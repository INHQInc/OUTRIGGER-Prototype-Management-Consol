/**
 * The VERDICT engine — deterministic adjudication of the PRE-REGISTERED
 * hypothesis.
 *
 * OPMC's moat: the hypothesis, primary metric, and guardrails were frozen
 * in `briefSnapshot` when the version was CUT — provably before traffic.
 * This module is the payoff: a pure function maps (that frozen contract,
 * the confirmed metric map, the computed StatsReport) onto a typed verdict.
 * The model NARRATES the verdict; it cannot decide or override it. Validity
 * gates run before significance is even consulted — a broken traffic split
 * makes CONFIRMED structurally unreachable.
 *
 * Anything significant that was NOT pre-registered lands in discoveries[],
 * permanently labeled exploratory: a post-hoc metric can never be laundered
 * into "confirmed", only promoted into the NEXT pre-registered experiment
 * (the flywheel).
 *
 * Lifecycle (house pattern, like the brief-drift marker): a DRAFT verdict
 * re-derives on every results view while the experiment runs; when the run
 * stops, the conductor demands adjudication and a human STAMPS the record —
 * verdict + results + stats frozen immutably. Frozen question → frozen answer.
 */
import { getContentStore } from "../content/store";
import type { ArtifactVersion } from "./types";
import type { ExperimentResults, MetricMap, CompositeMetric } from "./results";
import type { StatsReport, CellStats } from "./stats";

export type VerdictState =
  | "confirmed"
  | "refuted"
  | "guardrail_breach"
  | "keep_running"
  | "underpowered"
  | "invalid"
  | "not_adjudicable";

export interface VerdictGate {
  id: "mapping" | "focus" | "validity" | "runtime" | "sample" | "direction" | "significance" | "guardrails";
  title: string;
  /** true = pass · false = fail · null = can't be evaluated (stated why). */
  pass: boolean | null;
  detail: string;
}

export interface GuardrailVerdict {
  compositeId: string;
  label: string;
  state: "pass" | "at_risk" | "breach" | "unknown";
  detail: string;
}

export interface Discovery {
  id: string;
  label: string;
  variationName: string;
  lift?: number;
  q: number;
  note: string;
  promotedIdeaId?: string;
}

export interface PreRegistration {
  /** What froze the contract: a version cut (console-built) or the
   *  measurement plan's confirmation (externally-built — no cuts exist). */
  anchor: "cut" | "plan";
  /** Present only for anchor "cut". */
  version?: number;
  cutAt?: string;
  hypothesis: string;
  primaryMetric: string;
  guardrails: string[];
  /** Mapping operationalized after traffic started — disclosed, not hidden. */
  mapConfirmedAt?: string;
  mapConfirmedAfterObservation?: boolean;
  /** A post-observation re-confirm changed the frozen brief — the verdict
   *  adjudicates the EARLIEST stamp; the edit is disclosed, never laundered. */
  briefRefrozenAfterObservation?: boolean;
  /** WHERE the decision metric was declared. "optimizely" = the experiment's
   *  own primary metric, adjudicated because it was declared in the system of
   *  record before traffic — the console authored nothing. Frozen onto the
   *  stamp so a printed record always says what it judged. */
  primarySource?: "console" | "optimizely";
  /** True when the console adjudicated a nomination the team never ratified
   *  (no confirmed measurement plan). Judged, and said out loud. */
  primaryUnratified?: boolean;
  /** The decision metric was SWAPPED after observation began. */
  primaryChangedAfterObservation?: { was: string; at: string };
}

export interface VerdictRecord {
  state: "draft" | "stamped";
  verdict: VerdictState;
  headline: string;
  gates: VerdictGate[];
  guardrails: GuardrailVerdict[];
  discoveries: Discovery[];
  preRegistration?: PreRegistration;
  experimentStatus?: string;
  observedAt: string;
  /** Stamp-time freeze — absent on drafts (drafts re-derive live). */
  frozenResults?: ExperimentResults;
  frozenStats?: StatsReport;
  skillRef?: { id: string; updatedAt?: string };
  stampedBy?: string;
  stampedAt?: string;
}

export const VERDICT_THRESHOLDS = {
  alpha: 0.05,
  minRuntimeDays: 7,
  minPerArm: 100,
  /** Guardrail non-inferiority margin, relative (2% worse tolerated). */
  guardrailMarginRel: 0.02,
  discoveryQ: 0.1,
  /** An observed effect needing longer than this to confirm = underpowered. */
  maxChaseDays: 90,
} as const;

const flagKey = (k: string) => `verdict:${k}`;

/** Blank the verdict record — draft or stamped. Stamped is the immutable
 *  record, so the route refuses to do this without an explicit confirmation. */
export async function clearVerdict(prototypeKey: string): Promise<void> {
  await (await getContentStore()).setFlag(flagKey(prototypeKey), "");
}

export async function getVerdict(prototypeKey: string): Promise<VerdictRecord | null> {
  const raw = await (await getContentStore()).getFlag(flagKey(prototypeKey));
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as VerdictRecord;
    if (!v || typeof v.verdict !== "string") return null;
    // Pre-S8 records lack the anchor field; every one of them was
    // cut-anchored by construction (version was required then).
    if (v.preRegistration && !v.preRegistration.anchor) {
      v.preRegistration.anchor = v.preRegistration.version !== undefined ? "cut" : "plan";
    }
    return v;
  } catch {
    return null;
  }
}

/**
 * CAS mutation over the verdict flag — the ONLY write path. Concurrent
 * writers are real here: a GET re-deriving a draft races the human's stamp,
 * and a lost stamp would silently revert the official record to a draft.
 * `fn` returns the next record, or null to keep the current one (no write).
 */
export async function mutateVerdict(
  prototypeKey: string,
  fn: (current: VerdictRecord | null) => VerdictRecord | null,
): Promise<VerdictRecord | null> {
  const store = await getContentStore();
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await store.getFlag(flagKey(prototypeKey));
    let current: VerdictRecord | null = null;
    if (raw) {
      try { current = JSON.parse(raw) as VerdictRecord; } catch { /* treat as absent */ }
    }
    const next = fn(current);
    if (next === null) return current;
    if (await store.compareAndSetFlag(flagKey(prototypeKey), raw, JSON.stringify(next))) return next;
  }
  return getVerdict(prototypeKey);
}

/** A draft never overwrites a stamp — the stamped record is the record. */
export async function saveDraftVerdict(prototypeKey: string, record: VerdictRecord): Promise<VerdictRecord> {
  const saved = await mutateVerdict(prototypeKey, (existing) => {
    if (existing?.state === "stamped") return null;
    // carry forward promoted-idea markers so a re-derived draft doesn't
    // resurrect "Promote" buttons for discoveries already promoted
    if (existing) {
      for (const d of record.discoveries) {
        const prev = existing.discoveries.find((p) => p.id === d.id);
        if (prev?.promotedIdeaId) d.promotedIdeaId = prev.promotedIdeaId;
      }
    }
    return record;
  });
  return saved ?? record;
}

/** Should the console nag "adjudicate this"? One rule, shared by the
 *  workspace rail, the conductor, and the board — never three opinions.
 *  A stopped experiment with an unstamped verdict needs adjudication UNLESS
 *  the engine itself says the stop is premature (keep_running = it was
 *  paused mid-flight, restarting is the likely intent). */
export function adjudicationPending(v: VerdictRecord | null, experimentStatus?: string | null): boolean {
  if (!experimentStatus || experimentStatus === "running" || experimentStatus === "not_started") return false;
  // No verdict record = results were never even analyzed. Only a positively
  // CONCLUDED experiment nags then — a pause is routinely the console's own
  // pause-to-push step, and an archived run with no record is abandoned, not
  // adjudicable (the stamp route refuses when results are unreadable, so
  // nagging there would demand the impossible).
  if (!v) return experimentStatus === "concluded";
  if (v.state === "stamped") return false;
  return v.verdict !== "keep_running";
}

const pct = (v: number) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

function guardrailVerdict(c: CompositeMetric, cell: CellStats | undefined, marginRel: number): GuardrailVerdict {
  const dir = c.direction === "decrease" ? -1 : 1;
  if (!cell || cell.lift === undefined || !cell.liftCi) {
    return { compositeId: c.id, label: c.label, state: "unknown", detail: "No computable lift yet for this guardrail." };
  }
  // Normalize so that positive = good: for decrease-is-good metrics, a rise is harm.
  const lift = cell.lift * dir;
  const lo = (dir === 1 ? cell.liftCi.lo : -cell.liftCi.hi);
  const hi = (dir === 1 ? cell.liftCi.hi : -cell.liftCi.lo);
  if (lo > -marginRel) {
    return { compositeId: c.id, label: c.label, state: "pass", detail: `Proven no worse than ${(marginRel * 100).toFixed(0)}%: lift ${pct(cell.lift)}, CI keeps it inside the pre-set tolerance.` };
  }
  if (hi < -marginRel) {
    return { compositeId: c.id, label: c.label, state: "breach", detail: `Confidently worse than the ${(marginRel * 100).toFixed(0)}% tolerance (lift ${pct(cell.lift)}) — this vetoes a confirmed verdict.` };
  }
  if (lift < -marginRel) {
    return { compositeId: c.id, label: c.label, state: "at_risk", detail: `Point estimate ${pct(cell.lift)} is past the tolerance but the CI still straddles it — needs more data before it blocks or clears.` };
  }
  return { compositeId: c.id, label: c.label, state: "at_risk", detail: `Not yet proven inside the ${(marginRel * 100).toFixed(0)}% tolerance (lift ${pct(cell.lift)}, CI too wide).` };
}

/** The adjudicator. Pure — same inputs, same verdict, forever. */
export function deriveVerdict(opts: {
  results: ExperimentResults;
  map: MetricMap | null;
  stats: StatsReport;
  /** The version that is LIVE in the experiment (its briefSnapshot is the
   *  pre-registration) — resolved from the push record, never the live brief. */
  pushedVersion?: ArtifactVersion | null;
  experimentStatus?: string;
  experimentStarted?: boolean;
  firstObservedDate?: string;
  /** The experiment's REAL start (Optimizely results payload). */
  experimentStart?: string;
  mapConfirmedAt?: string;
}): VerdictRecord {
  const { map, stats } = opts;
  const T = VERDICT_THRESHOLDS;
  const gates: VerdictGate[] = [];
  const snap = opts.pushedVersion?.briefSnapshot;
  const lateSwap = (map?.primaryHistory ?? []).filter((h) => opts.firstObservedDate && h.at.slice(0, 10) > opts.firstObservedDate).pop();
  // WHERE the decision metric came from rides with every disclosure: a record
  // that judged Optimizely's own primary must say so wherever it is read.
  const primaryDecl = map?.composites.find((c) => c.role === "primary");
  const mapDisclosure = {
    mapConfirmedAt: opts.mapConfirmedAt,
    mapConfirmedAfterObservation:
      Boolean(opts.mapConfirmedAt && opts.firstObservedDate && opts.mapConfirmedAt.slice(0, 10) > opts.firstObservedDate),
    primaryChangedAfterObservation: lateSwap ? { was: lateSwap.from, at: lateSwap.at } : undefined,
    primarySource: primaryDecl ? (primaryDecl.source === "optimizely" ? "optimizely" as const : "console" as const) : undefined,
    primaryUnratified: primaryDecl && primaryDecl.source !== "optimizely" && !map?.confirmed ? true : undefined,
  };

  // The pre-registration anchor: console-built prototypes freeze the brief
  // at CUT (and the push record proves which cut is live); externally-built
  // prototypes never cut, so the brief frozen at the measurement plan's
  // CONFIRMATION is the contract. The EARLIEST frozen brief wins — a post-
  // observation re-confirm must never launder an edited hypothesis into
  // "what was declared before traffic" (re-freezes are disclosed).
  const briefStamps = [
    ...(map?.priorConfirmations ?? []).filter((p) => p.briefAtConfirm).map((p) => ({ at: p.confirmedAt, brief: p.briefAtConfirm! })),
    ...(map?.confirmedAt && map.briefAtConfirm ? [{ at: map.confirmedAt, brief: map.briefAtConfirm }] : []),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const earliestStamp = briefStamps[0];
  const latestStamp = briefStamps[briefStamps.length - 1];
  const briefRefrozen = Boolean(
    earliestStamp && latestStamp && earliestStamp.at !== latestStamp.at
    && JSON.stringify(earliestStamp.brief) !== JSON.stringify(latestStamp.brief)
    && opts.firstObservedDate && latestStamp.at.slice(0, 10) > opts.firstObservedDate,
  );
  const planBrief = earliestStamp?.brief;
  const preRegistration: PreRegistration | undefined = opts.pushedVersion
    ? {
        anchor: "cut",
        version: opts.pushedVersion.version,
        cutAt: opts.pushedVersion.createdAt,
        hypothesis: snap
          ? `We believe ${snap.hypothesis.change || "…"} for ${snap.hypothesis.audience || "…"} will cause ${snap.hypothesis.outcome || "…"}.`
          : "(no brief snapshot on this cut)",
        primaryMetric: snap?.metrics.primary || "(unset)",
        guardrails: snap?.metrics.guardrails ?? [],
        ...mapDisclosure,
      }
    : planBrief && map?.confirmed
      ? {
          anchor: "plan",
          cutAt: earliestStamp?.at,
          hypothesis: `We believe ${planBrief.change || "…"} for ${planBrief.audience || "…"} will cause ${planBrief.outcome || "…"}.`,
          primaryMetric: planBrief.primary || "(unset)",
          guardrails: planBrief.guardrails ?? [],
          briefRefrozenAfterObservation: briefRefrozen || undefined,
          ...mapDisclosure,
        }
      : undefined;

  const finish = (verdict: VerdictState, headline: string, guardrails: GuardrailVerdict[] = [], discoveries: Discovery[] = []): VerdictRecord => ({
    state: "draft",
    verdict,
    headline,
    gates,
    guardrails,
    discoveries,
    preRegistration,
    experimentStatus: opts.experimentStatus,
    observedAt: new Date().toISOString(),
  });

  // Discoveries exist regardless of the primary's fate — they're the flywheel.
  const discoveries: Discovery[] = stats.exploratory
    .filter((r) => r.discovery)
    .slice(0, 8)
    .map((r) => ({
      id: `${r.key}:${r.variationId}`,
      label: r.label,
      variationName: r.variationName,
      lift: r.lift,
      q: r.q,
      note: `Exploratory (FDR q${r.q * 100 < 0.5 ? "<1" : `=${(r.q * 100).toFixed(0)}`}%): not pre-registered, so it can never be "confirmed" here — it's a hypothesis for the NEXT experiment.`,
    }));

  // Gate 1: A DECLARED DECISION METRIC — provenance, not presence.
  //
  // A declaration made in Optimizely counts. Someone attached that metric to
  // the experiment in the system of record before traffic began; that IS
  // pre-registration, and refusing to judge because it was not re-typed here
  // left running experiments permanently "not adjudicable". What changes with
  // provenance is the WORDING and the disclosure, never whether we judge.
  const primary = map?.composites.find((c) => c.role === "primary");
  if (!primary) {
    gates.push({
      id: "mapping",
      title: "A declared decision metric",
      pass: false,
      detail: "Neither Optimizely nor this console has a primary metric for this experiment — there is nothing to judge the run against.",
    });
    return finish("not_adjudicable", "Not adjudicable — no decision metric is declared in either system.", [], discoveries);
  }
  const fromOpti = primary.source === "optimizely";
  gates.push({
    id: "mapping",
    title: fromOpti ? "Decision metric: Optimizely's primary" : "A declared decision metric",
    pass: true,
    detail: fromOpti
      ? `“${primary.label}” — the experiment's own primary metric, as attached in Optimizely. The console did not author it and cannot timestamp the attachment. ${primary.direction ? `Optimizely declares ${primary.direction === "decrease" ? "DOWN" : "UP"} as the winning direction.` : "Optimizely did not declare a winning direction, so UP is ASSUMED — if down is good on this metric, nominate your own decision metric."} Confirm a measurement plan to adjudicate against your own definition instead.`
      : `“${primary.label}” = ${primary.events.join(" + ")}, nominated in the console${map?.confirmed ? " and human-confirmed" : " — the measurement plan has NOT been confirmed since it last changed, so the definition is one person's nomination rather than a ratified contract"}.`,
  });

  // The bound variation must actually be IN the results — adjudicating a
  // substitute arm because the binding is stale would be an identity swap.
  if (stats.focusFallback) {
    gates.push({ id: "focus", title: "Bound variation present in results", pass: false, detail: "The variation this prototype is bound to is not reporting in the results — the binding is stale. Rebind the experiment (Ship section); display stats below show a substitute arm, but no verdict is read from it." });
    return finish("not_adjudicable", "Not adjudicable — the bound variation isn't in the results (stale binding). Rebind, then re-derive.", [], discoveries);
  }

  if (!preRegistration) {
    const legacyPlan = Boolean(map?.confirmed && !map.briefAtConfirm);
    gates.push({ id: "validity", title: "Pre-registration resolved", pass: false, detail: legacyPlan
      ? "The plan was confirmed before the console froze the brief with it — open the Measurement section and Re-confirm once to freeze the contract."
      : "No pre-registration anchor — console-built prototypes freeze the brief at cut/push; externally-built ones freeze it when the measurement plan is CONFIRMED. Confirm the plan to make this adjudicable." });
    return finish("not_adjudicable", legacyPlan
      ? "Not adjudicable — re-confirm the measurement plan once to freeze the brief (a one-time upgrade)."
      : "Not adjudicable — nothing frozen to adjudicate against yet. Confirm the measurement plan.", [], discoveries);
  }

  // Gate 2: validity (SRM). Compromised → nothing downstream matters.
  if (stats.validity.status === "compromised") {
    gates.push({ id: "validity", title: "Traffic split valid (SRM)", pass: false, detail: stats.validity.detail });
    return finish("invalid", "INVALID — sample-ratio mismatch. The traffic split is broken; no verdict can be read from these numbers.", [], discoveries);
  }
  gates.push({
    id: "validity",
    title: "Traffic split valid (SRM)",
    pass: stats.validity.status === "unknown" ? null : true,
    detail: stats.validity.detail,
  });

  const primaryStats = stats.metrics.find((m) => m.key === stats.primaryKey);
  const cell = primaryStats?.cells.find((c) => c.variationId === stats.focusVariationId);
  const running = opts.experimentStatus === "running";
  // A pause is routinely the console's own pause-to-push step — for the
  // keep-running-vs-underpowered decision it behaves like running (restart
  // is the likely intent), never like a concluded run.
  const paused = opts.experimentStatus === "paused";

  // Gate 3: runtime floor (full weekly cycle). A KNOWN-short window blocks a
  // verdict in EVERY state — a gate that fails without changing the verdict
  // would make the record incoherent (day-2 spike, pause, stamp CONFIRMED
  // with a failed runtime gate in its own trace). Only an UNKNOWN window at
  // stop is disclosed rather than blocking (the run may predate the
  // console's watch). Derived from the FIRST snapshot date, not stats.power
  // (which needs 2+ history days) — otherwise a high-traffic day-one
  // experiment would slide past as "unknown".
  const obsDays = opts.experimentStart
    ? Math.max(0, Math.floor((Date.now() - Date.parse(opts.experimentStart)) / 86400000))
    : opts.firstObservedDate
      ? Math.max(0, Math.floor((Date.now() - Date.parse(opts.firstObservedDate)) / 86400000))
      : stats.power?.observationDays;
  if (obsDays !== undefined && obsDays < T.minRuntimeDays) {
    gates.push({ id: "runtime", title: `Runtime ≥ ${T.minRuntimeDays} days`, pass: false, detail: `Only ${obsDays} day(s) observed — a full weekly cycle is required before any verdict (day-of-week effects are real in travel traffic).` });
    if (running || paused) {
      return finish("keep_running", `Too early — ${paused ? "resume it and " : ""}let it run a full week before reading anything into the numbers.`, [], discoveries);
    }
    return finish("underpowered", `The run stopped after only ${obsDays} observed day(s) — below the ${T.minRuntimeDays}-day floor. Day-of-week and novelty artifacts make any read unreliable; the pre-registered hypothesis is UNPROVEN.`, [], discoveries);
  }
  gates.push({
    id: "runtime",
    title: `Runtime ≥ ${T.minRuntimeDays} days`,
    pass: obsDays === undefined ? null : true,
    detail:
      obsDays === undefined
        ? "Observation window unknown — snapshots just began; disclosed rather than blocking since the experiment may predate the console's watch."
        : `${obsDays} day(s) of console observation.`,
  });

  // Gate 4: sample floor.
  const perArm = stats.power?.perArmN ?? Math.min(...opts.results.variations.map((v) => v.visitors));
  if (perArm < T.minPerArm) {
    gates.push({ id: "sample", title: `Sample ≥ ${T.minPerArm}/arm`, pass: false, detail: `${perArm} visitors in the smallest arm — far too few for any read.` });
    return finish(running || paused ? "keep_running" : "underpowered", running || paused ? "Too early — the sample is far below any adjudicable floor." : "Underpowered — the run ended with too little traffic to adjudicate.", [], discoveries);
  }
  gates.push({ id: "sample", title: `Sample ≥ ${T.minPerArm}/arm`, pass: true, detail: `${perArm.toLocaleString()} visitors in the smallest arm.` });

  // Guardrails (computed before the primary so a breach can veto).
  // (`map` is no longer narrowed by gate 1: a decision metric can now be
  // declared in Optimizely with no console plan at all.)
  const guardrails: GuardrailVerdict[] = (map?.composites ?? [])
    .filter((c) => c.role === "guardrail")
    .map((c) => {
      const ms = stats.metrics.find((m) => m.key === `composite:${c.id}`);
      return guardrailVerdict(c, ms?.cells.find((x) => x.variationId === stats.focusVariationId), T.guardrailMarginRel);
    });
  const breached = guardrails.filter((g) => g.state === "breach");

  // Gate 5+6: direction + significance on the pre-registered primary.
  if (primaryStats?.featureOnly) {
    gates.push({ id: "significance", title: "Primary metric measurable", pass: false, detail: `“${primary.label}” fires in only one arm — the ${primaryStats.featureOnly === "variation" ? "control" : "variation"} structurally can't convert on it, so a comparison is meaningless. Remap the primary to pair the new surface with the control's equivalent action (e.g. main CTA + overlay CTA = total intent both arms can express).` });
    return finish("not_adjudicable", "Not adjudicable — the primary only fires in one arm. Remap it to a composite both arms can convert on.", guardrails, discoveries);
  }
  if (!cell || cell.lift === undefined || cell.p === undefined) {
    gates.push({ id: "significance", title: "Primary metric measurable", pass: false, detail: "The primary composite has no computable lift yet (missing events or zero baseline)." });
    return finish("not_adjudicable", "Not adjudicable — the primary composite isn't computing (check that its events are reporting).", guardrails, discoveries);
  }
  const dir = primary.direction === "decrease" ? -1 : 1;
  const movedGoodWay = cell.lift * dir > 0;
  const significant = cell.p < T.alpha;
  gates.push({
    id: "direction",
    title: `Moved in the predicted direction (${primary.direction ?? "increase"})`,
    pass: movedGoodWay,
    detail: `Primary lift ${pct(cell.lift)}${cell.liftCi ? ` (CI ${pct(cell.liftCi.lo)} … ${pct(cell.liftCi.hi)})` : ""}.`,
  });
  gates.push({
    id: "significance",
    title: `Significant at α=${T.alpha} (pre-registered primary, full alpha)`,
    pass: significant,
    detail: `p=${cell.p < 0.0001 ? "<0.0001" : cell.p.toFixed(4)}${cell.pBeat !== undefined ? ` · P(beats baseline)=${(cell.pBeat * 100).toFixed(0)}%` : ""}${cell.expectedLossRel !== undefined ? ` · expected loss if shipped wrongly ≈ ${(cell.expectedLossRel * 100).toFixed(2)}% of baseline` : ""}.`,
  });
  gates.push({
    id: "guardrails",
    title: "Guardrails hold",
    pass: guardrails.length ? breached.length === 0 : null,
    detail: guardrails.length
      ? breached.length
        ? `BREACH: ${breached.map((g) => g.label).join(", ")}.`
        : guardrails.map((g) => `${g.label}: ${g.state}`).join(" · ")
      : "No guardrail composites mapped.",
  });

  if (significant && movedGoodWay && breached.length) {
    return finish("guardrail_breach", `The primary won (${pct(cell.lift)}, p=${cell.p.toFixed(4)}) but ${breached.map((g) => g.label).join(" and ")} broke the pre-set tolerance — a win that costs the guardrail is not a win.`, guardrails, discoveries);
  }
  if (significant && movedGoodWay) {
    const decayNote = stats.novelty?.decayed ? " Caveat: the lift is decaying (novelty flag) — roll out with monitoring, don't extrapolate the cumulative number." : "";
    return finish("confirmed", `HYPOTHESIS CONFIRMED — “${preRegistration.primaryMetric}” moved ${pct(cell.lift)} as predicted before the run (p=${cell.p < 0.0001 ? "<0.0001" : cell.p.toFixed(4)}), guardrails hold.${decayNote}`, guardrails, discoveries);
  }
  if (significant && !movedGoodWay) {
    return finish("refuted", `HYPOTHESIS REFUTED — the primary moved ${pct(cell.lift)}, significantly ${dir === 1 ? "DOWN" : "UP"} when the pre-registered prediction said ${primary.direction ?? "increase"} (p=${cell.p.toFixed(4)}). A clean, honest negative: the record is the value.`, guardrails, discoveries);
  }

  // Not significant → keep running vs underpowered, decided by projection.
  // Paused counts as "still runnable": the console's own flow pauses to push
  // new code, and nagging "the run ended" mid-iteration would be a lie.
  const days = stats.power?.daysToObserved;
  if (running || paused) {
    if (days !== undefined && days > T.maxChaseDays) {
      return finish("underpowered", `Inconclusive and not worth chasing — the observed ${pct(cell.lift)} would need ~${days} more days to confirm at this traffic. Decide: accept the null, or redesign for a bigger effect.`, guardrails, discoveries);
    }
    return finish("keep_running", `Too early to call — the observed ${pct(cell.lift)} isn't significant yet${days !== undefined ? ` (~${days} more day(s) of traffic should decide it)` : ""}. Keep ${paused ? "it going (resume the experiment)" : "running"}.`, guardrails, discoveries);
  }
  return finish("underpowered", `The run ended without a significant read on the primary (${pct(cell.lift)}, p=${cell.p.toFixed(3)}) — the pre-registered hypothesis is UNPROVEN, not refuted. ${stats.power?.mdeNow !== undefined ? `This sample could only detect ±${(stats.power.mdeNow * 100).toFixed(1)}% reliably.` : ""}`, guardrails, discoveries);
}
