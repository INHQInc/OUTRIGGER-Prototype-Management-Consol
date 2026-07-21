/**
 * Environment = a CUSTOMER's deploy/review target — dev / staging / production.
 * The three nouns of the product are Customer (who), Environment (where),
 * Prototype (what). Environments carry the loader (per-env tag + heartbeat);
 * prototypes are reviewed and promoted across them.
 *
 * Legacy: pre-refactor environments were keyed to a Site. listOrgEnvironments
 * lazily migrates them (site.orgId → env.orgId) so existing data self-heals.
 */
import { getContentStore } from "./content/store";
import { getActiveOrgId } from "./active-org";

export type EnvironmentKind = "development" | "staging" | "production";

export interface Environment {
  id: string;
  /** Owning customer. */
  orgId: string;
  /** Legacy: the pre-refactor site this env belonged to (kept for heartbeat + migration). */
  siteKey?: string;
  label: string;
  /** Base URL prototypes run against in this environment. */
  url: string;
  kind: EnvironmentKind;
  createdAt: string;
}

const KIND_LABEL: Record<EnvironmentKind, string> = {
  development: "Development",
  staging: "Staging",
  production: "Production",
};
const KIND_ORDER: Record<EnvironmentKind, number> = { production: 0, staging: 1, development: 2 };

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

function normalizeUrl(raw: string): string {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("Enter a valid URL, e.g. https://staging.example.com"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("URL must start with http:// or https://");
  return u.origin;
}

function sortEnvs(envs: Environment[]): Environment[] {
  return [...envs].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.createdAt.localeCompare(b.createdAt));
}

/**
 * The customer's environments, production first. Lazily adopts legacy
 * site-keyed environments belonging to the org's sites (one-time, persisted).
 */
export async function listOrgEnvironments(orgId: string): Promise<Environment[]> {
  if (!orgId) return []; // "" would match every not-yet-migrated legacy row across tenants
  const store = await getContentStore();
  const own = await store.listEnvironmentsByOrg(orgId);
  // Legacy adoption: envs still keyed to this org's old sites.
  const orgSiteKeys = (await store.listDynamicSites()).filter((s) => s.orgId === orgId).map((s) => s.siteKey);
  const adopted: Environment[] = [];
  for (const sk of orgSiteKeys) {
    for (const legacy of await store.listEnvironments(sk)) {
      if (legacy.orgId) continue; // already migrated
      await store.updateEnvironment(legacy.id, { orgId });
      adopted.push({ ...legacy, orgId });
    }
  }
  const seen = new Set(own.map((e) => e.id));
  return sortEnvs([...own, ...adopted.filter((e) => !seen.has(e.id))]);
}

export async function addOrgEnvironment(orgId: string, input: { label?: string; url: string; kind: EnvironmentKind }): Promise<Environment> {
  const url = normalizeUrl(input.url);
  const store = await getContentStore();
  const existing = await listOrgEnvironments(orgId);
  if (existing.some((e) => e.url === url)) throw new Error(`An environment for ${url} already exists.`);
  const label = input.label?.trim() || KIND_LABEL[input.kind];
  const base = `${orgId}-${slugify(label) || input.kind}`;
  const ids = new Set(existing.map((e) => e.id));
  let id = base;
  let n = 2;
  while (ids.has(id)) id = `${base}-${n++}`;
  const env: Environment = { id, orgId, label, url, kind: input.kind, createdAt: new Date().toISOString() };
  await store.addEnvironment(env);
  return env;
}

export async function updateEnvironment(id: string, patch: { label?: string; url?: string; kind?: EnvironmentKind }): Promise<void> {
  const store = await getContentStore();
  const clean: Partial<Environment> = {};
  if (patch.label !== undefined) clean.label = patch.label.trim();
  if (patch.url !== undefined) clean.url = normalizeUrl(patch.url);
  if (patch.kind !== undefined) clean.kind = patch.kind;
  await store.updateEnvironment(id, clean);
}

export async function deleteOrgEnvironment(orgId: string, id: string): Promise<void> {
  const store = await getContentStore();
  const envs = await listOrgEnvironments(orgId);
  if (!envs.some((e) => e.id === id)) return;
  await store.deleteEnvironment(id);
}

/** Last loader heartbeat for an environment (checks the env id and, for
 *  migrated envs, the legacy site-keyed loader tag). ISO timestamp or null. */
export async function envLoaderSeenAt(env: Environment): Promise<string | null> {
  const store = await getContentStore();
  const direct = await store.getFlag(`loader:seen:${env.id}`);
  if (direct) return direct;
  if (env.siteKey) return store.getFlag(`loader:seen:${env.siteKey}`);
  return null;
}

/** Convenience for the active customer (API routes). */
export async function listActiveOrgEnvironments(): Promise<Environment[]> {
  const orgId = await getActiveOrgId();
  return orgId ? listOrgEnvironments(orgId) : [];
}
