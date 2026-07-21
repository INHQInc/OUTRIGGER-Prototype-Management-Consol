import type { PageVersionMeta } from "../capture/types";
import type { SiteConfig } from "../sites";
import type { SiteRepoBinding } from "../git/types";
import type { PrototypeRecord, ArtifactVersion, PrototypeOverlay } from "../prototypes/types";
import type { Org, OrgMember } from "../orgs";
import type { Environment } from "../environments";
import type { ExperimentationConfig } from "../experimentation/types";
import type { Promotion, PromotionStatus } from "../promotions/types";
import type { AuditEvent } from "../audit/types";

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

  // --- Key/value flags (one-time migrations, seed markers) ---
  getFlag(key: string): Promise<string | null>;
  setFlag(key: string, value: string): Promise<void>;

  // --- Orgs (tenants) + membership ---
  listOrgs(): Promise<Org[]>;
  getOrg(id: string): Promise<Org | null>;
  addOrg(org: Org): Promise<void>;
  deleteOrg(id: string): Promise<void>;
  listMembers(orgId: string): Promise<OrgMember[]>;
  putMember(m: OrgMember): Promise<void>;
  removeMember(orgId: string, email: string): Promise<void>;
  orgIdsForMember(email: string): Promise<string[]>;

  // --- Brand-level experimentation config (org-scoped A/B platform connection) ---
  getExperimentationConfig(orgId: string): Promise<ExperimentationConfig | null>;
  setExperimentationConfig(config: ExperimentationConfig): Promise<void>;
  deleteExperimentationConfig(orgId: string): Promise<void>;

  // --- Sites (dynamic layer; built-in CONFIG_SITES live in code) ---
  listDynamicSites(): Promise<SiteConfig[]>;
  addDynamicSite(site: SiteConfig): Promise<void>;
  updateDynamicSite(siteKey: string, patch: Partial<SiteConfig>): Promise<void>;
  /** Cascade-delete a site: its record + all pages/versions/assets + prototypes + repo binding + environments. */
  deleteSite(siteKey: string): Promise<void>;

  // --- Environments (per-site deploy targets: dev/staging/production) ---
  listEnvironments(siteKey: string): Promise<Environment[]>;
  /** Insert an environment; idempotent on id (on-conflict-do-nothing) so the production seed is race-safe. */
  addEnvironment(env: Environment): Promise<void>;
  updateEnvironment(id: string, patch: Partial<Environment>): Promise<void>;
  deleteEnvironment(id: string): Promise<void>;

  // --- Repo binding (per-site feature + source repos) ---
  getRepoBinding(siteKey: string): Promise<SiteRepoBinding | null>;
  setRepoBinding(siteKey: string, binding: SiteRepoBinding): Promise<void>;

  // --- Prototypes (metadata / brief / hypothesis / lifecycle) ---
  listPrototypes(siteKey?: string): Promise<PrototypeRecord[]>;
  getPrototype(key: string): Promise<PrototypeRecord | null>;
  putPrototype(record: PrototypeRecord): Promise<void>;

  // --- Prototype overlay (inline authored code: css/js/blocks) ---
  getPrototypeOverlay(prototypeKey: string): Promise<PrototypeOverlay | null>;
  putPrototypeOverlay(overlay: PrototypeOverlay): Promise<void>;

  // --- Artifact versions (immutable, git-SHA-pinned builds; append-only) ---
  listArtifactVersions(prototypeKey: string): Promise<ArtifactVersion[]>;
  addArtifactVersion(version: ArtifactVersion): Promise<void>;

  // --- Promotions (version → environment; append-only history) ---
  listPromotions(prototypeKey: string): Promise<Promotion[]>;
  addPromotion(promotion: Promotion): Promise<void>;
  updatePromotionStatus(id: string, status: PromotionStatus): Promise<void>;

  // --- Audit trail (append-only, org-scoped) ---
  listAuditEvents(orgId: string, limit?: number): Promise<AuditEvent[]>;
  addAuditEvent(event: AuditEvent): Promise<void>;

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

// Memoize the in-flight create promise (not just the resolved store) so
// concurrent cold-start requests share ONE create()/ensureSchema() instead of
// each racing to bootstrap the schema. On failure we clear it so a later
// request retries.
let cached: Promise<ContentStore> | null = null;

export function getContentStore(): Promise<ContentStore> {
  if (cached) return cached;
  cached = (async () => {
    if (process.env.DATABASE_URL) {
      const { NeonContentStore } = await import("./store-neon");
      return NeonContentStore.create();
    }
    const { FsContentStore } = await import("./store-fs");
    return new FsContentStore();
  })().catch((e) => {
    cached = null;
    throw e;
  });
  return cached;
}
