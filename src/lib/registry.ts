import { join } from "node:path";
import { getAllSites } from "./sites";
import { getContentStore } from "./content/store";
import type { PageVersionMeta } from "./capture/types";

/**
 * Page registry — reads captured content through the content store
 * (filesystem locally, Neon when hosted). snapshotsRoot() is retained for the
 * local deploy bundler, which operates on the filesystem directly.
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

export async function readVersionMeta(
  siteKey: string,
  slug: string,
  version: string
): Promise<PageVersionMeta | null> {
  const store = await getContentStore();
  return store.getMeta(siteKey, slug, version);
}

export async function listPages(siteKey: string): Promise<PageSummary[]> {
  const store = await getContentStore();
  const slugs = await store.listSlugs(siteKey);

  const out: PageSummary[] = [];
  for (const slug of slugs) {
    const versions = await store.listVersions(siteKey, slug);
    const latest = versions[versions.length - 1] ?? null;
    let url = "";
    let capturedAt: string | null = null;
    let assetCount = 0;
    let removedCount = 0;
    if (latest) {
      const meta = await store.getMeta(siteKey, slug, latest);
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
  const store = await getContentStore();
  const versions = await store.listVersions(siteKey, slug);
  const out: VersionSummary[] = [];
  for (const v of versions) {
    const meta = await store.getMeta(siteKey, slug, v);
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
