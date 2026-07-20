import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { getAllSites } from "./sites";
import type { PageVersionMeta } from "./capture/types";

/**
 * The snapshot filesystem IS the page registry (v1, no database).
 *   snapshots/<siteKey>/pages/<slug>/<version>/meta.json
 *   snapshots/<siteKey>/assets/<sha1>.<ext>
 */
export function snapshotsRoot(): string {
  return join(process.cwd(), "snapshots");
}

export interface SiteSummary {
  key: string;
  origin: string;
  label: string;
  pageCount: number;
  versionCount: number;
}

export interface VersionSummary {
  version: string;
  capturedAt: string;
  htmlBytes: number;
  assetCount: number;
  assetBytes: number;
  removedCount: number;
}

export interface PageSummary {
  siteKey: string;
  slug: string;
  url: string;
  latestVersion: string | null;
  latestCapturedAt: string | null;
  versionCount: number;
  latestAssetCount: number;
  latestRemovedCount: number;
}

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

async function listVersionDirs(pageDir: string): Promise<string[]> {
  try {
    const entries = await readdir(pageDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    return [];
  }
}

export async function readVersionMeta(
  siteKey: string,
  slug: string,
  version: string
): Promise<PageVersionMeta | null> {
  try {
    const raw = await readFile(
      join(snapshotsRoot(), siteKey, "pages", slug, version, "meta.json"),
      "utf8"
    );
    return JSON.parse(raw) as PageVersionMeta;
  } catch {
    return null;
  }
}

export async function listPages(siteKey: string): Promise<PageSummary[]> {
  const pagesDir = join(snapshotsRoot(), siteKey, "pages");
  if (!(await exists(pagesDir))) return [];
  const slugs = (await readdir(pagesDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  const out: PageSummary[] = [];
  for (const slug of slugs) {
    const versions = await listVersionDirs(join(pagesDir, slug));
    const latest = versions[versions.length - 1] ?? null;
    let url = "";
    let capturedAt: string | null = null;
    let assetCount = 0;
    let removedCount = 0;
    if (latest) {
      const meta = await readVersionMeta(siteKey, slug, latest);
      if (meta) {
        url = meta.url;
        capturedAt = meta.capturedAt;
        assetCount = meta.assetCount;
        removedCount = meta.report.removed.length;
      }
    }
    out.push({
      siteKey,
      slug,
      url,
      latestVersion: latest,
      latestCapturedAt: capturedAt,
      versionCount: versions.length,
      latestAssetCount: assetCount,
      latestRemovedCount: removedCount,
    });
  }
  out.sort((a, b) => (b.latestCapturedAt ?? "").localeCompare(a.latestCapturedAt ?? ""));
  return out;
}

export async function listSites(): Promise<SiteSummary[]> {
  const out: SiteSummary[] = [];
  for (const [key, cfg] of Object.entries(await getAllSites())) {
    const pages = await listPages(key);
    out.push({
      key,
      origin: cfg.origin,
      label: cfg.label,
      pageCount: pages.length,
      versionCount: pages.reduce((s, p) => s + p.versionCount, 0),
    });
  }
  return out;
}

export async function getPageVersions(siteKey: string, slug: string): Promise<VersionSummary[]> {
  const versions = await listVersionDirs(join(snapshotsRoot(), siteKey, "pages", slug));
  const out: VersionSummary[] = [];
  for (const v of versions) {
    const meta = await readVersionMeta(siteKey, slug, v);
    if (meta) {
      out.push({
        version: v,
        capturedAt: meta.capturedAt,
        htmlBytes: meta.htmlBytes,
        assetCount: meta.assetCount,
        assetBytes: meta.assetBytes,
        removedCount: meta.report.removed.length,
      });
    }
  }
  return out.reverse(); // newest first
}
