/**
 * Site registry — the source of truth for which sites we clone.
 *
 * Two layers:
 *   - CONFIG_SITES: built-in, code-defined sites (always present).
 *   - dynamic sites: user-added at runtime, persisted to snapshots/_sites.json
 *     (local-first, travels with the snapshot content just like pages do).
 *
 * A "site" is { siteKey, origin, assetHosts, label }. The capture pipeline
 * resolves a site's origin + assetHosts through getSite() so newly-added
 * websites are captured exactly like the built-in ones.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { CaptureConfig } from "./capture/types";

export interface SiteConfig extends CaptureConfig {
  /** Human-facing label for display. */
  label: string;
}

/** Built-in sites. Always available, even with no captured content. */
export const CONFIG_SITES: Record<string, SiteConfig> = {
  outrigger: {
    siteKey: "outrigger",
    origin: "https://www.outrigger.com",
    assetHosts: ["outrigger.com", "outriggerhospitalityassets.com"],
    label: "Outrigger.com",
  },
  hvc: {
    siteKey: "hvc",
    origin: "https://hawaiivacationcondos.outrigger.com",
    assetHosts: ["outrigger.com", "outriggerhospitalityassets.com"],
    label: "Hawaii Vacation Condos",
  },
};

function snapshotsDir(): string {
  return join(process.cwd(), "snapshots");
}
function sitesFile(): string {
  return join(snapshotsDir(), "_sites.json");
}

async function readDynamicSites(): Promise<SiteConfig[]> {
  try {
    const arr = JSON.parse(await readFile(sitesFile(), "utf8"));
    return Array.isArray(arr) ? (arr as SiteConfig[]) : [];
  } catch {
    return [];
  }
}

async function writeDynamicSites(sites: SiteConfig[]): Promise<void> {
  await mkdir(snapshotsDir(), { recursive: true });
  await writeFile(sitesFile(), JSON.stringify(sites, null, 2) + "\n", "utf8");
}

/** All sites (built-in + user-added), keyed by siteKey. Dynamic wins on clash. */
export async function getAllSites(): Promise<Record<string, SiteConfig>> {
  const out: Record<string, SiteConfig> = { ...CONFIG_SITES };
  for (const s of await readDynamicSites()) out[s.siteKey] = s;
  return out;
}

/** Resolve one site's config, or null if unknown. */
export async function getSite(siteKey: string): Promise<SiteConfig | null> {
  if (CONFIG_SITES[siteKey]) return CONFIG_SITES[siteKey];
  return (await readDynamicSites()).find((s) => s.siteKey === siteKey) ?? null;
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
export async function addSite(input: { origin: string; label?: string; assetHosts?: string[] }): Promise<SiteConfig> {
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
  };

  const dyn = await readDynamicSites();
  dyn.push(site);
  await writeDynamicSites(dyn);
  return site;
}
