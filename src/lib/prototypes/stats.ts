/**
 * The deterministic STATISTICS engine under the experiment verdict.
 *
 * Every number the analyst model or the UI shows is computed HERE, in
 * TypeScript, from raw conversions and visitors — the model narrates facts
 * it cannot derive or override (the codebase's enforce-LLM-behavior-in-code
 * law applied to arithmetic). No dependencies; the numerics are the standard
 * closed forms: Wilson score intervals, Katz log-method lift CIs, pooled
 * two-proportion z-tests, a conditional-binomial rate-ratio test for
 * action-total composites, chi-square SRM, Benjamini-Hochberg FDR, a
 * Jeffreys-prior Beta-Binomial Bayesian layer via SEEDED Monte Carlo
 * (same data → same numbers, always), and power/MDE projection.
 */
import type { ExperimentResults, MetricMap, CompositeMetric, MetricResult } from "./results";
import { compositeMembers, resolveMetricRow } from "./results";

// ── numeric primitives ─────────────────────────────────────────────────────

/** ln Γ(x), Lanczos approximation. */
function lnGamma(x: number): number {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += g[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/** Regularized lower incomplete gamma P(a,x) — series + continued fraction. */
function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x < a + 1) {
    // series
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 0; n < 300; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-12) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  }
  // continued fraction (Lentz) for Q, return 1-Q
  let b = x + 1 - a;
  let c = 1 / 1e-30;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 300; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = b + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}

/** Upper-tail chi-square p-value. */
export function chiSquarePValue(x2: number, df: number): number {
  if (!(x2 > 0) || df <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - gammaP(df / 2, x2 / 2)));
}

function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + z / 2);
  const ans =
    t *
    Math.exp(
      -z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? ans : 2 - ans;
}

/** Standard normal CDF Φ(z). */
export function normCdf(z: number): number {
  return 0.5 * erfc(-z / Math.SQRT2);
}

/** Two-sided p from a z statistic. */
const twoSidedP = (z: number) => Math.max(0, Math.min(1, 2 * normCdf(-Math.abs(z))));

/** Deterministic PRNG (mulberry32) — the Bayesian layer must return the
 *  same numbers for the same data on every run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gamma(shape a, scale 1) sampler — Marsaglia-Tsang, boosted for a < 1. */
function sampleGamma(rng: () => number, a: number): number {
  if (a < 1) {
    const u = Math.max(rng(), 1e-12);
    return sampleGamma(rng, a + 1) * Math.pow(u, 1 / a);
  }
  const d = a - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    // polar normal draw
    let x: number;
    let u1: number;
    let u2: number;
    let s: number;
    do {
      u1 = 2 * rng() - 1;
      u2 = 2 * rng() - 1;
      s = u1 * u1 + u2 * u2;
    } while (s >= 1 || s === 0);
    x = u1 * Math.sqrt((-2 * Math.log(s)) / s);
    const v = Math.pow(1 + c * x, 3);
    if (v <= 0) continue;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(Math.max(u, 1e-12)) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

const sampleBeta = (rng: () => number, a: number, b: number) => {
  const x = sampleGamma(rng, a);
  const y = sampleGamma(rng, b);
  return x / (x + y);
};

// ── interval + test building blocks ────────────────────────────────────────

export interface Ci {
  lo: number;
  hi: number;
}

const Z95 = 1.959963985;

/** Wilson score interval on a proportion. */
export function wilsonCi(x: number, n: number, z = Z95): Ci | undefined {
  if (n <= 0) return undefined;
  const p = x / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { lo: Math.max(0, center - half), hi: Math.min(1, center + half) };
}

/** Relative-lift CI via the Katz log method on the rate ratio; zero cells get
 *  the Haldane-Anscombe 0.5 correction. Returns bounds on (RR - 1). */
export function liftCiProportion(x1: number, n1: number, x0: number, n0: number, z = Z95): { lift?: number; ci?: Ci } {
  if (n1 <= 0 || n0 <= 0) return {};
  if (x0 <= 0 && x1 <= 0) return {};
  let a1 = x1;
  let a0 = x0;
  let m1 = n1;
  let m0 = n0;
  if (x1 === 0 || x0 === 0) {
    a1 += 0.5;
    a0 += 0.5;
    m1 += 1;
    m0 += 1;
  }
  const rr = a1 / m1 / (a0 / m0);
  const se = Math.sqrt(Math.max(0, 1 / a1 - 1 / m1 + 1 / a0 - 1 / m0));
  const lift = x0 > 0 ? x1 / n1 / (x0 / n0) - 1 : rr - 1;
  return { lift, ci: { lo: rr * Math.exp(-z * se) - 1, hi: rr * Math.exp(z * se) - 1 } };
}

/** Pooled two-proportion z-test, two-sided. */
export function twoProportionP(x1: number, n1: number, x0: number, n0: number): number | undefined {
  if (n1 <= 0 || n0 <= 0) return undefined;
  const pooled = (x1 + x0) / (n1 + n0);
  if (pooled <= 0 || pooled >= 1) return 1;
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n0));
  if (!(se > 0)) return 1;
  return twoSidedP((x1 / n1 - x0 / n0) / se);
}

/** ACTION-TOTAL (Poisson-style) inference for composites: counts can exceed
 *  one per visitor, so a proportion test is wrong. Conditional-binomial exact
 *  frame: under H0 (equal rates), k1 | k1+k0 ~ Bin(k, n1/(n1+n0)) — normal
 *  approximation with continuity correction. Rate-ratio CI by the Poisson
 *  log method (SE = sqrt(1/k1 + 1/k0), Haldane on zeros). Per-visitor
 *  clustering makes this slightly optimistic — callers carry the caveat. */
export function actionRateTest(k1: number, n1: number, k0: number, n0: number, z = Z95): { lift?: number; ci?: Ci; p?: number } {
  if (n1 <= 0 || n0 <= 0) return {};
  const k = k1 + k0;
  if (k <= 0) return {};
  const pi0 = n1 / (n1 + n0);
  const mean = k * pi0;
  const sd = Math.sqrt(k * pi0 * (1 - pi0));
  // Continuity correction clamped at zero — an uncorrected |k1-mean| below
  // 0.5 must yield p=1, not a negative z manufacturing significance.
  const p = sd > 0 ? twoSidedP(Math.max(0, Math.abs(k1 - mean) - 0.5) / sd) : 1;
  let a1 = k1;
  let a0 = k0;
  if (k1 === 0 || k0 === 0) {
    a1 += 0.5;
    a0 += 0.5;
  }
  const rr = a1 / n1 / (a0 / n0);
  const se = Math.sqrt(1 / a1 + 1 / a0);
  const lift = k0 > 0 ? k1 / n1 / (k0 / n0) - 1 : rr - 1;
  return { lift, ci: { lo: rr * Math.exp(-z * se) - 1, hi: rr * Math.exp(z * se) - 1 }, p };
}

/** Jeffreys Beta-Binomial posterior comparison, seeded Monte Carlo.
 *  Returns P(variant beats baseline) and the expected RELATIVE loss of
 *  shipping the variant if it is actually worse (fraction of baseline rate). */
export function bayesCompare(x1: number, n1: number, x0: number, n0: number): { pBeat: number; expectedLossRel: number } | undefined {
  if (n1 <= 0 || n0 <= 0) return undefined;
  const seed = (Math.imul(x1 + 7, 2654435761) ^ Math.imul(n1 + 13, 40503) ^ Math.imul(x0 + 31, 2246822519) ^ Math.imul(n0 + 3, 3266489917)) >>> 0;
  const rng = mulberry32(seed);
  const DRAWS = 20000;
  let beats = 0;
  let lossSum = 0;
  let baseSum = 0;
  for (let i = 0; i < DRAWS; i++) {
    const p1 = sampleBeta(rng, x1 + 0.5, Math.max(0.5, n1 - x1 + 0.5));
    const p0 = sampleBeta(rng, x0 + 0.5, Math.max(0.5, n0 - x0 + 0.5));
    if (p1 > p0) beats++;
    lossSum += Math.max(0, p0 - p1);
    baseSum += p0;
  }
  const baseMean = baseSum / DRAWS;
  return { pBeat: beats / DRAWS, expectedLossRel: baseMean > 0 ? lossSum / DRAWS / baseMean : 0 };
}

/** Benjamini-Hochberg q-values, order-preserving with the inputs. */
export function benjaminiHochberg(ps: number[]): number[] {
  const m = ps.length;
  if (!m) return [];
  const idx = ps.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const q = new Array<number>(m);
  let running = 1;
  for (let r = m - 1; r >= 0; r--) {
    running = Math.min(running, (idx[r].p * m) / (r + 1));
    q[idx[r].i] = Math.min(1, running);
  }
  return q;
}

/** Sample-ratio-mismatch: chi-square goodness-of-fit of observed visitors
 *  against the allocation weights. The first thing a data scientist checks. */
export function srmCheck(observed: number[], weights?: number[]): { p: number; status: "ok" | "warn" | "compromised"; assumedEqual: boolean } | undefined {
  const total = observed.reduce((s, v) => s + v, 0);
  if (observed.length < 2 || total < 100) return undefined;
  const usable = Boolean(weights && weights.length === observed.length && weights.every((v) => v > 0));
  const assumedEqual = !usable;
  let w = usable ? weights! : observed.map(() => 1);
  const wSum = w.reduce((s, v) => s + v, 0);
  w = w.map((v) => v / wSum);
  let x2 = 0;
  for (let i = 0; i < observed.length; i++) {
    const e = total * w[i];
    if (e <= 0) return undefined;
    x2 += ((observed[i] - e) * (observed[i] - e)) / e;
  }
  const p = chiSquarePValue(x2, observed.length - 1);
  // Without REAL allocation weights the test runs against an ASSUMED equal
  // split — a perfectly healthy 90/10 ramp would "fail" it. An assumption
  // can raise an eyebrow (warn) but may NEVER fabricate "compromised" (which
  // the verdict engine escalates to INVALID).
  const status: "ok" | "warn" | "compromised" = p >= 0.01 ? "ok" : assumedEqual ? "warn" : p < 0.001 ? "compromised" : "warn";
  return { p, status, assumedEqual };
}

/** Required per-arm n to detect a relative lift on baseline rate p0 at
 *  alpha=.05 two-sided, 80% power. */
export function requiredPerArm(p0: number, relLift: number): number | undefined {
  const p1 = p0 * (1 + relLift);
  if (p0 <= 0 || p0 >= 1 || p1 <= 0 || p1 >= 1 || p1 === p0) return undefined;
  const zA = 1.959963985;
  const zB = 0.841621234;
  return Math.ceil(((zA + zB) ** 2 * (p0 * (1 - p0) + p1 * (1 - p1))) / (p1 - p0) ** 2);
}

/** Minimum detectable relative lift at 80% power for the CURRENT per-arm n. */
export function mdeNow(p0: number, perArmN: number): number | undefined {
  if (p0 <= 0 || p0 >= 1 || perArmN < 10) return undefined;
  let lo = 0.001;
  // The search's ceiling must keep p1 = p0(1+lift) below 1 — with hi pinned
  // at +500% every baseline above ~16.7% made requiredPerArm undefined and
  // mdeNow bailed for exactly the high-CTR composites that need power context.
  let hi = Math.min(5, (1 - p0) / p0 - 1e-6);
  if (hi <= lo) return undefined;
  if ((requiredPerArm(p0, hi) ?? Infinity) > perArmN) return undefined; // undetectable even at the ceiling
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const need = requiredPerArm(p0, mid);
    if (need !== undefined && need <= perArmN) hi = mid;
    else lo = mid;
  }
  return hi;
}

// ── the report ──────────────────────────────────────────────────────────────

export interface CellStats {
  variationId: string;
  name: string;
  isBaseline?: boolean;
  n: number;
  count: number;
  rate?: number;
  rateCi?: Ci;
  lift?: number;
  liftCi?: Ci;
  p?: number;
  pBeat?: number;
  expectedLossRel?: number;
}

export interface MetricStats {
  key: string;
  label: string;
  kind: "composite" | "metric";
  test: "proportion" | "actions" | "none";
  role?: CompositeMetric["role"];
  /** The event fires in only ONE arm (e.g. a CTA that exists only in the
   *  variation). Comparative inference is meaningless — the other arm
   *  structurally cannot convert — so lift/p are stripped and the metric is
   *  an ADOPTION view, excluded from the discovery sweep. */
  featureOnly?: "variation" | "baseline";
  cells: CellStats[];
}

export interface ExploratoryRow {
  key: string;
  label: string;
  variationId: string;
  variationName: string;
  lift?: number;
  p: number;
  q: number;
  discovery: boolean;
}

export interface StatsFlag {
  code: "SRM_FAIL" | "SRM_WARN" | "SRM_ASSUMED_EQUAL" | "CANNIBALIZATION" | "UNDERPOWERED" | "NOVELTY_DECAY" | "VALUE_METRIC_NO_INFERENCE" | "ACTION_OVERDISPERSION" | "SHORT_OBSERVATION" | "FEATURE_ONLY_METRIC";
  text: string;
}

export interface PowerBlock {
  baselineRate: number;
  perArmN: number;
  mdeNow?: number;
  observedLift?: number;
  daysToObserved?: number;
  /** The plan's PRE-REGISTERED smallest-lift-worth-shipping (mdeRel). */
  targetLift?: number;
  /** Days of traffic until the pre-registered target effect is detectable. */
  daysToTarget?: number;
  accrualPerArmPerDay?: number;
  observationDays?: number;
}

export interface TrendPoint {
  date: string;
  /** Cumulative lift on the primary composite as of this day. */
  lift?: number;
  focusRate?: number;
  baselineRate?: number;
}

export interface NoveltyBlock {
  earlyLift: number;
  lateLift: number;
  p: number;
  decayed: boolean;
  earlyDays: string;
  lateDays: string;
}

export interface StatsReport {
  computedAt: string;
  validity: { srmP?: number; status: "ok" | "warn" | "compromised" | "unknown"; detail: string };
  metrics: MetricStats[];
  exploratory: ExploratoryRow[];
  expectedFalsePositives: number;
  power?: PowerBlock;
  novelty?: NoveltyBlock;
  /** Cumulative primary-lift by snapshot day — the sparkline's data. */
  trend?: TrendPoint[];
  flags: StatsFlag[];
  /** ids: primary composite + the variation adjudicated against baseline. */
  primaryKey?: string;
  focusVariationId?: string;
  baselineVariationId?: string;
  /** The bound variation was NOT in the results — display stats fell back to
   *  another arm; the verdict engine refuses to adjudicate the substitute. */
  focusFallback?: boolean;
}

/** A trimmed daily observation — enough to recompute trends, tiny enough to
 *  keep ~4 months in one flag. */
export interface DailySnapshot {
  date: string; // yyyy-mm-dd
  variations: { variationId: string; visitors: number }[];
  metrics: { name: string; perVariation: { variationId: string; conversions: number }[] }[];
}

const visitorsOf = (results: ExperimentResults, variationId: string) => results.variations.find((v) => v.variationId === variationId)?.visitors ?? 0;

/** Summed member conversions per variation for a composite (unique/count members only). */
function compositeCounts(c: CompositeMetric, results: ExperimentResults): Map<string, number> {
  const { members } = compositeMembers(c, results);
  const byVar = new Map<string, number>();
  for (const m of members) for (const r of m.perVariation) byVar.set(r.variationId, (byVar.get(r.variationId) ?? 0) + r.conversions);
  return byVar;
}

function metricCells(opts: {
  key: string;
  counts: Map<string, number>;
  results: ExperimentResults;
  test: "proportion" | "actions" | "none";
  baselineId?: string;
  withBayes: boolean;
}): CellStats[] {
  const { counts, results, test, baselineId } = opts;
  const cells: CellStats[] = [];
  const base = baselineId ? { x: counts.get(baselineId) ?? 0, n: visitorsOf(results, baselineId) } : undefined;
  for (const v of results.variations) {
    const x = counts.get(v.variationId) ?? 0;
    const n = v.visitors;
    const cell: CellStats = { variationId: v.variationId, name: v.name, isBaseline: v.variationId === baselineId, n, count: x, rate: n > 0 ? x / n : undefined };
    if (test === "proportion" && n > 0) cell.rateCi = wilsonCi(Math.min(x, n), n);
    if (base && v.variationId !== baselineId && n > 0 && base.n > 0 && test !== "none") {
      if (test === "proportion") {
        const { lift, ci } = liftCiProportion(Math.min(x, n), n, Math.min(base.x, base.n), base.n);
        cell.lift = lift;
        cell.liftCi = ci;
        cell.p = twoProportionP(Math.min(x, n), n, Math.min(base.x, base.n), base.n);
        if (opts.withBayes) {
          const b = bayesCompare(Math.min(x, n), n, Math.min(base.x, base.n), base.n);
          if (b) {
            cell.pBeat = b.pBeat;
            cell.expectedLossRel = b.expectedLossRel;
          }
        }
      } else {
        const { lift, ci, p } = actionRateTest(x, n, base.x, base.n);
        cell.lift = lift;
        cell.liftCi = ci;
        cell.p = p;
      }
    }
    cells.push(cell);
  }
  return cells;
}

/** Windowed novelty-decay check from daily snapshots: compare the primary
 *  composite's absolute rate difference in the first ≥7-day window against
 *  the latest ≥7-day window. Needs ≥14 days of history to say anything. */
function noveltyCheck(history: DailySnapshot[], memberNames: string[], focusId: string, baselineId: string): NoveltyBlock | undefined {
  const days = [...history].sort((a, b) => a.date.localeCompare(b.date));
  if (days.length < 3) return undefined;
  const span = (Date.parse(days[days.length - 1].date) - Date.parse(days[0].date)) / 86400000;
  if (!(span >= 14)) return undefined;

  const wanted = new Set(memberNames);
  const at = (snap: DailySnapshot, variationId: string) => {
    const visitors = snap.variations.find((v) => v.variationId === variationId)?.visitors ?? 0;
    let conv = 0;
    for (const m of snap.metrics) {
      if (!wanted.has(m.name)) continue;
      conv += m.perVariation.find((r) => r.variationId === variationId)?.conversions ?? 0;
    }
    return { visitors, conv };
  };
  // window = cumulative difference between two snapshots
  const windowStats = (a: DailySnapshot, b: DailySnapshot, variationId: string) => {
    const s0 = at(a, variationId);
    const s1 = at(b, variationId);
    return { n: Math.max(0, s1.visitors - s0.visitors), x: Math.max(0, s1.conv - s0.conv) };
  };
  const cut = (fromEnd: boolean) => {
    // earliest snapshot ≥7 days after start (early window) / ≤ latest-7d (late window start)
    if (!fromEnd) {
      const startTs = Date.parse(days[0].date);
      return days.find((d) => Date.parse(d.date) - startTs >= 7 * 86400000);
    }
    const endTs = Date.parse(days[days.length - 1].date);
    return [...days].reverse().find((d) => endTs - Date.parse(d.date) >= 7 * 86400000);
  };
  const earlyEnd = cut(false);
  const lateStart = cut(true);
  if (!earlyEnd || !lateStart || earlyEnd.date > lateStart.date) return undefined;

  const e1 = windowStats(days[0], earlyEnd, focusId);
  const e0 = windowStats(days[0], earlyEnd, baselineId);
  const l1 = windowStats(lateStart, days[days.length - 1], focusId);
  const l0 = windowStats(lateStart, days[days.length - 1], baselineId);
  if (e1.n < 50 || e0.n < 50 || l1.n < 50 || l0.n < 50) return undefined;

  const dEarly = e1.x / e1.n - e0.x / e0.n;
  const dLate = l1.x / l1.n - l0.x / l0.n;
  // Poisson variance on ACTION rates (var ≈ r/n, r uncapped) — the binomial
  // r(1-r) collapses to ~zero as rates approach 100%, which would make the
  // decay z-test declare significance on noise exactly when composites are hot.
  const varOf = (s: { x: number; n: number }) => Math.max(s.x / s.n, 1e-9) / s.n;
  const se = Math.sqrt(varOf(e1) + varOf(e0) + varOf(l1) + varOf(l0));
  if (!(se > 0)) return undefined;
  const p = twoSidedP((dEarly - dLate) / se);
  const baseEarly = e0.x / e0.n;
  const earlyLift = baseEarly > 0 ? dEarly / baseEarly : 0;
  const baseLate = l0.x / l0.n;
  const lateLift = baseLate > 0 ? dLate / baseLate : 0;
  return {
    earlyLift,
    lateLift,
    p,
    decayed: dEarly > 0 && p < 0.05 && dLate < dEarly / 2,
    earlyDays: `${days[0].date} → ${earlyEnd.date}`,
    lateDays: `${lateStart.date} → ${days[days.length - 1].date}`,
  };
}

/** The whole report — one deterministic pass over normalized results. */
export function computeStatsReport(opts: {
  results: ExperimentResults;
  map: MetricMap | null;
  /** The variation this prototype's code runs in (adjudication focus). */
  focusVariationId?: string;
  /** Allocation weights by variationId (Optimizely weight units) for SRM. */
  weights?: Record<string, number>;
  history?: DailySnapshot[];
}): StatsReport {
  const { results, map } = opts;
  const flags: StatsFlag[] = [];

  const baselineId =
    results.metrics.flatMap((m) => m.perVariation).find((r) => r.isBaseline)?.variationId ?? results.variations[0]?.variationId;
  const nonBaseline = results.variations.filter((v) => v.variationId !== baselineId);
  const focusRequestedPresent =
    Boolean(opts.focusVariationId && results.variations.some((v) => v.variationId === opts.focusVariationId));
  const focusId = focusRequestedPresent ? opts.focusVariationId : nonBaseline[0]?.variationId;
  // The fallback is fine for DISPLAY stats; the verdict engine must know it
  // happened — adjudicating a substitute arm as if it were the bound one
  // would be a silent identity swap.
  const focusFallback = Boolean(opts.focusVariationId) && !focusRequestedPresent;

  // ── validity: SRM first, everything else is provisional on it ──
  const observed = results.variations.map((v) => v.visitors);
  const weights = opts.weights ? results.variations.map((v) => opts.weights![v.variationId] ?? 0) : undefined;
  const srm = srmCheck(observed, weights && weights.every((w) => w > 0) ? weights : undefined);
  const validity: StatsReport["validity"] = srm
    ? {
        srmP: srm.p,
        status: srm.status,
        detail:
          srm.status === "ok"
            ? `Traffic split matches allocation (SRM p=${srm.p.toFixed(3)}${srm.assumedEqual ? ", equal split assumed" : ""}).`
            : srm.assumedEqual
              ? `The split deviates from an ASSUMED equal allocation (p=${srm.p < 0.0001 ? "<0.0001" : srm.p.toFixed(4)}) — real allocation weights weren't available, so this may simply be a deliberate unequal split (a ramp). Not treated as invalid; reconnect the experiment config to run the real check.`
              : `Sample-ratio mismatch (p=${srm.p < 0.0001 ? "<0.0001" : srm.p.toFixed(4)}) — the traffic split does not match the CONFIGURED allocation. ${srm.status === "compromised" ? "Every number below is untrustworthy until the cause is found (redirects, bot filtering, targeting bugs)." : "Watch it — if it worsens, results are invalid."}`,
      }
    : { status: "unknown", detail: "Not enough traffic to check the sample ratio yet." };
  if (srm?.status === "compromised") flags.push({ code: "SRM_FAIL", text: validity.detail });
  else if (srm?.status === "warn") flags.push({ code: srm.assumedEqual ? "SRM_ASSUMED_EQUAL" : "SRM_WARN", text: validity.detail });

  // ── per-metric inference ──
  const metrics: MetricStats[] = [];
  const composites = map?.composites ?? [];
  const primary = composites.find((c) => c.role === "primary");

  for (const c of composites) {
    const counts = compositeCounts(c, results);
    metrics.push({
      key: `composite:${c.id}`,
      label: c.label,
      kind: "composite",
      test: "actions",
      role: c.role,
      cells: metricCells({ key: c.id, counts, results, test: "actions", baselineId, withBayes: false }),
    });
  }
  if (composites.length) {
    flags.push({
      code: "ACTION_OVERDISPERSION",
      text: "Composite p-values treat repeat actions as independent; per-guest clustering makes them slightly optimistic. Read them as strong evidence, not exact probabilities.",
    });
  }

  for (const m of results.metrics) {
    const counts = new Map(m.perVariation.map((r) => [r.variationId, r.conversions]));
    const isUnique = m.aggregator === "unique";
    const isValue = Boolean(m.aggregator && !["unique", "count", "total"].includes(m.aggregator));
    metrics.push({
      key: `metric:${m.name}`,
      label: m.name,
      kind: "metric",
      test: isValue ? "none" : isUnique ? "proportion" : "actions",
      cells: metricCells({ key: m.name, counts, results, test: isValue ? "none" : isUnique ? "proportion" : "actions", baselineId, withBayes: false }),
    });
    if (isValue) flags.push({ code: "VALUE_METRIC_NO_INFERENCE", text: `“${m.name}” is a value-style metric (${m.aggregator}); per-visitor variance isn't available from aggregates, so no significance is computed for it.` });
  }

  // ── feature-only reclassification ──
  // A CTA that exists only in the variation reports ZERO on control forever —
  // "lift vs baseline" against a structural zero is meaningless (and explodes
  // to +20,000% via the zero-cell correction), and calling it a "discovery"
  // is dishonest: nobody discovered that guests click a button the control
  // doesn't have. Such metrics become ADOPTION views: rates stay, comparative
  // inference is stripped, discovery eligibility revoked. (Inside composites
  // they remain legitimate members — total intent across arms is the point.)
  const featureOnlyNames: string[] = [];
  if (focusId && baselineId) {
    for (const ms of metrics) {
      if (ms.test === "none") continue;
      const base = ms.cells.find((c) => c.variationId === baselineId);
      const focus = ms.cells.find((c) => c.variationId === focusId);
      if (!base || !focus || base.n < 50 || focus.n < 50) continue;
      const oneSided =
        base.count <= 2 && focus.count >= 50 ? "variation" :
        focus.count <= 2 && base.count >= 50 ? "baseline" : undefined;
      if (!oneSided) continue;
      ms.featureOnly = oneSided;
      for (const c of ms.cells) {
        c.lift = undefined;
        c.liftCi = undefined;
        c.p = undefined;
        c.pBeat = undefined;
        c.expectedLossRel = undefined;
      }
      if (ms.kind === "metric") featureOnlyNames.push(ms.label);
    }
    if (featureOnlyNames.length) {
      flags.push({
        code: "FEATURE_ONLY_METRIC",
        text: `${featureOnlyNames.map((n) => `“${n}”`).join(", ")} fire${featureOnlyNames.length === 1 ? "s" : ""} in only one arm (the other structurally can't — e.g. a CTA that exists only in the variation). Shown as ADOPTION rates, not lift, and excluded from discoveries. Their comparative impact lives in the composite decision metric that pairs them with the control's equivalent action.`,
      });
    }
  }

  // Bayesian layer on the PRIMARY composite's focus-vs-baseline pair only —
  // the decision pair gets the decision numbers.
  const primaryStats = primary ? metrics.find((ms) => ms.key === `composite:${primary.id}`) : undefined;
  if (primary && primaryStats && !primaryStats.featureOnly && focusId && baselineId) {
    const counts = compositeCounts(primary, results);
    const x1 = counts.get(focusId) ?? 0;
    const n1 = visitorsOf(results, focusId);
    const x0 = counts.get(baselineId) ?? 0;
    const n0 = visitorsOf(results, baselineId);
    // The Beta-Binomial posterior needs x ≤ n. When action totals actually
    // exceed visitors, capping would compute a DIFFERENT metric than the
    // rate-ratio test and the two could contradict each other on the same
    // card — so the Bayes layer is suppressed instead (the p-value stands).
    if (x1 < n1 && x0 < n0) {
      const b = bayesCompare(x1, n1, x0, n0);
      const cell = primaryStats.cells.find((c) => c.variationId === focusId);
      if (b && cell) {
        cell.pBeat = b.pBeat;
        cell.expectedLossRel = b.expectedLossRel;
      }
    }
  }

  // ── exploratory sweep + FDR ──
  // One hypothesis per SIGNAL: the pre-registered primary is adjudicated at
  // full alpha (excluded), guardrail composites are adjudicated by the
  // guardrail gate (excluded — no double jeopardy), and raw metrics that are
  // MEMBERS of any composite are excluded (the composite already carries
  // them; member-vs-composite divergence is the cannibalization flag's job).
  // Member exclusion must speak the RESULTS namespace: plan events are
  // registry names, metric rows may carry disambiguated names — resolve.
  const memberEvents = new Set(
    composites.flatMap((c) => c.events.flatMap((e) => {
      const row = resolveMetricRow(e, results);
      return row ? [e, row.name] : [e];
    })),
  );
  const exploratory: ExploratoryRow[] = [];
  const pool: { key: string; label: string; variationId: string; variationName: string; lift?: number; p: number }[] = [];
  for (const ms of metrics) {
    if (primary && ms.key === `composite:${primary.id}`) continue;
    if (ms.kind === "composite" && ms.role === "guardrail") continue;
    if (ms.kind === "metric" && memberEvents.has(ms.label)) continue;
    if (ms.featureOnly) continue; // one-arm events can't "discover" anything
    for (const cell of ms.cells) {
      if (cell.isBaseline || cell.p === undefined) continue;
      pool.push({ key: ms.key, label: ms.label, variationId: cell.variationId, variationName: cell.name, lift: cell.lift, p: cell.p });
    }
  }
  const qs = benjaminiHochberg(pool.map((r) => r.p));
  pool.forEach((r, i) => exploratory.push({ ...r, q: qs[i], discovery: qs[i] <= 0.1 }));
  exploratory.sort((a, b) => a.q - b.q);
  const expectedFalsePositives = Math.round(pool.length * 0.05 * 10) / 10;

  // ── power / projection on the primary pair ──
  let power: PowerBlock | undefined;
  if (primary && focusId && baselineId) {
    const counts = compositeCounts(primary, results);
    const n0 = visitorsOf(results, baselineId);
    const n1 = visitorsOf(results, focusId);
    const x0 = counts.get(baselineId) ?? 0;
    const p0 = n0 > 0 ? Math.min(1, x0 / n0) : 0;
    const perArmN = Math.min(n0, n1);
    if (p0 > 0 && p0 < 1 && perArmN > 0) {
      const cell = metrics.find((ms) => ms.key === `composite:${primary.id}`)?.cells.find((c) => c.variationId === focusId);
      const observedLift = cell?.lift;
      power = { baselineRate: p0, perArmN, mdeNow: mdeNow(p0, perArmN), observedLift };
      const history = opts.history ?? [];
      if (history.length >= 2) {
        const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
        const daySpan = (Date.parse(sorted[sorted.length - 1].date) - Date.parse(sorted[0].date)) / 86400000;
        // Accrual pairs with perArmN: min over the SAME two arms (baseline +
        // focus), not over every variation — mixing arms skews the rate.
        const firstDayOf = (id: string) => sorted[0].variations.find((v) => v.variationId === id)?.visitors ?? 0;
        const firstN = Math.min(firstDayOf(baselineId ?? ""), firstDayOf(focusId ?? ""));
        if (daySpan >= 1) {
          const accrual = Math.max(0, (perArmN - firstN) / daySpan);
          power.accrualPerArmPerDay = Math.round(accrual);
          power.observationDays = Math.round(daySpan);
          if (observedLift !== undefined && Math.abs(observedLift) > 0.0001 && accrual > 0) {
            const need = requiredPerArm(p0, Math.abs(observedLift));
            if (need !== undefined) power.daysToObserved = need <= perArmN ? 0 : Math.ceil((need - perArmN) / accrual);
          }
          // The plan's pre-registered "smallest lift worth shipping" turns
          // power math into the team's own question, not a generic one.
          if (primary.mdeRel !== undefined && primary.mdeRel > 0 && accrual > 0) {
            const needT = requiredPerArm(p0, primary.mdeRel);
            if (needT !== undefined) {
              power.targetLift = primary.mdeRel;
              power.daysToTarget = needT <= perArmN ? 0 : Math.ceil((needT - perArmN) / accrual);
            }
          }
        }
      }
      if (power.mdeNow !== undefined && observedLift !== undefined && Math.abs(observedLift) < power.mdeNow && cell?.p !== undefined && cell.p >= 0.05) {
        flags.push({
          code: "UNDERPOWERED",
          text: `The experiment can currently detect a ±${(power.mdeNow * 100).toFixed(1)}% lift at 80% power; the observed ${(observedLift * 100).toFixed(1)}% is smaller — a non-significant result here is expected either way and proves nothing yet.`,
        });
      }
    }
  }

  // ── cannibalization: computed, not prompted ──
  for (const c of composites) {
    if (c.events.length < 2) continue;
    const ms = metrics.find((x) => x.key === `composite:${c.id}`);
    const cell = ms?.cells.find((x) => x.variationId === focusId);
    if (!cell?.liftCi || !(cell.liftCi.lo < 0 && cell.liftCi.hi > 0)) continue;
    const movers: string[] = [];
    for (const ev of c.events) {
      const rowName = resolveMetricRow(ev, results)?.name ?? ev;
      const raw = metrics.find((x) => x.key === `metric:${rowName}`);
      const rc = raw?.cells.find((x) => x.variationId === focusId);
      if (rc?.liftCi && (rc.liftCi.lo > 0 || rc.liftCi.hi < 0)) movers.push(`${ev} ${rc.lift !== undefined ? `${rc.lift > 0 ? "+" : ""}${(rc.lift * 100).toFixed(1)}%` : ""}`);
    }
    if (movers.length) {
      flags.push({
        code: "CANNIBALIZATION",
        text: `“${c.label}” is flat overall (CI spans zero) while member events moved: ${movers.join(" · ")}. Traffic is shifting BETWEEN the member CTAs, not new intent being created.`,
      });
    }
  }

  // ── novelty decay ──
  let novelty: NoveltyBlock | undefined;
  let trend: TrendPoint[] | undefined;
  if (primary && focusId && baselineId && opts.history?.length) {
    // Snapshots store RESULTS-namespace names — resolve the plan's member
    // events (and the members actually summed, honoring exclusions).
    const memberNames = compositeMembers(primary, results).members.map((m) => m.name);
    novelty = noveltyCheck(opts.history, memberNames, focusId, baselineId);

    // The sparkline: cumulative primary lift as of each snapshot day —
    // deterministic, from the same member resolution as everything else.
    const wanted = new Set(memberNames);
    trend = [...opts.history]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((day) => {
        const armOf = (id: string) => {
          const visitors = day.variations.find((v) => v.variationId === id)?.visitors ?? 0;
          let conv = 0;
          for (const m of day.metrics) {
            if (!wanted.has(m.name)) continue;
            conv += m.perVariation.find((r) => r.variationId === id)?.conversions ?? 0;
          }
          return { visitors, conv };
        };
        const f = armOf(focusId);
        const b = armOf(baselineId);
        const focusRate = f.visitors > 0 ? f.conv / f.visitors : undefined;
        const baselineRate = b.visitors > 0 ? b.conv / b.visitors : undefined;
        return {
          date: day.date,
          focusRate,
          baselineRate,
          lift: focusRate !== undefined && baselineRate !== undefined && baselineRate > 0 ? focusRate / baselineRate - 1 : undefined,
        };
      });
    if (!trend.some((t) => t.lift !== undefined)) trend = undefined;
    if (novelty?.decayed) {
      flags.push({
        code: "NOVELTY_DECAY",
        text: `The primary lift is fading: ${(novelty.earlyLift * 100).toFixed(1)}% in the early window (${novelty.earlyDays}) vs ${(novelty.lateLift * 100).toFixed(1)}% recently (${novelty.lateDays}), p=${novelty.p.toFixed(3)}. Don't extrapolate the cumulative number — the effect may be novelty.`,
      });
    }
  }

  if ((opts.history?.length ?? 0) < 2) {
    flags.push({ code: "SHORT_OBSERVATION", text: "The console has under two days of snapshot history for this experiment — trend, accrual, and novelty checks unlock as daily snapshots accumulate." });
  }

  return {
    computedAt: new Date().toISOString(),
    validity,
    metrics,
    exploratory,
    expectedFalsePositives,
    power,
    novelty,
    trend,
    flags,
    primaryKey: primary ? `composite:${primary.id}` : undefined,
    focusVariationId: focusId,
    baselineVariationId: baselineId,
    focusFallback: focusFallback || undefined,
  };
}
