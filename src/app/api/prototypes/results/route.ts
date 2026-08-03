import { NextRequest, NextResponse } from "next/server";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { getOptimizelyClientForOrg } from "@/lib/experimentation";
import { normalizeResults, getMetricMap, setMetricMap, type ExperimentResults, type CompositeMetric } from "@/lib/prototypes/results";
import { proposeMetricMap, analyzeResults } from "@/lib/ai/results";
import { resolveRepoSource } from "@/lib/prototypes/source";
import { listArtifactVersions } from "@/lib/prototypes/versions";
import { currentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";

export const maxDuration = 60;

/**
 * Experiment results + the metric-semantics layer. Session-only (the
 * analyst spends console API credit; results are org analytics).
 *
 * GET  ?key=                     → { results | null, resultsError?, metricMap }
 * POST { key, propose: true }    → Claude proposes the composite mapping
 *                                  (grounded in brief + built code + the
 *                                  ACTUAL event names) — stored unconfirmed
 * POST { key, confirm: {composites} } → human confirms/edits the mapping
 * POST { key, ask: "…" }         → the analyst answers a question
 * POST { key, explain: true }    → the honest readout
 */
async function fetchResults(orgId: string, experimentId?: string): Promise<{ results: ExperimentResults | null; error?: string }> {
  if (!experimentId) return { results: null, error: "No experiment bound yet — bind it in Experiment → Ship." };
  const client = await getOptimizelyClientForOrg(orgId);
  if (!client) return { results: null, error: "Optimizely isn't connected for this customer." };
  try {
    const raw = await client.getExperimentResults(experimentId);
    const results = normalizeResults(raw);
    if (!results) return { results: null, error: "Optimizely returned no readable results yet — usually means no traffic so far." };
    return { results };
  } catch (e) {
    return { results: null, error: e instanceof Error ? e.message : "Couldn't reach Optimizely results." };
  }
}

export async function GET(req: NextRequest) {
  const g = await guardPrototypeAccess(req.nextUrl.searchParams.get("key"), req.headers.get("authorization"), { tokenAllowed: false });
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const [{ results, error }, metricMap] = await Promise.all([
    fetchResults(g.orgId, g.proto.experiment?.experimentId),
    getMetricMap(g.proto.key),
  ]);
  return NextResponse.json({ results, resultsError: error, metricMap });
}

export async function POST(req: NextRequest) {
  let body: { key?: string; propose?: boolean; confirm?: { composites?: unknown }; ask?: string; explain?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const g = await guardPrototypeAccess(body.key ?? null, req.headers.get("authorization"), { tokenAllowed: false });
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const user = await currentUser();
  const actor = user?.name ?? user?.sub ?? "user";

  try {
    if (body.propose) {
      const { results, error } = await fetchResults(g.orgId, g.proto.experiment?.experimentId);
      if (!results) return NextResponse.json({ error: error ?? "No results to map yet." }, { status: 400 });
      // Grounding evidence: the built code shows which elements fire what.
      const source = await resolveRepoSource(g.proto.key).catch(() => null);
      const variationJs = source?.found ? source.variationJs ?? null : (await listArtifactVersions(g.proto.key).catch(() => []))[0]?.variationJs ?? null;
      const composites = await proposeMetricMap({ proto: g.proto, variationJs, eventNames: results.metrics.map((m) => m.name) });
      const map = { composites, proposedBy: "claude (analyst)", confirmed: false };
      await setMetricMap(g.proto.key, map);
      await audit(g.orgId, actor, "results.map-proposed", g.proto.name, composites.map((c) => `${c.label} = ${c.events.join(" + ")}`).join(" · ").slice(0, 400));
      return NextResponse.json({ metricMap: map, results });
    }

    if (body.confirm) {
      const raw = Array.isArray(body.confirm.composites) ? body.confirm.composites : [];
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
        composites.push({ id, label, events: [...new Set(events)].slice(0, 10), role: o.role === "guardrail" ? "guardrail" : o.role === "info" ? "info" : "primary", note: typeof o.note === "string" ? o.note.trim().slice(0, 300) || undefined : undefined });
      }
      if (!composites.length) return NextResponse.json({ error: "Nothing to confirm — a composite needs a label and at least one event." }, { status: 400 });
      const map = { composites: composites.slice(0, 12), confirmed: true, confirmedBy: actor, confirmedAt: new Date().toISOString() };
      await setMetricMap(g.proto.key, map);
      await audit(g.orgId, actor, "results.map-confirmed", g.proto.name, composites.map((c) => `${c.label} = ${c.events.join(" + ")}`).join(" · ").slice(0, 400));
      return NextResponse.json({ metricMap: map });
    }

    if (body.ask !== undefined || body.explain) {
      const { results, error } = await fetchResults(g.orgId, g.proto.experiment?.experimentId);
      if (!results) return NextResponse.json({ error: error ?? "No results yet." }, { status: 400 });
      const map = await getMetricMap(g.proto.key);
      const answer = await analyzeResults({ proto: g.proto, results, map, question: body.explain ? undefined : String(body.ask ?? "") });
      return NextResponse.json({ answer, results });
    }

    return NextResponse.json({ error: "Nothing to do — pass propose, confirm, ask, or explain." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
