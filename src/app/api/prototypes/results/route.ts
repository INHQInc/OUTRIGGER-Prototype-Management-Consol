import { NextRequest, NextResponse } from "next/server";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { getOptimizelyClientForOrg } from "@/lib/experimentation";
import {
  normalizeResults, getMetricMap, mutateMetricMap, recordDailySnapshot, windowedResults,
  type ExperimentResults, type CompositeMetric, type MetricMap, type ResultsHistory, pruneMeasureKeys, clearMetricMap, clearResultsHistory,
  supportingKeys, optiPrimaryKeyOf, SUPPORTING_CAP, resolveDecisionMap, OPTI_PRIMARY_ID } from "@/lib/prototypes/results";
import { computeStatsReport, type StatsReport } from "@/lib/prototypes/stats";
import { deriveAttention } from "@/lib/prototypes/attention";
import { deriveVerdict, getVerdict, saveDraftVerdict, mutateVerdict, clearVerdict, type VerdictRecord } from "@/lib/prototypes/verdict";
import {
  getOrgNotebook, getProtoNotebook, addOrgPreference, removeOrgPreference, appendNotebook,
  getReading, saveReading, readingBasisKey, clearReading, clearNotebookEntries, clearProtoNotebook } from "@/lib/prototypes/notebook";
import { proposeMetricMap, analyzeResults, analystSkill, generateReading, defineCustomMetric } from "@/lib/ai/results";
import { deepObservation, type DeepObservation } from "@/lib/ai/observation";
import { resolveRepoSource } from "@/lib/prototypes/source";
import { listArtifactVersions } from "@/lib/prototypes/versions";
import { lastPush } from "@/lib/prototypes/ship";
import { addIdea } from "@/lib/ideas/ideas";
import { currentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";
import { getContentStore } from "@/lib/content/store";
import { isExternalBuild, type PrototypeRecord } from "@/lib/prototypes/types";

export const maxDuration = 60;

/**
 * Experiment results + the statistics/verdict layer. Session-only (the
 * analyst spends console API credit; results are org analytics).
 *
 * GET  ?key=  → { results, resultsError?, metricMap, stats, verdict }
 *   Every GET: normalizes the Optimizely payload, records today's snapshot
 *   (first viewer of the day), computes the deterministic StatsReport, and
 *   re-derives the DRAFT verdict against the PUSHED version's frozen
 *   briefSnapshot. A stamped verdict is never overwritten — it is returned
 *   as-is (frozen question → frozen answer).
 *
 * POST { key, propose: true }        → Claude proposes the composite mapping
 * POST { key, confirm: {composites} }→ human confirms/edits the mapping
 * POST { key, stamp: true }          → human stamps the verdict (immutable;
 *                                      refused while the experiment runs)
 * POST { key, unstamp: true }        → reopen to draft (audited, keeps history)
 * POST { key, promote: discoveryId } → discovery → Backlog idea (the flywheel)
 * POST { key, ask / explain }        → the analyst, over computed facts
 */

interface Bundle {
  results: ExperimentResults | null;
  error?: string;
  experimentStatus?: string;
  weights?: Record<string, number>;
  /** Which way is GOOD on Optimizely's own primary metric, when the experiment
   *  definition declares it. Only consulted when the console adjudicates that
   *  metric — absent means undeclared, and the readout says "assumed". */
  primaryDirection?: "increase" | "decrease";
}

async function fetchResults(orgId: string, experimentId?: string): Promise<Bundle> {
  if (!experimentId) return { results: null, error: "No experiment bound yet — bind it in Experiment → Ship." };
  const client = await getOptimizelyClientForOrg(orgId);
  if (!client) return { results: null, error: "Optimizely isn't connected for this customer." };
  try {
    const [raw, exp] = await Promise.all([
      client.getExperimentResults(experimentId),
      client.getExperiment(experimentId).catch(() => null),
    ]);
    const results = normalizeResults(raw);
    const weights: Record<string, number> = {};
    for (const v of exp?.variations ?? []) if (typeof v.weight === "number" && v.weight > 0) weights[String(v.variation_id)] = v.weight;
    if (!results) return { results: null, error: "Optimizely returned no readable results yet — usually means no traffic so far.", experimentStatus: exp?.status };
    // Polarity is joined by EVENT ID, never by array position: the experiment
    // definition and the results payload are two different lists, and reading
    // "down is good" off the wrong metric would invert a verdict silently.
    // No confident match ⇒ undefined ⇒ every surface says UP is assumed.
    const primaryEventId = results.metrics[0]?.eventId;
    const wd = primaryEventId !== undefined
      ? exp?.metrics?.find((m) => m.event_id === primaryEventId)?.winning_direction
      : undefined;
    const primaryDirection = wd === "decreasing" ? "decrease" as const : wd === "increasing" ? "increase" as const : undefined;
    return { results, experimentStatus: exp?.status, weights: Object.keys(weights).length ? weights : undefined, primaryDirection };
  } catch (e) {
    return { results: null, error: e instanceof Error ? e.message : "Couldn't reach Optimizely results." };
  }
}

/** stats + draft verdict, derived fresh from a results bundle. */
async function analyze(proto: PrototypeRecord, bundle: Bundle): Promise<{ stats: StatsReport | null; verdict: VerdictRecord | null; history: ResultsHistory; map: MetricMap | null }> {
  const existing = await getVerdict(proto.key);
  // The RESOLVED map is what every reader downstream must use — the stored
  // one is what every WRITER mutates. Mixing them would let the page and the
  // engines disagree about which metric the run is being judged on.
  if (!bundle.results) return { stats: null, verdict: existing, history: { days: [] }, map: await getMetricMap(proto.key) };

  const history = await recordDailySnapshot(proto.key, bundle.results);
  const stored = await getMetricMap(proto.key);
  // THE DECISION METRIC IS RESOLVED BEFORE ANYTHING IS COMPUTED. With no
  // console nomination, Optimizely's own primary becomes the decision metric
  // — derived here, never written back, so the stored plan stays exactly what
  // a human authored. Both engines see the same resolved map.
  const { map } = resolveDecisionMap(stored, bundle.results, bundle.primaryDirection);
  const stats = computeStatsReport({
    results: bundle.results,
    map,
    focusVariationId: proto.experiment?.variationId,
    weights: bundle.weights,
    history: history.days,
    experimentStart: bundle.results.startTime,
  });

  if (existing?.state === "stamped") return { stats, verdict: existing, history, map };

  // The pre-registration anchor follows the BUILD MODE, never push-presence:
  // console-built → the pushed version's briefSnapshot; externally-built →
  // the plan-anchored contract (a flipped prototype's stale legacy cut must
  // never adjudicate Optimizely-authored code).
  const external = isExternalBuild(proto);
  const push = external ? null : await lastPush(proto.key).catch(() => null);
  const versions = external ? [] : await listArtifactVersions(proto.key).catch(() => []);
  const pushedVersion = push ? versions.find((v) => v.version === push.version) ?? null : null;

  const draft = deriveVerdict({
    results: bundle.results,
    map,
    stats,
    pushedVersion,
    experimentStatus: bundle.experimentStatus,
    firstObservedDate: history.days[0]?.date,
    experimentStart: bundle.results.startTime,
    // The EARLIEST stamp is the pre-registration disclosure's anchor — a
    // mid-run Re-plan replacing the stamp must not erase "this was declared
    // before traffic".
    mapConfirmedAt: [...(map?.priorConfirmations?.map((p) => p.confirmedAt) ?? []), ...(map?.confirmedAt ? [map.confirmedAt] : [])].sort()[0],
    // The floor: with nothing frozen, the run is read against the brief as it
    // stands today and the record says so. A missing plan stops the console
    // pre-registering a result; it no longer stops it reading one.
    liveBrief: proto.hypothesis?.change || proto.hypothesis?.outcome
      ? {
          change: proto.hypothesis.change,
          audience: proto.hypothesis.audience,
          outcome: proto.hypothesis.outcome,
          primary: proto.metrics?.primary,
          guardrails: proto.metrics?.guardrails,
        }
      : undefined,
  });
  const saved = await saveDraftVerdict(proto.key, draft);
  return { stats, verdict: saved, history, map };
}

/** Attention rows for a freshly-analyzed bundle — POST responses carry them
 *  so the triage zone can never describe pre-change numbers. */
function attentionFor(opts: {
  results: ExperimentResults | null; map: MetricMap | null; stats: StatsReport | null;
  verdict: VerdictRecord | null; resultsError?: string; experimentStatus?: string;
}) {
  const planDrift = opts.map?.plannedAt && opts.map.known && opts.results
    ? opts.results.metrics.filter((m) => !opts.map!.known!.includes(m.name) && !(m.baseName && opts.map!.known!.includes(m.baseName))).map((m) => m.name)
    : [];
  return deriveAttention({
    verdict: opts.verdict, stats: opts.stats, map: opts.map, planDrift,
    resultsError: opts.resultsError, experimentStatus: opts.experimentStatus,
  });
}


/** The decision metric as the PAGE needs it: a read-only descriptor, never a
 *  composite the client could post back. */
function decisionOf(map: MetricMap | null, stats: StatsReport | null): {
  key: string; label: string; source: "console" | "optimizely"; direction?: "increase" | "decrease"; directionDeclared: boolean;
} | null {
  const c = map?.composites.find((x) => x.role === "primary");
  if (!c || !stats?.primaryKey) return null;
  return {
    key: stats.primaryKey,
    label: c.label,
    source: c.source === "optimizely" ? "optimizely" : "console",
    direction: c.direction,
    directionDeclared: Boolean(c.direction),
  };
}

type BasisInput = {
  history: ResultsHistory; verdict: VerdictRecord | null; map: MetricMap | null;
  orgNb: { updatedAt?: string }; protoNb: { updatedAt?: string };
  stats?: StatsReport | null; results?: ExperimentResults | null;
};

/** The set the reading is ABOUT, as the generator will resolve it. */
function supportingFor(opts: BasisInput): string[] {
  return supportingKeys({
    map: opts.map,
    optiPrimaryKey: optiPrimaryKeyOf(opts.results),
    decisionKey: opts.stats?.primaryKey,
    available: (opts.stats?.metrics ?? []).map((m) => m.key),
    optiRowIsDecision: opts.map?.composites.some((c) => c.role === "primary" && c.source === "optimizely"),
  });
}

/** The reading's staleness basis, derived from the current truth. */
function basisFor(opts: BasisInput): string {
  return readingBasisKey({
    latestSnapshotDate: opts.history.days[opts.history.days.length - 1]?.date,
    verdict: opts.verdict?.verdict,
    mapConfirmedAt: opts.map?.confirmedAt,
    orgNotebookUpdatedAt: opts.orgNb.updatedAt,
    protoNotebookUpdatedAt: opts.protoNb.updatedAt,
    supporting: supportingFor(opts),
  });
}

/** Deep observations are PER-METRIC and don't depend on which other metrics
 *  are supporting, so they keep the basis WITHOUT the set — otherwise marking
 *  a fourth metric would throw away the three deep reads already generated. */
function obsBasisFor(opts: BasisInput): string {
  return readingBasisKey({
    latestSnapshotDate: opts.history.days[opts.history.days.length - 1]?.date,
    verdict: opts.verdict?.verdict,
    mapConfirmedAt: opts.map?.confirmedAt,
    orgNotebookUpdatedAt: opts.orgNb.updatedAt,
    protoNotebookUpdatedAt: opts.protoNb.updatedAt,
  });
}

export async function GET(req: NextRequest) {
  const g = await guardPrototypeAccess(req.nextUrl.searchParams.get("key"), req.headers.get("authorization"), { tokenAllowed: false });
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const [bundle, metricMap, orgNb, protoNb, reading] = await Promise.all([
    fetchResults(g.orgId, g.proto.experiment?.experimentId),
    getMetricMap(g.proto.key),
    getOrgNotebook(g.orgId),
    getProtoNotebook(g.proto.key),
    getReading(g.proto.key),
  ]);
  // `effMap` carries the RESOLVED decision metric (Optimizely's own primary
  // when the console has no nomination). Every reader below uses it; the
  // stored `metricMap` is only what writes mutate.
  const { stats, verdict, history, map: effMap } = await analyze(g.proto, bundle);
  // Measurement drift: results reporting EVENTS the stamped plan never
  // reviewed = the build (or Opti config) moved past the plan. Compared in
  // ONE namespace: a row's baseName (registry name) counts as known — the
  // trust boundary's disambiguation suffix must never read as drift.
  const planDrift = metricMap?.plannedAt && metricMap.known && bundle.results
    ? bundle.results.metrics
        .filter((m) => !metricMap.known!.includes(m.name) && !(m.baseName && metricMap.known!.includes(m.baseName)))
        .map((m) => m.name)
    : [];
  // WINDOWED view (honest date-range analytics from the console's own daily
  // snapshots — Optimizely only reports cumulative). View-layer only: the
  // verdict always judges the full run.
  const windowDays = Number(req.nextUrl.searchParams.get("window") ?? "");
  let windowView: { results: ExperimentResults; from: string; to: string } | null = null;
  let windowStats: StatsReport | null = null;
  if (Number.isFinite(windowDays) && windowDays > 0 && bundle.results) {
    windowView = windowedResults(bundle.results, history.days, windowDays);
    if (windowView) {
      windowStats = computeStatsReport({
        results: windowView.results,
        map: effMap,
        focusVariationId: g.proto.experiment?.variationId,
        weights: bundle.weights,
        history: [],
      });
    }
  }

  const basisIn = { history, verdict, map: effMap, orgNb, protoNb, stats, results: bundle.results };
  const basis = basisFor(basisIn);
  const deepCache = JSON.parse((await (await getContentStore()).getFlag(`observations:${g.proto.key}`)) || "{}") as Record<string, { basisKey?: string }>;
  const obsBasis = obsBasisFor(basisIn);
  const deepObservations = Object.fromEntries(Object.entries(deepCache).filter(([, v]) => v?.basisKey === `${obsBasis}|obs2`));
  const attention = deriveAttention({
    verdict, stats, map: effMap, planDrift,
    resultsError: bundle.error, experimentStatus: bundle.experimentStatus,
  });
  return NextResponse.json({
    // the printed readout should name the experiment it is about, and state
    // what was being tested even when nothing is frozen yet
    prototypeName: g.proto.name,
    liveHypothesis: g.proto.hypothesis?.change || g.proto.hypothesis?.outcome
      ? `We believe ${g.proto.hypothesis.change || "…"} for ${g.proto.hypothesis.audience || "…"} will cause ${g.proto.hypothesis.outcome || "…"}.`
      : null,
    attention,
    deepObservations,
    windowResults: windowView?.results ?? null,
    windowStats,
    windowRange: windowView ? { from: windowView.from, to: windowView.to } : null,
    // last 31 days of history — powers the per-metric trend charts
    historyDays: history.days.slice(-31),
    results: bundle.results,
    resultsError: bundle.error,
    experimentStatus: bundle.experimentStatus,
    // The STORED map — never the resolved one. The page round-trips this
    // object through confirm/propose/buildMetric, so handing it a composite
    // that exists only in memory would launder Optimizely's declaration into
    // the team's authored plan as though a human had written and ratified it.
    metricMap,
    // The decision metric travels as its own read-only descriptor instead.
    decision: decisionOf(effMap, stats),
    stats,
    verdict,
    planDrift,
    reading,
    readingStale: !reading || reading.basisKey !== basis,
    /** The regeneration TARGET — the client keys its retry guard to this,
     *  so a failed attempt in one episode never suppresses the next. */
    readingBasis: basis,
    notebook: { org: orgNb, proto: protoNb },
  });
}

export async function POST(req: NextRequest) {
  let body: {
    key?: string;
    propose?: boolean;
    confirm?: { composites?: unknown };
    stamp?: boolean;
    /** The verdict enum the human REVIEWED — stamp 409s if it moved. */
    expectVerdict?: string;
    unstamp?: boolean;
    promote?: string;
    ask?: string;
    /** How the analyst should read: answer the question, or argue against
     *  the current call. Different instructions, same answer schema. */
    stance?: "ask" | "challenge";
    /** Clear the analyst conversation for this prototype (audited). */
    clearThread?: boolean;
    explain?: boolean;
    reading?: boolean;
    /** Plain-language description of a custom console-computed metric. */
    defineMetric?: string;
    /** Delete a CUSTOM metric by composite id (plan metrics are protected). */
    removeMetric?: string;
    /** Rename a CUSTOM metric. */
    renameMetric?: { id?: string; label?: string };
    /** Promote a composite to the console's PRIMARY decision metric. */
    setPrimary?: string;
    /** Stand the decision metric down entirely. The experiment then has no
     *  console primary and says so — better than being locked into one. */
    clearPrimary?: boolean;
    /** Persist the All-metrics display order (row keys). Presentation only. */
    orderMetrics?: string[];
    /** The full read of ONE metric, generated on demand and cached. */
    deepDive?: { key?: string; force?: boolean };
    /** Mark an attention row as seen — it collapses on screen, still prints. */
    acknowledge?: { id?: string; on?: boolean };
    /** Watch a measure: it gets an observation under the decision summary.
     *  Display only — observing something never makes it adjudicable. */
    observeMetric?: { key?: string; on?: boolean };
    setMetricRole?: { key?: string; role?: string };
    /** Hide/show a metric in the index. Display only — plan metrics keep
     *  feeding the verdict; the primary refuses. */
    hideMetric?: { key?: string; hidden?: boolean };
    /** Build a composite by hand — no LLM. The builder shows live numbers as
     *  the author picks, so this is a save, not an interpretation. */
    buildMetric?: {
      id?: string;                       // present = edit in place
      label?: string;
      events?: string[];
      armEvents?: { variationId: string; events: string[] }[];
      direction?: "increase" | "decrease";
      role?: "guardrail" | "info";
      definition?: string;
    };
    /** Start over: blank the console's analytics state for this prototype.
     *  Scoped on purpose — the caller says exactly what goes. */
    reset?: { plan?: boolean; verdict?: boolean; reading?: boolean; history?: boolean; notebook?: boolean };
    /** Required to wipe a STAMPED verdict — the record doesn't go silently. */
    confirmStamped?: boolean;
    /** Manual "Refresh the reading" — bypasses the current-basis short-circuit. */
    force?: boolean;
    tune?: { question?: string; answer?: string; durable?: boolean };
    forgetPreference?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const g = await guardPrototypeAccess(body.key ?? null, req.headers.get("authorization"), { tokenAllowed: false });
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const user = await currentUser();
  const actor = user?.name ?? user?.sub ?? "user";

  try {
    if (body.propose) {
      const bundle = await fetchResults(g.orgId, g.proto.experiment?.experimentId);
      if (!bundle.results) return NextResponse.json({ error: bundle.error ?? "No results to map yet." }, { status: 400 });
      const source = isExternalBuild(g.proto) ? null : await resolveRepoSource(g.proto.key).catch(() => null);
      const variationJs = isExternalBuild(g.proto) ? null : source?.found ? source.variationJs ?? null : (await listArtifactVersions(g.proto.key).catch(() => []))[0]?.variationJs ?? null;
      const composites = await proposeMetricMap({ proto: g.proto, variationJs, eventNames: bundle.results.metrics.map((m) => m.name) });
      // Preserve the measurement-plan layer (interview, known, gaps) — a
      // results-side re-propose replaces the BINDING, not the understanding.
      // pendingQuestions/understanding described the REPLACED composites, so
      // they're cleared; a replaced confirmation stamp is archived.
      const map = (await mutateMetricMap(g.proto.key, (prior) => pruneMeasureKeys({
        ...(prior ?? {}),
        composites,
        proposedBy: "claude (analyst)",
        confirmed: false,
        confirmedBy: undefined,
        confirmedAt: undefined,
        pendingQuestions: undefined,
        understanding: undefined,
        priorConfirmations: prior?.confirmed && prior.confirmedAt
          ? [...(prior.priorConfirmations ?? []), { confirmedBy: prior.confirmedBy ?? "?", confirmedAt: prior.confirmedAt }]
          : prior?.priorConfirmations,
      })))!;
      await audit(g.orgId, actor, "results.map-proposed", g.proto.name, composites.map((c) => `${c.label} = ${c.events.join(" + ")}`).join(" · ").slice(0, 400));
      const { stats, verdict } = await analyze(g.proto, bundle);
      return NextResponse.json({ metricMap: map, results: bundle.results, stats, verdict, attention: attentionFor({ results: bundle.results, map, stats, verdict, experimentStatus: bundle.experimentStatus }) });
    }

    if (Array.isArray(body.confirm?.composites) && body.confirm.composites.some((c: { id?: string }) => c?.id === OPTI_PRIMARY_ID)) {
      return NextResponse.json({ error: "Optimizely's own primary metric can't be confirmed into the plan — it is read from Optimizely, not authored here. Build your own decision metric if you want one." }, { status: 400 });
    }
    if (body.confirm) {
      const raw = Array.isArray(body.confirm.composites) ? body.confirm.composites : [];
      const priorMap = await getMetricMap(g.proto.key);
      const composites: CompositeMetric[] = [];
      const seen = new Set<string>();
      for (const r of raw) {
        if (!r || typeof r !== "object") continue;
        const o = r as Record<string, unknown>;
        let id = String(o.id ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        if (!id) id = `composite-${composites.length + 1}`;
        while (seen.has(id)) id = `${id}-2`;
        seen.add(id);
        const events = (Array.isArray(o.events) ? o.events : []).filter((e): e is string => typeof e === "string" && e.trim().length > 0).map((e) => e.slice(0, 200));
        const label = String(o.label ?? "").trim().slice(0, 120);
        if (!label || !events.length) continue;
        // Ratifying must not strip the plan layer: fields the payload omits
        // fall back to the prior composite with the same id.
        const prior = priorMap?.composites.find((c) => c.id === id);
        composites.push({
          id,
          label,
          events: [...new Set(events)].slice(0, 10),
          role: o.role === "guardrail" ? "guardrail" : o.role === "info" ? "info" : "primary",
          direction: o.direction === "decrease" ? "decrease" : "increase",
          note: typeof o.note === "string" ? o.note.trim().slice(0, 300) || undefined : prior?.note,
          definition: typeof o.definition === "string" ? o.definition.trim().slice(0, 300) || undefined : prior?.definition,
          surfaces: Array.isArray(o.surfaces)
            ? o.surfaces
                .filter((s): s is { arm: string; description: string } => Boolean(s && typeof s === "object" && typeof (s as Record<string, unknown>).description === "string"))
                .map((s) => ({ arm: s.arm === "variation" ? "variation" as const : s.arm === "baseline" ? "baseline" as const : "both" as const, description: s.description.slice(0, 160) }))
                .slice(0, 8)
            : prior?.surfaces,
          expectedOneArm: o.expectedOneArm === "variation" ? "variation" : o.expectedOneArm === "baseline" ? "baseline" : prior?.expectedOneArm,
          mdeRel: typeof o.mdeRel === "number" && o.mdeRel > 0 && o.mdeRel < 5 ? o.mdeRel : prior?.mdeRel,
        });
      }
      if (!composites.length) return NextResponse.json({ error: "Nothing to confirm — a composite needs a label and at least one event." }, { status: 400 });
      // One primary — same enforcement as the planner (extras demote to info).
      let sawPrimary = false;
      for (const c of composites) {
        if (c.role !== "primary") continue;
        if (sawPrimary) c.role = "info";
        else sawPrimary = true;
      }
      // Confirming from the Results panel must not wipe the measurement-plan
      // layer (interview, drift baseline, gaps) the Measurement room authored.
      const map = (await mutateMetricMap(g.proto.key, (cur) => pruneMeasureKeys({
        ...(cur ?? {}),
        composites: composites.slice(0, 12),
        confirmed: true,
        confirmedBy: actor,
        confirmedAt: new Date().toISOString(),
        pendingQuestions: undefined,
        // A re-confirm ARCHIVES the earlier stamp + its frozen brief — the
        // earliest pre-observation confirmation stays the contract's anchor.
        priorConfirmations: cur?.confirmed && cur.confirmedAt
          ? [...(cur.priorConfirmations ?? []), { confirmedBy: cur.confirmedBy ?? "?", confirmedAt: cur.confirmedAt, briefAtConfirm: cur.briefAtConfirm }]
          : cur?.priorConfirmations,
        // Same pre-registration anchor as the measurement route's confirm.
        briefAtConfirm: {
          change: g.proto.hypothesis.change ?? "",
          audience: g.proto.hypothesis.audience ?? "",
          outcome: g.proto.hypothesis.outcome ?? "",
          primary: g.proto.metrics.primary ?? "",
          guardrails: g.proto.metrics.guardrails ?? [],
        },
      })))!;
      await audit(g.orgId, actor, "results.map-confirmed", g.proto.name, composites.map((c) => `${c.label} = ${c.events.join(" + ")}`).join(" · ").slice(0, 400));
      const bundle = await fetchResults(g.orgId, g.proto.experiment?.experimentId);
      const { stats, verdict } = bundle.results
        ? await analyze(g.proto, bundle)
        : { stats: null, verdict: await getVerdict(g.proto.key) };
      return NextResponse.json({ metricMap: map, results: bundle.results, stats, verdict, attention: attentionFor({ results: bundle.results, map, stats, verdict, experimentStatus: bundle.experimentStatus }) });
    }

    if (body.stamp) {
      // The finalization ritual: human-only, refused mid-run, frozen forever.
      const existing = await getVerdict(g.proto.key);
      if (existing?.state === "stamped") return NextResponse.json({ error: "Already stamped — the verdict is the record." }, { status: 400 });
      const bundle = await fetchResults(g.orgId, g.proto.experiment?.experimentId);
      if (!bundle.results) return NextResponse.json({ error: bundle.error ?? "No results to stamp." }, { status: 400 });
      // FAIL CLOSED on both status checks: an unreadable status must never
      // let a mid-run peek become the permanent record.
      if (bundle.experimentStatus === "running") {
        return NextResponse.json({ error: "The experiment is still RUNNING — pause or conclude it in Optimizely before stamping the verdict. A verdict stamped mid-run is a peek, not a record." }, { status: 400 });
      }
      if (!bundle.experimentStatus) {
        return NextResponse.json({ error: "Couldn't verify the experiment has stopped (Optimizely didn't return its status) — try again in a moment." }, { status: 400 });
      }
      const { stats, verdict } = await analyze(g.proto, bundle);
      if (!stats || !verdict) return NextResponse.json({ error: "Couldn't derive a verdict to stamp." }, { status: 400 });
      // Approve-what-you-see: the stamp freezes a FRESH derivation, so if the
      // numbers moved it since the human read the draft, force a re-review
      // instead of silently stamping a different verdict than they approved.
      if (body.expectVerdict && verdict.verdict !== body.expectVerdict) {
        return NextResponse.json({ error: `The verdict changed while you were reviewing — it now reads ${verdict.verdict.toUpperCase()} (you reviewed ${String(body.expectVerdict).toUpperCase()}). Re-review the updated card, then stamp.`, verdict, stats, results: bundle.results }, { status: 409 });
      }
      const { ref } = await analystSkill(g.orgId).catch(() => ({ system: "", ref: undefined }));
      const stamped = await mutateVerdict(g.proto.key, (cur) => {
        if (cur?.state === "stamped") return null; // lost the race — theirs stands
        return {
          ...verdict,
          state: "stamped" as const,
          frozenResults: bundle.results!,
          frozenStats: stats,
          skillRef: ref,
          stampedBy: actor,
          stampedAt: new Date().toISOString(),
        };
      });
      if (!stamped || stamped.stampedBy !== actor) {
        return NextResponse.json({ error: "Someone else stamped the verdict first — refresh to see the record.", verdict: stamped }, { status: 409 });
      }
      await audit(g.orgId, actor, "verdict.stamped", g.proto.name, `${stamped.verdict.toUpperCase()} — ${stamped.headline}`.slice(0, 400));
      return NextResponse.json({ verdict: stamped, results: bundle.results, stats });
    }

    if (body.unstamp) {
      let was: VerdictRecord | null = null;
      const reopened = await mutateVerdict(g.proto.key, (cur) => {
        if (cur?.state !== "stamped") return null;
        was = cur;
        return { ...cur, state: "draft" as const, frozenResults: undefined, frozenStats: undefined, stampedBy: undefined, stampedAt: undefined };
      });
      if (!was) return NextResponse.json({ error: "Nothing stamped to reopen." }, { status: 400 });
      const prev = was as VerdictRecord;
      await audit(g.orgId, actor, "verdict.reopened", g.proto.name, `was: ${prev.verdict.toUpperCase()} stamped by ${prev.stampedBy ?? "?"}`);
      return NextResponse.json({ verdict: reopened });
    }

    if (body.promote) {
      const verdict = await getVerdict(g.proto.key);
      const disc = verdict?.discoveries.find((d) => d.id === body.promote);
      if (!verdict || !disc) return NextResponse.json({ error: "Unknown discovery — refresh and try again." }, { status: 400 });
      if (disc.promotedIdeaId) return NextResponse.json({ error: "Already promoted to the backlog." }, { status: 400 });
      const idea = await addIdea({
        orgId: g.orgId,
        kind: "backlog",
        title: `Discovery: ${disc.label} moved ${disc.lift !== undefined ? `${disc.lift > 0 ? "+" : ""}${(disc.lift * 100).toFixed(1)}%` : "significantly"} in "${g.proto.name}"`.slice(0, 200),
        body: [
          `EXPLORATORY DISCOVERY from experiment "${g.proto.name}" (prototype ${g.proto.key}) — NOT pre-registered there, so it needs its own experiment before anyone calls it real.`,
          ``,
          `Evidence: ${disc.label} on ${disc.variationName}: lift ${disc.lift !== undefined ? `${disc.lift > 0 ? "+" : ""}${(disc.lift * 100).toFixed(1)}%` : "n/a"}, FDR q=${(disc.q * 100).toFixed(0)}% (survived multiple-comparison correction in the exploratory sweep).`,
          verdict.preRegistration ? `Source experiment's pre-registered hypothesis: ${verdict.preRegistration.hypothesis}` : ``,
          ``,
          `Suggested next step: promote this to a prototype whose brief pre-registers "${disc.label}" as the PRIMARY metric, with the observed effect as the prior.`,
        ].filter(Boolean).join("\n"),
        category: "other",
        source: "claude",
      });
      // CAS: a concurrent GET re-deriving the draft must not clobber the
      // promoted marker (or vice versa) — mark inside the mutation.
      const updated = await mutateVerdict(g.proto.key, (cur) => {
        if (!cur) return null;
        const d = cur.discoveries.find((x) => x.id === body.promote);
        if (!d || d.promotedIdeaId) return null;
        d.promotedIdeaId = idea.id;
        return cur;
      });
      await audit(g.orgId, actor, "verdict.discovery-promoted", g.proto.name, `${disc.label} → backlog ${idea.id}`);
      return NextResponse.json({ verdict: updated ?? verdict, ideaId: idea.id });
    }

    if (body.buildMetric) {
      const b = body.buildMetric;
      const label = String(b.label ?? "").trim().slice(0, 120);
      if (!label) return NextResponse.json({ error: "Give the metric a name." }, { status: 400 });

      const bundle = await fetchResults(g.orgId, g.proto.experiment?.experimentId);
      if (!bundle.results) return NextResponse.json({ error: bundle.error ?? "Live results are needed to build a metric." }, { status: 400 });
      // Only events Optimizely is actually reporting — a composite built on a
      // name that doesn't exist would silently compute as zero.
      const reported = new Set(bundle.results.metrics.map((m) => m.name));
      const armIds = new Set(bundle.results.variations.map((v) => v.variationId));
      const clean = (list: unknown) => (Array.isArray(list) ? list : [])
        .filter((e): e is string => typeof e === "string" && reported.has(e)).slice(0, 12);

      const events = clean(b.events);
      const armEvents = (Array.isArray(b.armEvents) ? b.armEvents : [])
        .filter((a) => a && typeof a.variationId === "string" && armIds.has(a.variationId))
        .map((a) => ({ variationId: a.variationId, events: clean(a.events) }))
        .filter((a) => a.events.length);
      if (!events.length && !armEvents.length) {
        return NextResponse.json({ error: "Pick at least one event that is reporting." }, { status: 400 });
      }
      // A per-arm build needs BOTH arms named, or one side silently reads zero
      // and the comparison is a lie.
      if (armEvents.length && armEvents.length < armIds.size && !events.length) {
        return NextResponse.json({ error: "With per-version events, every version needs its own list (or a shared fallback list)." }, { status: 400 });
      }

      let slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "metric";
      // OPTI_PRIMARY_ID is reserved for the read-time synthesis of Optimizely's
      // own primary. A metric a user happens to call "Opti primary" would
      // otherwise slug straight onto it and collide with the decision metric.
      if (slug === OPTI_PRIMARY_ID) slug = `${slug}-custom`;
      let saved: CompositeMetric | null = null;
      const map = await mutateMetricMap(g.proto.key, (cur) => {
        const composites = [...(cur?.composites ?? [])];
        const existingIdx = b.id ? composites.findIndex((c) => c.id === b.id) : -1;
        const editing = existingIdx >= 0 ? composites[existingIdx] : null;
        // Optimizely's own primary is synthesized at read time — there is no
        // stored record to edit, and it isn't ours to change.
        if (editing?.source === "optimizely") return null;
        // A PLAN-AUTHORED metric is editable here. It used to be refused and
        // the user sent to the measurement plan, which is no longer part of the
        // flow — so the refusal became a dead end on metrics the planner wrote
        // and the user never did. Redefining one DOES change the contract, so
        // it is disclosed below rather than forbidden.
        const wasPlanAuthored = Boolean(editing && editing.source !== "custom");
        let id = b.id && existingIdx >= 0 ? composites[existingIdx].id : slug;
        if (existingIdx < 0) {
          let n = 2;
          while (composites.some((c) => c.id === id)) id = `${slug}-${n++}`;
        }
        const next: CompositeMetric = {
          ...(existingIdx >= 0 ? composites[existingIdx] : {}),
          id, label,
          events,
          ...(armEvents.length ? { armEvents } : {}),
          role: existingIdx >= 0 ? composites[existingIdx].role : (b.role === "guardrail" ? "guardrail" : "info"),
          direction: b.direction === "decrease" ? "decrease" : "increase",
          definition: typeof b.definition === "string" ? b.definition.slice(0, 400) : composites[existingIdx]?.definition,
          // Lineage is kept: a metric the plan authored still reads as the
          // plan's on the record, even after the team redefined it.
          ...(editing?.source ? { source: editing.source } : { source: "custom" as const }),
        };
        // Editing a PER-VERSION metric back to shared events must CLEAR the
        // per-arm lists. Spreading the old record and conditionally re-adding
        // armEvents left the previous definition in place, so the saved metric
        // quietly disagreed with the preview the user just approved.
        if (!armEvents.length) delete next.armEvents;
        saved = next;
        if (existingIdx >= 0) composites[existingIdx] = next;
        else composites.push(next);
        const base = { ...(cur ?? { composites: [], confirmed: false }) };
        const out: MetricMap = { ...base, composites: composites.slice(0, 24) };
        // REDEFINING A PLAN METRIC MOVES THE CONTRACT. The stamp is archived
        // and the plan drops to unconfirmed — the same treatment removing one
        // already gets. (Adding a NEW metric changes nothing that was agreed,
        // so it leaves the confirmation alone. The old code meant to do this
        // and couldn't: `{ confirmed: false, ...cur }` put the spread last, so
        // a confirmed plan overwrote the false every time.)
        if (wasPlanAuthored && base.confirmed) {
          out.confirmed = false;
          out.priorConfirmations = [
            ...(base.priorConfirmations ?? []),
            { confirmedBy: base.confirmedBy ?? "?", confirmedAt: base.confirmedAt ?? new Date().toISOString(), briefAtConfirm: base.briefAtConfirm },
          ];
        }
        return out;
      });
      if (!saved) return NextResponse.json({ error: "That's Optimizely's own primary metric — it's read from Optimizely, not stored here, so there's nothing to edit." }, { status: 400 });

      await audit(g.orgId, actor, b.id ? "results.metric-rebuilt" : "results.metric-built", g.proto.name,
        `${label} = ${armEvents.length ? armEvents.map((a) => `${a.variationId}:[${a.events.join(" + ")}]`).join(" vs ") : events.join(" + ")}`.slice(0, 400));
      const { stats, verdict } = await analyze(g.proto, bundle);
      return NextResponse.json({ metricMap: map, results: bundle.results, stats, verdict,
        attention: attentionFor({ results: bundle.results, map, stats, verdict, experimentStatus: bundle.experimentStatus }) });
    }

    if (body.clearThread) {
      await clearNotebookEntries(g.proto.key);
      await audit(g.orgId, actor, "results.thread-cleared", g.proto.name, "analyst conversation cleared");
      const [orgNb, protoNb] = await Promise.all([getOrgNotebook(g.orgId), getProtoNotebook(g.proto.key)]);
      return NextResponse.json({ notebook: { org: orgNb, proto: protoNb }, cleared: ["thread"] });
    }

    if (body.reset) {
      const scope = body.reset;
      const wanted = Object.entries(scope).filter(([, v]) => v === true).map(([k]) => k);
      if (!wanted.length) return NextResponse.json({ error: "Nothing selected to reset." }, { status: 400 });

      // A stamped verdict is the immutable record of a decision. It can be
      // discarded, but never as a side effect of clearing something else.
      if (scope.verdict) {
        const existing = await getVerdict(g.proto.key);
        if (existing?.state === "stamped" && !body.confirmStamped) {
          return NextResponse.json({
            error: `This experiment has a STAMPED verdict (${existing.verdict.toUpperCase()} by ${existing.stampedBy ?? "?"}). Resetting discards that record — confirm explicitly to proceed.`,
            needsStampedConfirm: true,
          }, { status: 409 });
        }
      }

      await Promise.all([
        scope.plan ? clearMetricMap(g.proto.key) : null,
        scope.verdict ? clearVerdict(g.proto.key) : null,
        scope.reading ? clearReading(g.proto.key) : null,
        scope.history ? clearResultsHistory(g.proto.key) : null,
        scope.notebook ? clearProtoNotebook(g.proto.key) : null,
      ].filter(Boolean));

      await audit(g.orgId, actor, "results.reset", g.proto.name, `cleared: ${wanted.join(", ")}`);
      // Re-derive from whatever survives so the client sees the new truth
      // rather than its own optimistic guess about what a reset means.
      const bundle = await fetchResults(g.orgId, g.proto.experiment?.experimentId);
      const map = await getMetricMap(g.proto.key);
      const { stats, verdict } = bundle.results ? await analyze(g.proto, bundle) : { stats: null, verdict: null };
      const [orgNb, protoNb] = await Promise.all([getOrgNotebook(g.orgId), getProtoNotebook(g.proto.key)]);
      return NextResponse.json({
        cleared: wanted,
        metricMap: map, results: bundle.results, stats, verdict,
        reading: null, readingStale: true,
        notebook: { org: orgNb, proto: protoNb },
        attention: attentionFor({ results: bundle.results, map, stats, verdict, resultsError: bundle.error, experimentStatus: bundle.experimentStatus }),
      });
    }

    if (body.orderMetrics) {
      const order = (Array.isArray(body.orderMetrics) ? body.orderMetrics : [])
        .filter((k): k is string => typeof k === "string" && k.length > 0)
        .map((k) => k.slice(0, 220))
        .slice(0, 100);
      const map = await mutateMetricMap(g.proto.key, (cur) =>
        cur ? { ...cur, measureOrder: order } : { composites: [], confirmed: false, measureOrder: order });
      return NextResponse.json({ metricMap: map });
    }

    if (body.deepDive?.key) {
      const key = String(body.deepDive.key).slice(0, 220);
      const bundle = await fetchResults(g.orgId, g.proto.experiment?.experimentId);
      if (!bundle.results) return NextResponse.json({ error: bundle.error ?? "No results to read yet." }, { status: 400 });
      const { stats, verdict, history, map } = await analyze(g.proto, bundle);
      const [orgNb, protoNb] = await Promise.all([getOrgNotebook(g.orgId), getProtoNotebook(g.proto.key)]);
      const basis = obsBasisFor({ history, verdict, map, orgNb, protoNb });

      const store = await getContentStore();
      const cacheKey = `observations:${g.proto.key}`;
      const cached = JSON.parse((await store.getFlag(cacheKey)) || "{}") as Record<string, DeepObservation>;
      // The read is expensive and rarely changes — serve the cached one until
      // the same basis that retires the reading retires this too.
      if (!body.deepDive.force && cached[key]?.basisKey === `${basis}|obs2`) {
        return NextResponse.json({ observation: cached[key] });
      }

      const source = isExternalBuild(g.proto) ? null : await resolveRepoSource(g.proto.key).catch(() => null);
      const variationJs = isExternalBuild(g.proto)
        ? null
        : source?.found ? source.variationJs ?? null : (await listArtifactVersions(g.proto.key).catch(() => []))[0]?.variationJs ?? null;
      const { system } = await analystSkill(g.orgId);

      const observation = await deepObservation({
        metricKey: key, proto: g.proto, results: bundle.results, map, stats, verdict,
        variationJs, system, basisKey: basis,
      });
      await store.setFlag(cacheKey, JSON.stringify({ ...cached, [key]: observation })).catch(() => {});
      await audit(g.orgId, actor, "results.observation-read", g.proto.name, observation.headline.slice(0, 200));
      return NextResponse.json({ observation });
    }

    if (body.acknowledge) {
      const id = String(body.acknowledge.id ?? "").slice(0, 220);
      const on = Boolean(body.acknowledge.on);
      if (!id) return NextResponse.json({ error: "An acknowledgement needs the row id." }, { status: 400 });
      const map = await mutateMetricMap(g.proto.key, (cur) => {
        const base = cur ?? { composites: [], confirmed: false };
        const set = new Set(base.acknowledged ?? []);
        if (on) set.add(id); else set.delete(id);
        return { ...base, acknowledged: [...set].slice(0, 40) };
      });
      await audit(g.orgId, actor, on ? "results.attention-acknowledged" : "results.attention-restored", g.proto.name, id);
      return NextResponse.json({ metricMap: map });
    }

    if (body.setMetricRole) {
      const rowKey = String(body.setMetricRole.key ?? "").slice(0, 220);
      const want = String(body.setMetricRole.role ?? "");
      if (!rowKey) return NextResponse.json({ error: "A type needs the metric key." }, { status: 400 });
      if (!["supporting", "guardrail", "exploratory"].includes(want)) {
        return NextResponse.json({ error: "That isn't a metric type. The decision metric is set with its own toggle." }, { status: 400 });
      }
      const role = want as "supporting" | "guardrail" | "exploratory";
      const map = await mutateMetricMap(g.proto.key, (cur) => {
        const base = cur ?? { composites: [], confirmed: false };
        // Typing a HIDDEN row shows it again — a type that changes nothing
        // visible is a control that lies about what it did.
        const hidden = (base.hiddenMeasures ?? []).filter((k) => k !== rowKey);
        return {
          ...base,
          roles: { ...(base.roles ?? {}), [rowKey]: role },
          ...(hidden.length !== (base.hiddenMeasures ?? []).length ? { hiddenMeasures: hidden } : {}),
        };
      });
      await audit(g.orgId, actor, "results.metric-type", g.proto.name, `${rowKey} → ${role}`);
      return NextResponse.json({ metricMap: map });
    }

    if (body.observeMetric) {
      const rowKey = String(body.observeMetric.key ?? "").slice(0, 220);
      const on = Boolean(body.observeMetric.on);
      if (!rowKey) return NextResponse.json({ error: "An observation needs the metric key." }, { status: 400 });
      const map = await mutateMetricMap(g.proto.key, (cur) => {
        const base = cur ?? { composites: [], confirmed: false };
        const set = new Set(base.observed ?? []);
        if (on) set.add(rowKey); else set.delete(rowKey);
        // Marking a HIDDEN row shows it again. supportingKeys drops hidden
        // metrics, so the alternative is a lit toggle that consumes a slot and
        // does nothing — a control that lies about what it did.
        const hidden = on ? (base.hiddenMeasures ?? []).filter((k) => k !== rowKey) : base.hiddenMeasures;
        // Six marked is the point where a list of observations becomes the
        // wall this readout exists to avoid (both primaries ride free).
        return { ...base, observed: [...set].slice(0, SUPPORTING_CAP - 2), ...(hidden ? { hiddenMeasures: hidden } : {}) };
      });
      await audit(g.orgId, actor, on ? "results.metric-supporting" : "results.metric-context", g.proto.name, rowKey);
      return NextResponse.json({ metricMap: map });
    }

    if (body.hideMetric) {
      const rowKey = String(body.hideMetric.key ?? "").slice(0, 220);
      const wantHidden = Boolean(body.hideMetric.hidden);
      if (!rowKey) return NextResponse.json({ error: "A hide needs the metric key." }, { status: 400 });
      let refused = false;
      let label = rowKey.startsWith("metric:") ? rowKey.slice(7) : rowKey;
      const map = await mutateMetricMap(g.proto.key, (cur) => {
        const base = cur ?? { composites: [], confirmed: false };
        const target = base.composites.find((c) => `composite:${c.id}` === rowKey);
        if (target?.role === "primary" && wantHidden) { refused = true; return null; }
        if (target) label = target.label;
        const set = new Set(base.hiddenMeasures ?? []);
        if (wantHidden) set.add(rowKey); else set.delete(rowKey);
        // Hiding a SUPPORTING metric releases it. Leaving the mark behind
        // would keep a row nobody can see driving the readout's top line.
        const observed = wantHidden ? (base.observed ?? []).filter((k) => k !== rowKey) : base.observed;
        return { ...base, hiddenMeasures: [...set].slice(0, 100), ...(observed ? { observed } : {}) };
      });
      if (refused) return NextResponse.json({ error: "The decision metric can't be hidden — move the primary first." }, { status: 400 });
      await audit(g.orgId, actor, wantHidden ? "results.measure-hidden" : "results.measure-shown", g.proto.name, label);
      return NextResponse.json({ metricMap: map });
    }

    if (body.clearPrimary) {
      let fromLabel = "";
      const map = await mutateMetricMap(g.proto.key, (cur) => {
        const old = cur?.composites.find((c) => c.role === "primary");
        if (!cur || !old) return null;
        fromLabel = old.label;
        return {
          ...cur,
          composites: cur.composites.map((c) => (c.role === "primary" ? { ...c, role: "info" as const } : c)),
          // Standing the decision metric down IS a change to the contract, so
          // it is archived and disclosed exactly like a swap.
          priorConfirmations: cur.confirmed && cur.confirmedAt
            ? [...(cur.priorConfirmations ?? []), { confirmedBy: cur.confirmedBy ?? "?", confirmedAt: cur.confirmedAt, briefAtConfirm: cur.briefAtConfirm }]
            : cur.priorConfirmations,
          primaryHistory: [...(cur.primaryHistory ?? []), { from: fromLabel, to: "(none)", at: new Date().toISOString(), by: actor }].slice(-8),
        };
      });
      if (!fromLabel) return NextResponse.json({ error: "There is no decision metric to stand down." }, { status: 400 });
      await audit(g.orgId, actor, "results.primary-cleared", g.proto.name, fromLabel);
      const bundle = await fetchResults(g.orgId, g.proto.experiment?.experimentId);
      const { stats, verdict } = bundle.results ? await analyze(g.proto, bundle) : { stats: null, verdict: await getVerdict(g.proto.key) };
      return NextResponse.json({ metricMap: map, results: bundle.results, stats, verdict,
        attention: attentionFor({ results: bundle.results, map, stats, verdict, experimentStatus: bundle.experimentStatus }) });
    }

    // Optimizely's own primary is SYNTHESIZED at read time and has nothing to
    // mutate. A client holding the resolved map could otherwise ask to rename,
    // remove or re-nominate a composite that does not exist in storage.
    const touchedId = String(
      (typeof body.setPrimary === "string" ? body.setPrimary : "")
      || (typeof body.removeMetric === "string" ? body.removeMetric : "")
      || (body.renameMetric?.id ?? ""),
    );
    if (touchedId === OPTI_PRIMARY_ID) {
      return NextResponse.json({ error: "That's Optimizely's own primary metric — change it in Optimizely, or nominate a different decision metric here." }, { status: 400 });
    }

    if (body.setPrimary) {
      const id = String(body.setPrimary);
      let fromLabel = "";
      let toLabel = "";
      const map = await mutateMetricMap(g.proto.key, (cur) => {
        const target = cur?.composites.find((c) => c.id === id);
        if (!cur || !target || target.role === "primary") return null;
        if (target.expectedOneArm) return null; // one-arm can't adjudicate — the engine would refuse anyway
        const oldPrimary = cur.composites.find((c) => c.role === "primary");
        fromLabel = oldPrimary?.label ?? "(none)";
        toLabel = target.label;
        return {
          ...cur,
          composites: cur.composites.map((c) =>
            c.id === id ? { ...c, role: "primary" as const } : c.role === "primary" ? { ...c, role: "info" as const } : c),
          // a primary swap IS a re-confirmation of the contract — the prior
          // stamp is archived (earliest still anchors) and the swap is
          // recorded so a post-observation change gets disclosed
          priorConfirmations: cur.confirmed && cur.confirmedAt
            ? [...(cur.priorConfirmations ?? []), { confirmedBy: cur.confirmedBy ?? "?", confirmedAt: cur.confirmedAt, briefAtConfirm: cur.briefAtConfirm }]
            : cur.priorConfirmations,
          confirmedBy: cur.confirmed ? actor : cur.confirmedBy,
          confirmedAt: cur.confirmed ? new Date().toISOString() : cur.confirmedAt,
          primaryHistory: [...(cur.primaryHistory ?? []), { from: fromLabel, to: toLabel, at: new Date().toISOString(), by: actor }].slice(-8),
          // The decision metric is never hidden — promoting a hidden metric
          // clears its flag, or it would silently vanish on the next swap.
          hiddenMeasures: (cur.hiddenMeasures ?? []).filter((k) => k !== `composite:${id}`),
        };
      });
      if (!toLabel) return NextResponse.json({ error: "Can't make that the primary — it's already primary, doesn't exist, or fires in only one arm (the control couldn't convert on it)." }, { status: 400 });
      await audit(g.orgId, actor, "results.primary-changed", g.proto.name, `${fromLabel} → ${toLabel}`);
      const bundle = await fetchResults(g.orgId, g.proto.experiment?.experimentId);
      const { stats, verdict } = bundle.results ? await analyze(g.proto, bundle) : { stats: null, verdict: await getVerdict(g.proto.key) };
      return NextResponse.json({ metricMap: map, results: bundle.results, stats, verdict, attention: attentionFor({ results: bundle.results, map, stats, verdict, experimentStatus: bundle.experimentStatus }) });
    }

    if (body.removeMetric) {
      const id = String(body.removeMetric);
      let removed: string | null = null;
      let planOwned = false;
      let refusedPrimary = false;
      const map = await mutateMetricMap(g.proto.key, (cur) => {
        const target = cur?.composites.find((c) => c.id === id);
        if (!cur || !target) return null;
        // The decision metric is the one thing that cannot just vanish —
        // stand it down first, so the change is recorded as a change.
        if (target.role === "primary") { refusedPrimary = true; return null; }
        removed = target.label;
        planOwned = target.source !== "custom";
        return pruneMeasureKeys({
          ...cur,
          composites: cur.composites.filter((c) => c.id !== id),
          // Removing something the PLAN authored edits the pre-registered
          // contract. It is allowed — the plan may simply be wrong — but the
          // plan drops to unconfirmed and the old stamp is archived, so the
          // verdict discloses that the contract moved instead of quietly
          // adjudicating a plan nobody agreed to.
          ...(planOwned
            ? {
                confirmed: false,
                priorConfirmations: cur.confirmed && cur.confirmedAt
                  ? [...(cur.priorConfirmations ?? []), { confirmedBy: cur.confirmedBy ?? "?", confirmedAt: cur.confirmedAt, briefAtConfirm: cur.briefAtConfirm }]
                  : cur.priorConfirmations,
              }
            : {}),
        });
      });
      if (refusedPrimary) return NextResponse.json({ error: "That is the decision metric. Stand it down with its toggle first, then remove it." }, { status: 400 });
      if (!removed) return NextResponse.json({ error: "No such metric." }, { status: 400 });
      await audit(g.orgId, actor, planOwned ? "results.plan-metric-removed" : "results.custom-metric-removed", g.proto.name,
        planOwned ? `${removed} — removed from the measurement plan; plan is now unconfirmed` : removed);
      const bundle = await fetchResults(g.orgId, g.proto.experiment?.experimentId);
      const { stats, verdict } = bundle.results ? await analyze(g.proto, bundle) : { stats: null, verdict: await getVerdict(g.proto.key) };
      return NextResponse.json({ metricMap: map, results: bundle.results, stats, verdict, planUnconfirmed: planOwned,
        attention: attentionFor({ results: bundle.results, map, stats, verdict, experimentStatus: bundle.experimentStatus }) });
    }

    if (body.renameMetric) {
      const id = String(body.renameMetric.id ?? "");
      const label = String(body.renameMetric.label ?? "").trim().slice(0, 120);
      if (!id || !label) return NextResponse.json({ error: "A rename needs the metric and its new name." }, { status: 400 });
      let renamed = false;
      const map = await mutateMetricMap(g.proto.key, (cur) => {
        const target = cur?.composites.find((c) => c.id === id);
        if (!cur || !target || target.source !== "custom") return null;
        renamed = true;
        return { ...cur, composites: cur.composites.map((c) => (c.id === id ? { ...c, label } : c)) };
      });
      if (!renamed) return NextResponse.json({ error: "Only custom console metrics can be renamed here — plan metrics are managed in the Measurement plan." }, { status: 400 });
      await audit(g.orgId, actor, "results.custom-metric-renamed", g.proto.name, `→ ${label}`);
      return NextResponse.json({ metricMap: map });
    }

    if (body.defineMetric) {
      const desc = String(body.defineMetric).trim().slice(0, 600);
      if (!desc) return NextResponse.json({ error: "Describe the metric first." }, { status: 400 });
      const bundle = await fetchResults(g.orgId, g.proto.experiment?.experimentId);
      if (!bundle.results) return NextResponse.json({ error: bundle.error ?? "Custom metrics need live results first." }, { status: 400 });
      const { composite, explanation } = await defineCustomMetric({
        orgId: g.orgId, proto: g.proto, description: desc,
        eventNames: bundle.results.metrics.map((m) => m.name),
      });
      if (!composite) return NextResponse.json({ error: explanation }, { status: 400 });
      // Appending an INFO metric never touches the plan's confirmation or
      // the primary — the verdict is unaffected by construction.
      const map = await mutateMetricMap(g.proto.key, (cur) => {
        const composites = [...(cur?.composites ?? [])];
        if (composites.some((c) => c.id === composite.id)) composite.id = `${composite.id}-${composites.length}`;
        composites.push(composite);
        return { confirmed: false, ...(cur ?? {}), composites: composites.slice(0, 16) };
      });
      await audit(g.orgId, actor, "results.custom-metric", g.proto.name, `${composite.label} = ${composite.events.join(" + ")}`.slice(0, 300));
      // The conversation is the record of what was created — a "note" entry
      // (an existing kind renderNotebook already attributes correctly).
      const protoNbAfter = await appendNotebook(g.proto.key, [
        { kind: "note", text: `Added console metric “${composite.label}” = ${composite.events.join(" + ")}. ${explanation}` },
      ]);
      const orgNbNow = await getOrgNotebook(g.orgId);
      const { stats, verdict } = await analyze(g.proto, bundle);
      return NextResponse.json({ metricMap: map, results: bundle.results, stats, verdict, explanation, notebook: { org: orgNbNow, proto: protoNbAfter }, attention: attentionFor({ results: bundle.results, map, stats, verdict, experimentStatus: bundle.experimentStatus }) });
    }

    if (body.reading) {
      // The standing narrative. The cost boundary is enforced HERE, not by
      // client trust: an already-current reading short-circuits (no LLM),
      // and a short-lived lock stops N concurrent stale viewers from paying
      // for N generations of the same basis.
      const bundle = await fetchResults(g.orgId, g.proto.experiment?.experimentId);
      if (!bundle.results) return NextResponse.json({ error: bundle.error ?? "No results to read yet." }, { status: 400 });
      const { stats, verdict, history, map } = await analyze(g.proto, bundle);
      const [orgNb, protoNb, cached] = await Promise.all([getOrgNotebook(g.orgId), getProtoNotebook(g.proto.key), getReading(g.proto.key)]);
      const basis = basisFor({ history, verdict, map, orgNb, protoNb, stats, results: bundle.results });
      if (!body.force && cached?.basisKey === basis) {
        return NextResponse.json({ reading: cached, readingStale: false, readingBasis: basis, notebook: { org: orgNb, proto: protoNb } });
      }
      const store = await getContentStore();
      const lockKey = `readinglock:${g.proto.key}`;
      const lockRaw = await store.getFlag(lockKey);
      const now = Date.now();
      if (lockRaw && Number(lockRaw) > now - 90_000) {
        return NextResponse.json({ reading: cached, readingStale: true, readingBasis: basis, readingPending: true, notebook: { org: orgNb, proto: protoNb } });
      }
      await store.compareAndSetFlag(lockKey, lockRaw, String(now)).catch(() => {});
      try {
        const planDriftNow = map?.plannedAt && map.known
          ? bundle.results.metrics.filter((m) => !map.known!.includes(m.name) && !(m.baseName && map.known!.includes(m.baseName))).map((m) => m.name)
          : [];
        const { reading, dataWishes } = await generateReading({
          orgId: g.orgId, proto: g.proto, results: bundle.results, map, stats, verdict,
          orgNotebook: orgNb, protoNotebook: protoNb, basisKey: basis,
          attention: deriveAttention({ verdict, stats, map, planDrift: planDriftNow, experimentStatus: bundle.experimentStatus }),
        });
        // Wishes the reading surfaced land in the notebook FIRST, then the
        // basis is recomputed so the just-saved reading isn't instantly
        // stale — but ONLY when nothing foreign landed meanwhile: the wish
        // append adds no ENTRIES, so an entry-count change means a
        // concurrent tune/ask that must keep the new reading stale.
        const protoNb2 = dataWishes.length ? await appendNotebook(g.proto.key, [], dataWishes) : protoNb;
        const foreignWrite = protoNb2.entries.length !== protoNb.entries.length;
        reading.basisKey = foreignWrite ? basis : basisFor({ history, verdict, map, orgNb, protoNb: protoNb2, stats, results: bundle.results });
        await saveReading(g.proto.key, reading);
        return NextResponse.json({ reading, readingStale: foreignWrite, readingBasis: reading.basisKey, notebook: { org: orgNb, proto: protoNb2 } });
      } finally {
        await store.setFlag(lockKey, "").catch(() => {});
      }
    }

    if (body.tune) {
      const question = String(body.tune.question ?? "").trim().slice(0, 300);
      const answer = String(body.tune.answer ?? "").trim().slice(0, 600);
      if (!question || !answer) return NextResponse.json({ error: "A tune needs the question and your answer." }, { status: 400 });
      const protoNb = await appendNotebook(g.proto.key, [
        { kind: "ai-question", text: question },
        { kind: "answer", text: answer },
      ]);
      // "Remember for all experiments" → a durable, visible, removable
      // org-level preference (voice/emphasis only — never thresholds). The
      // question is ALWAYS attached so every chip is self-contained, and a
      // re-answer to the same question REPLACES the old preference instead
      // of accumulating a contradiction.
      const qBase = question.replace(/\?+$/, "");
      const orgNb = body.tune.durable
        ? await addOrgPreference(g.orgId, `${qBase} → ${answer}`, `${qBase} → `)
        : await getOrgNotebook(g.orgId);
      await audit(g.orgId, actor, "results.analyst-tuned", g.proto.name, `${question.slice(0, 160)} → ${answer.slice(0, 160)}${body.tune.durable ? " · org-wide" : ""}`);
      return NextResponse.json({ notebook: { org: orgNb, proto: protoNb }, readingStale: true });
    }

    if (body.forgetPreference) {
      const orgNb = await removeOrgPreference(g.orgId, String(body.forgetPreference));
      const protoNb = await getProtoNotebook(g.proto.key);
      await audit(g.orgId, actor, "results.preference-forgotten", g.proto.name, String(body.forgetPreference).slice(0, 160));
      return NextResponse.json({ notebook: { org: orgNb, proto: protoNb }, readingStale: true });
    }

    if (body.ask !== undefined || body.explain) {
      const bundle = await fetchResults(g.orgId, g.proto.experiment?.experimentId);
      if (!bundle.results) return NextResponse.json({ error: bundle.error ?? "No results yet." }, { status: 400 });
      const { stats, verdict, map } = await analyze(g.proto, bundle);
      const [orgNb, protoNb] = await Promise.all([getOrgNotebook(g.orgId), getProtoNotebook(g.proto.key)]);
      const question = body.explain ? undefined : String(body.ask ?? "");
      const answer = await analyzeResults({
        stance: body.stance === "challenge" ? "challenge" : "ask",
        orgId: g.orgId,
        proto: g.proto,
        results: bundle.results,
        map,
        stats,
        verdict,
        orgNotebook: orgNb,
        protoNotebook: protoNb,
        question,
      });
      // The ask box IS the tuner: what they asked (and what they were told)
      // becomes analyst memory, so future readings lean toward it.
      let protoNb2 = protoNb;
      if (question?.trim()) {
        // "answer" is reserved for HUMAN answers — the analyst's own reply
        // is "analyst-answer", or a later reading would treat its old words
        // (and stale numbers) as the team's stated position.
        protoNb2 = await appendNotebook(g.proto.key, [
          { kind: "user-question", text: question.trim() },
          { kind: "analyst-answer", text: [answer.headline, ...answer.bullets].filter(Boolean).join(" · ") },
        ]);
      }
      return NextResponse.json({ answer, results: bundle.results, stats, verdict, notebook: { org: orgNb, proto: protoNb2 }, attention: attentionFor({ results: bundle.results, map, stats, verdict, experimentStatus: bundle.experimentStatus }) });
    }

    return NextResponse.json({ error: "Nothing to do — pass propose, confirm, stamp, promote, ask, or explain." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
