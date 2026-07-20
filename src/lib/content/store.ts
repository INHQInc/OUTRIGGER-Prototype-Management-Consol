import type { PageVersionMeta } from "../capture/types";
import type { SiteConfig } from "../sites";
import type { SiteRepoBinding } from "../git/types";
import type { PrototypeRecord } from "../prototypes/types";

/**
 * Persistence seam for CONTENT (sites, captured pages, assets) — the same
 * FS-vs-Neon swap pattern as the auth store (src/lib/auth/store.ts).
 *
 *   - Local dev (no DATABASE_URL): FsContentStore — the snapshots/ filesystem,
 *     full frozen asset mirror (uses curl, which the local machine has).
 *   - Hosted (DATABASE_URL set): NeonContentStore — Postgres. Serverless has no
 *     writable FS and no curl (`curlAvailable = false`), so capture tries Node
 *     fetch per asset: what it can fetch is stored, and WAF-blocked assets are
 *     left at their origin CDN (browsers load those directly). HTML stays
 *     tracking-free either way.
 */
export interface ContentStore {
  /**
   * Whether `curl` is available for downloads. Local shells out to curl (which
   * passes the WAF that TLS-fingerprint-blocks Node fetch) and mirrors every
   * asset. Serverless has no curl → capture falls back to Node fetch, storing
   * what it can and leaving WAF-blocked assets at their origin CDN.
   */
  readonly curlAvailable: boolean;

  // --- Sites (dynamic layer; built-in CONFIG_SITES live in code) ---
  listDynamicSites(): Promise<SiteConfig[]>;
  addDynamicSite(site: SiteConfig): Promise<void>;
  updateDynamicSite(siteKey: string, patch: Partial<SiteConfig>): Promise<void>;
  /** Cascade-delete a site: its record + all pages/versions/assets + prototypes + repo binding. */
  deleteSite(siteKey: string): Promise<void>;

  // --- Repo binding (per-site feature + source repos) ---
  getRepoBinding(siteKey: string): Promise<SiteRepoBinding | null>;
  setRepoBinding(siteKey: string, binding: SiteRepoBinding): Promise<void>;

  // --- Prototypes (metadata / brief / hypothesis / lifecycle) ---
  listPrototypes(siteKey?: string): Promise<PrototypeRecord[]>;
  getPrototype(key: string): Promise<PrototypeRecord | null>;
  putPrototype(record: PrototypeRecord): Promise<void>;

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
