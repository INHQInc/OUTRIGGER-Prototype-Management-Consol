import type { PageVersionMeta } from "../capture/types";
import type { SiteConfig } from "../sites";

/**
 * Persistence seam for CONTENT (sites, captured pages, assets) — the same
 * FS-vs-Neon swap pattern as the auth store (src/lib/auth/store.ts).
 *
 *   - Local dev (no DATABASE_URL): FsContentStore — the snapshots/ filesystem,
 *     full frozen asset mirror (uses curl, which the local machine has).
 *   - Hosted (DATABASE_URL set): NeonContentStore — Postgres. Serverless has no
 *     writable FS and no curl, so hosted capture is HTML-only: the sanitized
 *     HTML is stored and assets are referenced at their origin CDN URLs
 *     (`mirrorsAssets = false`). Browsers load those directly (they pass the
 *     WAF that blocks server-side fetch); the HTML stays tracking-free.
 */
export interface ContentStore {
  /** FS: true (mirror assets to the pool). Serverless: false (HTML-only, assets stay remote). */
  readonly mirrorsAssets: boolean;

  // --- Sites (dynamic layer; built-in CONFIG_SITES live in code) ---
  listDynamicSites(): Promise<SiteConfig[]>;
  addDynamicSite(site: SiteConfig): Promise<void>;

  // --- Pages ---
  /** Distinct page slugs captured for a site. */
  listSlugs(siteKey: string): Promise<string[]>;
  /** Version ids for a page, ascending (oldest first). */
  listVersions(siteKey: string, slug: string): Promise<string[]>;
  getMeta(siteKey: string, slug: string, version: string): Promise<PageVersionMeta | null>;
  getHtml(siteKey: string, slug: string, version: string): Promise<string | null>;
  putPageVersion(input: { siteKey: string; slug: string; version: string; html: string; meta: PageVersionMeta }): Promise<void>;

  // --- Assets (content-addressed <sha1>.<ext>) ---
  hasAsset(siteKey: string, name: string): Promise<boolean>;
  putAsset(siteKey: string, name: string, bytes: Buffer, contentType: string): Promise<void>;
  getAsset(siteKey: string, name: string): Promise<{ bytes: Buffer; contentType: string } | null>;
}

let cached: ContentStore | null = null;

export async function getContentStore(): Promise<ContentStore> {
  if (cached) return cached;
  if (process.env.DATABASE_URL) {
    const { NeonContentStore } = await import("./store-neon");
    cached = await NeonContentStore.create();
  } else {
    const { FsContentStore } = await import("./store-fs");
    cached = new FsContentStore();
  }
  return cached;
}
