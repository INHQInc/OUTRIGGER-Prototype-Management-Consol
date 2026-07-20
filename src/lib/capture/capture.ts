import { load } from "cheerio";
import { AssetStore, captureAssets, absolutizeAssetUrls } from "./assets";
import { sanitize, injectGuards, buildReport } from "./sanitize";
import type { PageVersionMeta } from "./types";
import { getSite } from "../sites";
import { getContentStore } from "../content/store";

// Sites now live in the site registry (built-in config + user-added).
// Re-exported here for back-compat with existing importers.
export { CONFIG_SITES as SITES } from "../sites";

const FIRECRAWL_API = "https://api.firecrawl.dev/v1/scrape";

export interface CaptureOptions {
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
  siteKey: string,
  opts: CaptureOptions = {}
): Promise<PageVersionMeta> {
  const cfg = await getSite(siteKey);
  if (!cfg) throw new Error(`Unknown site key: ${siteKey}`);
  const progress = opts.onProgress ?? (() => {});
  const store = await getContentStore();

  const version = new Date().toISOString().replace(/[:.]/g, "-");
  const pageSlug = slugForUrl(url);
  // Mirrored asset URLs are root-relative to the site's pool; the serving layer
  // maps /snap-assets/<siteKey>/* onto the pool.
  const assetPublicPath = `/snap-assets/${cfg.siteKey}`;

  progress(`Scraping ${url} via Firecrawl...`);
  const rawHtml = await firecrawlScrape(url);
  progress(`Received ${(rawHtml.length / 1024).toFixed(0)} KB of rendered HTML`);

  const $ = load(rawHtml);

  progress("Sanitizing (GTM / GA4 / pixels / consent)...");
  const removed = sanitize($);
  progress(`Removed ${removed.length} tracking artifacts`);

  // Best-effort freeze: mirror every asset we can into the pool (curl locally,
  // Node fetch when hosted), then point anything we couldn't fetch at its
  // origin CDN so the browser loads it directly. Frozen where possible,
  // remote fallback where not.
  progress(store.curlAvailable ? "Downloading + rewriting assets..." : "Fetching assets (store what we can, remote fallback)...");
  const assetStore = new AssetStore(store, cfg.siteKey, cfg, store.curlAvailable);
  const writeProcessedCss = async (fileName: string, content: string) => {
    await store.putAsset(cfg.siteKey, fileName, Buffer.from(content, "utf8"), "text/css");
  };
  const assetNotes = await captureAssets($, url, assetStore, assetPublicPath, writeProcessedCss);
  absolutizeAssetUrls($, url); // remote-fallback any asset that wasn't mirrored
  const records = assetStore.records;
  const totalBytes = records.reduce((s, r) => s + r.bytes, 0);
  const notes = [
    ...assetNotes,
    ...assetStore.failed.map((f) => `asset left remote: ${f.url} (${f.error})`),
  ];
  progress(`Mirrored ${records.length} assets (${(totalBytes / 1024 / 1024).toFixed(1)} MB); ${assetStore.failed.length} left remote`);

  injectGuards($);
  const report = buildReport(url, removed, notes);
  const html = $.html();

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
  await store.putPageVersion({ siteKey: cfg.siteKey, slug: pageSlug, version, html, meta });

  progress(`Snapshot stored: ${cfg.siteKey}/${pageSlug}/${version}`);
  return meta;
}
