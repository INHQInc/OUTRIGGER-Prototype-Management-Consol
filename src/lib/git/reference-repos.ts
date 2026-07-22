/**
 * Reference repos — read-only production-source checkouts a prototype should
 * consult (real SCSS/components beat runtime-computed styles, which miss media
 * queries and pseudo-states).
 *
 * Identity + notes ONLY. The local filesystem path is machine-specific, so it
 * belongs in the init script (where it's symlinked in as `source-site/`), never
 * in the committed `.opmc/context.json`.
 *
 * Stored as a content-store flag so this needs no schema migration.
 */
import { getContentStore } from "../content/store";

export interface ReferenceRepo {
  name: string;
  url: string;
  access: "read-only";
  /** Where to look — e.g. "raw SCSS in prototype/src/components; tokens in base/variables.scss". */
  notes?: string;
}

const flagKey = (orgId: string) => `refrepos:${orgId}`;

export async function listReferenceRepos(orgId: string | null | undefined): Promise<ReferenceRepo[]> {
  if (!orgId) return [];
  const raw = await (await getContentStore()).getFlag(flagKey(orgId));
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as ReferenceRepo[]) : [];
  } catch { return []; }
}

export async function setReferenceRepos(orgId: string, repos: ReferenceRepo[]): Promise<ReferenceRepo[]> {
  const clean = (repos ?? [])
    .filter((r) => r?.url?.trim())
    .slice(0, 10)
    .map((r) => ({
      name: (r.name ?? "").trim() || r.url.trim(),
      url: r.url.trim(),
      access: "read-only" as const,
      notes: (r.notes ?? "").trim() || undefined,
    }));
  await (await getContentStore()).setFlag(flagKey(orgId), JSON.stringify(clean));
  return clean;
}
