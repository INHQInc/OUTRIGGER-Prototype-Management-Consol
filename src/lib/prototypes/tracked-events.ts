/**
 * TRACKED EVENTS — what the overlay draws when a page opens with
 * ?opmc_metrics=1.
 *
 * For one prototype: its Optimizely experiment, the experiment's variations
 * (which of our prototypes shows each one through the loader, whether a
 * variation is simply the page as it is, and the build Optimizely holds), and
 * the click events its metrics count, with their selectors.
 *
 * Read-only against Optimizely. Reached only through /api/loader/metrics,
 * which the loader calls ONLY when the page's address carries
 * opmc_metrics=1. A normal page load never gets here.
 */
import { getContentStore } from "../content/store";
import { getOptimizelyClientForOrg } from "../experimentation";
import { OptimizelyClient, type OptiChange, type OptiEvent, type OptiExperiment } from "../optimizely/api";
import { getSite } from "../sites";
import { buildFor } from "../reports/build";
import type { StatsReport } from "./stats";

export interface TrackedVariation {
  id: string;
  name: string;
  /** The prototype key that shows this variation through the loader, if ours. */
  opmc: string | null;
  /** True when the variation changes nothing (usually the original), so the
   *  page without our code IS this variation. */
  pageAsIs: boolean;
  /** The "built from src <hash>" stamp on the code Optimizely holds, if ours. */
  optimizelyBuild: string | null;
}

export interface TrackedEvents {
  experiment: { id: string; name: string; status: string };
  variations: TrackedVariation[];
  events: { name: string; selector: string }[];
  /** Metrics with no selector (not click events): nothing on a page to box. */
  notDrawable: string[];
}

/** Optimizely's editor leaves an empty attribute change on each element an
 *  event was created on. It changes nothing on the page. */
export function isNoOpChange(c: OptiChange): boolean {
  if (c.type !== "attribute") return false;
  const empty = (o: unknown) => o === undefined || o === null || (typeof o === "object" && Object.keys(o as object).length === 0);
  const rearrange = c.rearrange as { insertSelector?: string } | undefined;
  return empty(c.attributes) && empty(c.css) && !rearrange?.insertSelector;
}

/** The build stamp our build script writes at the top of a variation's code. */
export function buildStamp(code: string | null): string | null {
  return code ? /built from src ([0-9a-f]+)/.exec(code.slice(0, 400))?.[1] ?? null : null;
}

/** Pure: the overlay's data from what Optimizely returned. */
export function assembleTrackedEvents(exp: OptiExperiment, metricEvents: OptiEvent[], keyForVariation: Map<string, string>): TrackedEvents {
  const events: TrackedEvents["events"] = [];
  const notDrawable: string[] = [];
  for (const e of metricEvents) {
    const selector = typeof e.config?.selector === "string" ? e.config.selector.trim() : "";
    if (selector) events.push({ name: e.name, selector });
    else notDrawable.push(e.name);
  }
  const variations = (exp.variations ?? []).filter((v) => !v.archived).map((v) => ({
    id: String(v.variation_id),
    name: v.name,
    opmc: keyForVariation.get(String(v.variation_id)) ?? null,
    pageAsIs: (v.actions ?? []).flatMap((a) => a.changes ?? []).every(isNoOpChange),
    optimizelyBuild: buildStamp(OptimizelyClient.liveVariationBuild(exp, v.variation_id).customCode),
  }));
  return { experiment: { id: String(exp.id), name: exp.name, status: exp.status }, variations, events, notDrawable };
}

export async function trackedEventsFor(key: string): Promise<{ data: TrackedEvents } | { status: number; error: string }> {
  const store = await getContentStore();
  const proto = await store.getPrototype(key);
  if (!proto) return { status: 404, error: "No prototype with that key." };
  const bound = proto.experiment;
  if (!bound?.experimentId) return { status: 404, error: "This prototype isn't bound to an Optimizely experiment yet." };
  // resolvePrototypeOrg would backfill a legacy record. This route is public,
  // so it only reads.
  const orgId = proto.orgId || (proto.siteKey ? (await getSite(proto.siteKey))?.orgId ?? "" : "");
  const client = orgId ? await getOptimizelyClientForOrg(orgId) : null;
  if (!client) return { status: 404, error: "Optimizely isn't connected for this customer." };

  const exp = await client.getExperiment(bound.experimentId);
  // By id: the project's /events list misses events that metrics point at
  // (see OptimizelyClient.getEvent).
  const ids = [...new Set((exp.metrics ?? []).flatMap((m) => (m.event_id === undefined ? [] : [m.event_id])))];
  const metricEvents = await Promise.all(ids.map((id) => client.getEvent(id)));

  // Which of our prototypes shows each variation.
  const keyFor = new Map<string, string>();
  for (const p of await store.listPrototypes()) {
    if (String(p.experiment?.experimentId ?? "") === String(exp.id) && p.experiment?.variationId) keyFor.set(String(p.experiment.variationId), p.key);
  }
  if (bound.variationId) keyFor.set(String(bound.variationId), proto.key);
  return { data: assembleTrackedEvents(exp, metricEvents, keyFor) };
}

// ── results on the page (?opmc_analytics=1) ─────────────────────────────────

/** One event's result, worded the way the Evidence board words its chips, so
 *  the page and the board can't disagree. Variation first, then control. */
export interface EventReading {
  event: string;
  /** up / down only once the interval excludes zero; new = the element
   *  exists only in the variation, so the number is adoption, not lift. */
  tone: "up" | "down" | "flat" | "new";
  delta: string;
  variationRate: string;
  controlRate: string;
  counts: string;
  settled: "settled" | "not settled" | "new surface";
}

export interface TrackedResults {
  experimentName: string;
  /** Visitors, variation vs control: "25,181 vs 25,096". */
  visitors: string;
  readings: EventReading[];
}

const pct = (v?: number) => (v === undefined ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`);
// Two decimals below 10%, as in the readout and on the Evidence board.
const rate = (v?: number) => (v === undefined ? "—" : `${(v * 100).toFixed(Math.abs(v * 100) >= 10 ? 1 : 2)}%`);
const count = (v?: number) => (v === undefined ? "—" : v.toLocaleString("en-US"));

/** Pure: one reading per per-event metric in a stats report (composites are
 *  the plan's sums of events, so they have no single element to sit on). */
export function resultReadings(stats: StatsReport): EventReading[] {
  return stats.metrics.filter((m) => m.kind === "metric").map((m) => {
    const focus = m.cells.find((c) => c.variationId === stats.focusVariationId);
    const base = m.cells.find((c) => c.variationId === stats.baselineVariationId);
    const sig = Boolean(focus?.liftCi && focus.liftCi.lo * focus.liftCi.hi > 0);
    const featureOnly = Boolean(m.featureOnly);
    return {
      event: m.key.startsWith("metric:") ? m.key.slice("metric:".length) : m.label,
      tone: featureOnly ? "new" : !sig ? "flat" : (focus?.lift ?? 0) >= 0 ? "up" : "down",
      delta: featureOnly ? "new" : pct(focus?.lift),
      variationRate: rate(focus?.rate),
      controlRate: featureOnly ? "—" : rate(base?.rate),
      counts: featureOnly ? count(focus?.count) : `${count(focus?.count)} vs ${count(base?.count)}`,
      settled: featureOnly ? "new surface" : sig ? "settled" : "not settled",
    };
  });
}

/** The results for a prototype, for the overlay (?opmc_analytics=1).
 *
 * NOT GATED, by Bryan's decision (24 Sep 2026, "lets not gate it for now"):
 * anyone who opens a page with the flag and the prototype's key can read these
 * results. The gated version, the emailed readout's signed token
 * (lib/reports/link), was proposed and set aside for now. */
export async function trackedResultsFor(key: string): Promise<{ data: TrackedResults } | { status: number; error: string }> {
  const store = await getContentStore();
  const proto = await store.getPrototype(key);
  if (!proto) return { status: 404, error: "No prototype with that key." };
  // resolvePrototypeOrg would backfill a legacy record; this route is public,
  // so it only reads.
  const orgId = proto.orgId || (proto.siteKey ? (await getSite(proto.siteKey))?.orgId ?? "" : "");
  if (!orgId) return { status: 404, error: "No customer for this prototype." };
  const built = await buildFor(orgId, proto);
  if ("unavailable" in built || !built.stats) return { status: 404, error: "No results yet." };
  const stats = built.stats;
  const first = stats.metrics.find((m) => m.cells.length);
  const n = (id?: string) => first?.cells.find((c) => c.variationId === id)?.n;
  return {
    data: {
      experimentName: proto.experiment?.experimentName ?? proto.name,
      visitors: `${count(n(stats.focusVariationId))} vs ${count(n(stats.baselineVariationId))}`,
      readings: resultReadings(stats),
    },
  };
}
