/**
 * Experiment RESULTS + the metric-semantics layer.
 *
 * Optimizely counts EVENTS; the brief speaks INTENT. "Check Availability
 * clicks" as a decision is often the SUM of several instrumented events
 * (main CTA + overlay CTA) that Opti reports as disconnected rows. The
 * console is the only party holding all three pieces — the brief's metric
 * in words, the built code (which CTAs fire what), and the live numbers —
 * so the COMPOSITE mapping lives here: Claude proposes it, a human
 * confirms it, and the results table computes the decision row from the
 * raw events beneath it.
 *
 * normalizeResults() is the trust boundary for the external API — the UI
 * and the analyst never see a partial shape.
 */
import { getContentStore } from "../content/store";

export interface VariationResult {
  variationId: string;
  name: string;
  conversions: number;
  /** Conversion rate 0..1 when the metric has one. */
  rate?: number;
  /** Relative lift vs baseline, 0.05 = +5%. Absent on the baseline. */
  lift?: number;
  /** Statistical significance 0..1 (Opti reports per-variation). */
  significance?: number;
  isBaseline?: boolean;
}

export interface MetricResult {
  /** Metric name as Optimizely reports it — the join key for composites. */
  name: string;
  /** The PRE-disambiguation name (= the registry event name). The measurement
   *  plan binds to registry names before traffic exists, so joins must accept
   *  either namespace — set whenever disambiguation renamed this row. */
  baseName?: string;
  /** Optimizely's event id. Kept so polarity (winning_direction) can be joined
   *  from the EXPERIMENT payload by identity instead of by array position —
   *  two payloads, two orderings, and a wrong join flips a verdict. */
  eventId?: number;
  aggregator?: string;
  perVariation: VariationResult[];
}

export interface ExperimentResults {
  fetchedAt: string;
  /** The experiment's actual start, from Optimizely's results payload —
   *  the honest day-counter (the console's snapshots may start later). */
  startTime?: string;
  totalVisitors?: number;
  variations: { variationId: string; name: string; visitors: number }[];
  metrics: MetricResult[];
}

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string => (typeof v === "string" ? v : String(v ?? ""));

/** Normalize the raw Optimizely v2 results payload. Returns null only when
 *  the shape is unrecognizable — missing fields degrade per-cell, not whole. */
export function normalizeResults(raw: unknown): ExperimentResults | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const variations: ExperimentResults["variations"] = [];
  const reach = o.reach as Record<string, unknown> | undefined;
  const reachVars = reach?.variations as Record<string, Record<string, unknown>> | undefined;
  if (reachVars && typeof reachVars === "object") {
    for (const [id, v] of Object.entries(reachVars)) {
      if (!v || typeof v !== "object") continue;
      variations.push({ variationId: str(v.variation_id ?? id), name: str(v.name ?? id), visitors: num(v.count) ?? 0 });
    }
  }

  const metrics: MetricResult[] = [];
  const rawMetrics = Array.isArray(o.metrics) ? o.metrics : [];
  for (const m of rawMetrics) {
    if (!m || typeof m !== "object") continue;
    const mo = m as Record<string, unknown>;
    const results = mo.results as Record<string, Record<string, unknown>> | undefined;
    const perVariation: VariationResult[] = [];
    if (results && typeof results === "object") {
      for (const [id, r] of Object.entries(results)) {
        if (!r || typeof r !== "object") continue;
        const lift = r.lift as Record<string, unknown> | undefined;
        perVariation.push({
          variationId: str(r.variation_id ?? id),
          name: str(r.name ?? id),
          conversions: num(r.value) ?? 0,
          rate: num(r.rate),
          lift: lift ? num(lift.value) : undefined,
          significance: lift ? num(lift.significance) : undefined,
          isBaseline: r.is_baseline === true,
        });
      }
    }
    const name = str(mo.name ?? mo.event_id ?? "").trim();
    if (!name || !perVariation.length) continue;
    metrics.push({ name: name.slice(0, 200), eventId: num(mo.event_id), aggregator: typeof mo.aggregator === "string" ? mo.aggregator : undefined, perVariation });
  }

  // NAME is the join key for composites, the proposal enum, and React keys —
  // but Optimizely names aren't unique (the same event added as unique AND
  // total conversions is two metrics, one name). Disambiguate AT the trust
  // boundary so a composite can never silently match two rows and
  // double-count the decision metric.
  const nameCounts = new Map<string, number>();
  for (const m of metrics) nameCounts.set(m.name, (nameCounts.get(m.name) ?? 0) + 1);
  for (const m of metrics) {
    if ((nameCounts.get(m.name) ?? 0) > 1) {
      m.baseName = m.name; // the registry name the measurement plan knows
      m.name = `${m.name} (${m.aggregator ?? "metric"})`.slice(0, 200);
    }
  }
  // Still-colliding names (same event, same aggregator, twice) → numbered.
  const seenNames = new Map<string, number>();
  for (const m of metrics) {
    const n = seenNames.get(m.name) ?? 0;
    seenNames.set(m.name, n + 1);
    if (n > 0) {
      m.baseName = m.baseName ?? m.name;
      m.name = `${m.name} #${n + 1}`.slice(0, 200);
    }
  }

  if (!variations.length && !metrics.length) return null;
  const startTime = typeof o.start_time === "string" && o.start_time ? o.start_time : undefined;
  return { fetchedAt: new Date().toISOString(), startTime, totalVisitors: num(reach?.total_count), variations, metrics };
}

// ── Composite metrics (the semantics layer) ────────────────────────────────

export interface CompositeMetric {
  id: string;
  label: string;
  /** Optimizely metric NAMES (exactly as reported) summed into this composite. */
  events: string[];
  role: "primary" | "guardrail" | "info";
  /** Which way is GOOD. Data, not inference — the verdict engine never
   *  guesses polarity from prose. Defaults to "increase". */
  direction?: "increase" | "decrease";
  note?: string;
  // ── measurement-plan understanding (authored at the interview) ──
  /** What this metrics, in the team's own words. */
  definition?: string;
  /** Which UI surfaces express it, and in which arm each exists. */
  surfaces?: { arm: "both" | "variation" | "baseline"; description: string }[];
  /** DECLARED one-arm expectation (e.g. an overlay CTA that exists only in
   *  the variation) — makes the stats engine's data-driven feature-only
   *  detection a confirmation instead of a surprise. */
  expectedOneArm?: "variation" | "baseline";
  /** Pre-registered smallest relative lift worth shipping — powers
   *  "days until YOUR effect is detectable", not a generic one. */
  mdeRel?: number;
  /** "custom" = user-described, console-computed — badged everywhere as
   *  NOT an Optimizely metric. "optimizely" = the experiment's OWN primary,
   *  synthesized at read time and never stored. Absent = authored by the
   *  measurement plan. */
  source?: "custom" | "optimizely";
  /** PER-ARM event sets. A surface that exists in only one arm can't be
   *  compared to itself; this is how the variation's new CTA is paired with
   *  the control's equivalent action so both arms can express the same
   *  intent. An arm with no entry falls back to `events`, so a symmetric
   *  composite behaves exactly as it always has. */
  armEvents?: { variationId: string; events: string[] }[];
}

export interface MetricMap {
  composites: CompositeMetric[];
  proposedBy?: string;
  confirmed: boolean;
  confirmedBy?: string;
  confirmedAt?: string;
  // ── the measurement PLAN layer (one artifact — the plan compiles here) ──
  /** The interview trail: what the AI asked and what the human answered. */
  interview?: { question: string; answer: string }[];
  /** Planner's honest 0-100 confidence it understands what's being measured. */
  understanding?: number;
  /** Things the team wants measured that NOTHING currently fires an event
   *  for — detected instrumentation gaps, surfaced before start. */
  gaps?: string[];
  /** EVERY event name reviewed at planning time (bound, adoption-only, or
   *  noise) — the drift audit's baseline: a results/registry name not in
   *  here means the build moved past the plan. */
  known?: string[];
  /** Unanswered interview questions — persisted so navigating away doesn't
   *  lose them; emptied on the terminal answers pass. */
  pendingQuestions?: string[];
  /** Questions whose answer is a CHOICE of event — the planner offers
   *  candidates rather than binding one it cannot verify. */
  pendingChoices?: { question: string; options: string[] }[];
  plannedAt?: string;
  /** Primary swaps, in order — a post-observation change of the decision
   *  metric is legitimate but must be DISCLOSED, never silent. */
  primaryHistory?: { from: string; to: string; at: string; by: string }[];
  /** User-chosen display order of the All-metrics index — row keys
   *  ("composite:<id>" / "metric:<name>"). Presentation only. */
  measureOrder?: string[];
  /** Attention rows the team has SEEN and accepted. Acknowledged is not
   *  deleted: they leave the working view and still print, tagged, because a
   *  leadership PDF that omits "the decision metric changed mid-run" is worse
   *  than one that admits it. */
  acknowledged?: string[];
  /** Metrics the reader wants an OBSERVATION for — watched, never
   *  adjudicated. The verdict still reads the decision metric alone. */
  observed?: string[];
  /** Metrics hidden from the index (same key space). Presentation only —
   *  a hidden guardrail still feeds the verdict; the primary can't hide. */
  hiddenMeasures?: string[];
  /** Confirmation stamps a Re-plan replaced — the EARLIEST pre-observation
   *  stamp is what the verdict's pre-registration disclosure keys off, so a
   *  mid-run re-plan can't silently erase "this was declared before traffic". */
  priorConfirmations?: { confirmedBy: string; confirmedAt: string; briefAtConfirm?: MetricMap["briefAtConfirm"] }[];
  /** The BRIEF as it read when the plan was confirmed — the pre-registration
   *  anchor for EXTERNALLY-built prototypes, which never cut or push a
   *  version (console-built prototypes anchor to the pushed version's
   *  briefSnapshot instead). */
  briefAtConfirm?: { change: string; audience: string; outcome: string; primary: string; guardrails: string[] };
}

const mapKey = (k: string) => `metricmap:${k}`;

export async function getMetricMap(prototypeKey: string): Promise<MetricMap | null> {
  const raw = await (await getContentStore()).getFlag(mapKey(prototypeKey));
  if (!raw) return null;
  try {
    const m = JSON.parse(raw) as MetricMap;
    if (!Array.isArray(m.composites)) return null;
    return m;
  } catch { return null; }
}

export async function setMetricMap(prototypeKey: string, map: MetricMap): Promise<void> {
  await (await getContentStore()).setFlag(mapKey(prototypeKey), JSON.stringify(map));
}

/** CAS mutation over the plan/map flag — TWO routes write it (measurement
 *  authoring + results binding), and the planner holds a stale read across a
 *  long LLM call. `fn` gets the FRESH record and returns the next one, or
 *  null to keep the current (no write). */
/** Drop presentation keys pointing at composites that no longer exist. Ids are
 *  slugified from labels and therefore RE-USED — without this, a re-created
 *  metric inherits the deleted one's hidden flag and is born invisible. */
export function pruneMeasureKeys(map: MetricMap): MetricMap {
  const live = new Set(map.composites.map((c) => `composite:${c.id}`));
  const keep = (k: string) => !k.startsWith("composite:") || live.has(k);
  const next = { ...map };
  if (next.measureOrder) next.measureOrder = next.measureOrder.filter(keep);
  if (next.hiddenMeasures) next.hiddenMeasures = next.hiddenMeasures.filter(keep);
  // `observed` is the SUPPORTING set and now drives the beats row, so a key
  // pointing at a deleted composite would promote a metric that no longer
  // exists into the readout's top line.
  if (next.observed) next.observed = next.observed.filter(keep);
  return next;
}

/** Optimizely's OWN primary metric — the first metric attached to the
 *  experiment, which is the number the client reads in their own tool. Four
 *  call sites derived this inline; it is one rule, so it lives in one place. */
export function optiPrimaryKeyOf(results: ExperimentResults | null | undefined): string {
  return results?.metrics[0] ? `metric:${results.metrics[0].name}` : "";
}

/** Six marked + both primaries. The beats row is one line, not a table. */
export const SUPPORTING_CAP = 8;

/** The reserved id of Optimizely's own primary, expressed as a composite. */
export const OPTI_PRIMARY_ID = "opti-primary";

/**
 * THE DECISION METRIC, resolved — the one rule, in one place.
 *
 * Optimizely's primary IS a pre-registration: a human attached it in the
 * system of record before the experiment started. Refusing to adjudicate
 * because that declaration lives in the other system is bureaucracy, not
 * rigour — and it is why a running experiment with real traffic used to read
 * "the console has nothing to judge the run against".
 *
 * So: the console's own nomination wins when there is one; otherwise the
 * experiment's own primary metric is the decision metric, expressed as the
 * one-event composite the stats and verdict engines already understand.
 * Provenance travels with it and is disclosed everywhere — never laundered.
 *
 * The synthesized composite is DERIVED AT READ TIME and never written to the
 * metric map: the plan stays exactly what a human authored.
 */
export function resolveDecisionMap(
  map: MetricMap | null,
  results: ExperimentResults | null,
  /** Optimizely's declared winning direction for its primary metric, when the
   *  experiment payload carries one. UNDEFINED means undeclared — and the
   *  surfaces say "assumed" rather than presenting a default as a fact. */
  optiDirection?: "increase" | "decrease",
): {
  map: MetricMap | null;
  source: "console" | "optimizely" | "none";
  /** True when the row the raw index shows IS the decision metric, so the
   *  readout must not print the same number twice under two names. */
  optiRowIsDecision: boolean;
} {
  // A console primary only outranks Optimizely's when a HUMAN put it there:
  // the plan was confirmed, or someone nominated it (which `primaryHistory`
  // records). `propose` writes a role:"primary" composite with
  // `confirmed:false` straight from the model — adjudicating THAT would let
  // the console return CONFIRMED against a definition nobody ever approved.
  // Optimizely's primary is a real human declaration; an unratified proposal
  // is not, so the declaration wins.
  const own = map?.composites.find((c) => c.role === "primary" && c.source !== "optimizely");
  const ratified = Boolean(map?.confirmed) || (map?.primaryHistory ?? []).some((h) => h.to === own?.label);
  if (own && ratified) return { map, source: "console", optiRowIsDecision: false };

  const name = results?.metrics[0]?.name;
  if (!name) return { map, source: "none", optiRowIsDecision: false };

  const opti: CompositeMetric = {
    id: OPTI_PRIMARY_ID,
    label: name,
    events: [name],
    role: "primary",
    source: "optimizely",
    // Direction of good is DATA when Optimizely declares it, and ABSENT when
    // it does not — never a default dressed as a declaration. The engines
    // already treat absent as "up"; the difference is that every surface can
    // tell the reader which of the two it was.
    ...(optiDirection ? { direction: optiDirection } : {}),
    definition: "Optimizely's own primary metric for this experiment, read from the experiment definition.",
  };
  return {
    map: {
      ...(map ?? { composites: [], confirmed: false }),
      // EXACTLY ONE PRIMARY in the resolved map. An unratified console
      // nomination is demoted here (in memory only — the stored plan keeps it)
      // so no reader can pick a different "first primary" than another and
      // adjudicate a metric the rest of the page isn't showing.
      composites: [opti, ...(map?.composites ?? []).map((c) => (c.role === "primary" ? { ...c, role: "info" as const } : c))],
    },
    source: "optimizely",
    optiRowIsDecision: true,
  };
}

/** THE SUPPORTING SET — the metrics the readout promotes and the analyst is
 *  asked to reason about: Optimizely's primary, the console's decision metric,
 *  and whatever the team marked as supporting the hypothesis.
 *
 *  This is THE seam. The beats row, the Observations list, the reading prompt
 *  and the reading's cache basis all resolve through it — anything picking its
 *  own subset of metrics to narrate is a bug, because the whole point is that
 *  the TEAM chooses what the summary is about, not the model.
 *
 *  Marking supports PROMOTION only, never suppression: an unmarked metric is
 *  still computed, still feeds the verdict, and may still be raised as a
 *  contradiction. Otherwise the toggle would be a way to curate a flattering
 *  readout by omission.
 */
export function supportingKeys(opts: {
  map: MetricMap | null;
  /** Optimizely's primary — always supporting, marked or not. */
  optiPrimaryKey?: string | null;
  /** The console's decision metric — always supporting when one is set. */
  decisionKey?: string | null;
  /** Keys that actually exist in the current stats report. */
  available: string[];
  /** Row order; the client passes its in-flight local order while a drag saves. */
  order?: string[];
  /** The decision metric IS Optimizely's primary, so the raw index row is the
   *  same number under a second name. Passed explicitly rather than sniffed
   *  from the map — the PAGE holds the stored map (no synthesized composite in
   *  it) and would otherwise reach the opposite conclusion from the server. */
  optiRowIsDecision?: boolean;
}): string[] {
  const hidden = new Set(opts.map?.hiddenMeasures ?? []);
  const avail = new Set(opts.available);
  const rank = new Map((opts.order ?? opts.map?.measureOrder ?? []).map((k, i) => [k, i] as const));
  const decidesOnOpti = opts.optiRowIsDecision
    ?? opts.map?.composites.some((c) => c.role === "primary" && c.source === "optimizely");
  const optiPrimaryKey = decidesOnOpti ? undefined : opts.optiPrimaryKey;
  // Optimizely's primary leads, then the decision metric, then the team's own
  // row order — ONE ordering to think about across every surface.
  const rankOf = (k: string) =>
    k === optiPrimaryKey ? -2
      : k === opts.decisionKey ? -1
      : rank.get(k) ?? Number.MAX_SAFE_INTEGER;
  return [...new Set([
    ...(optiPrimaryKey ? [optiPrimaryKey] : []),
    ...(opts.decisionKey ? [opts.decisionKey] : []),
    ...(opts.map?.observed ?? []),
  ])]
    // A hidden row is hidden everywhere — except the two primaries, which
    // refuse to hide and are read whether or not anyone asked.
    .filter((k) => avail.has(k) && (!hidden.has(k) || k === optiPrimaryKey || k === opts.decisionKey))
    .sort((a, b) => rankOf(a) - rankOf(b))
    .slice(0, SUPPORTING_CAP);
}

/** Blank the metric map. The store has no delete; every reader treats an
 *  empty flag as absent, which is what "no plan yet" means. */
export async function clearMetricMap(prototypeKey: string): Promise<void> {
  await (await getContentStore()).setFlag(mapKey(prototypeKey), "");
}

/** Blank the console's own daily observation history (the day-by-day trend). */
export async function clearResultsHistory(prototypeKey: string): Promise<void> {
  await (await getContentStore()).setFlag(historyKey(prototypeKey), "");
}

export async function mutateMetricMap(
  prototypeKey: string,
  fn: (current: MetricMap | null) => MetricMap | null,
): Promise<MetricMap | null> {
  const store = await getContentStore();
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await store.getFlag(mapKey(prototypeKey));
    let current: MetricMap | null = null;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as MetricMap;
        if (Array.isArray(parsed.composites)) current = parsed;
      } catch { /* treat as absent */ }
    }
    const next = fn(current);
    if (next === null) return current;
    if (await store.compareAndSetFlag(mapKey(prototypeKey), raw, JSON.stringify(next))) return next;
  }
  return getMetricMap(prototypeKey);
}

/** Compute a composite's per-variation row by SUMMING its member events.
 *  Semantics are ACTION TOTALS, not unique visitors: a guest clicking both
 *  CTAs counts twice, so the derived "rate" (summed conversions / visitors)
 *  is actions-per-visitor and CAN exceed 100% — displayed with that caveat,
 *  never clamped. Lift derives from those rates; significance is per-event
 *  and doesn't compose (member rows keep it). Members with value-style
 *  aggregators (sum/revenue) are excluded — cents added to clicks is
 *  garbage, not a metric. */
/** Resolve ONE plan event name to ONE results row. Exact (disambiguated)
 *  name wins; else the registry baseName — and when several rows share the
 *  baseName (the same event attached under two aggregators), exactly one is
 *  chosen (unique > count/total > first) so a composite can never silently
 *  double-count the same event. This is THE join rule — plan, stats, and
 *  drift must all go through it or the namespaces diverge again. */
export function resolveMetricRow(eventName: string, results: ExperimentResults): MetricResult | undefined {
  const exact = results.metrics.find((m) => m.name === eventName);
  if (exact) return exact;
  const candidates = results.metrics.filter((m) => m.baseName === eventName);
  if (!candidates.length) return undefined;
  const pref = (m: MetricResult) => (m.aggregator === "unique" ? 0 : m.aggregator === "count" || m.aggregator === "total" ? 1 : 2);
  return [...candidates].sort((a, b) => pref(a) - pref(b))[0];
}

/** The event names this composite reads for one arm. */
export function armEventsFor(c: CompositeMetric, variationId: string): string[] {
  return c.armEvents?.find((a) => a.variationId === variationId)?.events ?? c.events;
}

/** Every event the composite touches in any arm — the membership used for
 *  staleness reporting ("a member stopped reporting") and for the raw-event
 *  overlap checks. */
export function allCompositeEvents(c: CompositeMetric): string[] {
  return [...new Set([...(c.events ?? []), ...(c.armEvents ?? []).flatMap((a) => a.events)])];
}

export function compositeMembers(c: CompositeMetric, results: ExperimentResults): { members: MetricResult[]; missing: string[]; excluded: string[] } {
  const members: MetricResult[] = [];
  const excluded: string[] = [];
  const missing: string[] = [];
  const used = new Set<MetricResult>();
  for (const e of allCompositeEvents(c)) {
    const row = resolveMetricRow(e, results);
    if (!row || used.has(row)) {
      if (!row) missing.push(e);
      continue;
    }
    used.add(row);
    // The exclusion exists to stop cents being summed into clicks. With a
    // SINGLE event there is nothing to mix, so a lone total/value metric is
    // the composite rather than being excluded out of existence — which is
    // what left Optimizely's revenue-style primary computing nothing at all.
    const lone = allCompositeEvents(c).length === 1;
    if (!lone && row.aggregator && !["unique", "count"].includes(row.aggregator)) excluded.push(row.name);
    else members.push(row);
  }
  return { members, missing, excluded };
}

// ── daily snapshot history (trend · accrual · novelty decay) ────────────────
//
// One flag (`resultshistory:<key>`) holding an append-only array of trimmed
// daily observations — written lazily the first time results are viewed each
// day (UTC). Whole-blob flag + compareAndSetFlag = safe under concurrent
// viewers, same grammar as the coverage store. Capped at 180 days.

export interface ResultsHistory {
  days: import("./stats").DailySnapshot[];
}

const historyKey = (k: string) => `resultshistory:${k}`;

export async function getResultsHistory(prototypeKey: string): Promise<ResultsHistory> {
  const raw = await (await getContentStore()).getFlag(historyKey(prototypeKey));
  if (!raw) return { days: [] };
  try {
    const h = JSON.parse(raw) as ResultsHistory;
    return Array.isArray(h.days) ? h : { days: [] };
  } catch {
    return { days: [] };
  }
}

/** Record today's cumulative numbers if today isn't recorded yet. Lost CAS
 *  races and already-recorded days are both fine — first writer wins. */
export async function recordDailySnapshot(prototypeKey: string, results: ExperimentResults): Promise<ResultsHistory> {
  const store = await getContentStore();
  const today = new Date().toISOString().slice(0, 10);
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await store.getFlag(historyKey(prototypeKey));
    let history: ResultsHistory = { days: [] };
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as ResultsHistory;
        if (Array.isArray(parsed.days)) history = parsed;
      } catch { /* rebuild from empty */ }
    }
    if (history.days.some((d) => d.date === today)) return history;
    const snap = {
      date: today,
      variations: results.variations.map((v) => ({ variationId: v.variationId, visitors: v.visitors })),
      metrics: results.metrics.map((m) => ({
        name: m.name,
        perVariation: m.perVariation.map((r) => ({ variationId: r.variationId, conversions: r.conversions })),
      })),
    };
    // A concluded/paused experiment's numbers stop moving — recording an
    // identical day would only churn the reading's staleness basis (a daily
    // LLM regeneration for zero new information).
    const last = history.days[history.days.length - 1];
    if (last && JSON.stringify({ v: last.variations, m: last.metrics }) === JSON.stringify({ v: snap.variations, m: snap.metrics })) {
      return history;
    }
    const next: ResultsHistory = { days: [...history.days, snap].sort((a, b) => a.date.localeCompare(b.date)).slice(-180) };
    if (await store.compareAndSetFlag(historyKey(prototypeKey), raw, JSON.stringify(next))) return next;
  }
  return getResultsHistory(prototypeKey);
}

/**
 * A WINDOWED view of the results: the difference between the latest snapshot
 * and the one at (or before) the window's start — Optimizely reports only
 * cumulative totals, but the console's own daily history makes honest
 * date-range analytics possible. The VERDICT always judges the full run;
 * a window changes the view, never the adjudication.
 */
export function windowedResults(full: ExperimentResults, history: import("./stats").DailySnapshot[], days: number): { results: ExperimentResults; from: string; to: string } | null {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return null;
  const last = sorted[sorted.length - 1];
  const cutoff = Date.parse(last.date) - days * 86400000;
  let base = sorted[0];
  for (const d of sorted) {
    if (Date.parse(d.date) <= cutoff) base = d;
  }
  if (base.date === last.date) return null;

  const baseVisitors = new Map(base.variations.map((v) => [v.variationId, v.visitors]));
  const variations = full.variations.map((v) => {
    const lastV = last.variations.find((x) => x.variationId === v.variationId)?.visitors ?? v.visitors;
    return { ...v, visitors: Math.max(0, lastV - (baseVisitors.get(v.variationId) ?? 0)) };
  });

  const baseMetric = new Map(base.metrics.map((m) => [m.name, new Map(m.perVariation.map((r) => [r.variationId, r.conversions]))]));
  const metrics: MetricResult[] = [];
  for (const lm of last.metrics) {
    // shape (aggregator, baseName, baseline flags) comes from the FULL
    // results by name — snapshots store only counts
    const shape = full.metrics.find((m) => m.name === lm.name);
    const prior = baseMetric.get(lm.name);
    metrics.push({
      name: lm.name,
      baseName: shape?.baseName,
      aggregator: shape?.aggregator,
      perVariation: lm.perVariation.map((r) => {
        const fullCell = shape?.perVariation.find((x) => x.variationId === r.variationId);
        const conv = Math.max(0, r.conversions - (prior?.get(r.variationId) ?? 0));
        const n = variations.find((v) => v.variationId === r.variationId)?.visitors ?? 0;
        return {
          variationId: r.variationId,
          name: fullCell?.name ?? r.variationId,
          conversions: conv,
          rate: n > 0 ? conv / n : undefined,
          isBaseline: fullCell?.isBaseline,
        };
      }),
    });
  }
  return { results: { fetchedAt: full.fetchedAt, variations, metrics }, from: base.date, to: last.date };
}

export function computeComposite(c: CompositeMetric, results: ExperimentResults): VariationResult[] {
  const { members } = compositeMembers(c, results);
  if (!members.length) return [];
  const visitorsBy = new Map(results.variations.map((v) => [v.variationId, v.visitors]));
  const byVar = new Map<string, VariationResult>();
  for (const m of members) {
    for (const r of m.perVariation) {
      // An arm only counts the events ITS OWN list names — that is what makes
      // pairing a variation-only surface with the control's equivalent honest.
      if (!armEventsFor(c, r.variationId).some((e) => resolveMetricRow(e, results) === m)) continue;
      const cur = byVar.get(r.variationId);
      if (cur) { cur.conversions += r.conversions; cur.isBaseline = cur.isBaseline || r.isBaseline; }
      else byVar.set(r.variationId, { variationId: r.variationId, name: r.name, conversions: r.conversions, isBaseline: r.isBaseline });
    }
  }
  const rows = [...byVar.values()].map((r) => {
    const visitors = visitorsBy.get(r.variationId);
    return { ...r, rate: visitors ? r.conversions / visitors : undefined };
  });
  const baseline = rows.find((r) => r.isBaseline);
  if (baseline?.rate) {
    for (const r of rows) {
      if (!r.isBaseline && r.rate !== undefined) r.lift = r.rate / baseline.rate - 1;
    }
  }
  return rows;
}
