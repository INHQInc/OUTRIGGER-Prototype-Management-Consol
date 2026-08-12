/**
 * SENDING A REPORT.
 *
 * ONE path, used by the scheduled sweep AND by Send now. Two code paths would
 * drift, and the difference would only ever be discovered by whoever received
 * the wrong one.
 *
 * PHASE 1 COVERS ONE EXPERIMENT PER REPORT. A report whose scope resolves to
 * several sends the FIRST and records the rest as skipped, because the digest
 * renderer does not exist yet and inventing one here would fork the readout —
 * `docs/READOUT-MODEL.md` lists the eleven defects the last fork produced. The
 * UI refuses to save a multi-prototype scope for the same reason, so this is a
 * belt-and-braces floor rather than a path anyone reaches.
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
import { renderReadoutEmail } from "../email/readout";
import { validRecipients, sendEmail } from "../email/send";
import { getContentStore } from "../content/store";
import { resolvePrototypeOrg } from "../prototypes/org";
import { audienceOf, receiving } from "./store";
import type { Report, ReportRun } from "./types";
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
async function buildFor(orgId: string, proto: PrototypeRecord) {
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
      hidden: stored?.unfeatured ?? [],
      experimentStatus: null,
      now: Date.parse(stats?.computedAt ?? results?.fetchedAt ?? "") || 0,
    });

    if (model.empty) return { unavailable: "no readable results yet" as const };
    return { model, results, stats, verdict, reading, resolved, supporting, frozen: model.fromFrozenSnapshot };
  } catch (e) {
    return { unavailable: (e as Error).message.slice(0, 120) };
  }
}

export interface SendOutcome {
  accepted: string[];
  failures: { to: string; error: string }[];
  entries: NonNullable<ReportRun["entries"]>;
  subject: string;
}

export async function runReport(opts: {
  report: Report;
  baseUrl?: string;
  /** Overrides the audience — the "send just to me" case. Never persisted. */
  to?: string[];
}): Promise<SendOutcome> {
  const r = opts.report;
  const people = opts.to?.length ? opts.to : receiving(await audienceOf(r)).map((p) => p.email);
  const to = validRecipients(people);
  if (!to.length) throw new Error("Nobody on this report's audience is receiving — add someone first.");

  const protos = await resolveScope(r);
  if (!protos.length) throw new Error("This report covers no experiments right now.");

  const entries: NonNullable<ReportRun["entries"]> = [];
  let payload: { subject: string; html: string; text: string } | null = null;

  for (const proto of protos) {
    if (payload) {
      // See the header: the digest renderer is Phase 2.
      entries.push({ key: proto.key, name: proto.name, state: "skipped", reason: "one experiment per report until the digest ships" });
      continue;
    }
    const built = await buildFor(r.orgId, proto);
    if ("unavailable" in built) {
      entries.push({ key: proto.key, name: proto.name, state: "unavailable", reason: built.unavailable });
      continue;
    }
    entries.push({ key: proto.key, name: proto.name, state: built.frozen ? "frozen" : "ok" });
    const rendered = renderReadoutEmail({
      prototypeName: proto.name,
      prototypeKey: proto.key,
      url: opts.baseUrl ? `${opts.baseUrl}/prototypes/${encodeURIComponent(proto.key)}?tab=analytics` : undefined,
      results: built.results!, stats: built.stats, verdict: built.verdict, reading: built.reading,
      map: built.resolved, supporting: built.supporting, model: built.model,
    });
    // THE REPORT'S NAME IS THE SUBJECT. Stable across weeks so the series
    // threads as one conversation; the readout's own subject would churn with
    // the experiment name.
    payload = { ...rendered, subject: r.name };
  }

  if (!payload) {
    const why = entries.map((e) => `${e.name}: ${e.reason}`).join("; ");
    throw new Error(`Nothing could be read for this report — ${why || "no experiments returned results"}.`);
  }

  const out = await sendEmail({ to, subject: payload.subject, html: payload.html, text: payload.text });
  return { accepted: out.accepted, failures: out.failed, entries, subject: payload.subject };
}
