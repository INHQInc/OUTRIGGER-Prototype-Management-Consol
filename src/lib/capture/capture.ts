import { load } from "cheerio";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AssetStore, captureAssets } from "./assets";
import { sanitize, injectGuards, buildReport } from "./sanitize";
import type { CaptureConfig, PageVersionMeta } from "./types";

export const SITES: Record<string, CaptureConfig> = {
  outrigger: {
    siteKey: "outrigger",
    origin: "https://www.outrigger.com",
    assetHosts: ["outrigger.com", "outriggerhospitalityassets.com"],
  },
  hvc: {
    siteKey: "hvc",
    origin: "https://hawaiivacationcondos.outrigger.com",
    assetHosts: ["outrigger.com", "outriggerhospitalityassets.com"],
  },
};

const FIRECRAWL_API = "https://api.firecrawl.dev/v1/scrape";

export interface CaptureOptions {
  /** Root dir where snapshots are stored (default: ./snapshots) */
  snapshotsRoot?: string;
  onProgress?: (msg: string) => void;
}

export function slugForUrl(url: string): string {
  const u = new URL(url);
  const path = u.pathname.replace(/\/+$/, "") || "/home";
  return path.replace(/^\//, "").replace(/\//g, "__").replace(/[^a-zA-Z0-9_-]/g, "-") || "home";
}

async function firecrawlScrape(url: string): Promise<string> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("FIRECRAWL_API_KEY is not set");
  const res = await fetch(FIRECRAWL_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["rawHtml"], onlyMainContent: false, waitFor: 3000 }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Firecrawl HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const html = data?.data?.rawHtml;
  if (!data?.success || !html) throw new Error(`Firecrawl returned no rawHtml for ${url}`);
  return html;
}

/**
 * Capture one page: scrape → download+rewrite assets → sanitize → store
 * an immutable PageVersion on disk.
 *
 * Layout:
 *   <root>/<siteKey>/assets/<sha1>.<ext>          shared content-addressed pool
 *   <root>/<siteKey>/pages/<slug>/<version>/index.html
 *   <root>/<siteKey>/pages/<slug>/<version>/meta.json
 */
export async function capturePage(
  url: string,
  siteKey: keyof typeof SITES,
  opts: CaptureOptions = {}
): Promise<PageVersionMeta> {
  const cfg = SITES[siteKey];
  if (!cfg) throw new Error(`Unknown site key: ${siteKey}`);
  const progress = opts.onProgress ?? (() => {});
  const root = opts.snapshotsRoot ?? join(process.cwd(), "snapshots");

  const version = new Date().toISOString().replace(/[:.]/g, "-");
  const pageSlug = slugForUrl(url);
  const assetsDir = join(root, cfg.siteKey, "assets");
  const versionDir = join(root, cfg.siteKey, "pages", pageSlug, version);
  await mkdir(versionDir, { recursive: true });
  await mkdir(assetsDir, { recursive: true });

  // Asset URLs in the stored HTML are root-relative to the site's asset pool;
  // the serving layer maps /snap-assets/<siteKey>/* onto the pool directory.
  const assetPublicPath = `/snap-assets/${cfg.siteKey}`;

  progress(`Scraping ${url} via Firecrawl...`);
  const rawHtml = await firecrawlScrape(url);
  progress(`Received ${(rawHtml.length / 1024).toFixed(0)} KB of rendered HTML`);

  const $ = load(rawHtml);

  progress("Sanitizing (GTM / GA4 / pixels / consent)...");
  const removed = sanitize($);
  progress(`Removed ${removed.length} tracking artifacts`);

  progress("Downloading and rewriting assets...");
  const store = new AssetStore(assetsDir, cfg);
  const writeProcessedCss = async (fileName: string, content: string) => {
    await writeFile(join(assetsDir, fileName), content, "utf8");
  };
  const assetNotes = await captureAssets($, url, store, assetPublicPath, writeProcessedCss);
  const records = store.records;
  const totalBytes = records.reduce((s, r) => s + r.bytes, 0);
  progress(`Stored ${records.length} assets (${(totalBytes / 1024 / 1024).toFixed(1)} MB), ${store.failed.length} failures`);

  injectGuards($);

  const notes = [
    ...assetNotes,
    ...store.failed.map((f) => `asset failed: ${f.url} (${f.error})`),
  ];
  const report = buildReport(url, removed, notes);

  const html = $.html();
  await writeFile(join(versionDir, "index.html"), html, "utf8");

  const meta: PageVersionMeta = {
    url,
    siteKey: cfg.siteKey,
    pageSlug,
    version,
    capturedAt: report.capturedAt,
    htmlBytes: Buffer.byteLength(html),
    assetCount: records.length,
    assetBytes: totalBytes,
    assets: records,
    report,
  };
  await writeFile(join(versionDir, "meta.json"), JSON.stringify(meta, null, 2), "utf8");

  progress(`Snapshot written: ${versionDir}`);
  return meta;
}
