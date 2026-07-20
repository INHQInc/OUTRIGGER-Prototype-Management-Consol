/**
 * Environment = a deploy target of a site (brand) — dev / staging / production.
 * The lifecycle promotes ONE immutable artifact version rightward across these:
 * local/dev → staging (review/QA) → production (experiment). See
 * docs/LIFECYCLE-ARCHITECTURE.md.
 *
 * Every site always has at least one environment: the site's origin is lazily
 * seeded as `production` on first read, so existing sites migrate themselves
 * with no global migration step.
 */
import { getContentStore } from "./content/store";
import { getSite } from "./sites";

export type EnvironmentKind = "development" | "staging" | "production";

export interface Environment {
  id: string;
  /** Owning site (brand). */
  siteKey: string;
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
 * A site's environments, production first. Lazily seeds `production` from the
 * site origin the first time (idempotent, race-safe via on-conflict-do-nothing)
 * so every site always has ≥1 environment — the promotion target the lifecycle
 * hangs on.
 */
export async function listEnvironments(siteKey: string): Promise<Environment[]> {
  const store = await getContentStore();
  const envs = await store.listEnvironments(siteKey);
  if (envs.length > 0) return sortEnvs(envs);
  const site = await getSite(siteKey);
  if (!site) return [];
  const prod: Environment = {
    id: `${siteKey}-production`,
    siteKey,
    label: "Production",
    url: site.origin,
    kind: "production",
    createdAt: new Date().toISOString(),
  };
  await store.addEnvironment(prod);
  return [prod];
}

export async function addEnvironment(siteKey: string, input: { label?: string; url: string; kind: EnvironmentKind }): Promise<Environment> {
  const url = normalizeUrl(input.url);
  const store = await getContentStore();
  const existing = await listEnvironments(siteKey); // ensures production seed exists too
  if (existing.some((e) => e.url === url)) throw new Error(`An environment for ${url} already exists on this site.`);
  const label = input.label?.trim() || KIND_LABEL[input.kind];
  const base = `${siteKey}-${slugify(label) || input.kind}`;
  const ids = new Set(existing.map((e) => e.id));
  let id = base;
  let n = 2;
  while (ids.has(id)) id = `${base}-${n++}`;
  const env: Environment = { id, siteKey, label, url, kind: input.kind, createdAt: new Date().toISOString() };
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

/** Delete an environment. A site must keep at least one. */
export async function deleteEnvironment(siteKey: string, id: string): Promise<void> {
  const store = await getContentStore();
  const envs = await store.listEnvironments(siteKey);
  if (envs.length <= 1) throw new Error("A site must keep at least one environment.");
  if (!envs.some((e) => e.id === id)) return;
  await store.deleteEnvironment(id);
}
