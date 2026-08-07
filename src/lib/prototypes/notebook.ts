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

/** One movement of the read: the words, and the ONE metric that evidences
 *  them. The number lives with the sentence that explains it — a standalone
 *  row of lifts underneath was a magnitude with no meaning, sitting between
 *  prose that gave the meaning and a table that gave the context. */
export interface ReadSection {
  text: string;
  /** Resolved to a LIVE value by the page, never a number the model typed. */
  measureKey?: string;
}

export interface Reading {
  /** The story in the shape a leader reads: one headline, one short
   *  paragraph, then the numbers as beats. The WORDS carry no digits and a
   *  beat names a MEASURE, not a number — the page resolves the live value,
   *  so the narrative can never drift from the data beside it. */
  headline?: string;
  lede?: string;
  /** The analyst's paragraph was rejected (digits, over-length, statistics
   *  vocabulary) and the COMPUTED floor is what is rendering. Silent fallback
   *  made a validator bug look like a quality problem for a whole session. */
  ledeComputed?: boolean;
  /** THE READ, in the SAME four movements for every experiment. One paragraph
   *  of good prose is still a wall — you cannot scan back to the part you
   *  half-remember. Fixed sections mean the shape is learned once and every
   *  readout is navigable. Absent on readings written before this. */
  read?: { effect?: ReadSection; shift?: ReadSection; cost?: ReadSection; prediction?: ReadSection };
  beats?: { measureKey: string; label: string }[];
  /** One line per WATCHED metric — an observation, never a decision. */
  observations?: { measureKey: string; note: string }[];
  /** Previous three-row form — still rendered if a cached reading has it. */
  findings?: { figureKey?: string; claim: string }[];
  /** ≤70-char glosses keyed to an attention row the CODE authored. The
   *  analyst may explain a risk; it may never invent one. */
  riskNotes: { code: string; note: string }[];
  /** One caption under the day-by-day picture it describes. */
  trend?: string;
  /** At most one preference question, answered in the analyst thread. */
  question?: string;
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
  /** The supporting set. Marking a metric changes what the reading is ABOUT,
   *  so a cached reading from the old set is stale by definition — without
   *  this the toggle looks broken: the row never changes. */
  supporting?: string[];
}): string {
  // READING_FORMAT bumps retire every cached reading on deploy — a format
  // change must never leave old walls of text rendering until data moves.
  // MEMBERSHIP, not order: the keys are sorted so dragging a row in the index
  // — presentation — cannot retire the reading and buy a fresh Opus call for
  // words that would come out the same.
  const sup = parts.supporting?.length ? [...parts.supporting].sort().join(",") : "";
  return ["fmt12", parts.latestSnapshotDate ?? "-", parts.verdict ?? "-", parts.mapConfirmedAt ?? "-", parts.orgNotebookUpdatedAt ?? "-", parts.protoNotebookUpdatedAt ?? "-",
    sup ? `sup:${sup}` : "-"].join("|");
}

/** Blank the cached reading. */
export async function clearReading(prototypeKey: string): Promise<void> {
  await (await getContentStore()).setFlag(readingKey(prototypeKey), "");
}

/** Clear the CONVERSATION only. Data wishes are an instrumentation ledger
 *  and org preferences are how the analyst writes for this team — neither is
 *  chat history, so neither goes with it. */
export async function clearNotebookEntries(prototypeKey: string): Promise<void> {
  await casMutate<ProtoNotebook>(protoKey(prototypeKey), { entries: [], dataWishes: [] }, (cur) => {
    if (!cur?.entries?.length) return null;
    return { ...cur, entries: [], updatedAt: new Date().toISOString() };
  }).catch(() => { /* nothing to clear */ });
}

/** Blank this prototype's analyst notebook — the thread and its data wishes.
 *  ORG preferences live in a different flag and are deliberately untouched:
 *  they are how the analyst writes for this team, not what it learned here. */
export async function clearProtoNotebook(prototypeKey: string): Promise<void> {
  await (await getContentStore()).setFlag(protoKey(prototypeKey), "");
}

export async function getReading(prototypeKey: string): Promise<Reading | null> {
  const r = await readJson<Reading>(readingKey(prototypeKey));
  return r && (Array.isArray(r.beats) || Array.isArray(r.findings)) ? r : null;
}

/** CAS save — an older generation racing a newer one must never win the flag. */
export async function saveReading(prototypeKey: string, reading: Reading): Promise<void> {
  await casMutate<Reading | Record<string, never>>(readingKey(prototypeKey), {}, (cur) => {
    const existing = cur && "generatedAt" in cur ? (cur as Reading) : null;
    if (existing && existing.generatedAt > reading.generatedAt) return null; // newer already saved
    return reading;
  }).catch(() => { /* concurrent saves — the surviving one is fine */ });
}
