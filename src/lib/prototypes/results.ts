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
  aggregator?: string;
  perVariation: VariationResult[];
}

export interface ExperimentResults {
  fetchedAt: string;
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
    metrics.push({ name: name.slice(0, 200), aggregator: typeof mo.aggregator === "string" ? mo.aggregator : undefined, perVariation });
  }

  // NAME is the join key for composites, the proposal enum, and React keys —
  // but Optimizely names aren't unique (the same event added as unique AND
  // total conversions is two metrics, one name). Disambiguate AT the trust
  // boundary so a composite can never silently match two rows and
  // double-count the decision metric.
  const nameCounts = new Map<string, number>();
  for (const m of metrics) nameCounts.set(m.name, (nameCounts.get(m.name) ?? 0) + 1);
  for (const m of metrics) {
    if ((nameCounts.get(m.name) ?? 0) > 1) m.name = `${m.name} (${m.aggregator ?? "metric"})`.slice(0, 200);
  }
  // Still-colliding names (same event, same aggregator, twice) → numbered.
  const seenNames = new Map<string, number>();
  for (const m of metrics) {
    const n = seenNames.get(m.name) ?? 0;
    seenNames.set(m.name, n + 1);
    if (n > 0) m.name = `${m.name} #${n + 1}`.slice(0, 200);
  }

  if (!variations.length && !metrics.length) return null;
  return { fetchedAt: new Date().toISOString(), totalVisitors: num(reach?.total_count), variations, metrics };
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
}

export interface MetricMap {
  composites: CompositeMetric[];
  proposedBy?: string;
  confirmed: boolean;
  confirmedBy?: string;
  confirmedAt?: string;
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

/** Compute a composite's per-variation row by SUMMING its member events.
 *  Semantics are ACTION TOTALS, not unique visitors: a guest clicking both
 *  CTAs counts twice, so the derived "rate" (summed conversions / visitors)
 *  is actions-per-visitor and CAN exceed 100% — displayed with that caveat,
 *  never clamped. Lift derives from those rates; significance is per-event
 *  and doesn't compose (member rows keep it). Members with value-style
 *  aggregators (sum/revenue) are excluded — cents added to clicks is
 *  garbage, not a metric. */
export function compositeMembers(c: CompositeMetric, results: ExperimentResults): { members: MetricResult[]; missing: string[]; excluded: string[] } {
  const members: MetricResult[] = [];
  const excluded: string[] = [];
  const present = new Set<string>();
  for (const m of results.metrics) {
    if (!c.events.includes(m.name)) continue;
    present.add(m.name);
    if (m.aggregator && !["unique", "count"].includes(m.aggregator)) excluded.push(m.name);
    else members.push(m);
  }
  const missing = c.events.filter((e) => !present.has(e));
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
    const next: ResultsHistory = { days: [...history.days, snap].sort((a, b) => a.date.localeCompare(b.date)).slice(-180) };
    if (await store.compareAndSetFlag(historyKey(prototypeKey), raw, JSON.stringify(next))) return next;
  }
  return getResultsHistory(prototypeKey);
}

export function computeComposite(c: CompositeMetric, results: ExperimentResults): VariationResult[] {
  const { members } = compositeMembers(c, results);
  if (!members.length) return [];
  const visitorsBy = new Map(results.variations.map((v) => [v.variationId, v.visitors]));
  const byVar = new Map<string, VariationResult>();
  for (const m of members) {
    for (const r of m.perVariation) {
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
