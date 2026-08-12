/**
 * BUILDING ONE EXPERIMENT'S READOUT — separated from sending on purpose.
 *
 * The public readout page (`/r/[token]`) needs exactly this and nothing else.
 * Left inside `run.ts` it would have dragged the whole send path — and, once
 * the PDF ships, a 72 MB Chromium — into an unauthenticated route that only
 * ever renders HTML. See docs/READOUT-PDF-DESIGN.md.
 */
import { getOptimizelyClientForOrg } from "../experimentation";
import {
  normalizeResults, getMetricMap, resolveDecisionMap, supportingKeys, optiPrimaryKeyOf,
  type ExperimentResults,
} from "../prototypes/results";
import { computeStatsReport } from "../prototypes/stats";
import { getVerdict } from "../prototypes/verdict";
import { getReading } from "../prototypes/notebook";
import { buildReadoutModel } from "../prototypes/readout-model";
import { getContentStore } from "../content/store";
import { resolvePrototypeOrg } from "../prototypes/org";
import type { Report } from "./types";
import type { PrototypeRecord } from "../prototypes/types";

/** The experiments a report covers, right now. `all-live` is resolved at send
 *  time on purpose — a report that keeps up with the programme is the point. */
export async function resolveScope(r: Report): Promise<PrototypeRecord[]> {
  const all = await (await getContentStore()).listPrototypes();
  const mine: PrototypeRecord[] = [];
  for (const p of all) {
    if ((await resolvePrototypeOrg(p)) !== r.orgId) continue;
    if (r.scope.mode === "selected") { if (r.scope.keys.includes(p.key)) mine.push(p); }
    else if (p.experiment?.experimentId) mine.push(p);
  }
  return mine;
}

/**
 * Build one experiment's readout. NEVER THROWS — an unreadable Optimizely
 * response must cost that entry, not the whole report. The frozen-snapshot
 * fallback inside `buildReadoutModel` covers a stamped run whose fetch failed.
 */
export async function buildFor(orgId: string, proto: PrototypeRecord) {
  try {
    const experimentId = proto.experiment?.experimentId;
    if (!experimentId) return { unavailable: "no experiment is bound" as const };

    const client = await getOptimizelyClientForOrg(orgId);
    if (!client) return { unavailable: "Optimizely isn't connected" as const };

    let results: ExperimentResults | null = null;
    try {
      results = normalizeResults(await client.getExperimentResults(experimentId));
    } catch {
      results = null; // buildReadoutModel falls back to the frozen snapshot
    }

    const stored = await getMetricMap(proto.key);
    const { map: resolved, source: decisionSource } = resolveDecisionMap(stored, results);
    const stats = results
      ? computeStatsReport({ results, map: resolved, focusVariationId: proto.experiment?.variationId, experimentStart: results.startTime })
      : null;
    const [verdict, reading] = await Promise.all([getVerdict(proto.key), getReading(proto.key)]);

    const supporting = supportingKeys({
      map: resolved,
      optiPrimaryKey: optiPrimaryKeyOf(results),
      decisionKey: stats?.primaryKey,
      available: (stats?.metrics ?? []).map((m) => m.key),
      order: stored?.measureOrder ?? [],
      optiRowIsDecision: decisionSource === "optimizely",
    });

    const decisionComposite = resolved?.composites.find((c) => c.role === "primary");
    const model = buildReadoutModel({
      prototypeName: proto.name,
      prototypeKey: proto.key,
      results, stats, verdict, reading,
      plan: stored,
      decision: decisionComposite
        ? {
            key: stats?.primaryKey ?? `composite:${decisionComposite.id}`,
            label: decisionComposite.label,
            source: decisionSource === "optimizely" ? "optimizely" : "console",
            direction: decisionComposite.direction,
            directionDeclared: Boolean(decisionComposite.direction),
          }
        : null,
      observed: stored?.observed ?? [],
      roles: stored?.roles ?? {},
      order: stored?.measureOrder ?? [],
      // BOTH HIDE LISTS. `hiddenMeasures` is what the eye toggle writes; `unfeatured`
      // is the older "keep it out of the top line" mark. `supportingKeys` reads the
      // first and the model was fed only the second, so a metric you had visibly
      // hidden stayed eligible to lead a movement or the headline — hidden from the
      // index and still speaking for the experiment.
      hidden: [...new Set([...(stored?.unfeatured ?? []), ...(stored?.hiddenMeasures ?? [])])],
      experimentStatus: null,
      now: Date.parse(stats?.computedAt ?? results?.fetchedAt ?? "") || 0,
    });

    if (model.empty) return { unavailable: "no readable results yet" as const };
    return { model, results, stats, verdict, reading, resolved, supporting, frozen: model.fromFrozenSnapshot };
  } catch (e) {
    return { unavailable: (e as Error).message.slice(0, 120) };
  }
}

