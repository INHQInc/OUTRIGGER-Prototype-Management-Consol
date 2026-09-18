/**
 * PRIORITY — ONE derivation, the way `derivePipeline` is one derivation.
 *
 * Every surface that ranks, sorts, colours or exports a prototype's priority
 * reads `derivePriority()`. Nothing recomputes a piece of it locally, because
 * the moment two screens disagree about which test matters most, the ranking
 * stops being worth having.
 *
 * ── Why RICE, and why this RICE ────────────────────────────────────────────
 *
 * Four models are in circulation for experiment backlogs — ICE, PIE, PXL and
 * RICE. We compute RICE, `(Reach × Impact × Confidence) ÷ Effort`, for two
 * reasons that are specific to a testing programme rather than general taste:
 *
 *   · It has a DENOMINATOR in real units. "Three times the value per dev-day"
 *     survives a conversation with a client; "it scored 7.2" does not.
 *   · Reach is a LOOKUP, not an opinion. Most of what goes wrong with ICE is
 *     that all three inputs are feelings, and feelings converge on 8.
 *
 * And Confidence is DERIVED FROM EVIDENCE, never typed. That is PXL's real
 * contribution — replacing a subjective 1–10 with "which of these things do we
 * actually know?" — and it is the only defence against a backlog where every
 * idea is 90% certain. `confidenceOf()` below counts boxes; there is no field
 * a hopeful person can set to 100.
 *
 * ── Bands, not numbers ─────────────────────────────────────────────────────
 *
 * Reach, Impact and Effort are picked from small menus. Exact monthly visitors
 * and exact person-days are more precise and nobody fills them in for thirty
 * backlog items, which leaves a scoring model with no scores — strictly worse
 * than a coarse one that is actually populated. The bands carry representative
 * values and the ORDERING they produce is the point, not the decimals.
 */

/** Monthly visitors to the target area, in thousands — the RICE `R`. */
export type ReachBand = "s" | "m" | "l" | "xl";
/** Expected size of the effect on the primary metric — the RICE `I`. */
export type ImpactBand = "minimal" | "low" | "medium" | "high" | "massive";
/** Build + review person-days — the RICE `E`. A Fibonacci ladder, as estimates are. */
export type EffortBand = "xs" | "s" | "m" | "l" | "xl";

export const REACH: { id: ReachBand; label: string; hint: string; perMonth: number }[] = [
  { id: "s",  label: "Small",  hint: "a corner of the site — under ~2k visits a month", perMonth: 1_000 },
  { id: "m",  label: "Medium", hint: "a secondary page or step — around 5k a month",    perMonth: 5_000 },
  { id: "l",  label: "Large",  hint: "a main journey page — around 25k a month",        perMonth: 25_000 },
  { id: "xl", label: "Site-wide", hint: "home, booking bar, header — 100k+ a month",    perMonth: 100_000 },
];

export const IMPACT: { id: ImpactBand; label: string; hint: string; factor: number; mde: number }[] = [
  { id: "minimal", label: "Minimal", hint: "a polish — would not move the metric much", factor: 0.25, mde: 0.02 },
  { id: "low",     label: "Low",     hint: "a nudge on one step of the journey",        factor: 0.5,  mde: 0.05 },
  { id: "medium",  label: "Medium",  hint: "a real change to how the page works",       factor: 1,    mde: 0.10 },
  { id: "high",    label: "High",    hint: "removes a known blocker on the path",       factor: 2,    mde: 0.20 },
  { id: "massive", label: "Massive", hint: "rebuilds the decision the page asks for",   factor: 3,    mde: 0.35 },
];

export const EFFORT: { id: EffortBand; label: string; hint: string; days: number }[] = [
  { id: "xs", label: "1 day",    hint: "copy, styling, a swap",                 days: 1 },
  { id: "s",  label: "2 days",   hint: "one component, no new data",            days: 2 },
  { id: "m",  label: "3 days",   hint: "a component plus states and QA",        days: 3 },
  { id: "l",  label: "5 days",   hint: "several components, or new data",       days: 5 },
  { id: "xl", label: "8+ days",  hint: "a page rebuild, or an integration",     days: 8 },
];

/**
 * THE EVIDENCE CHECKLIST — what Confidence is made of.
 *
 * Each box is a thing somebody can point at. "I have a feeling about this" is
 * not on the list, and that is deliberate: an idea with no ticks scores 20%
 * confidence and sinks, which is the correct fate of an idea nobody can
 * justify. The last two are PXL's noticeability tests — a change nobody sees
 * cannot move a metric however sound the reasoning behind it is.
 */
export const EVIDENCE: { id: string; label: string; hint: string }[] = [
  { id: "audit",      label: "Named in an audit",        hint: "a UX/heuristic review flagged this exact problem" },
  { id: "analytics",  label: "Backed by analytics",      hint: "a measured drop-off, exit or funnel step says so" },
  { id: "research",   label: "Backed by research",       hint: "user testing, session replay, survey or VOC" },
  { id: "prior",      label: "A prior test moved it",    hint: "this pattern already won — here or in published work" },
  { id: "fold",       label: "Above the fold",           hint: "noticeable in five seconds, without scrolling" },
  { id: "structural", label: "Adds or removes an element", hint: "the page changes shape — not a restyle" },
];
export const EVIDENCE_IDS = new Set(EVIDENCE.map((e) => e.id));

/** Stored inputs. Everything else on this page is computed from them. */
export interface PrototypeScore {
  reach?: ReachBand;
  impact?: ImpactBand;
  effort?: EffortBand;
  /** Ticked boxes from EVIDENCE. Confidence is a count of these, never typed. */
  evidence?: string[];
  /** Current conversion rate on the primary metric, 0–1. OPTIONAL — supplied,
   *  it buys a real weeks-to-decide figure; absent, we say nothing rather than
   *  invent one. */
  baselineRate?: number;
  setAt?: string;
  setBy?: string;
}

export type PriorityBand = "now" | "next" | "later" | "someday";

export const BAND_LABEL: Record<PriorityBand, string> = {
  now: "Now", next: "Next", later: "Later", someday: "Someday",
};

export interface DerivedPriority {
  /** All three bands present — below this, `rice` is null and the card is unscored. */
  scored: boolean;
  rice: number | null;
  band: PriorityBand | null;
  /** 0.2 – 1.0, from the evidence count. */
  confidence: number;
  evidenceCount: number;
  reachPerMonth: number | null;
  impactFactor: number | null;
  effortDays: number | null;
  /**
   * Weeks to a readable result at this reach, effect size and arm count.
   * NULL when no baseline rate was supplied — a weeks figure computed from a
   * guessed baseline is a number with no information in it, and it would be
   * believed. Absent beats fabricated.
   */
  weeksToDecide: number | null;
  /**
   * The test cannot realistically produce a decision: either the maths says so,
   * or there is no baseline and the reach band is the smallest one. This is a
   * FACT about runnability, not a preference about desirability — which is why
   * it is separate from the score and why it is the only part of priority that
   * earns a warning colour.
   */
  underpowered: boolean;
  /** Human sentence for the flag above, or null. */
  powerNote: string | null;
  /** Which inputs are still missing, in the order the panel asks for them. */
  missing: string[];
}

/** 0 ticks → 20%, 1–2 → 50%, 3–4 → 80%, 5+ → 100%. */
export function confidenceOf(evidence: string[] | undefined): number {
  const n = (evidence ?? []).filter((e) => EVIDENCE_IDS.has(e)).length;
  return n >= 5 ? 1 : n >= 3 ? 0.8 : n >= 1 ? 0.5 : 0.2;
}

/** Fixed thresholds, never percentiles: a card must not change band because
 *  somebody else added an idea to the backlog. */
export function bandOf(rice: number): PriorityBand {
  return rice >= 20 ? "now" : rice >= 5 ? "next" : rice >= 1 ? "later" : "someday";
}

/**
 * Visitors per arm needed to read an effect of `mde` (relative) on a baseline
 * of `p`, at 95% confidence and 80% power. The standard two-proportion rule of
 * thumb, n = 16·p(1−p)/Δ², with Δ = p·mde.
 */
export function sampleSizePerArm(baseline: number, mde: number): number {
  if (!(baseline > 0 && baseline < 1) || mde <= 0) return Infinity;
  const delta = baseline * mde;
  return Math.ceil((16 * baseline * (1 - baseline)) / (delta * delta));
}

/** How many weeks of this reach it takes to fill `arms` cells of that size. */
function weeksFor(perMonth: number, perArm: number, arms: number): number {
  const weekly = (perMonth / 4.345) / Math.max(2, arms);
  if (!isFinite(perArm) || weekly <= 0) return Infinity;
  return Math.ceil(perArm / weekly);
}

/** Past this, the result lands after anyone still cares — treat as unrunnable. */
export const MAX_RUNNABLE_WEEKS = 8;

export function derivePriority(
  score: PrototypeScore | undefined,
  opts: { arms?: number } = {},
): DerivedPriority {
  const reach = REACH.find((r) => r.id === score?.reach) ?? null;
  const impact = IMPACT.find((i) => i.id === score?.impact) ?? null;
  const effort = EFFORT.find((e) => e.id === score?.effort) ?? null;
  const confidence = confidenceOf(score?.evidence);
  const evidenceCount = (score?.evidence ?? []).filter((e) => EVIDENCE_IDS.has(e)).length;

  const missing: string[] = [];
  if (!reach) missing.push("reach");
  if (!impact) missing.push("impact");
  if (!effort) missing.push("effort");

  const scored = Boolean(reach && impact && effort);
  // Reach in THOUSANDS so the score lands in a range a person can hold in their
  // head (roughly 0.01 – 300) instead of one with five leading zeroes.
  const rice = scored
    ? ((reach!.perMonth / 1000) * impact!.factor * confidence) / effort!.days
    : null;

  let weeksToDecide: number | null = null;
  let underpowered = false;
  let powerNote: string | null = null;
  const baseline = typeof score?.baselineRate === "number" && score.baselineRate > 0 && score.baselineRate < 1
    ? score.baselineRate : null;

  if (reach && impact && baseline) {
    const weeks = weeksFor(reach.perMonth, sampleSizePerArm(baseline, impact.mde), opts.arms ?? 2);
    weeksToDecide = isFinite(weeks) ? weeks : null;
    if (!isFinite(weeks) || weeks > MAX_RUNNABLE_WEEKS) {
      underpowered = true;
      powerNote = isFinite(weeks)
        ? `${formatWeeks(weeks)} to a readable result — past the ${MAX_RUNNABLE_WEEKS}-week limit. Ship it on judgement, widen the audience, or test a bigger change.`
        : "No readable result at this traffic and effect size. This is not an A/B test — decide it another way.";
    }
  } else if (reach?.id === "s") {
    // A PROMPT, NOT A STATISTIC. Without a baseline there is no weeks figure to
    // give, but the smallest reach band is worth questioning out loud, because
    // the commonest way a programme wastes a quarter is running a good idea on
    // a page that can never answer it.
    underpowered = true;
    powerNote = "Thin traffic. Add the current conversion rate below and this will say whether it can reach a decision at all.";
  }

  return {
    scored, rice, band: rice === null ? null : bandOf(rice),
    confidence, evidenceCount,
    reachPerMonth: reach?.perMonth ?? null,
    impactFactor: impact?.factor ?? null,
    effortDays: effort?.days ?? null,
    weeksToDecide, underpowered, powerNote, missing,
  };
}

/**
 * A run length, said the way a person would. Past a year the exact figure stops
 * carrying information — "two thousand weeks" and "four hundred weeks" are the
 * same answer, which is "never" — and printing it invites someone to read false
 * precision into a rule-of-thumb sample size.
 */
export function formatWeeks(weeks: number | null): string {
  if (weeks === null || !isFinite(weeks)) return "—";
  if (weeks > 260) return "years";
  if (weeks > 52) return "over a year";
  return `~${weeks} ${weeks === 1 ? "week" : "weeks"}`;
}

/** The score as people read it: two significant figures where it matters. */
export function formatRice(rice: number | null): string {
  if (rice === null) return "—";
  if (rice >= 100) return String(Math.round(rice));
  if (rice >= 10) return rice.toFixed(0);
  if (rice >= 1) return rice.toFixed(1);
  return rice.toFixed(2);
}

/** Keep only what the model knows, so a bad body can't store junk. */
export function normalizeScore(raw: unknown): PrototypeScore | undefined {
  const r = (raw ?? {}) as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, set: readonly { id: T }[]): T | undefined =>
    set.some((x) => x.id === v) ? (v as T) : undefined;
  const evidence = Array.isArray(r.evidence)
    ? [...new Set(r.evidence.filter((e): e is string => typeof e === "string" && EVIDENCE_IDS.has(e)))]
    : undefined;
  const baseline = typeof r.baselineRate === "number" && isFinite(r.baselineRate) && r.baselineRate > 0 && r.baselineRate < 1
    ? r.baselineRate : undefined;
  const out: PrototypeScore = {
    ...(pick(r.reach, REACH) ? { reach: pick(r.reach, REACH) } : {}),
    ...(pick(r.impact, IMPACT) ? { impact: pick(r.impact, IMPACT) } : {}),
    ...(pick(r.effort, EFFORT) ? { effort: pick(r.effort, EFFORT) } : {}),
    ...(evidence?.length ? { evidence } : {}),
    ...(baseline !== undefined ? { baselineRate: baseline } : {}),
  };
  return Object.keys(out).length ? out : undefined;
}
