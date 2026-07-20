/**
 * Site registry — the source of truth for which sites we clone.
 *
 * Two layers:
 *   - CONFIG_SITES: built-in, code-defined sites (always present).
 *   - dynamic sites: user-added at runtime, persisted through the content store
 *     (filesystem locally, Neon when hosted — see src/lib/content/store.ts).
 *
 * A "site" is { siteKey, origin, assetHosts, label }. The capture pipeline
 * resolves a site's origin + assetHosts through getSite() so newly-added
 * websites are captured exactly like the built-in ones.
 */
import type { CaptureConfig } from "./capture/types";
import { getContentStore } from "./content/store";
import { getActiveOrgId } from "./active-org";

export type SiteMode = "clone" | "live";

export interface SiteConfig extends CaptureConfig {
  /** Human-facing label for display. */
  label: string;
  /** clone = snapshot pages & build against frozen copies; live = prototypes run on the real site (no capture). */
  mode: SiteMode;
  /** Owning org (tenant). */
  orgId: string;
}

/**
 * Legacy constants kept only for the CLI scaffold/capture scripts (re-exported
 * as SITES from capture.ts). NOT used by the app — the app reads sites purely
 * from the store. Nothing is seeded or hardcoded at runtime.
 */
export const CONFIG_SITES: Record<string, SiteConfig> = {
  outrigger: {
    siteKey: "outrigger",
    origin: "https://www.outrigger.com",
    assetHosts: ["outrigger.com", "outriggerhospitalityassets.com"],
    label: "Outrigger.com",
    mode: "clone",
    orgId: "",
  },
  hvc: {
    siteKey: "hvc",
    origin: "https://hawaiivacationcondos.outrigger.com",
    assetHosts: ["outrigger.com", "outriggerhospitalityassets.com"],
    label: "Hawaii Vacation Condos",
    mode: "clone",
    orgId: "",
  },
};

function normalize(s: SiteConfig): SiteConfig {
  return { ...s, mode: s.mode ?? "clone", orgId: s.orgId ?? "" }; // defaults for legacy records
}

// Sites are store records scoped to an org. getAllSites returns the ACTIVE
// org's sites (empty if no active org); getSite resolves a site by key across
// orgs (page-level guards enforce access).
export async function getAllSites(): Promise<Record<string, SiteConfig>> {
  const orgId = await getActiveOrgId();
  if (!orgId) return {};
  const store = await getContentStore();
  const out: Record<string, SiteConfig> = {};
  for (const s of await store.listDynamicSites()) {
    if ((s.orgId || "") === orgId) out[s.siteKey] = normalize(s);
  }
  return out;
}

/** Resolve one site by key (any org), or null if unknown. */
export async function getSite(siteKey: string): Promise<SiteConfig | null> {
  const store = await getContentStore();
  const found = (await store.listDynamicSites()).find((s) => s.siteKey === siteKey);
  return found ? normalize(found) : null;
}

/** Derive a short, url-safe key from a hostname (e.g. www.marriott.com → marriott). */
function keyFromHost(host: string): string {
  const bare = host.replace(/^www\./, "");
  const noTld = bare.replace(/\.[a-z0-9]+$/i, "");
  const key = (noTld || bare).replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-+|-+$/g, "");
  return key || "site";
}

/**
 * Add a website. Derives a unique key + sensible assetHosts default from the
 * origin. Rejects invalid URLs and duplicate origins. Persists and returns it.
 */
export async function addSite(input: { origin: string; orgId: string; label?: string; assetHosts?: string[]; mode?: SiteMode }): Promise<SiteConfig> {
  if (!input.orgId) throw new Error("No active org — create or pick an org first.");
  let url: URL;
  try {
    url = new URL(input.origin);
  } catch {
    throw new Error("Enter a valid URL, e.g. https://www.example.com");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("URL must start with http:// or https://");
  }

  const origin = url.origin;
  const host = url.hostname;
  const store = await getContentStore();
  const all = await store.listDynamicSites(); // global — siteKeys are unique across orgs

  // Origin uniqueness is PER-ORG: one tenant can't hold the same site twice,
  // but two tenants may legitimately have the same URL (siteKeys stay globally
  // unique via the auto-suffix below).
  if (all.some((s) => s.origin === origin && (s.orgId || "") === input.orgId)) {
    throw new Error(`A site for ${origin} already exists in this workspace.`);
  }

  // Pre-tenancy orphan: same origin exists but is UNOWNED (org_id === ""). Claim
  // it into the active org — preserving its key + captured pages/prototypes —
  // rather than erroring or spawning a suffixed duplicate. The user's current
  // label/mode input wins.
  const orphan = all.find((s) => s.origin === origin && !(s.orgId || ""));
  if (orphan) {
    const claimed: SiteConfig = {
      ...normalize(orphan),
      orgId: input.orgId,
      mode: input.mode ?? orphan.mode ?? "clone",
      label: input.label?.trim() || orphan.label,
    };
    await store.updateDynamicSite(orphan.siteKey, { orgId: claimed.orgId, mode: claimed.mode, label: claimed.label });
    return claimed;
  }

  const keys = new Set(all.map((s) => s.siteKey));
  let key = keyFromHost(host);
  if (keys.has(key)) {
    let n = 2;
    while (keys.has(`${key}-${n}`)) n++;
    key = `${key}-${n}`;
  }

  const site: SiteConfig = {
    siteKey: key,
    origin,
    assetHosts: input.assetHosts?.length ? input.assetHosts : [host.replace(/^www\./, "")],
    label: input.label?.trim() || host.replace(/^www\./, ""),
    // Live-injection-first: a new site defaults to live. `mode` is legacy — the
    // real clone/live decision is now per-prototype (target.source). Snapshots
    // are captured on demand, not forced at add time.
    mode: input.mode ?? "live",
    orgId: input.orgId,
  };

  await store.addDynamicSite(site);
  return site;
}

/** Change a site's mode (clone/live). */
export async function updateSiteMode(siteKey: string, mode: SiteMode): Promise<void> {
  const store = await getContentStore();
  await store.updateDynamicSite(siteKey, { mode });
}

/** Cascade-delete a site (record + pages + prototypes + repo binding). */
export async function deleteSite(siteKey: string): Promise<void> {
  const store = await getContentStore();
  await store.deleteSite(siteKey);
}
