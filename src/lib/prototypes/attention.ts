/**
 * NEEDS ATTENTION — the readout's triage zone, derived, never narrated.
 *
 * ONE DERIVATION: every risk on the leadership readout comes from this file.
 * The analyst may gloss a row it did not author (a ≤70-char note keyed to an
 * id that already exists), but it can never invent, retitle, reorder, or
 * re-severity one. A risk the code cannot substantiate is not a risk.
 *
 * Titles are frozen constants so the same condition always reads the same way
 * across experiments — an executive learns the vocabulary once.
 */

import type { StatsReport } from "./stats";
import type { VerdictRecord } from "./verdict";
import type { MetricMap } from "./results";

export type AttentionSeverity = "critical" | "attention" | "good";

export interface AttentionItem {
  /** Stable id — also the enum the analyst may attach a note to. */
  id: string;
  severity: AttentionSeverity;
  /** Frozen constant, ≤34 chars. */
  title: string;
  /** ≤70 chars ideally; longer details are the analyst's cue to gloss. */
  detail: string;
  actionLabel?: string;
  actionHref?: string;
}

/** A bare statistic in a detail is the signal to prefer the analyst's gloss. */
export const STAT_NOISE = /p\s*[=<]|χ²|\bq\s*=|\bSRM\b/;

const flag = (s: StatsReport | null, code: string) => s?.flags.find((f) => f.code === code);

export function deriveAttention(opts: {
  verdict: VerdictRecord | null;
  stats: StatsReport | null;
  map: MetricMap | null;
  planDrift: string[];
  resultsError?: string | null;
  experimentStatus?: string | null;
}): AttentionItem[] {
  const { verdict, stats, map, planDrift } = opts;
  const critical: AttentionItem[] = [];
  const attention: AttentionItem[] = [];

  // ── CRITICAL: the numbers themselves can't be trusted ──────────────────
  if (opts.resultsError) {
    critical.push({
      id: "results-unreadable", severity: "critical",
      title: "Live results didn't load",
      detail: opts.resultsError.slice(0, 160),
      actionLabel: "Refresh", actionHref: "#refresh",
    });
  }

  const srmFail = flag(stats, "SRM_FAIL");
  if (srmFail || stats?.validity.status === "compromised") {
    critical.push({
      id: "traffic-split-broken", severity: "critical",
      title: "Traffic split is broken",
      detail: srmFail?.text ?? stats?.validity.detail ?? "The arms didn't receive the traffic they were assigned.",
      actionLabel: "See the method", actionHref: "#method",
    });
  } else if (verdict?.verdict === "invalid") {
    critical.push({
      id: "data-invalid", severity: "critical",
      title: "Data can't be trusted",
      detail: verdict.headline,
      actionLabel: "See the method", actionHref: "#method",
    });
  }

  for (const gr of verdict?.guardrails ?? []) {
    if (gr.state === "breach") {
      critical.push({
        id: `guardrail-breach:${gr.compositeId}`, severity: "critical",
        title: `Guardrail broke: ${gr.label}`.slice(0, 34),
        detail: gr.detail,
        actionLabel: "See findings", actionHref: "#findings",
      });
    }
  }

  if (stats?.focusFallback) {
    critical.push({
      id: "stale-binding", severity: "critical",
      title: "Bound variation isn't reporting",
      detail: "The variation this prototype is bound to isn't in the results — the verdict won't adjudicate a substitute.",
      actionLabel: "Rebind", actionHref: "?tab=experiment#ship",
    });
  }

  // ── ATTENTION: the decision is at risk, or the contract moved ──────────
  const mappingGate = verdict?.gates.find((g) => g.id === "mapping");
  if (mappingGate && mappingGate.pass === false) {
    attention.push({
      id: "mapping-unconfirmed", severity: "attention",
      title: "No decision metric declared",
      detail: mappingGate.detail,
      actionLabel: "Confirm the plan", actionHref: "?tab=analytics#measurement",
    });
  }
  // Judged on Optimizely's declaration rather than the team's own — a real
  // verdict, and the reader is told which definition produced it. Only when a
  // verdict was actually REACHED: preRegistration is assembled before any gate
  // can refuse, so it exists on records that were never adjudicated.
  const adjudicated = verdict && !["not_adjudicable", "invalid"].includes(verdict.verdict);
  if (adjudicated && verdict?.preRegistration?.primarySource === "optimizely") {
    attention.push({
      id: "primary-inherited", severity: "attention",
      title: "Judged on Optimizely's primary",
      detail: "This run is being adjudicated against the experiment's own primary metric, declared in Optimizely. Confirm a measurement plan to judge against your own definition.",
      actionLabel: "Confirm the plan", actionHref: "?tab=analytics#measurement",
    });
  }

  if (verdict?.preRegistration?.primaryUnratified) {
    attention.push({
      id: "mapping-unratified", severity: "attention",
      title: "Decision metric not ratified",
      detail: "The decision metric was nominated but the measurement plan has never been confirmed, so the definition being judged is one person's choice rather than an agreed contract.",
      actionLabel: "Confirm the plan", actionHref: "?tab=analytics#measurement",
    });
  }

  const primary = stats?.metrics.find((m) => m.key === stats.primaryKey);
  if (primary?.featureOnly) {
    attention.push({
      id: "primary-one-arm", severity: "attention",
      title: "Primary fires in only one arm",
      detail: "The control structurally can't convert on the decision metric, so a lift can't be computed from it.",
      actionLabel: "Remap it", actionHref: "?tab=analytics#measurement",
    });
  }

  const atRisk = (verdict?.guardrails ?? []).filter((g) => g.state === "at_risk");
  if (atRisk[0]) {
    attention.push({
      id: `guardrail-at-risk:${atRisk[0].compositeId}`, severity: "attention",
      title: `Guardrail at risk: ${atRisk[0].label}`.slice(0, 34),
      detail: atRisk[0].detail,
      actionLabel: "See findings", actionHref: "#findings",
    });
  }

  if (planDrift.length) {
    attention.push({
      id: "plan-drift", severity: "attention",
      title: `${planDrift.length} event${planDrift.length === 1 ? "" : "s"} the plan never saw`,
      detail: planDrift.slice(0, 3).join(", "),
      actionLabel: "Re-plan", actionHref: "?tab=analytics#measurement",
    });
  }

  if (flag(stats, "NOVELTY_DECAY")) {
    attention.push({
      id: "novelty-decay", severity: "attention",
      title: "The lift is fading over time",
      detail: flag(stats, "NOVELTY_DECAY")!.text,
      actionLabel: "See day by day", actionHref: "#proof",
    });
  }
  if (flag(stats, "CANNIBALIZATION")) {
    attention.push({
      id: "cannibalization", severity: "attention",
      title: "Another metric moved the other way",
      detail: flag(stats, "CANNIBALIZATION")!.text,
      actionLabel: "See findings", actionHref: "#findings",
    });
  }
  if (!srmFail && (stats?.validity.status === "warn" || flag(stats, "SRM_WARN") || flag(stats, "SRM_ASSUMED_EQUAL"))) {
    attention.push({
      id: "srm-uneven", severity: "attention",
      title: "Traffic split looks uneven",
      detail: stats?.validity.detail ?? "The arms didn't receive equal traffic.",
      actionLabel: "See the method", actionHref: "#method",
    });
  }
  // The verdict word already says "underpowered" — don't alarm it twice.
  if (flag(stats, "UNDERPOWERED") && verdict?.verdict !== "underpowered") {
    attention.push({
      id: "underpowered", severity: "attention",
      title: "Not enough traffic to settle this",
      detail: flag(stats, "UNDERPOWERED")!.text,
      actionLabel: "See the method", actionHref: "#method",
    });
  }

  // Pre-registration integrity — promoted here, never buried in a footnote.
  const pr = verdict?.preRegistration;
  if (pr?.primaryChangedAfterObservation) {
    attention.push({
      id: "metric-swapped", severity: "attention",
      title: "Decision metric changed mid-run",
      detail: `Was “${pr.primaryChangedAfterObservation.was}” when traffic began — the change is on the record.`,
      actionLabel: "See the method", actionHref: "#method",
    });
  }
  if (pr?.mapConfirmedAfterObservation) {
    attention.push({
      id: "map-late", severity: "attention",
      title: "Mapping set after traffic began",
      detail: "The measurement plan was confirmed after the experiment started collecting data.",
      actionLabel: "See the method", actionHref: "#method",
    });
  }
  if (pr?.briefRefrozenAfterObservation) {
    attention.push({
      id: "brief-refrozen", severity: "attention",
      title: "Brief re-frozen mid-run",
      detail: "The earliest pre-observation stamp still anchors the verdict; the later edit is disclosed.",
      actionLabel: "See the method", actionHref: "#method",
    });
  }
  if (map?.pendingQuestions?.length) {
    attention.push({
      id: "plan-questions-open", severity: "attention",
      title: `${map.pendingQuestions.length} measurement question${map.pendingQuestions.length === 1 ? "" : "s"} open`,
      detail: map.pendingQuestions[0].slice(0, 120),
      actionLabel: "Answer them", actionHref: "?tab=analytics#measurement",
    });
  }

  const items = [...critical, ...attention];
  if (items.length) return items;

  // ── ALL CLEAR — assembled from only the clauses that are actually true.
  // Silence and a passed check must never look identical.
  const clauses = ["No blockers"];
  if (stats?.validity.status === "ok") clauses.push("data health OK");
  else if (stats?.validity.status === "unknown") clauses.push("traffic split not checkable yet");
  const grs = verdict?.guardrails ?? [];
  if (grs.length && grs.every((g) => g.state === "pass")) {
    clauses.push(`${grs.length} guardrail${grs.length === 1 ? "" : "s"} holding`);
  }
  if (map?.plannedAt && !planDrift.length) clauses.push("plan matches the events reporting");
  return [{ id: "all-clear", severity: "good", title: "Nothing needs attention", detail: clauses.join(" · ").slice(0, 120) }];
}
