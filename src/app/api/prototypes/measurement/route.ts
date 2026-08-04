import { NextRequest, NextResponse } from "next/server";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { getOptimizelyClientForOrg } from "@/lib/experimentation";
import { getMetricMap, mutateMetricMap, getResultsHistory, type MetricMap, pruneMeasureKeys } from "@/lib/prototypes/results";
import { planMeasurement } from "@/lib/ai/measurement";
import { resolveRepoSource } from "@/lib/prototypes/source";
import { listArtifactVersions } from "@/lib/prototypes/versions";
import { isExternalBuild } from "@/lib/prototypes/types";
import { currentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";

export const maxDuration = 60;

/**
 * The MEASUREMENT PLAN — Experiment stage, after bind, BEFORE start.
 *
 * Event names come from the experiment DEFINITION + the project's event
 * registry — NOT from results — so the interview runs and the plan gets
 * stamped with ZERO traffic. That ordering (plan confirmed → traffic
 * started) is what makes the verdict's pre-registration claim hold at
 * full strength.
 *
 * GET  ?key=            → { plan, eventNames, attachedNames, drift, bound }
 * POST { key, plan: true, answers? } → AI drafts/refines the plan
 *                          (interview trail stored; answers pass = terminal)
 * POST { key, confirm: true }        → stamp the CURRENT draft (audited)
 * Session-only. The results route's confirm/propose remain compatible —
 * one artifact (`metricmap:<key>`), this is its authoring surface.
 */

async function enumerateEvents(orgId: string, experimentId?: string): Promise<{ eventNames: string[]; attachedNames: string[]; error?: string }> {
  if (!experimentId) return { eventNames: [], attachedNames: [], error: "No experiment bound yet — bind it in the Ship section first." };
  const client = await getOptimizelyClientForOrg(orgId);
  if (!client) return { eventNames: [], attachedNames: [], error: "Optimizely isn't connected for this customer." };
  try {
    // A registry failure fails LOUD (no silent []): a plan drafted against a
    // truncated event set would poison the drift baseline and then gaslight
    // the user with "add metrics" that already exist.
    const [exp, registry] = await Promise.all([
      client.getExperiment(experimentId),
      client.listEvents(),
    ]);
    // Attached metrics resolve against the UNFILTERED registry — an attached
    // metric can point at an archived event and must still be visible.
    const byId = new Map(registry.events.map((e) => [e.id, e.name]));
    const attachedNames = (exp.metrics ?? [])
      .map((m) => (m.event_id !== undefined ? byId.get(m.event_id) : undefined))
      .filter((n): n is string => Boolean(n));
    // New bindings are offered from the LIVE registry (the build may fire
    // events not yet attached as experiment metrics — attaching them in
    // Opti is part of closing a gap), but the attached set leads.
    const live = registry.events.filter((e) => !e.archived).map((e) => e.name).filter(Boolean);
    const eventNames = [...new Set([...attachedNames, ...live])].slice(0, 200);
    return {
      eventNames,
      attachedNames,
      error: registry.truncated ? "The project has more events than the console enumerated (500+) — if a wanted event is missing from the plan, it may be past the cap." : undefined,
    };
  } catch (e) {
    return { eventNames: [], attachedNames: [], error: e instanceof Error ? e.message : "Couldn't reach Optimizely." };
  }
}

/** Names visible now that the plan has never reviewed — the drift audit. */
function planDrift(plan: MetricMap | null, attachedNames: string[]): string[] {
  if (!plan?.plannedAt || !plan.known) return [];
  const known = new Set(plan.known);
  return attachedNames.filter((n) => !known.has(n));
}

export async function GET(req: NextRequest) {
  const g = await guardPrototypeAccess(req.nextUrl.searchParams.get("key"), req.headers.get("authorization"), { tokenAllowed: false });
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const [plan, enumerated, history] = await Promise.all([
    getMetricMap(g.proto.key),
    enumerateEvents(g.orgId, g.proto.experiment?.experimentId),
    getResultsHistory(g.proto.key).catch(() => ({ days: [] })),
  ]);
  return NextResponse.json({
    plan,
    eventNames: enumerated.eventNames,
    attachedNames: enumerated.attachedNames,
    enumerationError: enumerated.error,
    // A failed enumeration returns null, never [] — an unrunnable audit must
    // be distinguishable from a clean one.
    drift: enumerated.error && !enumerated.attachedNames.length ? null : planDrift(plan, enumerated.attachedNames),
    // Lets the UI say "stamped before start" from OBSERVATION truth, not
    // from the live status (a paused experiment isn't pre-start).
    firstObservedAt: history.days[0]?.date ?? null,
    bound: Boolean(g.proto.experiment),
  });
}

export async function POST(req: NextRequest) {
  let body: { key?: string; plan?: boolean; answers?: { question: string; answer: string }[]; confirm?: boolean; expectPlannedAt?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const g = await guardPrototypeAccess(body.key ?? null, req.headers.get("authorization"), { tokenAllowed: false });
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const user = await currentUser();
  const actor = user?.name ?? user?.sub ?? "user";

  try {
    if (body.plan) {
      const enumerated = await enumerateEvents(g.orgId, g.proto.experiment?.experimentId);
      if (!enumerated.eventNames.length) {
        return NextResponse.json({ error: enumerated.error ?? "No events found on the experiment or in the project registry — add metrics to the experiment in Optimizely first." }, { status: 400 });
      }
      const prior = await getMetricMap(g.proto.key);
      let answers = Array.isArray(body.answers)
        ? body.answers.filter((a): a is { question: string; answer: string } =>
            Boolean(a && typeof a === "object" && typeof a.question === "string" && typeof a.answer === "string" && a.answer.trim()))
            .map((a) => ({ question: a.question.slice(0, 300), answer: a.answer.trim().slice(0, 1000) }))
        : undefined;
      // Answers are only TERMINAL when they answer the CURRENT questions —
      // stale or partial submissions must not vaporize open questions.
      if (answers?.length) {
        const pending = prior?.pendingQuestions ?? [];
        answers = answers.filter((a) => pending.includes(a.question));
        if (pending.length && answers.length < pending.length) {
          return NextResponse.json({ error: "Your answers don't match the current questions (the plan may have changed in another tab) — refresh and answer again.", plan: prior }, { status: 409 });
        }
        if (!answers.length) answers = undefined;
      }

      // Externally-built: the repo holds no evidence (a flipped prototype's
      // stale cut describes code that is NOT what runs in Optimizely).
      const source = isExternalBuild(g.proto) ? null : await resolveRepoSource(g.proto.key).catch(() => null);
      const variationJs = isExternalBuild(g.proto) ? null : source?.found ? source.variationJs ?? null : (await listArtifactVersions(g.proto.key).catch(() => []))[0]?.variationJs ?? null;

      const draft = await planMeasurement({
        orgId: g.orgId,
        proto: g.proto,
        variationJs,
        eventNames: enumerated.eventNames,
        priorPlan: prior,
        answers,
      });

      // CAS write against the FRESH record — the Opus call above took tens of
      // seconds and the flag may have moved (another tab confirmed, results
      // propose ran). A replaced confirmation stamp is ARCHIVED, never erased
      // — the earliest pre-observation stamp anchors the verdict's
      // pre-registration disclosure.
      const plan = (await mutateMetricMap(g.proto.key, (cur) => pruneMeasureKeys({
        // The user's own curation of the index (row order, hidden rows) is
        // presentation, not plan — a re-plan must never silently wipe it.
        measureOrder: cur?.measureOrder,
        hiddenMeasures: cur?.hiddenMeasures,
        composites: draft.composites,
        proposedBy: "claude (measurement planner)",
        confirmed: false,
        interview: [...(cur?.interview ?? prior?.interview ?? []), ...(answers ?? [])].slice(-12),
        understanding: draft.understanding,
        gaps: draft.gaps,
        // Everything reviewed at planning time — bound, adoption, or noise —
        // becomes the drift baseline. New names later = the build moved.
        known: enumerated.eventNames,
        pendingQuestions: draft.questions.length ? draft.questions : undefined,
        plannedAt: new Date().toISOString(),
        priorConfirmations: cur?.confirmed && cur.confirmedAt
          ? [...(cur.priorConfirmations ?? []), { confirmedBy: cur.confirmedBy ?? "?", confirmedAt: cur.confirmedAt, briefAtConfirm: cur.briefAtConfirm }]
          : cur?.priorConfirmations,
      })))!;
      await audit(g.orgId, actor, "measurement.planned", g.proto.name,
        `${draft.composites.map((c) => `${c.label} = ${c.events.join(" + ")}`).join(" · ")}${draft.questions.length ? ` · ${draft.questions.length} question(s)` : ""}${draft.gaps.length ? ` · ${draft.gaps.length} gap(s)` : ""}`.slice(0, 400));
      return NextResponse.json({ plan, questions: draft.questions, drift: [] });
    }

    if (body.confirm) {
      const plan = await getMetricMap(g.proto.key);
      if (!plan?.composites.length) return NextResponse.json({ error: "Nothing to confirm — run the planner first." }, { status: 400 });
      if (plan.confirmed && plan.briefAtConfirm) return NextResponse.json({ error: "The plan is already confirmed.", plan }, { status: 400 });
      if (plan.pendingQuestions?.length) {
        return NextResponse.json({ error: "The interview isn't finished — answer the open question(s) (or Re-plan) before confirming. A stamped plan with unresolved questions isn't a contract.", plan }, { status: 400 });
      }
      if (!plan.composites.some((c) => c.role === "primary")) {
        return NextResponse.json({ error: "The plan has no primary decision composite — usually because every candidate event fires in only one arm. Close the instrumentation gap (see Gaps below), re-sync the build, then Re-plan.", plan }, { status: 400 });
      }
      // Approve-what-you-see: 409 when the stored draft isn't the one the
      // client reviewed (another tab re-planned meanwhile).
      if (body.expectPlannedAt && plan.plannedAt && body.expectPlannedAt !== plan.plannedAt) {
        return NextResponse.json({ error: "The plan changed while you were reviewing (re-planned elsewhere) — review the current draft, then confirm.", plan }, { status: 409 });
      }
      const confirmed = await mutateMetricMap(g.proto.key, (cur) => {
        // Legacy upgrade: a plan confirmed before brief-freezing existed may
        // re-confirm once to freeze the contract (archiving the old stamp —
        // the new confirmedAt is honest about WHEN the brief was frozen).
        if (!cur || (cur.confirmed && cur.briefAtConfirm)) return null; // lost the race — theirs stands
        return {
          ...cur,
          confirmed: true,
          confirmedBy: actor,
          confirmedAt: new Date().toISOString(),
          pendingQuestions: undefined,
          // Legacy-upgrade re-confirm: the original stamp is archived, never erased.
          priorConfirmations: cur.confirmed && cur.confirmedAt
            ? [...(cur.priorConfirmations ?? []), { confirmedBy: cur.confirmedBy ?? "?", confirmedAt: cur.confirmedAt, briefAtConfirm: cur.briefAtConfirm }]
            : cur.priorConfirmations,
          // The brief AS IT READS NOW freezes into the plan — the
          // pre-registration anchor for externally-built prototypes (which
          // never cut/push a version to anchor to).
          briefAtConfirm: {
            change: g.proto.hypothesis.change ?? "",
            audience: g.proto.hypothesis.audience ?? "",
            outcome: g.proto.hypothesis.outcome ?? "",
            primary: g.proto.metrics.primary ?? "",
            guardrails: g.proto.metrics.guardrails ?? [],
          },
        };
      });
      if (!confirmed || confirmed.confirmedBy !== actor) {
        return NextResponse.json({ error: "Someone else confirmed the plan first — refresh to see it.", plan: confirmed }, { status: 409 });
      }
      await audit(g.orgId, actor, "measurement.confirmed", g.proto.name,
        confirmed.composites.map((c) => `${c.label} = ${c.events.join(" + ")}`).join(" · ").slice(0, 400));
      return NextResponse.json({ plan: confirmed });
    }

    return NextResponse.json({ error: "Nothing to do — pass plan or confirm." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
