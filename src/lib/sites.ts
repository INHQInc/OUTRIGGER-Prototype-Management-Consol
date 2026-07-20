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
import { getContentStore, type ContentStore } from "./content/store";

export type SiteMode = "clone" | "live";

export interface SiteConfig extends CaptureConfig {
  /** Human-facing label for display. */
  label: string;
  /** clone = snapshot pages & build against frozen copies; live = prototypes run on the real site (no capture). */
  mode: SiteMode;
}

/**
 * Seed sites — inserted into the store ONCE on first run (see ensureSeeded).
 * After seeding, the store is the single source of truth: every site is a
 * normal, editable, deletable record. Nothing here is special-cased at runtime.
 */
export const CONFIG_SITES: Record<string, SiteConfig> = {
  outrigger: {
    siteKey: "outrigger",
    origin: "https://www.outrigger.com",
    assetHosts: ["outrigger.com", "outriggerhospitalityassets.com"],
    label: "Outrigger.com",
    mode: "clone",
  },
  hvc: {
    siteKey: "hvc",
    origin: "https://hawaiivacationcondos.outrigger.com",
    assetHosts: ["outrigger.com", "outriggerhospitalityassets.com"],
    label: "Hawaii Vacation Condos",
    mode: "clone",
  },
};

/** All sites (built-in + user-added), keyed by siteKey. Dynamic wins on clash. */
function withMode(s: SiteConfig): SiteConfig {
  return { ...s, mode: s.mode ?? "clone" }; // default legacy records to clone
}

// One-time seed of the initial sites into the store. Idempotent + guarded by a
// marker so it never re-seeds (deletions stick). Nothing is hardcoded at runtime.
let seedPromise: Promise<void> | null = null;
async function ensureSeeded(store: ContentStore): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      if (await store.getFlag("sites_seeded")) return;
      const existing = new Set((await store.listDynamicSites()).map((s) => s.siteKey));
      for (const s of Object.values(CONFIG_SITES)) {
        if (!existing.has(s.siteKey)) await store.addDynamicSite(s);
      }
      await store.setFlag("sites_seeded", "1");
    })();
  }
  return seedPromise;
}

export async function getAllSites(): Promise<Record<string, SiteConfig>> {
  const store = await getContentStore();
  await ensureSeeded(store);
  const out: Record<string, SiteConfig> = {};
  for (const s of await store.listDynamicSites()) out[s.siteKey] = withMode(s);
  return out;
}

/** Resolve one site's config, or null if unknown. */
export async function getSite(siteKey: string): Promise<SiteConfig | null> {
  const store = await getContentStore();
  await ensureSeeded(store);
  const found = (await store.listDynamicSites()).find((s) => s.siteKey === siteKey);
  return found ? withMode(found) : null;
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
export async function addSite(input: { origin: string; label?: string; assetHosts?: string[]; mode?: SiteMode }): Promise<SiteConfig> {
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
  const all = await getAllSites();

  if (Object.values(all).some((s) => s.origin === origin)) {
    throw new Error(`A site for ${origin} already exists.`);
  }

  let key = keyFromHost(host);
  if (all[key]) {
    let n = 2;
    while (all[`${key}-${n}`]) n++;
    key = `${key}-${n}`;
  }

  const site: SiteConfig = {
    siteKey: key,
    origin,
    assetHosts: input.assetHosts?.length ? input.assetHosts : [host.replace(/^www\./, "")],
    label: input.label?.trim() || host.replace(/^www\./, ""),
    mode: input.mode ?? "clone",
  };

  const store = await getContentStore();
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
