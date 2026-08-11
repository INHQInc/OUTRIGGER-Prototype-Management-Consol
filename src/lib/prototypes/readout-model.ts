/**
 * THE READOUT MODEL — one interpretation, two skins.
 *
 * The maths was always shared (stats.ts, verdict.ts, results.ts, notebook.ts).
 * The INTERPRETATION was written twice, and the two copies disagreed. A
 * decrease-is-good metric that fell rendered RED on the page and GREEN in the
 * email. A refuted run read "Hold the call" on screen and "Stop it, or redesign
 * the change" in the inbox. "Settled" was a third statistical test that the
 * verdict itself never used.
 *
 * This module answers every interpretive question ONCE. See
 * docs/READOUT-MODEL.md for the eleven defects the audit found and which
 * implementation won each argument.
 *
 * THREE RULES FOR ANYONE ADDING A FIELD:
 *   1. If a renderer would have to write `? :` over the data to get it, it
 *      belongs here.
 *   2. If two renderers would answer it differently AND both are defensible,
 *      it is a SKIN concern (palette, precision, layout) — keep it out.
 *   3. Nothing this module returns may ever be POSTed back. It receives the
 *      stored plan and a read-only decision descriptor precisely so the
 *      synthesized `opti-primary` composite can never be laundered into the
 *      team's authored plan.
 *
 * HARD CONSTRAINTS: no React, no hooks, no store, no fetch, no `Date.now()`
 * (the caller passes `now`), no hex, no CSS class names. A pure synchronous
 * function over a plain record — which is what makes the cron path and the
 * browser path provably identical rather than hopefully similar.
 */
import type { ExperimentResults, MetricMap, MetricRole } from "./results";
import { isCompositeOf, describeComposite, effectiveDirection, directionDeclared } from "./results";
import type { StatsReport, MetricStats, CellStats, DailySnapshot } from "./stats";
import type { VerdictRecord, VerdictState, VerdictGate } from "./verdict";
import { VERDICT_THRESHOLDS, nextStep, guardrailHarmSide } from "./verdict";
import type { Reading } from "./notebook";
import { deriveHeadline, headlineContradiction, type HeadlineTrace } from "./readout-headline";

// ────────────────────────────────────────────────────────────────────────────
// TOKENS — the enums every skin maps to its own palette. No hex here, ever.
// ────────────────────────────────────────────────────────────────────────────

/** VALENCE. Direction-aware and breach-aware: `loss` means "moved against the
 *  team", which for a decrease-is-good metric is a RISE. `caution` is an
 *  at-risk guardrail — a state neither surface has ever shown. `neutral` is an
 *  exactly-zero lift, an unjudgeable one, or an adoption-only metric. */
export type Tone = "win" | "loss" | "caution" | "neutral";

/** Whether the tone has been EARNED. Orthogonal to `Tone` ON PURPOSE: the page
 *  greys unsettled numbers ("chroma is earned") and the email tints them
 *  ("valence always carries hue"). Both positions are documented and
 *  defensible, so the model refuses to pick one — it emits the two facts and
 *  each skin maps them. A single `tone` field would settle a live design
 *  argument by accident. */
export type Confidence = "settled" | "unsettled" | "not-applicable";

export type Severity = "good" | "bad" | "caution" | "neutral";

export type NoticeId =
  | "frozen-snapshot"
  | "decision-inherited"
  | "direction-assumed"
  | "tests-disagree"
  | "hypothesis-not-frozen"
  | "focus-fallback"
  | "validity";

export interface Notice {
  id: NoticeId;
  severity: Severity;
  /** ≤ 90 chars. The chip or one-liner. */
  text: string;
  /** The full explanation. Page uses it as a tooltip; email prints it. */
  detail: string;
}

// ────────────────────────────────────────────────────────────────────────────
// PRIMITIVES — every number arrives formatted AND raw.
// ────────────────────────────────────────────────────────────────────────────

/** A number ready to print. `text` is never empty — an absent value is the em
 *  dash. `raw` exists for things that must be DRAWN (bar widths, chart
 *  domains), never for re-formatting: a skin that reformats has reintroduced
 *  the precision drift this replaces. */
export interface Figure {
  text: string;
  raw?: number;
  absent: boolean;
}

export interface RangeView {
  lo: number;
  hi: number;
  text: string;
  sentence: string;
  span: number;
  excludesZero: boolean;
}

const EM = "—";
const fig = (raw: number | undefined, text: (v: number) => string): Figure =>
  raw === undefined || !Number.isFinite(raw)
    ? { text: EM, absent: true }
    : { text: text(raw), raw, absent: false };

const pctText = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
const rateText = (v: number) => `${(v * 100).toFixed(1)}%`;
const countText = (v: number) => v.toLocaleString();

export const asLift = (v?: number) => fig(v, pctText);
export const asRate = (v?: number) => fig(v, rateText);
export const asCount = (v?: number) => fig(v, countText);

// ────────────────────────────────────────────────────────────────────────────
// METRICS
// ────────────────────────────────────────────────────────────────────────────

export interface CompositeView {
  isComposite: boolean;
  perArm: boolean;
  chipLabel: string;
  description: string;
}

export interface MetricView {
  key: string;
  label: string;
  kind: "composite" | "metric";

  role: MetricRole;
  /** One vocabulary for the role, shared by both surfaces. */
  roleLabel: string;
  isDecision: boolean;

  /** THE number for this row: the lift, or the RATE for an adoption-only
   *  metric where a lift against a structural zero is meaningless. */
  headline: Figure;
  lift: Figure;
  ci: RangeView | null;
  p: Figure;
  focusRate: Figure;
  baseRate: Figure | null;
  focusCount: Figure;
  baseCount: Figure;
  focusN: Figure;

  /** WHAT THE NUMBERS MEAN — computed once, here. */
  tone: Tone;
  confidence: Confidence;
  /** The CI excludes zero. Kept because charts gate colour on it. */
  settled: boolean;
  /** p < alpha — THE TEST THE VERDICT ACTUALLY USED. Not the same test as
   *  `settled`: a Katz log rate-ratio interval versus a pooled two-proportion
   *  z on the risk difference. They disagree in a band around alpha. */
  significant: boolean;
  /** For anything that is not the decision metric or a guardrail, the engine
   *  already ran Benjamini-Hochberg. `beyondLuck` is the claim a surface is
   *  allowed to print; `significant` is the raw test. On a twelve-row readout
   *  the engine expects ~0.6 false movers at raw alpha. */
  beyondLuck: boolean;
  /** settled !== significant, so a green "It worked" can never sit above an
   *  amber "Not settled" with nothing explaining it. */
  testsDisagree: boolean;
  favourable: boolean | null;
  direction: "increase" | "decrease";
  /** False means "increase" is an ASSUMPTION, not a declaration. */
  directionDeclared: boolean;
  guardrail: "pass" | "at_risk" | "breach" | "unknown" | null;
  /** WHY an at-risk guardrail is at risk: the point estimate is already past
   *  tolerance ("harm"), or the interval is merely too wide to clear it
   *  ("unproven"). Different facts — a headline must not say the second in the
   *  words of the first. Computed by CALLING `guardrailHarmSide`, never by a
   *  second copy of the threshold comparison. */
  guardrailReason: "harm" | "unproven" | null;
  featureOnly: "variation" | "baseline" | null;

  /** "Settled" | "Not settled" | "Adoption" */
  settledWord: string;
  /** The unit the rate is in. A multi-event composite is scored as a Poisson
   *  rate-ratio and its "rate" is ACTIONS PER VISITOR — legitimately over
   *  100%. Printing that under a conversion-rate heading is a lie, so the unit
   *  travels with the value. */
  rateUnit: "conversion" | "actions-per-visitor";
  rateUnitLabel: string;
  note?: string;
  misnamed?: { events: string[]; line: string };
  composite: CompositeView | null;
  hidden: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// THE VERDICT
// ────────────────────────────────────────────────────────────────────────────

export interface GateView {
  id: VerdictGate["id"];
  title: string;
  detail: string;
  pass: boolean | null;
  word: string;
  severity: Severity;
}

export interface GuardrailSummary {
  breached: number;
  atRisk: number;
  total: number;
  /** "2 breached" | "1 at risk" | "All clear" | "None mapped" */
  word: string;
  tone: Tone;
}

export interface VerdictView {
  state: VerdictState;
  severity: Severity;
  /** The leader's question answered in the leader's words: "Yes" | "No". */
  answer: string;
  /** A complete answer with a subject, reading as the value of "Status:". */
  label: string;
  /** The engine's own term, for the chip. */
  term: string;
  sentence: string;
  stamped: boolean;
  stampLine: string | null;
  nextStep: { label: string; gateId?: string };
  gates: GateView[];
  guardrails: GuardrailSummary;
  /** The full "read this before trusting the verdict" paragraph, or null. */
  directionCaveat: string | null;
}

// ────────────────────────────────────────────────────────────────────────────
// FRAME
// ────────────────────────────────────────────────────────────────────────────

export interface RuntimeView {
  /** Days since the EXPERIMENT'S own start, measured to stats.computedAt so a
   *  re-send reads identically rather than drifting with the wall clock. */
  daysSinceStart?: number;
  observationDays?: number;
  /** "Day 12". ONE convention, 1-based: a run started today is on its first
   *  day. The two surfaces previously differed by exactly one. */
  dayLabel: string;
  freshWord: string;
  /** "12 Aug 2026", UTC. */
  asOfDate: string;
  computedAt?: string;
}

export interface HealthView {
  status: StatsReport["validity"]["status"];
  word: string;
  detail: string;
  severity: Severity;
}

export interface HypothesisView {
  text: string | null;
  frozen: boolean;
  anchor: "cut" | "plan" | "live" | "none";
}

export interface MovementView {
  id: "effect" | "shift" | "cost" | "prediction";
  ordinal: string;
  label: string;
  text: string;
  metric: MetricView | null;
}

export interface StoryView {
  headline: string | null;
  executive: string | null;
  lede: string | null;
  /** The prose a summary block should print: the executive summary, else the
   *  analyst's earlier paragraph. Never invented. */
  summaryProse: string | null;
  movements: MovementView[];
  source: "analyst" | "computed";
  /** The HEADLINE specifically fell back to the computed floor — tracked apart
   *  from `source`, which reports on the paragraph. The two fail independently:
   *  a reading can carry the analyst's prose above the template's headline. */
  headlineComputed: boolean;
  /** The analyst DID write a headline and it was refused because it contradicts
   *  the numbers. Recorded rather than silently swallowed: a model that keeps
   *  denying movement is a prompt problem, and a model that never trips this is
   *  evidence the check is dead code. */
  headlineOverridden?: string;
}

export type VitalId = "visitors" | "runtime" | "beyond-luck" | "guardrails";

export interface VitalView {
  id: VitalId;
  label: string;
  value: string;
  tone: Tone;
}

// ────────────────────────────────────────────────────────────────────────────
// THE MODEL
// ────────────────────────────────────────────────────────────────────────────

export interface ReadoutModel {
  empty: boolean;
  emptyReason: string | null;

  /** THE EFFECTIVE DATA — the frozen-snapshot fallback is already applied, and
   *  the raw inputs are deliberately not re-exported so no surface can read the
   *  un-fallen-back pair and blank a stamped run whose fetch failed. */
  results: ExperimentResults | null;
  stats: StatsReport | null;
  fromFrozenSnapshot: boolean;

  prototypeName: string;
  prototypeKey: string;

  byKey: Record<string, MetricView>;
  all: MetricView[];
  decisionKey: string | null;
  decision: MetricView | null;
  decisionInherited: boolean;
  supporting: MetricView[];
  visibleRows: MetricView[];
  hiddenRows: MetricView[];

  /** Picked by MAGNITUDE from the supporting set, never nominated — so a
   *  summary cannot disagree with the table beneath it. */
  biggestGain: MetricView | null;
  biggestCost: MetricView | null;

  verdict: VerdictView | null;
  story: StoryView;
  runtime: RuntimeView;
  health: HealthView | null;
  hypothesis: HypothesisView;
  vitals: VitalView[];
  notices: Notice[];
  settledTally: { settled: number; total: number; text: string };

  /** A guardrail was DECLARED but never adjudicated — distinct from none being
   *  declared at all, which the "None mapped" vitals tile conflates with it. */
  guardrailsUnjudged: boolean;

  /** THE COMPUTED HEADLINE — always present, always true, used when the analyst
   *  has not written one or when what they wrote contradicts the numbers. See
   *  readout-headline.ts for why this is not five branches over one metric. */
  headlineFloor: string;
  headlineTrace: HeadlineTrace | null;

  preheader: string;
  subject: string;
}

/** The decision metric as a READ-ONLY descriptor. This is how the model learns
 *  Optimizely's declaration without ever holding its synthesized composite —
 *  which is what stops the page POSTing that composite into the stored plan. */
export interface DecisionDescriptor {
  key: string;
  label: string;
  source: "console" | "optimizely";
  direction?: "increase" | "decrease";
  directionDeclared: boolean;
}

export interface ReadoutInput {
  prototypeName: string;
  prototypeKey: string;

  results: ExperimentResults | null;
  stats: StatsReport | null;
  verdict: VerdictRecord | null;
  reading: Reading | null;

  /** THE STORED PLAN — the thing writes mutate. Never the resolved map. */
  plan: MetricMap | null;
  /** The resolved decision metric, read-only. */
  decision: DecisionDescriptor | null;

  /** Presentation state, explicit so an OPTIMISTIC override can be passed. The
   *  page passes `observedLocal ?? plan.observed`; the server passes stored
   *  values. This is the one derivation that cannot be pure, and making it a
   *  parameter is what keeps everything else pure. */
  observed: string[];
  roles: Record<string, MetricRole>;
  order: string[];
  hidden: string[];

  /** Required, no defaults: a caller that forgets these must fail to compile
   *  rather than render "LIVE" over a concluded run. */
  experimentStatus: string | null;
  now: number;

  /** Optional. Each DEGRADES to a named empty; nothing is invented. */
  snapshots?: DailySnapshot[];
  liveHypothesis?: string | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const ROLE_LABEL: Record<MetricRole, string> = {
  decision: "Decision",
  supporting: "Supporting",
  guardrail: "Guardrail",
  exploratory: "Exploratory",
};

/** The verdict, in three registers: the leader's answer, a complete status
 *  sentence, and the engine's own term. Previously five vocabularies across
 *  two files, two of them dead. */
const VERDICT_WORDS: Record<VerdictState, { answer: string; label: string; term: string; severity: Severity }> = {
  confirmed:        { answer: "Yes",                        label: "It worked",                         term: "Confirmed",        severity: "good" },
  refuted:          { answer: "No",                         label: "It didn't work",                    term: "Refuted",          severity: "bad" },
  guardrail_breach: { answer: "No — and it hurt something", label: "Stop and look — a guardrail broke", term: "Guardrail breach", severity: "bad" },
  keep_running:     { answer: "Too early to say",           label: "Too early to call",                 term: "Keep running",     severity: "neutral" },
  underpowered:     { answer: "Can't tell at this traffic", label: "Not enough traffic to tell yet",    term: "Underpowered",     severity: "caution" },
  invalid:          { answer: "The data can't be trusted",  label: "The data can't be trusted yet",     term: "Invalid",          severity: "bad" },
  not_adjudicable:  { answer: "Nothing to judge against",   label: "No agreed definition of success",   term: "Not adjudicable",  severity: "neutral" },
};

const MOVEMENTS: { id: MovementView["id"]; ordinal: string; label: string }[] = [
  { id: "effect", ordinal: "01", label: "What the change did" },
  { id: "shift", ordinal: "02", label: "Where the behaviour went" },
  { id: "cost", ordinal: "03", label: "What it cost" },
  { id: "prediction", ordinal: "04", label: "Against the prediction" },
];

export function buildReadoutModel(input: ReadoutInput): ReadoutModel {
  // ── THE FROZEN-SNAPSHOT FALLBACK, applied once for both surfaces. Today the
  //    page does this and the email does not, so a stamped run whose Optimizely
  //    fetch fails renders on screen and hard-fails the inbox.
  const stamped = input.verdict?.state === "stamped";
  const results = input.results ?? (stamped ? input.verdict?.frozenResults ?? null : null);
  const stats = input.stats ?? (stamped ? input.verdict?.frozenStats ?? null : null);
  const fromFrozenSnapshot = Boolean(!input.results && results);

  const notices: Notice[] = [];
  const focusId = stats?.focusVariationId;
  const baseId = stats?.baselineVariationId;
  const cellOf = (m: MetricStats, id?: string) => m.cells.find((c) => c.variationId === id);

  /** The FDR-corrected q the engine already computed for swept metrics. */
  const qFor = (key: string) =>
    stats?.exploratory.find((e) => e.key === key && e.variationId === focusId);

  const decisionKey = input.decision?.key ?? stats?.primaryKey ?? null;

  const buildMetric = (m: MetricStats): MetricView => {
    const f = cellOf(m, focusId);
    const b = cellOf(m, baseId);
    const isDecision = m.key === decisionKey;
    const role: MetricRole = isDecision
      ? "decision"
      : input.roles[m.key] ?? (m.role === "guardrail" ? "guardrail" : "exploratory");

    // ── DIRECTION, resolved once. plan.directions wins because that is what a
    //    click on the ↑/↓ toggle writes; the composite's own field is the
    //    fallback, and the decision descriptor carries Optimizely's.
    const declaredHere = directionDeclared(input.plan, m.key);
    const decDir = isDecision ? input.decision?.direction : undefined;
    const direction: "increase" | "decrease" = declaredHere
      ? effectiveDirection(input.plan, m.key)
      : decDir === "decrease"
        ? "decrease"
        : "increase";
    const dirDeclared = declaredHere || Boolean(isDecision && input.decision?.directionDeclared);

    const featureOnly = m.featureOnly ?? null;
    const lift = featureOnly ? undefined : f?.lift;
    const settled = Boolean(f?.liftCi && (f.liftCi.lo > 0 || f.liftCi.hi < 0));
    const significant = f?.p !== undefined && f.p < VERDICT_THRESHOLDS.alpha;

    // ── BEYOND LUCK. The decision metric gets full alpha by design (it is
    //    pre-registered). Guardrails are adjudicated by their own
    //    non-inferiority gate. Everything else was swept, so the claim must
    //    clear the engine's own q — otherwise the readout prints "beyond luck"
    //    on rows the engine itself counted as expected false movers.
    const q = qFor(m.key);
    const beyondLuck = featureOnly
      ? false
      : isDecision || role === "guardrail"
        ? significant
        : q
          ? q.discovery
          : significant;

    const guardrailState =
      role === "guardrail"
        ? input.verdict?.guardrails.find((g) => `composite:${g.compositeId}` === m.key || g.compositeId === m.key)?.state ?? "unknown"
        : null;
    // WHY it is at risk. `at_risk` covers two different situations — already
    // past tolerance, versus an interval too wide to clear it — and a readout
    // that says the second in the words of the first is crying wolf. Calls the
    // engine's own comparison rather than repeating the threshold here.
    const guardrailReason: "harm" | "unproven" | null =
      guardrailState === "at_risk"
        ? guardrailHarmSide(f?.lift, effectiveDirection(input.plan, m.key), VERDICT_THRESHOLDS.guardrailMarginRel)
        : null;

    // ── VALENCE. Three-state and direction-aware. An exactly-zero or absent
    //    lift is NEUTRAL, never green. A guardrail's valence is its adjudicated
    //    state, because "did it go the right way" is not the guardrail question.
    let favourable: boolean | null = null;
    let tone: Tone = "neutral";
    if (guardrailState) {
      tone = guardrailState === "breach" ? "loss" : guardrailState === "at_risk" ? "caution" : guardrailState === "pass" ? "win" : "neutral";
      favourable = guardrailState === "pass" ? true : guardrailState === "breach" ? false : null;
    } else if (lift !== undefined && lift !== 0) {
      favourable = direction === "decrease" ? lift < 0 : lift > 0;
      tone = favourable ? "win" : "loss";
    }

    const confidence: Confidence = featureOnly ? "not-applicable" : beyondLuck ? "settled" : "unsettled";

    const comp = input.plan?.composites.find((c) => `composite:${c.id}` === m.key);
    const composite: CompositeView | null = comp
      ? {
          isComposite: isCompositeOf(comp),
          perArm: Boolean(comp.armEvents?.length),
          chipLabel: comp.armEvents?.length ? "composite · per version" : "composite",
          description: describeComposite(comp),
        }
      : null;

    // A multi-event composite is scored as actions-per-visitor and can exceed
    // 100%. The unit travels with the value so no skin can print it under a
    // conversion-rate heading.
    const actions = m.test === "actions";

    const ci: RangeView | null =
      f?.liftCi && !featureOnly
        ? {
            lo: f.liftCi.lo,
            hi: f.liftCi.hi,
            text: `${pctText(f.liftCi.lo)} to ${pctText(f.liftCi.hi)}`,
            sentence: `plausible range ${pctText(f.liftCi.lo)} to ${pctText(f.liftCi.hi)}`,
            span: f.liftCi.hi - f.liftCi.lo,
            excludesZero: settled,
          }
        : null;

    return {
      key: m.key,
      label: m.label,
      kind: m.kind,
      role,
      roleLabel: ROLE_LABEL[role],
      isDecision,
      headline: featureOnly ? asRate(f?.rate) : asLift(lift),
      lift: asLift(lift),
      ci,
      p: f?.p === undefined ? { text: EM, absent: true } : { text: f.p < 0.0001 ? "p<0.0001" : `p=${f.p.toFixed(4)}`, raw: f.p, absent: false },
      focusRate: asRate(f?.rate),
      baseRate: featureOnly ? null : asRate(b?.rate),
      focusCount: asCount(f?.count),
      baseCount: asCount(b?.count),
      focusN: asCount(f?.n),
      tone,
      confidence,
      settled,
      significant,
      beyondLuck,
      testsDisagree: !featureOnly && settled !== significant,
      favourable,
      direction,
      directionDeclared: dirDeclared,
      guardrail: guardrailState,
      guardrailReason,
      featureOnly,
      settledWord: featureOnly ? "Adoption" : beyondLuck ? "Settled" : "Not settled",
      rateUnit: actions ? "actions-per-visitor" : "conversion",
      rateUnitLabel: actions ? "actions per visitor" : "conversion rate",
      note: input.reading?.observations?.find((o) => o.measureKey === m.key)?.note,
      misnamed: m.missingEvents?.length
        ? { events: m.missingEvents, line: `This definition names ${m.missingEvents.length === 1 ? "an event" : "events"} Optimizely is not reporting — the metric is misnamed, not flat.` }
        : undefined,
      composite,
      hidden: input.hidden.includes(m.key),
    };
  };

  const built = (stats?.metrics ?? []).map(buildMetric);
  const byKey: Record<string, MetricView> = {};
  for (const v of built) byKey[v.key] = v;

  // ── ORDER: the team's dragged order, decision first, unknowns last.
  const rank = (k: string) => {
    const i = input.order.indexOf(k);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const all = [...built].sort((a, z) =>
    a.isDecision !== z.isDecision ? (a.isDecision ? -1 : 1) : rank(a.key) - rank(z.key),
  );

  const decision = decisionKey ? byKey[decisionKey] ?? null : null;
  const supporting = all.filter((m) => m.isDecision || m.role === "supporting" || m.role === "guardrail");
  const visibleRows = all.filter((m) => !m.hidden);
  const hiddenRows = all.filter((m) => m.hidden);

  // BIGGEST MOVERS, by magnitude, excluding the decision metric — it has its
  // own slot on both surfaces, and letting it also win "biggest gain" prints
  // the same number twice under two different headings.
  // (`.reverse().find()` here returned the SMALLEST cost — caught by the smoke
  //  test, which reported a -0.3% row while the decision metric had fallen 56%.)
  const movers = supporting.filter(
    (m) => !m.isDecision && m.lift.raw !== undefined && m.lift.raw !== 0,
  );
  const byMag = [...movers].sort((a, z) => Math.abs(z.lift.raw!) - Math.abs(a.lift.raw!));
  const biggestGain = byMag.find((m) => m.favourable === true) ?? null;
  const biggestCost = byMag.find((m) => m.favourable === false) ?? null;

  // ── RUNTIME. One day convention, 1-based, measured to computedAt so a
  //    re-send of the same data reads identically.
  const asOfMs = stats?.computedAt ? Date.parse(stats.computedAt) : undefined;
  const startMs = results?.startTime ? Date.parse(results.startTime) : undefined;
  const daysSinceStart =
    startMs !== undefined && asOfMs !== undefined && asOfMs > startMs
      ? Math.floor((asOfMs - startMs) / 86_400_000) + 1
      : undefined;
  const observationDays = stats?.power?.observationDays;
  const dayN = daysSinceStart ?? (observationDays !== undefined ? observationDays + 1 : undefined);
  const asOf = asOfMs !== undefined ? new Date(asOfMs) : undefined;
  const st = (input.experimentStatus ?? "").toLowerCase();
  const runtime: RuntimeView = {
    daysSinceStart,
    observationDays,
    dayLabel: dayN !== undefined ? `Day ${dayN}` : EM,
    freshWord: !st || st === "running" ? "LIVE" : st === "not_started" ? "NOT STARTED" : st.replace(/_/g, " ").toUpperCase(),
    asOfDate: asOf ? `${asOf.getUTCDate()} ${MONTHS[asOf.getUTCMonth()]} ${asOf.getUTCFullYear()}` : EM,
    computedAt: stats?.computedAt,
  };

  // ── VERDICT
  const pre = input.verdict?.preRegistration;
  let verdictView: VerdictView | null = null;
  if (input.verdict) {
    const words = VERDICT_WORDS[input.verdict.verdict] ?? VERDICT_WORDS.not_adjudicable;
    const gs = input.verdict.guardrails ?? [];
    const breached = gs.filter((g) => g.state === "breach").length;
    const atRisk = gs.filter((g) => g.state === "at_risk").length;
    const dirAssumed =
      Boolean(pre?.directionAssumed) &&
      (input.verdict.verdict === "refuted" || input.verdict.verdict === "confirmed");
    verdictView = {
      state: input.verdict.verdict,
      severity: words.severity,
      answer: words.answer,
      label: words.label,
      term: words.term,
      sentence: input.verdict.headline,
      stamped: input.verdict.state === "stamped",
      stampLine:
        input.verdict.state === "stamped"
          ? `Official — ${input.verdict.stampedBy ?? "unknown"} · ${input.verdict.stampedAt?.slice(0, 10) ?? ""}`
          : null,
      nextStep: nextStep(input.verdict, stats),
      gates: input.verdict.gates.map((g) => ({
        id: g.id,
        title: g.title,
        detail: g.detail,
        pass: g.pass ?? null,
        word: g.pass === true ? "PASS" : g.pass === false ? "FAIL" : "n/a",
        severity: g.pass === true ? "good" : g.pass === false ? "bad" : "neutral",
      })),
      guardrails: {
        breached,
        atRisk,
        total: gs.length,
        word: breached ? `${breached} breached` : atRisk ? `${atRisk} at risk` : gs.length ? "All clear" : "None mapped",
        tone: breached ? "loss" : atRisk ? "caution" : gs.length ? "win" : "neutral",
      },
      directionCaveat: dirAssumed
        ? `No winning direction was declared for ${decision?.label ?? "the decision metric"}, so this run was judged as though up is the win. If the change was meant to push that metric down, the verdict above is inverted — the prediction actually held. Set the winning direction on the metric and the call corrects itself.`
        : null,
    };
    if (dirAssumed) {
      notices.push({
        id: "direction-assumed",
        severity: "caution",
        text: "Winning direction was assumed, not declared",
        detail: verdictView.directionCaveat!,
      });
    }
    if (decision?.testsDisagree) {
      notices.push({
        id: "tests-disagree",
        severity: "caution",
        text: "The two tests disagree on the decision metric",
        detail:
          "The confidence interval and the significance test do not agree on this metric. The verdict follows the significance test, which is what the call was made on.",
      });
    }
  }

  if (fromFrozenSnapshot) {
    notices.push({
      id: "frozen-snapshot",
      severity: "neutral",
      text: "Showing the stamped snapshot",
      detail: "Live results were unavailable, so this is the data frozen when the verdict was stamped.",
    });
  }
  if (input.decision?.source === "optimizely") {
    notices.push({
      id: "decision-inherited",
      severity: "caution",
      text: "Judged on Optimizely's primary metric",
      detail: "No decision metric is declared in the console, so the experiment's own primary is being adjudicated.",
    });
  }
  if (stats?.focusFallback) {
    notices.push({
      id: "focus-fallback",
      severity: "bad",
      text: "The bound variation is not in these results",
      detail: "Another arm is being displayed; the verdict engine refuses to adjudicate the substitute.",
    });
  }
  if (stats && stats.validity.status !== "ok") {
    notices.push({
      id: "validity",
      severity: stats.validity.status === "compromised" ? "bad" : "caution",
      text: stats.validity.status === "unknown" ? "Traffic split unchecked" : "Traffic split looks wrong",
      detail: stats.validity.detail,
    });
  }

  // ── STORY
  const read = input.reading?.read;
  const movements: MovementView[] = MOVEMENTS.map((spec) => {
    const sec = read?.[spec.id];
    if (!sec?.text) return null;
    return {
      ...spec,
      text: sec.text,
      metric: sec.measureKey ? byKey[sec.measureKey] ?? null : null,
    };
  }).filter((m): m is MovementView => m !== null);

  const story: StoryView = {
    headline: input.reading?.headline ?? null,
    executive: input.reading?.executive ?? null,
    lede: input.reading?.lede ?? null,
    summaryProse: input.reading?.executive ?? input.reading?.lede ?? null,
    movements,
    source: input.reading?.ledeComputed ? "computed" : "analyst",
    headlineComputed: Boolean(input.reading?.headlineComputed),
  };

  // ── HYPOTHESIS
  const hypothesis: HypothesisView = {
    text: pre?.hypothesis ?? input.liveHypothesis ?? null,
    frozen: Boolean(pre && pre.anchor !== "live" && !pre.hypothesisNotFrozen),
    anchor: pre?.anchor ?? "none",
  };
  if (hypothesis.text && !hypothesis.frozen) {
    notices.push({
      id: "hypothesis-not-frozen",
      severity: "caution",
      text: "The hypothesis was not frozen before traffic",
      detail: "This run is judged against the brief as it reads today, so treat it as evidence rather than a pre-registered result.",
    });
  }

  // ── VITALS
  const visitorsRaw =
    results?.totalVisitors ?? results?.variations.reduce((sum, a) => sum + (a.visitors || 0), 0) ?? 0;
  const settledCount = supporting.filter((m) => m.beyondLuck).length;
  const settledTally = {
    settled: settledCount,
    total: supporting.length,
    text: `${settledCount} of ${supporting.length} metrics`,
  };
  const vitals: VitalView[] = [
    { id: "visitors", label: "Visitors", value: visitorsRaw > 0 ? countText(visitorsRaw) : EM, tone: "neutral" },
    { id: "runtime", label: "Running", value: runtime.dayLabel, tone: "neutral" },
    { id: "beyond-luck", label: "Beyond luck", value: settledTally.text, tone: "neutral" },
    {
      id: "guardrails",
      label: "Guardrails",
      value: verdictView?.guardrails.word ?? EM,
      tone: verdictView?.guardrails.tone ?? "neutral",
    },
  ];

  const health: HealthView | null = stats
    ? {
        status: stats.validity.status,
        word: stats.validity.status === "ok" ? "✓ health" : stats.validity.status === "unknown" ? "health unchecked" : "⚠ health",
        detail: stats.validity.detail,
        severity: stats.validity.status === "ok" ? "good" : stats.validity.status === "compromised" ? "bad" : "caution",
      }
    : null;

  const empty = !results || !stats;
  // THE NAME, AND NOTHING ELSE. The verdict used to ride along here — but an
  // inbox truncates the subject well before the end on a phone, so the tail was
  // spent on a word the reader could not see, and a subject that changes as the
  // verdict changes stops a weekly series from threading as one conversation.
  // The verdict leads the body; the subject only has to say which experiment.
  const subject = `Experiment Status: ${input.prototypeName}`;
  const preheader =
    story.summaryProse?.split(/(?<=[.!?])\s+/)[0]?.slice(0, 160) ??
    [verdictView?.answer, decision ? `decision step ${decision.lift.text}` : "", verdictView?.nextStep.label]
      .filter(Boolean)
      .join(" · ");

  // A guardrail DECLARED but never adjudicated is not the same as none being
  // declared, and the vitals tile's "None mapped" conflates them.
  const guardrailsUnjudged =
    (verdictView?.guardrails.total ?? 0) === 0 && all.some((m) => m.role === "guardrail");

  const model: ReadoutModel = {
    empty,
    emptyReason: empty ? "No results yet." : null,
    results,
    stats,
    fromFrozenSnapshot,
    prototypeName: input.prototypeName,
    prototypeKey: input.prototypeKey,
    byKey,
    all,
    decisionKey,
    decision,
    decisionInherited: input.decision?.source === "optimizely",
    supporting,
    visibleRows,
    hiddenRows,
    biggestGain,
    biggestCost,
    verdict: verdictView,
    story,
    runtime,
    health,
    hypothesis,
    vitals,
    notices,
    settledTally,
    guardrailsUnjudged,
    // Filled below: the derivation needs the assembled model to read.
    headlineFloor: "",
    headlineTrace: null,
    preheader,
    subject,
  };

  // ── THE HEADLINE, last, because it reads the finished model.
  const derived = deriveHeadline(model);
  model.headlineFloor = derived?.text ?? "";
  model.headlineTrace = derived?.trace ?? null;

  // THE ANALYST WINS ON WORDS, NEVER ON FACTS. Their headline is printed unless
  // it denies something the numbers beside it establish — the failure that put
  // "Nothing separates the two versions yet" above two settled movers. This
  // tests CONTRADICTION only: never tone, register, or preference.
  const written = input.reading?.headline?.trim();
  const contradiction = written ? headlineContradiction(written, model) : null;
  if (written && !contradiction) {
    story.headline = written;
  } else if (model.headlineFloor) {
    story.headline = model.headlineFloor;
    story.headlineComputed = true;
    if (contradiction) story.headlineOverridden = contradiction;
  }

  return model;
}
