/**
 * Sites: the websites a customer runs experiments on. Types and the rules they
 * carry are in ./types.ts; the decisions behind them in docs/HANDOFF.md →
 * "IN FLIGHT — SITE".
 *
 * THE STARTING SITE. A customer that already has environments, prototypes or a
 * brand profile gets exactly ONE site the first time its sites are read, and
 * everything it already had moves into it. Never one site per domain: both of
 * Outrigger's sites share outrigger.com, so domain grouping would merge them,
 * and prep. and www. are the same site, so host grouping would split them. A
 * person splits sites; the code does not guess.
 *
 * A PROTOTYPE'S SITE COMES FROM ITS RECORD (`resolvePrototypeSite`), never from
 * the sidebar cookie — token and agent calls carry no cookie, and the branch
 * sync hash is computed on four surfaces that must agree.
 */
import { getContentStore } from "../content/store";
import { listOrgEnvironments } from "../environments";
import { resolvePrototypeOrg } from "../prototypes/org";
import type { PrototypeRecord } from "../prototypes/types";
import { SITE_INDUSTRIES, type Site, type SiteIndustry, type SiteSource } from "./types";

/** The brand profile's org-default sentinel. No site may ever take this id. */
const RESERVED_SITE_ID = "*";

/** Lowercase, runs of anything else collapsed to one "-", trimmed — AFTER the
 *  length cut, so a truncated slug never ends in "-" and ids never grow "--". */
function idSlug(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
}

/** `${orgId}--${slug}`: unique across customers because neither half can contain "--". */
function siteIdFor(orgId: string, slug: string): string {
  return `${orgId}--${slug}`;
}

/** The starting site's id is fixed per customer, so two requests racing to
 *  create it insert the same row and the store keeps one. */
export function startingSiteId(orgId: string): string {
  return siteIdFor(orgId, "site");
}

/** Accepts "hawaiivacationcondos.outrigger.com" or a full URL; returns the origin. */
export function normalizeSiteUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Enter the site's URL, e.g. www.example.com");
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let u: URL;
  try { u = new URL(withScheme); } catch { throw new Error("That doesn't look like a web address — try something like www.example.com"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("The URL must start with http:// or https://");
  if (!u.hostname.includes(".")) throw new Error("That doesn't look like a web address — try something like www.example.com");
  return u.origin;
}

/** "https://www.outrigger.com" → "outrigger.com": how a site is named until a person names it. */
export function displayHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function isIndustry(v: unknown): v is SiteIndustry {
  return typeof v === "string" && (SITE_INDUSTRIES as readonly string[]).includes(v);
}

function cleanSource(src: SiteSource | undefined): SiteSource | undefined {
  if (!src) return undefined;
  if (src.kind === "repository" && src.repoId?.trim()) return { kind: "repository", repoId: src.repoId.trim() };
  if (src.kind === "local-folder" && src.path?.trim()) {
    const path = src.path.trim();
    if (!path.startsWith("/") && !path.startsWith("~")) throw new Error("Enter the folder's full path, e.g. ~/Projects/your-site");
    return { kind: "local-folder", path };
  }
  return undefined;
}

/**
 * A customer's sites, oldest first. On the first read for a customer that
 * already has environments, prototypes or a brand profile, this creates its
 * starting site and moves those into it (persisted, so it happens once).
 * A brand-new customer gets [] — the sidebar then offers "Add a site".
 */
export async function listSites(orgId: string): Promise<Site[]> {
  if (!orgId) return []; // "" would match every unassigned row across tenants
  const store = await getContentStore();
  const sites = await store.listOrgSites(orgId);
  if (sites.length) return sites;
  return ensureStartingSite(orgId);
}

async function ensureStartingSite(orgId: string): Promise<Site[]> {
  const store = await getContentStore();
  const envs = await listOrgEnvironments(orgId);
  const all = await store.listPrototypes();
  const owners = await Promise.all(all.map((p) => resolvePrototypeOrg(p)));
  const protos = all.filter((_, i) => owners[i] === orgId);
  const profiles = await store.listSiteProfiles(orgId);
  if (!envs.length && !protos.length && !profiles.length) return [];

  const primary = envs.find((e) => e.kind === "production") ?? envs[0];
  const org = await store.getOrg(orgId);
  const now = new Date().toISOString();
  await store.addOrgSite({
    id: startingSiteId(orgId),
    orgId,
    name: primary ? displayHost(primary.url) : org?.name || orgId,
    url: primary?.url ?? "",
    status: "ready",
    createdAt: now,
    updatedAt: now,
  });
  // Re-read: a concurrent request may have inserted it first, and that row is
  // the one everything must point at.
  const sites = await store.listOrgSites(orgId);
  const site = sites.find((s) => s.id === startingSiteId(orgId)) ?? sites[0];
  if (!site) return [];
  for (const env of envs) if (!env.siteId) await store.updateEnvironment(env.id, { siteId: site.id });
  for (const p of protos) if (!p.siteId) await store.putPrototype({ ...p, siteId: site.id });
  return sites;
}

/** One of THIS customer's sites, or null. The org check is the tenant boundary. */
export async function getSiteById(orgId: string, id: string): Promise<Site | null> {
  if (!orgId || !id) return null;
  const site = await (await getContentStore()).getOrgSite(id);
  return site && site.orgId === orgId ? site : null;
}

/**
 * The site a new environment or prototype lands in when the caller has not
 * chosen one: the customer's only (or first) site. Null for a customer with
 * no sites yet.
 */
export async function defaultSiteId(orgId: string): Promise<string | null> {
  return (await listSites(orgId))[0]?.id ?? null;
}

export async function createSite(
  orgId: string,
  input: { name: string; url: string; industry?: SiteIndustry; source?: SiteSource },
): Promise<Site> {
  if (!orgId) throw new Error("No customer selected.");
  const name = input.name?.trim();
  if (!name) throw new Error("Give the site a name.");
  const url = normalizeSiteUrl(input.url);
  const store = await getContentStore();
  const existing = await listSites(orgId);
  const dup = existing.find((s) => s.url === url);
  if (dup) throw new Error(`${displayHost(url)} is already a site here: ${dup.name}.`);

  const base = idSlug(name) || "site";
  const ids = new Set(existing.map((s) => s.id));
  let id = siteIdFor(orgId, base);
  for (let n = 2; ids.has(id); n++) id = siteIdFor(orgId, `${base}-${n}`);
  if (id === RESERVED_SITE_ID) throw new Error("That site id is reserved."); // unreachable by construction; asserted anyway

  const now = new Date().toISOString();
  const site: Site = {
    id,
    orgId,
    name,
    url,
    ...(isIndustry(input.industry) ? { industry: input.industry } : {}),
    ...(cleanSource(input.source) ? { source: cleanSource(input.source) } : {}),
    status: "setup",
    createdAt: now,
    updatedAt: now,
  };
  await store.addOrgSite(site);
  // A save that did not happen must not be reported as one — the environment
  // id collision returned 201 for a row the store had silently dropped.
  const saved = await store.getOrgSite(id);
  if (!saved || saved.orgId !== orgId) throw new Error("The site couldn't be saved. Try again.");
  return saved;
}

export async function updateSite(
  orgId: string,
  id: string,
  patch: { name?: string; url?: string; industry?: SiteIndustry | null; source?: SiteSource | null; status?: Site["status"] },
): Promise<Site> {
  const site = await getSiteById(orgId, id);
  if (!site) throw new Error("Unknown site.");
  const store = await getContentStore();
  const next: Partial<Site> = { updatedAt: new Date().toISOString() };
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("Give the site a name.");
    next.name = name;
  }
  if (patch.url !== undefined) {
    const url = normalizeSiteUrl(patch.url);
    const others = (await listSites(orgId)).filter((s) => s.id !== id);
    const dup = others.find((s) => s.url === url);
    if (dup) throw new Error(`${displayHost(url)} is already a site here: ${dup.name}.`);
    next.url = url;
  }
  if (patch.industry !== undefined) next.industry = patch.industry && isIndustry(patch.industry) ? patch.industry : undefined;
  if (patch.source !== undefined) next.source = patch.source ? cleanSource(patch.source) : undefined;
  if (patch.status === "setup" || patch.status === "ready") next.status = patch.status;
  await store.updateOrgSite(id, next);
  return (await getSiteById(orgId, id))!;
}

/**
 * The site a prototype belongs to, from its record. Legacy records made before
 * sites existed are moved into their customer's starting site on first read
 * (persisted) — the same self-healing read as resolvePrototypeOrg. "" only for
 * a prototype with no customer.
 */
export async function resolvePrototypeSite(proto: PrototypeRecord): Promise<string> {
  if (proto.siteId) return proto.siteId;
  const orgId = await resolvePrototypeOrg(proto);
  if (!orgId) return "";
  const sites = await listSites(orgId); // creates the starting site and assigns legacy records
  const fresh = await (await getContentStore()).getPrototype(proto.key);
  if (fresh?.siteId) return fresh.siteId;
  const siteId = sites[0]?.id ?? "";
  if (siteId) await (await getContentStore()).putPrototype({ ...(fresh ?? proto), siteId });
  return siteId;
}
