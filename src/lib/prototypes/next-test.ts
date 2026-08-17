/**
 * WHAT TO TEST NEXT — the computed half.
 *
 * The console is complete on "what happened" and silent on "what now". This
 * closes that gap with arithmetic only: no prose, no model call, nothing that
 * can invent a number. Everything here is a pure function of the readout model
 * the verdict already produced, so it is reproducible, diff-able, and testable
 * against a real run (see docs/dev/next-test-smoke.mts, which asserts against
 * the Home Page Hero figures).
 *
 * FOUR THINGS A HUMAN GETS WRONG AND ARITHMETIC DOESN'T:
 *
 *  1. PICKING A PRIMARY THAT CANNOT RESOLVE. The temptation after a run is to
 *     promote the most exciting number — usually the rarest one, usually a
 *     booking. At a 1.08% baseline and the traffic this experiment actually
 *     got, detecting 20% takes about eight weeks. Pre-registering it as the
 *     decision metric guarantees an unresolvable test. `resolvability` makes
 *     that a hard eligibility gate rather than a footnote nobody reads.
 *
 *  2. READING "NOT SIGNIFICANT" AS "NO INFORMATION". A tight interval around
 *     zero is a PROVEN NULL — a direction ruled out, which is worth as much as
 *     a win because it stops the next test wasting a fortnight on it. A wide
 *     interval around zero is merely unresolved. Same p-value, opposite
 *     meaning. `ruleOuts` separates them by the width of the interval, which is
 *     the only thing that distinguishes them.
 *
 *  3. LOSING THE TRANSFER. Eight metrics each moving a few percent, none
 *     significant, is noise — unless the counts sum to the count the decision
 *     metric lost, at which point it is one finding with eight witnesses.
 *     Nothing in a per-metric readout can see that; it is a property of the
 *     set.
 *
 *  4. TREATING METRICS AS INDEPENDENT WHEN THEY ARE A FUNNEL. Fewer arrivals
 *     and more completions is a worse result read row by row and a better one
 *     read as a ratio. `funnelPairs` computes the ratio and refuses to claim
 *     the two are on one path — that is a question for analytics, not for us.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: write the hypothesis, name the thing to
 * build, or rank creative options. Those need judgement and a model, they sit
 * on top of these figures, and they are Phase 3.
 */
import { requiredPerArm, mdeNow } from "./stats";
import type { MetricView } from "./readout-model";

/** The effect the NEXT test is planned to resolve. 20% is the smallest move
 *  worth a fortnight of traffic on a page-level change; smaller effects need
 *  more traffic than a hospitality site produces in a sane window. */
export const TARGET_REL = 0.2;
/** Beyond this, a test is a quarter-long commitment and should be an explicit
 *  decision rather than a default. */
const PRACTICAL_DAYS = 28;
const IMPRACTICAL_DAYS = 56;
/** An interval entirely inside ±6% is a null we can act on. Reported alongside
 *  the interval's own bound, so the reader never has to take the threshold on
 *  trust. */
const NULL_BOUND = 0.06;
/** A pair is only worth composing when the smaller metric is plausibly a
 *  subset of the larger. Outside this band it is two unrelated things. */
const PAIR_MIN = 0.05, PAIR_MAX = 0.9;
/** Below this the composed ratio is inside the noise of two noisy counts. */
const PAIR_MIN_DELTA = 0.15;
/** Fewer events than this and a ratio is uninterpretable at any delta. */
const MIN_PAIR_COUNT = 100;

export interface Traffic {
  perArmN: number;
  days: number;
  perArmPerDay: number;
}

export interface Resolvability {
  /** Smallest relative lift the LAST run could have resolved. */
  mdeRel?: number;
  /** Per-arm n needed for TARGET_REL. */
  needPerArm?: number;
  /** Days to reach it at the rate this experiment actually accrued. */
  days?: number;
  verdict: "resolvable" | "slow" | "impractical" | "unknown";
}

export interface Candidate {
  key: string;
  label: string;
  baselineRate?: number;
  lift?: number;
  ci: { lo: number; hi: number } | null;
  resolvability: Resolvability;
  /** Machine-readable reason codes. The UI renders them; it never invents its
   *  own explanation for a ranking it did not compute. */
  reasons: string[];
  score: number;
  eligible: boolean;
  ineligible?: string;
}

export interface RuleOut {
  key: string;
  label: string;
  /** The largest effect the interval still admits, either way. */
  bound: number;
  provenNull: boolean;
}

export interface CarryForward {
  key: string;
  label: string;
  lift?: number;
  why: "gained" | "guardrail";
}

export interface Transfer {
  lostKey: string;
  lostLabel: string;
  /** Negative — the count the decision metric gave up. */
  lost: number;
  /** Net count change across every other eligible measure. */
  net: number;
  /** net / |lost|. Near 1 means the actions moved rather than vanished. */
  coverage: number;
  contributors: { key: string; label: string; delta: number }[];
}

export interface FunnelPair {
  upKey: string; upLabel: string;
  downKey: string; downLabel: string;
  baseRatio: number;
  focusRatio: number;
  deltaRel: number;
  /** Always false. Whether these sit on one path is an analytics question and
   *  this module will not answer it by inference. */
  confirmed: false;
}

export interface NextTest {
  traffic: Traffic;
  primary: Candidate | null;
  alternatives: Candidate[];
  excluded: Candidate[];
  guardrails: CarryForward[];
  ruleOuts: RuleOut[];
  transfer: Transfer | null;
  funnelPairs: FunnelPair[];
}

const raw = (f: { raw?: number; absent: boolean } | null | undefined) =>
  f && !f.absent && typeof f.raw === "number" && isFinite(f.raw) ? f.raw : undefined;

/** How long TARGET_REL takes at the rate this experiment actually accrued. */
export function resolvabilityOf(baselineRate: number | undefined, t: Traffic): Resolvability {
  if (baselineRate === undefined || baselineRate <= 0 || baselineRate >= 1 || t.perArmPerDay <= 0) {
    return { verdict: "unknown" };
  }
  const mdeRel = mdeNow(baselineRate, t.perArmN);
  const needPerArm = requiredPerArm(baselineRate, TARGET_REL);
  if (needPerArm === undefined) return { mdeRel, verdict: "unknown" };
  const days = Math.ceil(needPerArm / t.perArmPerDay);
  return {
    mdeRel, needPerArm, days,
    verdict: days <= PRACTICAL_DAYS ? "resolvable" : days <= IMPRACTICAL_DAYS ? "slow" : "impractical",
  };
}

export function deriveNextTest(all: MetricView[], power: { perArmN?: number; observationDays?: number } | undefined): NextTest {
  const perArmN = power?.perArmN ?? 0;
  const days = power?.observationDays ?? 0;
  const traffic: Traffic = { perArmN, days, perArmPerDay: days > 0 ? perArmN / days : 0 };

  // Composites are sums of the rows beneath them. Counting both double-counts
  // every action, which would wreck the transfer arithmetic outright.
  const rows = all.filter((m) => m.kind === "metric" && !m.featureOnly);

  const boundOf = (m: MetricView) => (m.ci ? Math.max(Math.abs(m.ci.lo), Math.abs(m.ci.hi)) : undefined);
  const isNull = (m: MetricView) => { const b = boundOf(m); return b !== undefined && b <= NULL_BOUND; };

  const ruleOuts: RuleOut[] = rows
    .filter((m) => m.ci && !m.isDecision && isNull(m))
    .map((m) => ({ key: m.key, label: m.label, bound: boundOf(m)!, provenNull: true }))
    .sort((a, z) => a.bound - z.bound);

  // ── candidates for the next primary ──────────────────────────────────────
  const funnelPairs = pairsOf(rows, isNull);
  const downstreamKeys = new Set(funnelPairs.map((p) => p.upKey));

  const candidates: Candidate[] = rows.map((m) => {
    const baselineRate = raw(m.baseRate) ?? raw(m.focusRate);
    const lift = raw(m.lift);
    const res = resolvabilityOf(baselineRate, traffic);
    const reasons: string[] = [];
    let score = 0;

    if (lift !== undefined && lift < 0 && !isNull(m)) { score += 3; reasons.push("moved the wrong way and is not a settled null"); }
    if (downstreamKeys.has(m.key)) { score += 2; reasons.push("sits above a step whose conversion changed"); }
    if (m.role !== "exploratory") { score += 1; reasons.push("already part of the measured set"); }
    if (m.guardrail) { score -= 2; reasons.push("is a guardrail — protects, does not lead"); }
    if (isNull(m)) { score -= 3; reasons.push("interval is tight around zero — nothing left to find"); }

    let ineligible: string | undefined;
    if (m.isDecision) ineligible = "already settled by this run — retesting it buys nothing";
    else if (res.verdict === "impractical") ineligible = `needs ~${res.days} days to resolve ${Math.round(TARGET_REL * 100)}% at this traffic`;
    else if (res.verdict === "unknown") ineligible = "no usable baseline rate";

    return { key: m.key, label: m.label, baselineRate, lift, ci: m.ci ? { lo: m.ci.lo, hi: m.ci.hi } : null,
             resolvability: res, reasons, score, eligible: !ineligible, ineligible };
  });

  const rank = (a: Candidate, z: Candidate) =>
    z.score - a.score || (a.resolvability.days ?? 1e9) - (z.resolvability.days ?? 1e9);
  const eligible = candidates.filter((c) => c.eligible).sort(rank);
  const excluded = candidates.filter((c) => !c.eligible)
    .sort((a, z) => z.score - a.score)
    .filter((c) => c.score > 0 || c.ineligible?.startsWith("needs"));

  // ── what must not fall back ──────────────────────────────────────────────
  const guardrails: CarryForward[] = [
    ...all.filter((m) => m.guardrail).map((m) => ({ key: m.key, label: m.label, lift: raw(m.lift), why: "guardrail" as const })),
    ...rows.filter((m) => !m.guardrail && !m.isDecision && !isNull(m) && (raw(m.lift) ?? 0) > 0)
           .sort((a, z) => (raw(z.lift) ?? 0) - (raw(a.lift) ?? 0))
           .slice(0, 4)
           .map((m) => ({ key: m.key, label: m.label, lift: raw(m.lift), why: "gained" as const })),
  ];

  return { traffic, primary: eligible[0] ?? null, alternatives: eligible.slice(1, 4), excluded,
           guardrails, ruleOuts, transfer: transferOf(rows, isNull), funnelPairs };
}

/** Did the decision metric's actions reappear elsewhere, or vanish? */
function transferOf(rows: MetricView[], isNull: (m: MetricView) => boolean): Transfer | null {
  const decision = rows.find((m) => m.isDecision);
  if (!decision) return null;
  const dFocus = raw(decision.focusCount), dBase = raw(decision.baseCount);
  if (dFocus === undefined || dBase === undefined) return null;
  const lost = dFocus - dBase;
  if (lost >= 0) return null; // nothing was given up; there is no transfer to account for

  // A metric PROVEN not to have moved cannot be where the actions went — which
  // is also what keeps high-volume depth metrics out of a click-transfer sum.
  const others = rows.filter((m) => !m.isDecision && !m.guardrail && !isNull(m));
  const contributors = others.map((m) => {
    const f = raw(m.focusCount), b = raw(m.baseCount);
    return f !== undefined && b !== undefined ? { key: m.key, label: m.label, delta: f - b } : null;
  }).filter(Boolean) as { key: string; label: string; delta: number }[];
  if (!contributors.length) return null;

  const net = contributors.reduce((s, c) => s + c.delta, 0);
  return {
    lostKey: decision.key, lostLabel: decision.label, lost, net,
    coverage: net / Math.abs(lost),
    contributors: contributors.sort((a, z) => Math.abs(z.delta) - Math.abs(a.delta)),
  };
}

/** Metric pairs whose composed ratio moved — a funnel step, if they are one. */
function pairsOf(rows: MetricView[], isNull: (m: MetricView) => boolean): FunnelPair[] {
  const usable = rows.filter((m) =>
    // THE DECISION METRIC IS NEVER HALF OF A PAIR. It is the lever we pulled,
    // not a step we observed — its numerator was changed on purpose, so any
    // ratio against it moves enormously and means nothing. Left in, it
    // outranked the real pair by 175% to 28% on the run this was built from.
    !m.isDecision
    && !isNull(m)
    // Below ~100 events the ratio's own interval is wider than any movement it
    // could show, so the composed number is not interpretable.
    && (raw(m.baseCount) ?? 0) >= MIN_PAIR_COUNT
    && raw(m.focusCount) !== undefined
    && raw(m.lift) !== undefined);
  const out: FunnelPair[] = [];
  for (const up of usable) {
    for (const down of usable) {
      if (up.key === down.key) continue;
      const ub = raw(up.baseCount)!, uf = raw(up.focusCount)!;
      const db = raw(down.baseCount)!, df = raw(down.focusCount)!;
      const share = db / ub;
      if (share < PAIR_MIN || share > PAIR_MAX) continue;
      // Opposite directions is what makes the ratio worth composing at all: two
      // metrics moving together say nothing a single row didn't already say.
      if (Math.sign(raw(up.lift)!) === Math.sign(raw(down.lift)!)) continue;
      const baseRatio = db / ub, focusRatio = df / uf;
      if (!isFinite(baseRatio) || !isFinite(focusRatio) || baseRatio <= 0) continue;
      const deltaRel = focusRatio / baseRatio - 1;
      if (Math.abs(deltaRel) < PAIR_MIN_DELTA) continue;
      out.push({ upKey: up.key, upLabel: up.label, downKey: down.key, downLabel: down.label,
                 baseRatio, focusRatio, deltaRel, confirmed: false });
    }
  }
  return out.sort((a, z) => Math.abs(z.deltaRel) - Math.abs(a.deltaRel)).slice(0, 2);
}
