/**
 * The ANALYST NOTEBOOK — what the analyst remembers about its audience.
 *
 * Two layers, per Bryan's model:
 *  - ORG notebook (`notebook:org:<orgId>`): the audience (leadership by
 *    default) and durable presentation preferences that apply to EVERY
 *    experiment ("always lead with visitors", "track the mobile angle").
 *    Human-visible, human-removable chips — never a black box.
 *  - PROTOTYPE notebook (`notebook:<key>`): this experiment's memory — the
 *    user's ask-box questions, the AI's follow-up questions and the answers,
 *    and dataWishes (things the user wants that the data can't show —
 *    recorded honestly instead of improvised).
 *
 * INTEGRITY BOUNDARY (enforced where these are consumed): the notebook
 * tunes EMPHASIS, LAYOUT, and VOICE. It never touches thresholds, the
 * verdict, or the honesty rules. Leadership pressure can change how the
 * story is told, never what the numbers say.
 *
 * Also here: the READING cache (`reading:<key>`) — the standing AI
 * narrative, regenerated only when the data materially moves.
 */
import { getContentStore } from "../content/store";

export interface OrgNotebook {
  audience: string; // "leadership" default — the voice the reading writes for
  preferences: string[];
  updatedAt?: string;
}

export interface NotebookEntry {
  /** "answer" is a HUMAN answer (tune flow); the analyst's own replies are
   *  "analyst-answer" — attribution matters or the model reads its old
   *  words as the team's stated preferences. */
  kind: "user-question" | "ai-question" | "answer" | "analyst-answer" | "note";
  text: string;
  at: string;
}

export interface ProtoNotebook {
  entries: NotebookEntry[];
  /** Wanted-but-unmeasurable asks (segments, funnels) — the honest ledger. */
  dataWishes: string[];
  updatedAt?: string;
}

export interface Reading {
  /** The TLDR — one or two sentences a leader reads first. */
  summary?: string;
  /** "What the data shows" — 1-3 short plain-language paragraphs. */
  dataRead?: string[];
  /** Legacy cached readings (pre-sectioned format). */
  story?: string[];
  trendLine?: string;
  watchItems: string[];
  questionsForYou: string[];
  nextStep: string;
  generatedAt: string;
  /** What the reading was generated FROM — staleness is a key comparison. */
  basisKey: string;
}

const orgKey = (orgId: string) => `notebook:org:${orgId}`;
const protoKey = (k: string) => `notebook:${k}`;
const readingKey = (k: string) => `reading:${k}`;

async function readJson<T>(flag: string): Promise<T | null> {
  const raw = await (await getContentStore()).getFlag(flag);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function casMutate<T>(flag: string, empty: T, fn: (cur: T) => T | null): Promise<T> {
  const store = await getContentStore();
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await store.getFlag(flag);
    let cur = empty;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as T;
        if (parsed && typeof parsed === "object") cur = parsed;
      } catch { /* corrupted → start from empty */ }
    }
    const next = fn(cur);
    if (next === null) return cur;
    if (await store.compareAndSetFlag(flag, raw, JSON.stringify(next))) return next;
  }
  // FAIL LOUD: a silently dropped mutation would still get audited and
  // reported as success by callers. The routes' catch turns this into a 400.
  throw new Error("The notebook is receiving concurrent updates — try again.");
}

// ── org notebook ────────────────────────────────────────────────────────────

export async function getOrgNotebook(orgId: string): Promise<OrgNotebook> {
  const n = await readJson<OrgNotebook>(orgKey(orgId));
  return n && Array.isArray(n.preferences) ? n : { audience: "leadership", preferences: [] };
}

/** Append a durable preference (deduped, capped, visible+removable in UI).
 *  `replacePrefix` drops any earlier preference for the same question first —
 *  a re-answer must replace, never accumulate a contradiction. */
export async function addOrgPreference(orgId: string, preference: string, replacePrefix?: string): Promise<OrgNotebook> {
  const p = preference.trim().slice(0, 200);
  if (!p) return getOrgNotebook(orgId);
  return casMutate<OrgNotebook>(orgKey(orgId), { audience: "leadership", preferences: [] }, (cur) => {
    let prefs = Array.isArray(cur.preferences) ? cur.preferences : [];
    if (replacePrefix) prefs = prefs.filter((x) => !x.toLowerCase().startsWith(replacePrefix.toLowerCase()));
    if (prefs.some((x) => x.toLowerCase() === p.toLowerCase())) return null;
    return { ...cur, audience: cur.audience || "leadership", preferences: [...prefs, p].slice(-12), updatedAt: new Date().toISOString() };
  });
}

export async function removeOrgPreference(orgId: string, preference: string): Promise<OrgNotebook> {
  return casMutate<OrgNotebook>(orgKey(orgId), { audience: "leadership", preferences: [] }, (cur) => {
    const next = (cur.preferences ?? []).filter((x) => x !== preference);
    // A no-op removal must not phantom-bump updatedAt — it would mark every
    // prototype's reading stale org-wide for zero content change.
    if (next.length === (cur.preferences ?? []).length) return null;
    return { ...cur, preferences: next, updatedAt: new Date().toISOString() };
  });
}

// ── prototype notebook ──────────────────────────────────────────────────────

export async function getProtoNotebook(prototypeKey: string): Promise<ProtoNotebook> {
  const n = await readJson<ProtoNotebook>(protoKey(prototypeKey));
  return n && Array.isArray(n.entries) ? { ...n, dataWishes: Array.isArray(n.dataWishes) ? n.dataWishes : [] } : { entries: [], dataWishes: [] };
}

export async function appendNotebook(prototypeKey: string, entries: Omit<NotebookEntry, "at">[], dataWishes?: string[]): Promise<ProtoNotebook> {
  const at = new Date().toISOString();
  return casMutate<ProtoNotebook>(protoKey(prototypeKey), { entries: [], dataWishes: [] }, (cur) => {
    const wishes = [...(cur.dataWishes ?? [])];
    let newWish = false;
    for (const w of dataWishes ?? []) {
      const t = w.trim().slice(0, 200);
      if (t && !wishes.some((x) => x.toLowerCase() === t.toLowerCase())) {
        wishes.push(t);
        newWish = true;
      }
    }
    // No-op appends must NOT bump updatedAt — the reading's staleness basis
    // keys off it, and a phantom bump would loop regeneration forever.
    if (!entries.length && !newWish) return null;
    return {
      entries: [...(cur.entries ?? []), ...entries.map((e) => ({ ...e, text: e.text.slice(0, 600), at }))].slice(-30),
      dataWishes: wishes.slice(-10),
      updatedAt: at,
    };
  });
}

// ── the reading cache ───────────────────────────────────────────────────────

/** What "materially moved" means — the reading regenerates ONLY when this
 *  key changes (new snapshot day, verdict change, mapping change, notebook
 *  change). Keeps the reading instant on load and the API bill bounded. */
export function readingBasisKey(parts: {
  latestSnapshotDate?: string;
  verdict?: string;
  mapConfirmedAt?: string;
  orgNotebookUpdatedAt?: string;
  protoNotebookUpdatedAt?: string;
}): string {
  return [parts.latestSnapshotDate ?? "-", parts.verdict ?? "-", parts.mapConfirmedAt ?? "-", parts.orgNotebookUpdatedAt ?? "-", parts.protoNotebookUpdatedAt ?? "-"].join("|");
}

export async function getReading(prototypeKey: string): Promise<Reading | null> {
  const r = await readJson<Reading>(readingKey(prototypeKey));
  return r && Array.isArray(r.story) ? r : null;
}

/** CAS save — an older generation racing a newer one must never win the flag. */
export async function saveReading(prototypeKey: string, reading: Reading): Promise<void> {
  await casMutate<Reading | Record<string, never>>(readingKey(prototypeKey), {}, (cur) => {
    const existing = cur && "generatedAt" in cur ? (cur as Reading) : null;
    if (existing && existing.generatedAt > reading.generatedAt) return null; // newer already saved
    return reading;
  }).catch(() => { /* concurrent saves — the surviving one is fine */ });
}
