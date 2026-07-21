/**
 * Per-customer console API token — lets trusted CLI tooling (the Claude Code
 * prototype skill) read a prototype's brief, check its source status, and cut
 * versions WITHOUT a browser session. Scope is enforced at the route level:
 * the token's org must own the prototype being touched. It can never promote,
 * delete, or change configuration.
 *
 * Format: opmc_<orgId>_<48 hex chars>  (org ids are slugs — never contain "_")
 * Storage: content_meta flag `api-token:<orgId>` (no schema change).
 */
import { getContentStore } from "./content/store";

function generate(orgId: string): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `opmc_${orgId}_${hex}`;
}

const flagKey = (orgId: string) => `api-token:${orgId}`;

/** The customer's API token, minting one on first use. */
export async function ensureApiToken(orgId: string): Promise<string> {
  const store = await getContentStore();
  const existing = await store.getFlag(flagKey(orgId));
  if (existing) return existing;
  const token = generate(orgId);
  await store.setFlag(flagKey(orgId), token);
  return token;
}

/** Invalidate the old token and mint a new one. */
export async function regenerateApiToken(orgId: string): Promise<string> {
  const token = generate(orgId);
  await (await getContentStore()).setFlag(flagKey(orgId), token);
  return token;
}

/**
 * Resolve an Authorization header to the org it authenticates, or null.
 * Constant-shape parse → single flag lookup → exact match.
 */
export async function apiOrgFromAuthHeader(header: string | null): Promise<string | null> {
  if (!header?.startsWith("Bearer opmc_")) return null;
  const token = header.slice("Bearer ".length).trim();
  const parts = token.split("_");
  if (parts.length !== 3 || parts[0] !== "opmc" || !/^[0-9a-f]{48}$/.test(parts[2])) return null;
  const orgId = parts[1];
  const stored = await (await getContentStore()).getFlag(flagKey(orgId));
  return stored === token ? orgId : null;
}
