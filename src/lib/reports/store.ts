/**
 * REPORT PERSISTENCE — flags, not tables.
 *
 * The design promises "next send" and "last run", both single fields on the
 * record; history is already answered by `audit_event`, which is org-scoped and
 * surfaced at /settings/activity. So no `ContentStore` method is added and the
 * FS and Neon backends cannot drift. The object model maps 1:1 onto a `report`
 * table keyed `(org_id, …)` the day the sweep outgrows reading every blob —
 * a storage swap, not a redesign.
 *
 * The store exposes no prefix scan, so an INDEX flag per org lists the ids.
 * Every write keeps the index and the record consistent, index last: an index
 * entry pointing at nothing breaks the list screen, while an orphaned record
 * is merely invisible.
 */
import { getContentStore } from "../content/store";
import type { Report, RecipientGroup, Person } from "./types";

const recordKey = (orgId: string, id: string) => `report:v2:${orgId}:${id}`;
const groupKey = (orgId: string, id: string) => `group:v1:${orgId}:${id}`;
const indexKey = (orgId: string) => `reports:index:${orgId}`;

interface Index { reports: string[]; groups: string[] }

async function readIndex(orgId: string): Promise<Index> {
  const raw = await (await getContentStore()).getFlag(indexKey(orgId));
  if (!raw) return { reports: [], groups: [] };
  try {
    const p = JSON.parse(raw) as Partial<Index>;
    return { reports: Array.isArray(p.reports) ? p.reports : [], groups: Array.isArray(p.groups) ? p.groups : [] };
  } catch {
    return { reports: [], groups: [] };
  }
}

/** CAS loop — the sweep settling a run and a human saving an edit are genuinely
 *  concurrent, and a lost index entry is a report that vanishes from the list. */
async function mutateIndex(orgId: string, fn: (cur: Index) => Index): Promise<void> {
  const store = await getContentStore();
  for (let attempt = 0; attempt < 4; attempt++) {
    const raw = await store.getFlag(indexKey(orgId));
    const cur = raw ? (JSON.parse(raw) as Index) : { reports: [], groups: [] };
    const next = fn({ reports: cur.reports ?? [], groups: cur.groups ?? [] });
    if (await store.compareAndSetFlag(indexKey(orgId), raw, JSON.stringify(next))) return;
  }
  throw new Error("Couldn't update the report index — try again.");
}

export async function getReport(orgId: string, id: string): Promise<Report | null> {
  const raw = await (await getContentStore()).getFlag(recordKey(orgId, id));
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as Report;
    // A TOMBSTONE IS NOT A RECORD. There is no deleteFlag, so delete unlinks
    // from the index — and the index is not what `getReport` reads. Without
    // this check a deleted report still resolved by URL, so its detail page
    // still loaded and its Send now button still mailed people.
    return r.deleted ? null : r;
  } catch { return null; }
}

export async function listReports(orgId: string): Promise<Report[]> {
  const idx = await readIndex(orgId);
  const out = await Promise.all(idx.reports.map((id) => getReport(orgId, id)));
  return out.filter((r): r is Report => r !== null).sort((a, z) => a.name.localeCompare(z.name));
}

export async function putReport(r: Report): Promise<void> {
  const store = await getContentStore();
  await store.setFlag(recordKey(r.orgId, r.id), JSON.stringify(r));
  await mutateIndex(r.orgId, (cur) =>
    cur.reports.includes(r.id) ? cur : { ...cur, reports: [...cur.reports, r.id] });
}

/**
 * Read-modify-write against the EXACT bytes we read. Returns null on a lost
 * race after retries so the caller decides — the sweep must SKIP rather than
 * retry, because losing the claim race means another invocation is already
 * sending this report.
 */
export async function mutateReport(
  orgId: string,
  id: string,
  fn: (cur: Report) => Report,
  attempts = 4,
): Promise<Report | null> {
  const store = await getContentStore();
  for (let i = 0; i < attempts; i++) {
    const raw = await store.getFlag(recordKey(orgId, id));
    if (!raw) return null;
    let cur: Report;
    try { cur = JSON.parse(raw) as Report; } catch { return null; }
    const next = fn(cur);
    if (await store.compareAndSetFlag(recordKey(orgId, id), raw, JSON.stringify(next))) return next;
  }
  return null;
}

/**
 * Claim this week BEFORE sending. Returns the claimed record, or null if
 * anyone else already has it — in which case do nothing at all.
 *
 * THIS CANNOT GO THROUGH `mutateReport`. That helper re-reads the record and
 * compares against its OWN fresh read, which makes it a lost-update guard and
 * nothing more: a second invocation that reads an already-claimed blob would
 * CAS against exactly those bytes and succeed. Two overlapping sweeps would
 * both claim and both send, and the second settle would overwrite the first so
 * the record showed a single send while two landed in the inbox.
 *
 * So the precondition lives INSIDE the compare: the periodKey check rejects a
 * claim that already happened, and the CAS against the bytes we read rejects
 * one that lands between our read and our write. One attempt on purpose — a
 * lost race is a decision, not a transient failure.
 */
export async function claimRun(orgId: string, id: string, periodKey: string, late: boolean): Promise<Report | null> {
  const store = await getContentStore();
  const raw = await store.getFlag(recordKey(orgId, id));
  if (!raw) return null;
  let cur: Report;
  try { cur = JSON.parse(raw) as Report; } catch { return null; }
  // Someone already holds this week — claimed, sent or failed alike.
  if (cur.run?.periodKey === periodKey) return null;
  const next: Report = {
    ...cur,
    run: { periodKey, state: "claimed", at: new Date().toISOString(), ...(late ? { late: true } : {}) },
  };
  return (await store.compareAndSetFlag(recordKey(orgId, id), raw, JSON.stringify(next))) ? next : null;
}

export async function deleteReport(orgId: string, id: string): Promise<void> {
  // The store has no deleteFlag, so deletion is a TOMBSTONE ON THE RECORD plus
  // an index unlink. The tombstone is the load-bearing half: `getReport` reads
  // the record key directly and never consults the index, so unlinking alone
  // left the report fully alive to anyone holding its URL.
  await mutateReport(orgId, id, (cur) => ({ ...cur, deleted: true, updatedAt: new Date().toISOString() }));
  await mutateIndex(orgId, (cur) => ({ ...cur, reports: cur.reports.filter((x) => x !== id) }));
}

// ── GROUPS ──────────────────────────────────────────────────────────────────

export async function getGroup(orgId: string, id: string): Promise<RecipientGroup | null> {
  const raw = await (await getContentStore()).getFlag(groupKey(orgId, id));
  if (!raw) return null;
  try { return JSON.parse(raw) as RecipientGroup; } catch { return null; }
}

export async function listGroups(orgId: string): Promise<RecipientGroup[]> {
  const idx = await readIndex(orgId);
  const out = await Promise.all(idx.groups.map((id) => getGroup(orgId, id)));
  return out.filter((g): g is RecipientGroup => g !== null).sort((a, z) => a.name.localeCompare(z.name));
}

export async function putGroup(g: RecipientGroup): Promise<void> {
  const store = await getContentStore();
  await store.setFlag(groupKey(g.orgId, g.id), JSON.stringify(g));
  await mutateIndex(g.orgId, (cur) =>
    cur.groups.includes(g.id) ? cur : { ...cur, groups: [...cur.groups, g.id] });
}

/**
 * The people a report would mail RIGHT NOW — a group resolved live, or the
 * inline list. Unsubscribed and undeliverable are filtered here, once, so no
 * caller can forget. Returns everyone so the UI can show who is excluded and
 * why; `receiving()` is what the sender uses.
 */
export async function audienceOf(r: Report): Promise<Person[]> {
  if (r.audience.mode === "list") return r.audience.people;
  const g = await getGroup(r.orgId, r.audience.groupId);
  return g?.people ?? [];
}

export const receiving = (people: Person[]) => people.filter((p) => p.state === "receiving");
