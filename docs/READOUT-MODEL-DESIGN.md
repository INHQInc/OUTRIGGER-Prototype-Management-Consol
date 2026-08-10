# The Shared Readout Model

**File:** `/Users/bryanhopkins/Projects/OUTRIGGER Prototypes/OUTRIGGER Prototype Managment Console/src/lib/prototypes/readout-model.ts`

It belongs in `lib/prototypes/` beside `stats.ts` / `verdict.ts` / `results.ts` / `notebook.ts` — the layer both surfaces already import. Hard constraints on the module: **no React, no `getContentStore`, no `fetch`, no `Date.now()`, no hex, no CSS class names, no hooks.** A pure synchronous function over a plain input record.

One dependency move is required in step 1: `shortLabel` and `templateStory` come out of `src/lib/ai/results.ts` (which does `import Anthropic from "@anthropic-ai/sdk"` at module top) and into this file. They are string functions with no model in them, and today the page's import of them drags the Anthropic SDK toward the client bundle.

---

## 1. The interface

```ts
/**
 * THE READOUT MODEL — one interpretation, two skins.
 *
 * The maths was always shared (stats.ts, verdict.ts, results.ts, notebook.ts).
 * The INTERPRETATION was written twice: the settled test four times, valence
 * five times, the verdict vocabulary five times, the next action twice — and
 * the two copies disagreed. A decrease-is-good metric that fell rendered RED
 * on the page and GREEN in the email; a refuted run read "Hold the call" on
 * screen and "Stop it, or redesign the change and retest" in the inbox.
 *
 * This module answers every interpretive question ONCE. It emits values a
 * renderer PRINTS or SWITCHES ON — never a value it must compute, and never a
 * colour: tone is a token, and each skin owns its own palette because email
 * has no CSS variables, no dark mode, and Outlook discards the `font`
 * shorthand.
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
 */
import type {
  ExperimentResults, MetricMap, MetricRole, CompositeMetric,
} from "./results";
import type { StatsReport, DailySnapshot, CellStats } from "./stats";
import type { VerdictRecord, VerdictState, VerdictGate } from "./verdict";
import type { Reading, ReadSection } from "./notebook";
import type { AttentionItem } from "./attention";
import type { DeepObservation } from "../ai/observation";

// ────────────────────────────────────────────────────────────────────────────
// TOKENS — the enums every skin maps to its own palette. No hex here, ever.
// ────────────────────────────────────────────────────────────────────────────

/** VALENCE. Direction-aware and breach-aware: `loss` means "moved against the
 *  team", which for a decrease-is-good metric is a RISE. `caution` is reserved
 *  for at-risk guardrails — a state the page has never surfaced. `neutral` is
 *  an exactly-zero lift, an unjudgeable one, or an adoption-only metric. */
export type Tone = "win" | "loss" | "caution" | "neutral";

/** Whether the tone has been EARNED. Orthogonal to `Tone` on purpose: the page
 *  greys unsettled numbers ("chroma is earned") and the email tints them
 *  ("valence always carries hue"). Both are defensible; both consume the same
 *  two facts. */
export type Confidence = "settled" | "unsettled" | "not-applicable";

/** How loud a state is. Drives the verdict rule, the attention bar, the
 *  guardrail tile. `bad` is a stop; `caution` is a look. */
export type Severity = "good" | "bad" | "caution" | "neutral";

/** Where a metric's definition came from. */
export type MetricSource = "plan" | "console" | "optimizely";

/** Ids a skin may switch on to decide whether it has room for a notice.
 *  Exhaustive union so a new notice fails to compile until every surface has
 *  decided what to do with it. */
export type NoticeId =
  | "frozen-snapshot"          // live fetch empty; rendering the stamped freeze
  | "decision-inherited"       // no console decision metric; Optimizely's is judged
  | "direction-assumed"        // nobody declared which way a win looks
  | "tests-disagree"           // CI excludes zero XOR p < alpha, on the decision metric
  | "hypothesis-not-frozen"    // judged against the brief as it reads today
  | "plan-unconfirmed"         // the definition is a nomination, not a contract
  | "focus-fallback"           // the bound variation isn't in the results
  | "validity"                 // SRM warn/compromised
  | "reading-partial-structure"
  | "reading-computed-summary"
  | "only-decision-declared"   // nothing typed supporting, so the read has one metric
  | "plan-drift";              // results report events the plan never reviewed

export interface Notice {
  id: NoticeId;
  severity: Severity;
  /** ≤ 90 chars. The chip or one-liner. */
  text: string;
  /** The full explanation. Page uses it as a title/tooltip; email prints it. */
  detail: string;
  /** In-app destination. Email ignores it. */
  href?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// PRIMITIVES — every number arrives formatted AND raw.
// ────────────────────────────────────────────────────────────────────────────

/** A number that is ready to print. `text` is never empty — an absent value is
 *  the em dash. `raw` is there for the things that must be DRAWN (bar widths,
 *  gauge domains, chart scales), never for re-formatting. */
export interface Figure {
  text: string;
  raw?: number;
  absent: boolean;
}

/** A confidence interval on the relative lift. */
export interface RangeView {
  lo: number;
  hi: number;
  /** "-0.4% to +9.1%" */
  text: string;
  /** "plausible range -0.4% to +9.1%" */
  sentence: string;
  /** hi - lo. A skin may use it to budget space; it may NOT use it to change
   *  precision — that was the page's hidden second uncertainty channel. */
  span: number;
  /** True when the interval excludes zero. The same fact as `settled`, carried
   *  here so a gauge does not have to reach back up to the metric. */
  excludesZero: boolean;
}

/** One day of the run, resolved through resolveMetricRow (never a raw name
 *  match — a disambiguated event, "X (unique)", draws flat otherwise). */
export interface SeriesPoint {
  date: string;
  /** Cumulative lift to this date. Always defined — undefined days are dropped. */
  lift: number;
  /** This day alone. Absent when Optimizely restated its totals (a negative
   *  delta) or the day's base rate is zero — suppressed, never drawn as a fall
   *  that did not happen. */
  dailyLift?: number;
  focusRate: number;
  baseRate: number;
}

// ────────────────────────────────────────────────────────────────────────────
// METRICS
// ────────────────────────────────────────────────────────────────────────────

export interface CompositeView {
  /** More than one event, or any per-arm definition. A one-event composite is
   *  the event under another name and is NOT flagged. */
  isComposite: boolean;
  /** The definition differs by arm — a variation-only surface paired with the
   *  control's equivalent. */
  perArm: boolean;
  /** "composite" | "composite · per version" */
  chipLabel: string;
  /** describeComposite() — the ONE sentence, including the actions-per-visitor
   *  caveat that makes a >100% rate legible. */
  description: string;
  /** The member event names, per arm where they differ. */
  events: string[];
}

/** One arm's cell in the index table. */
export interface ArmCell {
  variationId: string;
  name: string;
  isBaseline: boolean;
  isFocus: boolean;
  rate: Figure;
  count: Figure;
  visitors: Figure;
}

export interface MetricView {
  key: string;
  label: string;
  /** ≤34 chars, trimmed at a word boundary. */
  shortLabel: string;
  kind: "composite" | "metric";

  // ── identity ──
  role: MetricRole;
  /** "Decision" | "Supporting" | "Guardrail" | "Exploratory" — one vocabulary. */
  roleLabel: string;
  isDecision: boolean;
  isOptiPrimary: boolean;
  source: MetricSource;
  /** "optimizely" | "console" | "plan" — the badge word. */
  sourceLabel: string;
  /** The full provenance sentence, including the joined event list. */
  sourceDetail: string;

  // ── the numbers ──
  /** THE number for this row. The lift, or the RATE for an adoption-only
   *  metric where a lift is meaningless. Print this when there is room for one. */
  headline: Figure;
  lift: Figure;
  ci: RangeView | null;
  p: Figure;                 // "p<0.0001" | "p=0.043" | "—"
  /** "94% to beat control" — the whole clause, or absent. */
  pBeat: Figure;
  focusRate: Figure;
  /** null = the control has nothing equivalent (an adoption-only surface). */
  baseRate: Figure | null;
  focusCount: Figure;
  baseCount: Figure;
  focusN: Figure;
  baseN: Figure;
  /** Optimizely's own significance, 0..1. Suppressed (absent) on windowed data. */
  optiSignificance: Figure;

  // ── what the numbers MEAN ──
  tone: Tone;
  confidence: Confidence;
  /** confidence === "settled". The flag every chart's colour gate wants. */
  earned: boolean;
  /** The CI excludes zero. (lo > 0 || hi < 0.) */
  settled: boolean;
  /** p < VERDICT_THRESHOLDS.alpha — the test the VERDICT actually used.
   *  Not the same test as `settled`: Katz log-RR interval vs pooled
   *  two-proportion z on the risk difference. They disagree around alpha. */
  significant: boolean;
  /** settled !== significant. Surfaced so a green "It worked" can never sit
   *  above an amber "Not settled" with nothing explaining it. */
  testsDisagree: boolean;
  /** Moved the way the team wanted. null when there is no lift to judge. An
   *  exactly-zero lift is NOT favourable. */
  favourable: boolean | null;
  /** Resolved once: plan.directions[key] → decision.direction → composite.direction
   *  → "increase". */
  direction: "increase" | "decrease";
  /** False means "increase" is an ASSUMPTION, not a declaration. */
  directionDeclared: boolean;
  guardrail: "pass" | "at_risk" | "breach" | "unknown" | null;
  /** The event fires in one arm only — comparison is meaningless. */
  featureOnly: "variation" | "baseline" | null;

  // ── words ──
  /** "Settled" | "Not settled" | "Adoption" */
  settledWord: string;
  /** "guardrail" | "at risk" | "too early" | "new surface" | undefined. */
  qualifier?: string;
  /** The analyst's line: the deep read's `captures` when one has been fetched,
   *  else the reading's observation note. */
  note?: string;
  /** WHAT THIS METRIC COUNTS, always present, always true whichever way the
   *  number went. The fallback body of an observation row. */
  countingLine: string;
  /** Present when the definition names events Optimizely isn't reporting.
   *  A misnamed metric is a broken definition, not a flat result. */
  misnamed?: { events: string[]; line: string };
  composite: CompositeView | null;

  // ── the run, day by day. EMPTY, never invented, when no snapshots. ──
  series: SeriesPoint[];
  /** null when < 3 points or no snapshots. "Only 2 days of day-by-day data so
   *  far." for 1–2 points. */
  trendSentence: string | null;

  // ── the index table ──
  arms: ArmCell[];
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
  /** "PASS" | "FAIL" | "n/a" */
  word: string;
  severity: Severity;
}

export interface GuardrailSummary {
  breached: number;
  atRisk: number;
  unknown: number;
  total: number;
  /** "2 breached" | "1 at risk" | "All clear" | "None mapped" */
  word: string;
  tone: Tone;
  rows: { compositeId: string; key: string; label: string;
          state: "pass" | "at_risk" | "breach" | "unknown"; detail: string; tone: Tone }[];
}

export interface VerdictView {
  state: VerdictState;
  severity: Severity;
  /** "Yes" · "No" · "No — and it hurt something" · "Too early to say".
   *  The leader's question, answered in the leader's words. */
  answer: string;
  /** "It worked" · "Stop and look — a guardrail broke". A complete answer with
   *  a subject, reading as the VALUE of "Status:". */
  label: string;
  /** "Confirmed" · "Guardrail breach". The engine's own term, for the chip. */
  term: string;
  /** The engine's sentence from deriveVerdict(). */
  sentence: string;
  stamped: boolean;
  /** "Official — Bryan Hopkins · 2026-08-04", or null while a draft. */
  stampLine: string | null;
  /** verdict.nextStep(), the ONE derivation, plus the in-app destination. */
  nextStep: { label: string; gateId?: string; href?: string };
  gates: GateView[];
  gatesPassed: number;
  gatesTotal: number;
  guardrails: GuardrailSummary;
  /** The full "read this before trusting the verdict" paragraph, or null. */
  directionCaveat: string | null;
  discoveries: DiscoveryView[];
  /** "~1.4 false movers expected among 23 at raw α=.05" */
  falsePositiveLine: string | null;
}

export interface DiscoveryView {
  id: string;
  label: string;
  variationName: string;
  lift: Figure;
  tone: Tone;
  /** "very unlikely to be noise" | "unlikely to be noise" | "worth a look" */
  strength: string;
  /** "False-discovery rate q=3.2% after correcting for the metrics swept" */
  strengthDetail: string;
  promoted: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// FRAME — the things around the numbers
// ────────────────────────────────────────────────────────────────────────────

export interface RuntimeView {
  /** Wall-clock days since the EXPERIMENT'S OWN start (results.startTime),
   *  measured to stats.computedAt so a re-send reads identically. */
  daysSinceStart?: number;
  /** Days of console snapshots. What the countdown arithmetic uses, because
   *  nextStep() uses it. */
  observationDays?: number;
  /** "Day 12" — daysSinceStart when known, else observationDays + 1, else "—". */
  dayLabel: string;
  daysLeft?: number;
  ready: boolean;
  /** "decision-ready — the verdict gates are clear" | "~3 more days to a
   *  decision" | "waiting on the verdict gates" | "trend unlocks as daily
   *  snapshots accumulate" */
  readyCaption: string;
  /** "LIVE" | "PAUSED" | "CONCLUDED" | "NOT STARTED" — from experimentStatus. */
  freshWord: string;
  /** "12 Jan 2026", UTC. Stable across re-sends. */
  asOfDate: string;
  /** "12 min ago". Needs `now`; a skin that memoizes must not print it. */
  asOfRelative: string;
  computedAt?: string;
  provenance: string;
  /** shortNotice() */
  notice: string;
}

export interface HealthView {
  status: StatsReport["validity"]["status"];
  /** "✓ health" | "health unchecked" | "⚠ health" */
  word: string;
  detail: string;
  severity: Severity;
}

export interface HypothesisView {
  /** The pre-registered hypothesis, else the brief as it reads today. */
  text: string | null;
  frozen: boolean;
  /** "frozen 2026-07-14" | "not frozen" */
  chip: string;
  frozenAt?: string;
  anchor: "cut" | "plan" | "live" | "none";
  severity: Severity;
  prototypeName: string;
}

export interface PowerView {
  perArmN: Figure;
  mdeNow: Figure;
  observedLift: Figure;
  targetLift: Figure;
  daysToObserved?: number;
  daysToTarget?: number;
  /** The whole assembled sentence. */
  sentence: string | null;
}

/** ONE superset of vitals. Each surface renders the ids it has room for; the
 *  page's four and the email's four stop being four different derivations. */
export type VitalId =
  | "visitors" | "runtime" | "beyond-luck" | "guardrails"
  | "decision-count" | "decision-lift";

export interface VitalView {
  id: VitalId;
  label: string;
  value: string;
  sub?: string;
  tone: Tone;
}

// ────────────────────────────────────────────────────────────────────────────
// THE STORY
// ────────────────────────────────────────────────────────────────────────────

/** One of the four movements. The label and the order are here, in one place,
 *  rather than literally duplicated in two files. */
export interface MovementView {
  id: "effect" | "shift" | "cost" | "prediction";
  /** "01" — the email numbers them; the page may ignore it. */
  ordinal: string;
  /** "What the change did" */
  label: string;
  text: string;
  /** The metric that evidences the sentence, resolved live. null when the
   *  section named no measure or the measure no longer resolves. */
  metric: MetricView | null;
}

export interface StoryView {
  headline: string | null;
  /** The analyst's executive summary — two or three sentences, digit-free by
   *  schema, for someone who reads this and nothing else. */
  executive: string | null;
  lede: string | null;
  /** Non-empty only when at least one movement has text. */
  movements: MovementView[];
  /** The beats row, built from the SUPPORTING SET (not from the cached
   *  reading's beat list), borrowing the reading's wording where it has one,
   *  decision metric sorted first. */
  beats: MetricView[];
  /** Where the words came from. */
  source: "analyst" | "computed";
  /** The email's last resort when there is no headline at all:
   *  "<name> — experiment readout". The PAGE must not use it — the read zone
   *  stays closed rather than opening onto a title with no body. */
  titleFallback: string;
  /** One caption under the day-by-day picture, from the analyst. */
  trendCaption: string | null;
}

export interface AttentionView {
  id: string;
  title: string;
  /** The analyst's gloss when there is one, else the computed detail. */
  detail: string;
  severity: Severity;
  acknowledged: boolean;
  actionLabel?: string;
  actionHref?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// THE MODEL
// ────────────────────────────────────────────────────────────────────────────

export interface ReadoutModel {
  /** True when there is nothing to render. Every other field is still
   *  populated and safe to read — this is the "show the empty state" flag,
   *  not a null model. */
  empty: boolean;
  /** Why it is empty, in the reader's words. */
  emptyReason: string | null;

  /** THE EFFECTIVE DATA — frozen-snapshot fallback already applied. Every
   *  renderer reads these. The raw inputs are not re-exported, so no surface
   *  can accidentally read the un-fallen-back pair and blank a stamped run
   *  whose Optimizely fetch failed. */
  results: ExperimentResults | null;
  stats: StatsReport | null;
  /** True when `results`/`stats` came from verdict.frozen*. */
  fromFrozenSnapshot: boolean;

  prototypeName: string;
  prototypeKey: string;

  // ── metrics ──
  /** Every metric in the stats report, keyed. THE lookup — replaces
   *  metric()/cell() and statsFor()/cellFor() on both sides. */
  byKey: Record<string, MetricView>;
  /** Every metric, in the team's dragged order, decision first. */
  all: MetricView[];
  /** THREE NAMED SETS. Each surface keeps consuming the one it consumes today;
   *  collapsing them is a separate, reviewable decision. */
  decisionKey: string | null;
  optiPrimaryKey: string | null;
  /** The decision metric resolved for DISPLAY: the console's, else
   *  Optimizely's. `decisionInherited` says which. */
  headlineKey: string | null;
  decisionInherited: boolean;
  decision: MetricView | null;
  /** Role-driven: both primaries + everything typed supporting. What the
   *  summary is ABOUT. Drives the beats row and the email's table. */
  supporting: MetricView[];
  /** Pin-driven: the decision metric + everything the team pinned. What gets a
   *  written OBSERVATION. Drives the page's Metric-by-metric. */
  observed: MetricView[];
  /** Index rows in drag order, hidden ones separated. */
  visibleRows: MetricView[];
  hiddenRows: MetricView[];
  /** Canonical column order: focus, then others, then baseline, capped at 5. */
  arms: { variationId: string; name: string; isBaseline: boolean; isFocus: boolean; visitors: Figure }[];

  /** Picked by MAGNITUDE from the supporting set, never nominated — so the
   *  summary cannot disagree with the table beneath it. */
  biggestGain: MetricView | null;
  biggestCost: MetricView | null;

  // ── frame ──
  verdict: VerdictView | null;
  story: StoryView;
  runtime: RuntimeView;
  health: HealthView | null;
  hypothesis: HypothesisView;
  power: PowerView | null;
  vitals: VitalView[];
  attention: AttentionView[];
  notices: Notice[];

  /** "3 of 7 metrics" — the beyond-luck tally over the supporting set. */
  settledTally: { settled: number; total: number; text: string };

  /** The inbox preview / one-line summary. Built from the model, so it can
   *  never promise something the body does not say. */
  preheader: string;
  /** "<name> — It worked" */
  subject: string;
}
```

### The builder

```ts
/** The decision metric as a READ-ONLY descriptor. Promote the shape that
 *  already exists in results/route.ts `decisionOf()` to a named export in
 *  results.ts, and have report-run.ts build one too. */
export interface DecisionDescriptor {
  key: string;
  label: string;
  source: "console" | "optimizely";
  direction?: "increase" | "decrease";
  directionDeclared: boolean;
  events: string[];
  armEvents?: { variationId: string; events: string[] }[];
}

export interface ReadoutInput {
  prototypeName: string;
  prototypeKey: string;

  // ── data. The model applies the frozen fallback itself. ──
  results: ExperimentResults | null;
  stats: StatsReport | null;
  verdict: VerdictRecord | null;
  reading: Reading | null;

  /** THE STORED PLAN — the thing writes mutate. Never the resolved map.
   *  Feeding this the resolved map would let the page POST the synthesized
   *  `opti-primary` composite into the team's authored plan. */
  plan: MetricMap | null;
  /** The resolved decision metric, read-only. This is how the model learns
   *  Optimizely's declaration without ever holding its composite. */
  decision: DecisionDescriptor | null;

  // ── presentation state. Explicit, so an OPTIMISTIC override can be passed.
  //    The page passes `observedLocal ?? plan.observed`; the server passes the
  //    stored values. Required, not optional: a caller that forgets `order`
  //    would silently stop following an in-flight drag. ──
  observed: string[];
  roles: Record<string, "supporting" | "guardrail" | "exploratory">;
  order: string[];
  hidden: string[];

  // ── environment. Required, no defaults: a caller that forgets these must
  //    fail to compile rather than render "LIVE · 12 min ago" over a
  //    concluded run. ──
  experimentStatus: string | null;
  now: number;

  // ── optional. Each DEGRADES to a named empty; nothing is invented. ──
  snapshots?: DailySnapshot[];
  deepObservations?: Record<string, DeepObservation>;
  liveHypothesis?: string | null;
  attention?: AttentionItem[];
  acknowledged?: string[];
  planDrift?: string[];
  /** Suppress Optimizely's own significance column (windowed data). */
  suppressOptiSignificance?: boolean;
  /** Absolute base for hrefs. Email leaves it unset and ignores every href. */
  baseHref?: string;
}

export function buildReadoutModel(input: ReadoutInput): ReadoutModel;
```

**Degradation, precisely — degrade, never invent:**

| Missing input | What the model does |
|---|---|
| `snapshots` absent or `< 2` days | `series: []`, `trendSentence: null` on every metric. No sentence is synthesized from cumulative numbers. `runtime.observationDays` still comes from `stats.power`. |
| `snapshots` present but `< 3` points for a metric | `series` populated, `trendSentence = "Only 2 days of day-by-day data so far."` — the count, not a shape. |
| `deepObservations` absent | `note` falls back to `reading.observations[key].note`, then `undefined`. Never falls back to `countingLine` — that is a separate field, and a skin decides whether to substitute. |
| `attention` absent | `attention: []`. The model does not re-derive it; `deriveAttention` is server-side and stays there. |
| `liveHypothesis` absent and no pre-registration | `hypothesis.text = null`, `frozen: false`, `anchor: "none"`. The card does not render. |
| `results` null and verdict not stamped | `empty: true`, `emptyReason` = the results error or "No results yet." Every collection is `[]`, every view object is null-or-neutral. **The model never throws.** |
| `results` null and verdict **stamped** | Frozen fallback: `results = verdict.frozenResults`, `stats = verdict.frozenStats`, `fromFrozenSnapshot: true`, plus a `"frozen-snapshot"` notice. The email gains this — today `report-run.ts` hard-fails here. |
| `verdict` null | `verdict: null`; `nextStep` is still available at `model.story`-level? No — a null verdict means no status band. `runtime`, `story`, metrics all still build. |
| `planDrift` absent | no `"plan-drift"` notice. |

---

## 2. Field-by-field: what it replaces, and who wins

### Formatters and primitives

| Model field | Page today | Email today | Winner · why |
|---|---|---|---|
| `Figure.text` (lift) | `pctS` L28 (1dp signed), `fmtLift` L863 (▲/▼, 0dp when CI span > 0.2) | `pct` L113 (1dp signed) | **Email/`pctS`.** They already agree. `fmtLift`'s ▲/▼ duplicates a sign the string already carries, and the wide-CI 0dp downgrade is a *second, hidden* uncertainty channel — the model carries uncertainty explicitly in `settled`, `ci`, `settledWord`. Kill both. (Step 7.) |
| `Figure.text` (rate) | local `rate()` inside `observationFor` L1471 (1dp); `.toFixed(2)` in the numbers table | `rate` L114 (1dp) | **1dp everywhere except the numbers workbench,** which is the statistical view and keeps 2dp as an explicit skin override on `raw`. |
| `Figure.text` (count) | `.toLocaleString()` inline ×9 | `num` L115 | Identical. One function. |
| `Figure.absent` | `"—"` literals scattered | `"—"` in each formatter | The em dash becomes a model fact, not a magic string in twelve places. |
| plural in captions | `plural` L76 | inline in `nextStep` | **`plural`.** `nextStep` already has its own day/days branch; keep it there and use `plural` inside it. |

### The settled test — the single most duplicated derivation

| Model field | Page today | Email today | Winner · why |
|---|---|---|---|
| `settled` | `sigOf` L73 `(lo > 0 \|\| hi < 0)`; **restated inline** at L2145 `(lo * hi > 0)`; again in `templateStory` ai/results.ts L495 and L509 | `isSettled` L141 `(lo * hi > 0)` | **The page's expression.** Algebraically identical for a well-ordered interval, but `lo*hi` flushes to zero on denormals (lo=1e-200, hi=2e-200 → "unsettled") and reads worse. Four textual copies → one. |
| `significant` | *nowhere* | *nowhere* | **New.** The verdict adjudicates on `cell.p < alpha` (pooled z on the risk difference); both surfaces display the Katz log-RR interval. These are different tests and they disagree in a band around α. Exposing `significant` is what lets a surface stop contradicting the verdict it prints. |
| `testsDisagree` + the `"tests-disagree"` notice | *nowhere* | *nowhere* | **New.** This is the bug where a green "It worked" sits directly above an amber "Not settled" with nothing reconciling them. |
| `settledWord` | `"beyond luck"` / `"too early"` L2422, L2520; `"too early"` as a beat qualifier L1298; no chip anywhere | `"Settled"` / `"Not settled"` L410, `"Settled beyond luck"` / `"Still inside luck"` L327, the amber pill L161 | **Email's "Settled" / "Not settled".** Three page wordings for one predicate, none of which match the email's two. "Beyond luck" is charming and ambiguous — it reads as a magnitude claim. Add `"Adoption"` for `featureOnly`, which the email has no word for at all. |

### Valence — five rules become one

| Model field | Page today | Email today | Winner · why |
|---|---|---|---|
| `direction` | `comp?.direction === "decrease"` read off the **STORED** map, inline at L1285 (`beatFor`) and L1468 (`observationFor`); **absent entirely** from `toneOf` L74 | `wantsDown` L139, off the **RESOLVED** map | **Neither.** Both are wrong in different places. The page's stored map has no `directions` overlay (`withDirections` runs only inside `resolveDecisionMap`) and no synthesized `opti-primary`, so it is direction-blind for every console declaration *and* for the inherited decision metric. The email reads the resolved map but `report-run.ts:47` calls `resolveDecisionMap(stored, results)` with `optiDirection` **omitted**, so it is blind to Optimizely's declaration. The model resolves once: `plan.directions[key] ?? decision.direction (for the decision key) ?? composite.direction ?? "increase"`. Two prerequisite fixes in step 0. |
| `directionDeclared` | in state at L574, **never consulted** by `beatFor`/`observationFor` | only inside `dirAssumed` L200, and only for the hero | **Page's data, email's use.** Every metric carries it, not just the decision metric. |
| `favourable` | `good` L1285 / L1469 (direction-aware, `lift > 0`) | `favourable` L145 (direction-aware, `lift === 0 → false`) | **Email on the zero case.** `toneOf` paints an exactly-zero settled lift GREEN (`>= 0`). Zero is not a win. |
| `tone` | `toneOf` L74 (direction-BLIND, greys unsettled, zero→green) drives the All-metrics Δ column L2421/L2519 and the whole numbers workbench L1163; `liftClass` L829 (sign only, no significance gate); `beatFor`/`observationFor` (direction + breach aware) | `tone`/`inkFor` L150–158 (direction-aware, **breach-blind**, never greys) | **`beatFor`'s semantics.** It is the only rule that consults `verdict.guardrails`. The email prints a breached-but-rising guardrail GREEN. Direction-blind `toneOf` colours most of what an analyst actually reads. Add `caution` for `at_risk`, which **neither surface has ever shown** — a guardrail one CI away from breaching is currently invisible on both. |
| `confidence` / `earned` | "Chroma is earned" L72 → grey when unsettled | "Valence always carries hue" L85–90 → soft tint when unsettled | **Neither — this stays a skin decision.** Both files argue their case in a comment and both are defensible: the page has data-viz tracks, dark mode and a `MicroTrend`; the email is light-only with an explicit NOT SETTLED tag doing the work in words. The model separates `tone` (must agree) from `confidence` (each skin maps). |
| `guardrail` per metric + `verdict.guardrails` aggregate | per-metric breach lookup only, L1286/L1470, used solely to force red | aggregate count only L213–214/L237 | **Both, unified.** Page gains the aggregate and `at_risk`; email gains the per-metric override. Note the page matches on `composite:${g.compositeId}` and so only sees guardrails whose metric is on screen; the model counts every guardrail in the record. |

### The verdict

| Model field | Page today | Email today | Winner · why |
|---|---|---|---|
| `label` | `VERDICT_LOOK[].label` L31 — "HYPOTHESIS CONFIRMED", "WON, BUT BROKE A GUARDRAIL" | `VERDICT[].label` L100 — "It worked", "Stop and look — a guardrail broke" | **Email.** The page's shouty caps are engine vocabulary wearing a headline's clothes. "Stop and look — a guardrail broke" is a complete sentence; "WON, BUT BROKE A GUARDRAIL" leads with the win. |
| `term` | *none* | `VERDICT[].term` L100 | **Email.** The chip is how a reader learns the engine's word without being shouted at in it. |
| `answer` | *none* | `ANSWER[].word` L243 — and the HTML no longer even uses it; it survives only in the preheader fallback L276 because the block that consumed it is dead | **Email, resurrected.** "Underpowered" is not an answer to a leader's question. A third page vocabulary also exists at `prototypes/[key]/page.tsx:525` (`verdict.replace(/_/g," ")`) — that dies too. |
| `severity` | `VERDICT_LOOK[].cls` (guardrail_breach → **amber**) *and* `edge` L1265 (guardrail_breach → **amber**) — two tables in one file | `VERDICT[].rule` (guardrail_breach → **red**) | **Email.** A breached guardrail *vetoes a confirmed verdict* — that is a stop, not a caution. `underpowered` → `caution` in both. Five colour tables (`VERDICT_LOOK.cls`, `VERDICT_LOOK.border`, `edge`, `VERDICT.rule`, `ANSWER.ink`) → one token. |
| `nextStep` | `actionChip` L1238 — a **reimplementation**, not a share; ResultsPanel never imports `nextStep` | `nextStep()` L261, the shared function | **The shared `nextStep()`, outright.** `actionChip` reads the failing gate first with no verdict short-circuit, so a refuted run says "Hold the call" on screen and "Stop it, or redesign the change and retest" in the inbox — exactly the bug `verdict.ts:585-587` documents having fixed. It also lacks a `prereg` entry, hardcodes the 7-day floor where `nextStep` uses `VERDICT_THRESHOLDS.minRuntimeDays`, and phrases every shared branch differently. The file comment at `readout.ts:49-51` claiming this is already shared is **false**; adopting `nextStep` makes it true. |
| `nextStep.href` | `actionChip`'s four hrefs | none (an email cannot link to `#attention`) | **Page's hrefs, mapped from `nextStep`'s `gateId`.** This is the only genuinely page-only part of `actionChip` and it is why `nextStep` returns `gateId` in the first place. |
| `directionCaveat` | *none* | L200–207 | **Email.** The page has never told a reader that a verdict turning on direction was judged on an assumption. |
| `gates` / `gatesPassed` | L1018, L2574 | *none* | **Page.** |
| `discoveries` | L2185 (behind `SHOW_EXPLORATORY=false`) | *none* | **Page.** The q-value→words translation is good and the email has no exploratory section at all. |

### Metric sets and the story

| Model field | Page today | Email today | Winner · why |
|---|---|---|---|
| `supporting` | `supportingKeys` L1315 with `map: mapEff` (optimistic), `order: orderLocal ?? measureOrder`, `optiRowIsDecision: decision.source === "optimizely"` | same function, `report-run.ts:58` with the **resolved** map, **no `order`**, `optiRowIsDecision` sniffed from `map.composites` | **Same function, one argument list.** Order agrees today only because `supportingKeys` falls back to `opts.map?.measureOrder` internally (results.ts:470) — an accident, not a contract. `order` becomes required on the model so a caller cannot forget it. |
| `observed` | L1365 — dedupe(primaryKey + pins), sorted by rank, decision forced first | *no equivalent*; the email lists `supporting` and **captions it "All metrics"** (L504) | **Keep both sets, separately named.** Collapsing them changes what renders: a metric typed supporting but never pinned would gain a chart and a `seriesFor` pass on the page; a pinned exploratory metric would vanish. Fix the email's caption to "Supporting metrics". |
| `all` / `visibleRows` / `hiddenRows` / `arms` | L2229–2261 | *none* | **Page.** Including the display-only `inheritedRow` synthesis (L2243) and the filter that drops the duplicate raw row (L2255) — this is what keeps the decision metric from printing twice under two names. |
| `story.headline` | `reading.headline \|\| templateStory().headline`, gated on `picked.length` L1343 | `reading.headline \|\| verdict.headline \|\| "<name> — experiment readout"` L184 | **Page's chain, including the `picked.length` guard.** With no reading the page shows a full computed story and the email shows a bare title. The email's last resort survives as `titleFallback`, which the page must not read. |
| `story.executive` | *unused* | L298 | **Email.** The analyst writes an executive summary and the page throws it away. |
| `story.trendCaption` | L2026, behind `SHOW_PROOF=false` | *none* | **Page.** |
| `story.movements` | L1874 — labels + order hardcoded | L365 — the same four labels, the same order, **literally duplicated** | Same content, one definition. Page keeps the decision chip / composite flag / qualifier; email keeps the `01`–`04` ordinals (now `ordinal`). |
| `story.beats` | L1326 built from `supporting` | *none* | **Page.** |
| `biggestGain` / `biggestCost` | *none* | L256–260, picked by magnitude | **Email.** "Picked by the data, not nominated by the analyst" is the rule that stops the summary disagreeing with the table. |
| `story.source` + the two reading-quality notices | L1853–1862 | *none* | **Page.** A section that silently disappears reads as the feature being broken. |

### Frame

| Model field | Page today | Email today | Winner · why |
|---|---|---|---|
| `results` / `stats` (frozen fallback) | L825–826 | **absent** — `report-run.ts:42` hard-fails | **Page.** A stamped run whose Optimizely fetch fails renders fully on screen and fails to send. Resolving inside the model means no surface can read the un-fallen-back pair. New: a `"frozen-snapshot"` notice, which neither surface shows today. |
| `headlineKey` / `decisionInherited` | L853–854 — falls back to `optiPrimaryKeyOf(live)` **and says so** | `pk = stats.primaryKey` only, L191 — no fallback, no caveat, so with no console decision metric the hero simply does not render | **Page.** Fallback-and-disclose beats silence. |
| `runtime.dayLabel` | `dayN = power.observationDays + 1`, L905 and again L1255 | `floor((computedAt − startTime)/86.4e6)`, L223 | **Both, named.** They measure different things and the email is *internally* inconsistent: its "about N more days" comes from `nextStep`, which uses `power.observationDays`. So one email quotes two clocks. `dayLabel` prefers `daysSinceStart` (results.ts calls `startTime` "the honest day-counter"); the countdown uses `observationDays`. |
| `runtime.freshWord` | L840, from `expStatus` | *none* | **Page.** `experimentStatus` becomes a required model input so a PAUSED run can never email as LIVE. |
| `runtime.asOfDate` / `asOfRelative` | `relTime` L78 (local, wall clock) | `asOfLabel` L268 (UTC, absolute, re-send-stable) | **Both.** `now` is an explicit input; a skin that memoizes must print `asOfDate`, not `asOfRelative`. |
| `health` | L1749, duplicated at L1828 | **nothing** | **Page.** Today an experiment with a compromised traffic split emails as if nothing were wrong. |
| `hypothesis.frozen` | L1787 — `pr.hypothesis` present → frozen | L188 — `pre.anchor !== "live" && !pre.hypothesisNotFrozen`, computed and then **never used** | **Page.** Two definitions of frozen, one of them dead. Email also gains the `liveHypothesis` fallback it lacks. |
| `vitals` | four tiles L865–924 (behind `SHOW_TILES=false`): focus+base visitors, decision counts, lift+CiGauge, Timeline | four *different* tiles L482–485: all-arm visitors, Day N, beyond-luck tally, guardrails | **One superset of six ids.** On visitors specifically: **email wins** (`totalVisitors ?? sum of all arms`) — on a 3-arm test the page's focus+base prints a different number for the same experiment. The page's per-arm breakdown survives as `sub`. |
| `settledTally` | *none* | L212 | **Email.** (`nFav` L211 is computed alongside and never used — dead.) |
| `power` | L1030–1038 | *none* | **Page.** |
| `attention` | L1934 (behind `SHOW_ATTENTION=false`), with `riskNotes` gloss preference | *none* | **Page.** |
| Composite Σ + `describeComposite` | L1214 | *none* — `isCompositeOf`/`describeComposite` are **already shared in results.ts and simply unused** | **Page.** Today an action-total metric whose rate can legitimately exceed 100% prints in the email as if it were a per-visitor conversion rate. |
| `misnamed` | L2379 badge, L1482 counting line | *none* | **Page.** A broken definition and a flat result must not look the same. |
| `featureOnly` / "new surface" | `beatFor` L1288, `observationFor` L1487 | *none* — an adoption-only metric prints a meaningless lift | **Page.** |
| `series` / `trendSentence` | `seriesFor` L1416 + `improvementFor` L1379 (two near-identical implementations in one file) + `MetricTrend` L118 (a **third**, matching snapshot rows by exact `m.name` instead of `resolveMetricRow`, so a disambiguated event draws flat) + `trendSentence` L1449 | *none* | **Page's `seriesFor`/`improvementFor`, merged into one pass** that emits both cumulative and daily. `MetricTrend`'s exact-name match is a bug — fix it as its own commit with a before/after on a duplicate-named event. |

---

## 3. Migration order

Each step is independently shippable and independently verifiable. **One fix per commit.**

### Step 0 — prerequisites. Three commits, before any extraction.

The model cannot be correct on top of two live bugs, and extracting on top of them would canonize them.

**0a. `report-run.ts` must resolve Optimizely's direction.** It calls `resolveDecisionMap(stored, results)` with `optiDirection` omitted, where `route.ts:101` passes `bundle.primaryDirection`. Thread it the same way: fetch the experiment definition, join `winning_direction` by `event_id` (never array position), pass it through.
*Verify:* an experiment with `winning_direction: decreasing` and a −8% primary. Before: hero red under a green "It worked". After: green.

**0b. `setDirection` must write through.** `route.ts:820-843` writes only `map.directions[rowKey]`; the page's toggle at L2437 reads `c.direction ?? "increase"` from the stored map, which never changes. Either write `composites[].direction` alongside, or have the toggle read `map.directions[key] ?? c.direction`.
*Verify:* click ↓ on a bounce metric — the glyph flips, the tooltip flips, a second click flips it back. Today the control is one-way.

**0c. Baseline the dead branches.** Flip `SHOW_ATTENTION`, `SHOW_EXPLORATORY`, `SHOW_PROOF`, `SHOW_CALL`, `SHOW_TILES` all to `true` locally. Screenshot every zone. Flip back. Commit nothing. This is the only baseline that exists for four derivations that execute every render and appear nowhere — and the comment at L1838 records exactly this failure mode shipping before ("how the Email button shipped invisible and how Print kept calling `window.print()`").

### Step 1 — land the module, no callers.

Add `readout-model.ts`. Move `shortLabel` and `templateStory` out of `ai/results.ts` into it. Add `readout-model.test.ts` with snapshot fixtures:
- a `confirmed` run with a console decision metric, a breached guardrail, and a decrease-is-good metric;
- a `not_adjudicable` run with no console primary (exercises `decisionInherited`);
- `results: null` with `verdict.state === "stamped"` (exercises the frozen fallback);
- three **real cached readings** pulled from the store: one written before `read` existed, one before `executive`, one before `riskNotes` (which is typed required and is absent on old records — the page survives only via optional chaining at L1512).

*Verify:* `./scripts/check-build.sh --quick`, tests green, zero rendered change anywhere.

### Step 2 — page adopts identity and lookup only. No tone, no words.

`buildReadoutModel` is called as a **plain function in the render body at the same point the derivations sit today** — after the four conditional returns at L804/L805/L808/L822 and before the `view === "numbers"` return at L993. **It must not be a `useMemo`:** `AnalyticsView.tsx:105` mounts one ResultsPanel and flips `hidden`, so a hook added below `if (hidden) return` changes the hook count between renders and white-screens the Analytics tab on a tab switch.

Replace: `live`/`statsEff` → `model.results`/`model.stats`; `statsFor`/`cellFor` → `model.byKey`; `headlineKey`/`optiPrimaryKey`/`supporting`/`observed`/`obsRank` → the model's. Pass the optimistic values: `observed: observedLocal ?? map?.observed ?? []`, `roles: rolesLocal ?? map?.roles ?? {}`, `order: orderLocal ?? map?.measureOrder ?? []`, `hidden: map?.hiddenMeasures ?? []`.

*Verify:* full-panel screenshot diff is pixel-identical. Then click the pin, the Type select, and drag a row **while a background reading is holding `busy`** — each must answer on the same frame. This is where the optimistic-state contract is proven, and it is the regression the comment at L686-691 says already shipped once.

Fix `L2094` in this commit: the pin icon reads `map?.observed` directly, bypassing the optimistic `observedEff` the rest of the row uses, so it lags a click the row has already answered. Normalizing it is a rendered change — ship it deliberately, not as a side effect.

### Step 3 — email adopts the same.

`report-run.ts` stops passing the resolved map. It passes `plan: stored` plus a `DecisionDescriptor` built from the resolved map (the same shape `decisionOf` already produces server-side). Add `getResultsHistory` so `snapshots` can be supplied.

*Verify:* render the email for the same fixtures before and after and diff the HTML. The only expected diffs are the ones step 0a introduced.

### Step 4 — semantics. The first deliberate visual change.

Both surfaces switch to `model.tone` / `confidence` / `earned` / `settledWord` / `qualifier`, **each keeping its own palette map verbatim**. The page's five tone rules collapse; the email's breach-blindness ends.

*Verify:* a per-metric before/after table for one real experiment, checked against three specific cases — a decrease-is-good metric that fell (page red → green), a breached-but-rising guardrail (email green → red), an exactly-zero settled lift (page green → neutral). Also check every prototype with a non-empty `map.directions`: those are exactly the readouts whose colours move.

### Step 5 — the verdict and the next step.

Delete `VERDICT_LOOK`, `edge`, `actionChip` from the page; delete `ANSWER` and `VERDICT` from the email. Both read `model.verdict`.

*Verify:* **with `SHOW_CALL` flipped on.** The page currently renders no verdict word, no status and no next step at all, so this change is invisible on `main` — and the divergence would otherwise land the day someone flips the const, with nothing testing it. Check a `refuted` run with a failing gate: it must read "Stop it, or redesign the change and retest" on both surfaces.

### Step 6 — the one-sided features cross over. One commit each.

Email gains: health, composite Σ + `describeComposite`, `featureOnly`, `misnamed`, the frozen/not-frozen chip, the frozen-snapshot fallback, the trend sentence. Page gains: `executive`, the plain-words `answer`, the beyond-luck tally, the guardrail aggregate, `at_risk` (amber appears across the index for the first time), the direction caveat.

### Step 7 — formatting and the numbers view.

Kill `▲/▼` and the wide-CI 0dp downgrade. Build a **second model instance** for the windowed pair rather than reusing the readout's — otherwise the 7/14/30-day buttons stop changing anything and only the amber caption says otherwise. Keep `focusVariationId` and `suppressOptiSignificance` as explicit inputs so the existing quirks (the windowed table still reading the unwindowed focus id at L1093; Opti significance blanked at L1170) are preserved by declaration rather than by accident.

Land `MetricTrend`'s `resolveMetricRow` fix here, as its own commit, with a screenshot of a duplicate-disambiguated event.

### Step 8 — delete.

Page: `pctS`, `fmtLift`, `ciWide`, `sigOf`, `toneOf`, `liftClass`, `sigClass`, `beatFor`, `observationFor`, `seriesFor`, `improvementFor`, `trendSentence`, `compositeFor`, `figureFor` (already dead — defined at L1274, never called). Email: `pct`, `rate`, `num`, `wantsDown`, `isSettled`, `favourable`, `tone`, `inkFor`, `unsettledTag`, `frozen` (L188 — a second definition of frozen, never used), `nFav` (L211 — computed, never used). `ai/results.ts` L495/L509: `templateStory`'s two inline settled tests.

Keep every `SHOW_*` const and its render branch exactly where it is. The gated derivations move into the model; the branches do not move.

---

## 4. What deliberately stays surface-specific

**Palette and typography.** The model emits `Tone`, `Confidence`, `Severity`, `MetricRole`. The page maps them to `text-ok` / `text-danger` / `text-warn` / `text-muted-2`; the email maps them to `#0B7A4B` / `#B3261E` / `#7A5B00` and their soft variants. Email is `color-scheme: light only`; the page has dark mode and `data-viz-fill` attributes. One palette cannot serve both, and neither should try.

**How unsettled reads.** `tone` must agree; whether an unsettled number is *greyed* (page: "chroma is earned") or *tinted* (email: "valence always carries hue") stays a skin decision. Both files argue their case and both are right for their medium — the email has an explicit NOT SETTLED pill doing the work that the page does with saturation.

**Layout and markup.** Email has no flexbox, no grid, no CSS classes, no `<style>` worth relying on, and Outlook discards the `font` shorthand. The four movements are a `md:grid-cols-2 xl:grid-cols-4` on the page and a `<table>` with a 3px `<td>` rule in the email. The model gives them the same four labels, the same order, and the same resolved number.

**Charts.** `ComparisonBars`, `CiGauge`, `ProgressMeter`, `MetricTrend`, `MetricChart`, `MicroTrend`, `Sparkline` stay components. The model gives them `series`, `ci.lo`/`ci.hi`/`raw`, and `earned`; scale padding (1.15× on the gauge, 15%/0.02 on the chart), the 2% bar floor, the three y-ticks, the split-at-zero-crossing in `MicroTrend`, and the dashed today-tail all stay in the components — that is geometry, not interpretation. The email has no charts and takes nothing here.

**Interaction.** Drag/drop and `dropOn`, the `<select>` overlay on the Type chip, the pin, the eye, the direction toggle, the primary switch, rename/delete, the deep-observation fetch, the confirm-twice stamp, the print-fold opener, the mail panel, `MetricBuilder`. Wholly page.

**The numbers workbench.** The gate trace, the composite cards, `rows()`, the window buttons, the method fold, 2dp rates. It is a second reading of the same model at a different altitude, not a second model — but its *presentation* is unshared and should stay that way.

**Transport.** Subject line assembly, the hidden preheader div, the plain-text alternative, `esc()`. All built *from* model fields; none of it belongs in the model. (The plain-text alternative currently drops roles entirely — worth fixing while it is open, from `model.byKey[k].roleLabel`.)

**`hidden` stays non-optimistic.** `saveHidden` (L720) is the one presentation write with no local copy, while order/observe/role all have one. Giving it an optimistic copy for consistency would make hiding a metric *instantly* drop it from `supporting` (`supportingKeys` filters `hiddenMeasures`) and therefore from the beats row and Metric-by-metric — which today only happens after the server answers. Leave it inconsistent in this change and flag it as a separate decision.

**What the model must never do:** be POSTed back. `plan` is the only writable object and the model never returns it, never merges into it, and never returns a composite. `decision` is read-only by construction. Add an assertion to the test suite that no object reachable from a `ReadoutModel` is reference-identical to `input.plan.composites` or any member of it.