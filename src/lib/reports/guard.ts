/**
 * TENANT ISOLATION FOR REPORTS.
 *
 * Two checks, and both are load-bearing:
 *
 *  1. The org comes off the RECORD, never out of the URL or the storage key. A
 *     caller who forges an id containing another tenant's slug still loads a
 *     record carrying the true org, and fails on that.
 *  2. Every prototype key in a report's scope is re-checked against the org AT
 *     SEND TIME, not only when saved. Without that, a report saved while a key
 *     belonged to you and read later is a cross-tenant read primitive.
 *
 * Session only. `tokenAllowed` is not a parameter: these routes mail real
 * people on a customer's behalf, and the read-scoped token an agent holds must
 * never reach them.
 */
import { canAccessOrg } from "../active-org";
import { getContentStore } from "../content/store";
import { resolvePrototypeOrg } from "../prototypes/org";
import { getReport } from "./store";
import type { Report } from "./types";

export async function guardReport(
  orgId: string | null | undefined,
  id: string | null | undefined,
): Promise<{ report: Report; orgId: string } | { error: string; status: number }> {
  if (!orgId || !id) return { error: "Which report?", status: 400 };
  if (!(await canAccessOrg(orgId))) return { error: "Not found.", status: 404 };
  const report = await getReport(orgId, id);
  if (!report) return { error: "Not found.", status: 404 };
  // The record's own org wins over anything the caller supplied.
  if (!(await canAccessOrg(report.orgId))) return { error: "Not found.", status: 404 };
  return { report, orgId: report.orgId };
}

/**
 * Every key in scope belongs to this org. Returns the keys that do NOT, so the
 * caller can refuse the write and name them rather than silently dropping
 * them — a scope that quietly loses an experiment is a report that stops
 * covering something nobody notices.
 */
export async function foreignScopeKeys(orgId: string, keys: string[]): Promise<string[]> {
  if (!keys.length) return [];
  const store = await getContentStore();
  const all = await store.listPrototypes();
  const out: string[] = [];
  for (const key of keys) {
    const proto = all.find((p) => p.key === key);
    if (!proto) { out.push(key); continue; }
    // Resolve rather than read the field: legacy records carry no orgId and
    // reach it through their site link. Reading `proto.orgId` here would call
    // a prototype the rest of the app happily serves "foreign".
    if ((await resolvePrototypeOrg(proto)) !== orgId) out.push(key);
  }
  return out;
}
