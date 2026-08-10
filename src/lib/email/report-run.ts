/**
 * SENDING ONE PROTOTYPE'S READOUT.
 *
 * ONE path, used by the "Email this" button AND by the weekly sweep. Two code
 * paths would drift, and the difference would only ever be discovered by
 * whoever received the wrong one.
 *
 * The reading is used AS CACHED and never generated here: a scheduled job that
 * can trigger an Opus call per prototype is a job that can quietly cost real
 * money at 6am, and a digest is a report on the current state, not a reason to
 * recompute it.
 */
import { getOptimizelyClientForOrg } from "../experimentation";
import {
  normalizeResults, getMetricMap, resolveDecisionMap, supportingKeys, optiPrimaryKeyOf,
  type ExperimentResults,
} from "../prototypes/results";
import { computeStatsReport } from "../prototypes/stats";
import { getVerdict } from "../prototypes/verdict";
import { getReading } from "../prototypes/notebook";
import { getReportSettings, mutateReportSettings } from "../prototypes/report";
import { validRecipients, sendEmail } from "./send";
import { renderReadoutEmail } from "./readout";
import { buildReadoutModel } from "../prototypes/readout-model";
import type { PrototypeRecord } from "../prototypes/types";

export async function sendReadoutEmail(opts: {
  orgId: string;
  proto: PrototypeRecord;
  /** Overrides the saved list — the button's "send to just these" case. */
  to?: string[];
  baseUrl?: string;
}): Promise<{ sent: number; to: string[]; subject: string }> {
  const settings = await getReportSettings(opts.proto.key);
  const to = validRecipients(opts.to?.length ? opts.to : settings.recipients);
  if (!to.length) throw new Error("No recipients — add at least one address first.");

  const experimentId = opts.proto.experiment?.experimentId;
  if (!experimentId) throw new Error("This prototype has no experiment bound, so there is nothing to report.");

  const client = await getOptimizelyClientForOrg(opts.orgId);
  if (!client) throw new Error("Optimizely isn't connected for this customer.");
  const raw = await client.getExperimentResults(experimentId);
  const results: ExperimentResults | null = normalizeResults(raw);
  if (!results) throw new Error("Optimizely returned no readable results, so there is nothing to send.");

  const stored = await getMetricMap(opts.proto.key);
  // The RESOLVED map is what the statistics are computed against; the STORED
  // plan is what the model interprets. Keeping them separate is what stops
  // Optimizely's synthesized composite ever reaching a write path.
  const { map: resolved, source: decisionSource } = resolveDecisionMap(stored, results);
  const stats = computeStatsReport({
    results, map: resolved,
    focusVariationId: opts.proto.experiment?.variationId,
    experimentStart: results.startTime,
  });
  const [verdict, reading] = await Promise.all([
    getVerdict(opts.proto.key),
    getReading(opts.proto.key),
  ]);

  const supporting = supportingKeys({
    map: resolved,
    optiPrimaryKey: optiPrimaryKeyOf(results),
    decisionKey: stats.primaryKey,
    available: stats.metrics.map((m) => m.key),
    order: stored?.measureOrder ?? [],
    optiRowIsDecision: decisionSource === "optimizely",
  });

  // ── THE MODEL. Every interpretive question — direction, settled vs
  //    significant, beyond-luck after FDR, guardrail state, composite units,
  //    one-arm adoption, valence — is answered here rather than in the
  //    renderer, and answered identically for the page.
  const decisionComposite = resolved?.composites.find((c) => c.role === "primary");
  const model = buildReadoutModel({
    prototypeName: opts.proto.name,
    prototypeKey: opts.proto.key,
    results, stats, verdict, reading,
    plan: stored,
    decision: decisionComposite
      ? {
          key: stats.primaryKey ?? `composite:${decisionComposite.id}`,
          label: decisionComposite.label,
          source: decisionSource === "optimizely" ? "optimizely" : "console",
          direction: decisionComposite.direction,
          directionDeclared: Boolean(decisionComposite.direction),
        }
      : null,
    // The server has no optimistic state — it passes what is stored.
    observed: stored?.observed ?? [],
    roles: stored?.roles ?? {},
    order: stored?.measureOrder ?? [],
    hidden: stored?.unfeatured ?? [],
    experimentStatus: null,
    now: Date.parse(stats.computedAt),
  });

  const { subject, html, text } = renderReadoutEmail({
    prototypeName: opts.proto.name,
    prototypeKey: opts.proto.key,
    url: opts.baseUrl ? `${opts.baseUrl}/prototypes/${encodeURIComponent(opts.proto.key)}?tab=analytics` : undefined,
    results, stats, verdict, reading, map: resolved, supporting, model,
  });

  let out: Awaited<ReturnType<typeof sendEmail>>;
  try {
    out = await sendEmail({ to, subject, html, text });
  } catch (e) {
    // The failure is RECORDED, so a schedule that has been failing for a month
    // is visible in the app rather than only in a log nobody reads.
    await mutateReportSettings(opts.proto.key, (cur) => ({ ...cur, lastError: (e as Error).message.slice(0, 300) }));
    throw e;
  }

  // PARTIAL SUCCESS IS NOT SUCCESS. One bad address among five must not report
  // a clean send — the person who didn't get it is exactly who nobody notices.
  const partial = out.failed.length
    ? `${out.failed.length} of ${to.length} didn't go out — ${out.failed.map((f) => `${f.to}: ${f.error}`).join("; ")}`
    : undefined;

  await mutateReportSettings(opts.proto.key, (cur) => ({
    ...cur,
    lastSentAt: new Date().toISOString(),
    lastSentTo: out.accepted,
    lastError: partial,
  }));
  return { sent: out.accepted.length, to: out.accepted, subject, ...(partial ? { warning: partial } : {}) };
}
