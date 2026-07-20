import { createHash, randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);
import type { CheerioAPI } from "cheerio";
import type { AssetRecord, CaptureConfig } from "./types";
import type { ContentStore } from "../content/store";
import { TRACKING_DOMAINS } from "./sanitize";

const EXT_BY_TYPE: Record<string, string> = {
  "text/css": "css",
  "text/javascript": "js",
  "application/javascript": "js",
  "application/x-javascript": "js",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "font/woff2": "woff2",
  "font/woff": "woff",
  "font/ttf": "ttf",
  "application/font-woff": "woff",
  "application/font-woff2": "woff2",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "application/json": "json",
};

function extFor(url: string, contentType: string): string {
  const clean = url.split(/[?#]/)[0];
  const m = clean.match(/\.([a-z0-9]{2,5})$/i);
  if (m) return m[1].toLowerCase();
  const base = contentType.split(";")[0].trim().toLowerCase();
  return EXT_BY_TYPE[base] ?? "bin";
}

function isTracking(url: string): boolean {
  const u = url.toLowerCase();
  return TRACKING_DOMAINS.some((d) => u.includes(d));
}

/** Resolve a possibly-relative URL against the page URL; null if unusable. */
export function resolveUrl(raw: string, pageUrl: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("blob:") || trimmed.startsWith("javascript:") || trimmed.startsWith("#")) {
    return null;
  }
  // Already rewritten to the local asset pool — never re-process
  if (trimmed.startsWith("/snap-assets/")) return null;
  try {
    return new URL(trimmed, pageUrl).href;
  } catch {
    return null;
  }
}

/** Should we download this asset? First-party origin or approved asset host, and never tracking. */
export function isDownloadable(absUrl: string, cfg: CaptureConfig): boolean {
  if (isTracking(absUrl)) return false;
  try {
    const host = new URL(absUrl).host;
    const originHost = new URL(cfg.origin).host;
    if (host === originHost) return true;
    return cfg.assetHosts.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export class AssetStore {
  private byUrl = new Map<string, AssetRecord>();
  private failures = new Map<string, string>();

  constructor(private store: ContentStore, private siteKey: string, private cfg: CaptureConfig) {}

  get records(): AssetRecord[] {
    return [...this.byUrl.values()];
  }

  get failed(): { url: string; error: string }[] {
    return [...this.failures.entries()].map(([url, error]) => ({ url, error }));
  }

  /**
   * Download an asset (deduped by URL), store content-addressed, return the
   * local file name — or null if skipped/failed.
   */
  async fetch(absUrl: string, via: string): Promise<AssetRecord | null> {
    const existing = this.byUrl.get(absUrl);
    if (existing) return existing;
    if (this.failures.has(absUrl)) return null;
    if (!isDownloadable(absUrl, this.cfg)) return null;

    try {
      // Node's fetch is blocked by the site's WAF via TLS fingerprinting;
      // curl's TLS stack passes, so downloads shell out to curl.
      const { contentType, buf, status } = await curlFetch(absUrl, this.cfg.origin);
      if (status !== 200) {
        this.failures.set(absUrl, `HTTP ${status}`);
        return null;
      }
      const hash = createHash("sha1").update(buf).digest("hex");
      const file = `${hash}.${extFor(absUrl, contentType)}`;

      if (!(await this.store.hasAsset(this.siteKey, file))) {
        await this.store.putAsset(this.siteKey, file, buf, contentType);
      }

      const rec: AssetRecord = { originalUrl: absUrl, hash, file, contentType, bytes: buf.length, via };
      this.byUrl.set(absUrl, rec);
      return rec;
    } catch (e) {
      this.failures.set(absUrl, e instanceof Error ? e.message : String(e));
      return null;
    }
  }
}

/** Rewrite url(...) references inside CSS, downloading each referenced asset. */
export async function processCss(
  cssText: string,
  cssUrl: string,
  store: AssetStore,
  assetPublicPath: string
): Promise<string> {
  const urlRe = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
  const refs = new Map<string, string>(); // raw match -> replacement
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(cssText))) {
    const raw = m[2];
    if (refs.has(raw)) continue;
    const abs = resolveUrl(raw, cssUrl);
    if (!abs) continue;
    const rec = await store.fetch(abs, "css");
    if (rec) refs.set(raw, `${assetPublicPath}/${rec.file}`);
  }
  let out = cssText;
  for (const [raw, local] of refs) {
    out = out.split(`url(${raw})`).join(`url(${local})`);
    out = out.split(`url('${raw}')`).join(`url('${local}')`);
    out = out.split(`url("${raw}")`).join(`url("${local}")`);
  }
  // @import statements
  const importRe = /@import\s+(?:url\()?\s*(['"]?)([^'")]+)\1\s*\)?/g;
  while ((m = importRe.exec(cssText))) {
    const abs = resolveUrl(m[2], cssUrl);
    if (abs) {
      const rec = await store.fetch(abs, "css");
      if (rec) out = out.split(m[2]).join(`${assetPublicPath}/${rec.file}`);
    }
  }
  return out;
}

/** Parse a srcset attribute into candidate URLs with descriptors. */
export function parseSrcset(srcset: string): { url: string; descriptor: string }[] {
  return srcset
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [url, ...rest] = part.split(/\s+/);
      return { url, descriptor: rest.join(" ") };
    });
}

/** Collect every downloadable asset referenced by the document and rewrite refs to local paths. */
export async function captureAssets(
  $: CheerioAPI,
  pageUrl: string,
  store: AssetStore,
  assetPublicPath: string,
  writeProcessedCss: (fileName: string, content: string) => Promise<void>
): Promise<string[]> {
  const notes: string[] = [];

  // Stylesheets (any rel containing "stylesheet", plus preload-as-style)
  const styleLinks = $("link[href]").filter((_, el) => {
    const rel = ($(el).attr("rel") ?? "").toLowerCase();
    const as = ($(el).attr("as") ?? "").toLowerCase();
    return rel.includes("stylesheet") || (rel.includes("preload") && as === "style");
  });
  for (const el of styleLinks.toArray()) {
    const href = $(el).attr("href") ?? "";
    const abs = resolveUrl(href, pageUrl);
    if (!abs) continue;
    const rec = await store.fetch(abs, "html");
    if (!rec) continue;
    if (rec.contentType.includes("css") || rec.file.endsWith(".css")) {
      // Reprocess CSS for nested url()/@import refs, store processed copy under same name
      const raw = await fetchText(abs);
      if (raw !== null) {
        const processed = await processCss(raw, abs, store, assetPublicPath);
        await writeProcessedCss(rec.file, processed);
      }
    }
    $(el).attr("href", `${assetPublicPath}/${rec.file}`);
  }

  // Scripts
  for (const el of $("script[src]").toArray()) {
    const src = $(el).attr("src") ?? "";
    const abs = resolveUrl(src, pageUrl);
    if (!abs) continue;
    const rec = await store.fetch(abs, "html");
    if (rec) $(el).attr("src", `${assetPublicPath}/${rec.file}`);
    else notes.push(`script kept remote (third-party or failed): ${abs}`);
  }

  // Images + srcset + lazy variants
  for (const el of $("img, source").toArray()) {
    for (const attr of ["src", "data-src", "data-lazy-src"]) {
      const v = $(el).attr(attr);
      if (!v) continue;
      const abs = resolveUrl(v, pageUrl);
      if (!abs) continue;
      const rec = await store.fetch(abs, "html");
      if (rec) $(el).attr(attr, `${assetPublicPath}/${rec.file}`);
    }
    for (const attr of ["srcset", "data-srcset"]) {
      const v = $(el).attr(attr);
      if (!v) continue;
      const candidates = parseSrcset(v);
      const rewritten: string[] = [];
      for (const c of candidates) {
        const abs = resolveUrl(c.url, pageUrl);
        if (!abs) { rewritten.push(`${c.url} ${c.descriptor}`.trim()); continue; }
        const rec = await store.fetch(abs, "srcset");
        rewritten.push(`${rec ? `${assetPublicPath}/${rec.file}` : c.url} ${c.descriptor}`.trim());
      }
      $(el).attr(attr, rewritten.join(", "));
    }
  }

  // Video/audio, favicons, manifest, og:image stays remote (meta only)
  for (const el of $("video[src], audio[src], video source[src]").toArray()) {
    const v = $(el).attr("src");
    if (!v) continue;
    const abs = resolveUrl(v, pageUrl);
    if (!abs) continue;
    const rec = await store.fetch(abs, "html");
    if (rec) $(el).attr("src", `${assetPublicPath}/${rec.file}`);
  }
  for (const el of $("link[rel*='icon'], link[rel='manifest'], link[rel='apple-touch-icon']").toArray()) {
    const v = $(el).attr("href");
    if (!v) continue;
    const abs = resolveUrl(v, pageUrl);
    if (!abs) continue;
    const rec = await store.fetch(abs, "html");
    if (rec) $(el).attr("href", `${assetPublicPath}/${rec.file}`);
  }

  // Inline style="background-image:url(...)"
  for (const el of $("[style]").toArray()) {
    const style = $(el).attr("style") ?? "";
    if (!style.includes("url(")) continue;
    const processed = await processCss(style, pageUrl, store, assetPublicPath);
    $(el).attr("style", processed);
  }

  return notes;
}

/**
 * HTML-only capture (serverless): don't mirror assets — instead make every
 * asset URL absolute against the page origin, so the browser loads them
 * straight from the live CDN (browsers pass the WAF that blocks server fetch).
 * The HTML stays tracking-free (sanitize already ran).
 */
export function absolutizeAssetUrls($: CheerioAPI, pageUrl: string): void {
  const abs = (raw?: string): string | null => {
    if (!raw) return null;
    const t = raw.trim();
    if (!t || t.startsWith("data:") || t.startsWith("blob:") || t.startsWith("#") || t.startsWith("javascript:")) return null;
    try { return new URL(t, pageUrl).href; } catch { return null; }
  };
  $("link[href], script[src], img[src], source[src], video[src], audio[src]").each((_, el) => {
    const $el = $(el);
    for (const attr of ["href", "src"]) {
      const v = $el.attr(attr);
      const a = abs(v);
      if (a && a !== v) $el.attr(attr, a);
    }
  });
  $("img[srcset], source[srcset]").each((_, el) => {
    const $el = $(el);
    const v = $el.attr("srcset");
    if (!v) return;
    const out = parseSrcset(v).map((c) => `${abs(c.url) ?? c.url} ${c.descriptor}`.trim()).join(", ");
    $el.attr("srcset", out);
  });
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const { status, buf } = await curlFetch(url, new URL(url).origin);
    return status === 200 ? buf.toString("utf8") : null;
  } catch {
    return null;
  }
}

/** Download via curl (the site's WAF TLS-fingerprints Node's fetch, curl passes). */
export async function curlFetch(
  url: string,
  referer: string
): Promise<{ status: number; contentType: string; buf: Buffer }> {
  const tmp = join(tmpdir(), `opmc-${randomUUID()}`);
  try {
    const { stdout } = await execFileAsync(
      "curl",
      [
        "-s",
        "--compressed",
        "--max-time", "60",
        "-L", "--max-redirs", "5",
        "-o", tmp,
        "-w", "%{http_code}\t%{content_type}",
        "-H", "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "-H", "Accept: */*",
        "-H", "Accept-Language: en-US,en;q=0.9",
        "-H", `Referer: ${referer}/`,
        url,
      ],
      { maxBuffer: 1024 * 1024 }
    );
    const [code, contentType = ""] = stdout.trim().split("\t");
    const buf = await readFile(tmp).catch(() => Buffer.alloc(0));
    return { status: parseInt(code, 10) || 0, contentType, buf };
  } finally {
    await rm(tmp, { force: true }).catch(() => {});
  }
}
