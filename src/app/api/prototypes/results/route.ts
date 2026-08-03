import { NextRequest, NextResponse } from "next/server";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { getOptimizelyClientForOrg } from "@/lib/experimentation";
import {
  normalizeResults, getMetricMap, mutateMetricMap, recordDailySnapshot,
  type ExperimentResults, type CompositeMetric, type MetricMap, type ResultsHistory,
} from "@/lib/prototypes/results";
import { computeStatsReport, type StatsReport } from "@/lib/prototypes/stats";
import { deriveVerdict, getVerdict, saveDraftVerdict, mutateVerdict, type VerdictRecord } from "@/lib/prototypes/verdict";
import {
  getOrgNotebook, getProtoNotebook, addOrgPreference, removeOrgPreference, appendNotebook,
  getReading, saveReading, readingBasisKey,
} from "@/lib/prototypes/notebook";
import { proposeMetricMap, analyzeResults, analystSkill, generateReading } from "@/lib/ai/results";
import { resolveRepoSource } from "@/lib/prototypes/source";
import { listArtifactVersions } from "@/lib/prototypes/versions";
import { lastPush } from "@/lib/prototypes/ship";
import { addIdea } from "@/lib/ideas/ideas";
import { currentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";
import { getContentStore } from "@/lib/content/store";
import type { PrototypeRecord } from "@/lib/prototypes/types";

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
    return { results, experimentStatus: exp?.status, weights: Object.keys(weights).length ? weights : undefined };
  } catch (e) {
    return { results: null, error: e instanceof Error ? e.message : "Couldn't reach Optimizely results." };
  }
}

/** stats + draft verdict, derived fresh from a results bundle. */
async function analyze(proto: PrototypeRecord, bundle: Bundle): Promise<{ stats: StatsReport | null; verdict: VerdictRecord | null; history: ResultsHistory }> {
  const existing = await getVerdict(proto.key);
  if (!bundle.results) return { stats: null, verdict: existing, history: { days: [] } };

  const history = await recordDailySnapshot(proto.key, bundle.results);
  const map = await getMetricMap(proto.key);
  const stats = computeStatsReport({
    results: bundle.results,
    map,
    focusVariationId: proto.experiment?.variationId,
    weights: bundle.weights,
    history: history.days,
  });

  if (existing?.state === "stamped") return { stats, verdict: existing, history };

  // The pre-registration = the briefSnapshot of the version that is LIVE in
  // the experiment (the push record knows which), never the evolving brief.
  const push = await lastPush(proto.key).catch(() => null);
  const versions = await listArtifactVersions(proto.key).catch(() => []);
  const pushedVersion = push ? versions.find((v) => v.version === push.version) ?? null : null;

  const draft = deriveVerdict({
    results: bundle.results,
    map,
    stats,
    pushedVersion,
    experimentStatus: bundle.experimentStatus,
    firstObservedDate: history.days[0]?.date,
    // The EARLIEST stamp is the pre-registration disclosure's anchor — a
    // mid-run Re-plan replacing the stamp must not erase "this was declared
    // before traffic".
    mapConfirmedAt: [...(map?.priorConfirmations?.map((p) => p.confirmedAt) ?? []), ...(map?.confirmedAt ? [map.confirmedAt] : [])].sort()[0],
  });
  const saved = await saveDraftVerdict(proto.key, draft);
  return { stats, verdict: saved, history };
}

/** The reading's staleness basis, derived from the current truth. */
function basisFor(opts: { history: ResultsHistory; verdict: VerdictRecord | null; map: MetricMap | null; orgNb: { updatedAt?: string }; protoNb: { updatedAt?: string } }): string {
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
  const { stats, verdict, history } = await analyze(g.proto, bundle);
  // Measurement drift: results reporting EVENTS the stamped plan never
  // reviewed = the build (or Opti config) moved past the plan. Compared in
  // ONE namespace: a row's baseName (registry name) counts as known — the
  // trust boundary's disambiguation suffix must never read as drift.
  const planDrift = metricMap?.plannedAt && metricMap.known && bundle.results
    ? bundle.results.metrics
        .filter((m) => !metricMap.known!.includes(m.name) && !(m.baseName && metricMap.known!.includes(m.baseName)))
        .map((m) => m.name)
    : [];
  const basis = basisFor({ history, verdict, map: metricMap, orgNb, protoNb });
  return NextResponse.json({
    results: bundle.results,
    resultsError: bundle.error,
    experimentStatus: bundle.experimentStatus,
    metricMap,
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
    explain?: boolean;
    reading?: boolean;
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
      const source = await resolveRepoSource(g.proto.key).catch(() => null);
      const variationJs = source?.found ? source.variationJs ?? null : (await listArtifactVersions(g.proto.key).catch(() => []))[0]?.variationJs ?? null;
      const composites = await proposeMetricMap({ proto: g.proto, variationJs, eventNames: bundle.results.metrics.map((m) => m.name) });
      // Preserve the measurement-plan layer (interview, known, gaps) — a
      // results-side re-propose replaces the BINDING, not the understanding.
      // pendingQuestions/understanding described the REPLACED composites, so
      // they're cleared; a replaced confirmation stamp is archived.
      const map = (await mutateMetricMap(g.proto.key, (prior) => ({
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
      return NextResponse.json({ metricMap: map, results: bundle.results, stats, verdict });
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
      const map = (await mutateMetricMap(g.proto.key, (cur) => ({
        ...(cur ?? {}),
        composites: composites.slice(0, 12),
        confirmed: true,
        confirmedBy: actor,
        confirmedAt: new Date().toISOString(),
        pendingQuestions: undefined,
      })))!;
      await audit(g.orgId, actor, "results.map-confirmed", g.proto.name, composites.map((c) => `${c.label} = ${c.events.join(" + ")}`).join(" · ").slice(0, 400));
      const bundle = await fetchResults(g.orgId, g.proto.experiment?.experimentId);
      const { stats, verdict } = bundle.results
        ? await analyze(g.proto, bundle)
        : { stats: null, verdict: await getVerdict(g.proto.key) };
      return NextResponse.json({ metricMap: map, results: bundle.results, stats, verdict });
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

    if (body.reading) {
      // The standing narrative. The cost boundary is enforced HERE, not by
      // client trust: an already-current reading short-circuits (no LLM),
      // and a short-lived lock stops N concurrent stale viewers from paying
      // for N generations of the same basis.
      const bundle = await fetchResults(g.orgId, g.proto.experiment?.experimentId);
      if (!bundle.results) return NextResponse.json({ error: bundle.error ?? "No results to read yet." }, { status: 400 });
      const map = await getMetricMap(g.proto.key);
      const { stats, verdict, history } = await analyze(g.proto, bundle);
      const [orgNb, protoNb, cached] = await Promise.all([getOrgNotebook(g.orgId), getProtoNotebook(g.proto.key), getReading(g.proto.key)]);
      const basis = basisFor({ history, verdict, map, orgNb, protoNb });
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
        const { reading, dataWishes } = await generateReading({
          orgId: g.orgId, proto: g.proto, results: bundle.results, map, stats, verdict,
          orgNotebook: orgNb, protoNotebook: protoNb, basisKey: basis,
        });
        // Wishes the reading surfaced land in the notebook FIRST, then the
        // basis is recomputed so the just-saved reading isn't instantly
        // stale — but ONLY when nothing foreign landed meanwhile: the wish
        // append adds no ENTRIES, so an entry-count change means a
        // concurrent tune/ask that must keep the new reading stale.
        const protoNb2 = dataWishes.length ? await appendNotebook(g.proto.key, [], dataWishes) : protoNb;
        const foreignWrite = protoNb2.entries.length !== protoNb.entries.length;
        reading.basisKey = foreignWrite ? basis : basisFor({ history, verdict, map, orgNb, protoNb: protoNb2 });
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
      const map = await getMetricMap(g.proto.key);
      const { stats, verdict } = await analyze(g.proto, bundle);
      const [orgNb, protoNb] = await Promise.all([getOrgNotebook(g.orgId), getProtoNotebook(g.proto.key)]);
      const question = body.explain ? undefined : String(body.ask ?? "");
      const answer = await analyzeResults({
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
          { kind: "analyst-answer", text: answer },
        ]);
      }
      return NextResponse.json({ answer, results: bundle.results, stats, verdict, notebook: { org: orgNb, proto: protoNb2 } });
    }

    return NextResponse.json({ error: "Nothing to do — pass propose, confirm, stamp, promote, ask, or explain." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
