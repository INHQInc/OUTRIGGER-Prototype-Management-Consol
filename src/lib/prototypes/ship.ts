/**
 * Ship a cut version into Optimizely by API — the end of the paste era.
 *
 * The prototype carries a binding to ONE experiment variation (set from the
 * Ship panel). Pushing:
 *   1. takes the latest cut version (immutable, SHA-pinned, certified),
 *   2. gates on its certification report (fails block unless overridden),
 *   3. replaces the variation's custom_code change via the REST API,
 *   4. reads the experiment back and verifies the stored code byte-matches,
 *   5. records the push (version, sha, verified) so the UI shows what's live.
 *
 * Never touches traffic: it edits a variation's code, it does not start,
 * pause, or publish the experiment. A human owns experiment state.
 */
import { getContentStore } from "../content/store";
import { getOptimizelyClientForOrg } from "../experimentation";
import { OptimizelyClient } from "../optimizely/api";
import { resolvePrototypeOrg } from "./org";
import { listArtifactVersions } from "./versions";
import { isBriefComplete } from "./types";
import { getCoverage, coverageGate } from "./coverage";
import { audit } from "../audit";

export interface PushResult {
  pushed: boolean;
  verified: boolean;
  version: number;
  gitSha: string;
  bytes: number;
  experimentId: string;
  variationId: string;
  certificationPassed?: boolean;
  overridden?: boolean;
  at: string;
}

const pushFlag = (key: string) => `optipush:${key}`;

export async function lastPush(prototypeKey: string): Promise<PushResult | null> {
  const raw = await (await getContentStore()).getFlag(pushFlag(prototypeKey));
  if (!raw) return null;
  try { return JSON.parse(raw) as PushResult; } catch { return null; }
}

export async function pushToOptimizely(prototypeKey: string, opts: { version?: number; override?: boolean; coverageAck?: boolean; actor?: string } = {}): Promise<PushResult> {
  const store = await getContentStore();
  const proto = await store.getPrototype(prototypeKey);
  if (!proto) throw new Error("Unknown prototype");
  const orgId = await resolvePrototypeOrg(proto);
  if (!orgId) throw new Error("This prototype has no owning customer.");
  if (!proto.experiment?.experimentId || !proto.experiment?.variationId) {
    throw new Error("No experiment bound — pick the Optimizely experiment and variation in the Ship panel first.");
  }
  if (!isBriefComplete(proto.brief, proto.metrics)) {
    throw new Error(!proto.brief.change?.trim()
      ? "No brief on record — describe the change before launching. It becomes the experiment's description."
      : "The brief has no success metric — set the one event that decides this experiment before launching.");
  }
  const client = await getOptimizelyClientForOrg(orgId);
  if (!client) throw new Error("Optimizely isn't connected for this customer (Settings → Experimentation).");

  // Any CUT version is shippable — that's the point of freezing them. Rollback
  // = pushing an older cut; same gates, run against THAT version's frozen cert.
  const versions = await listArtifactVersions(prototypeKey);
  const chosen = opts.version != null ? versions.find((v) => v.version === opts.version) : versions[0];
  if (opts.version != null && !chosen) throw new Error(`v${opts.version} is not a cut version of this prototype.`);
  if (!chosen?.variationJs) {
    throw new Error(chosen ? `v${chosen.version} carries no code snapshot — pick a cut that does.` : "No cut version with code — cut a version from the repo first.");
  }
  const rollback = versions[0] && chosen.version < versions[0].version;

  // The gate: a failed certification blocks the push unless explicitly overridden.
  const cert = chosen.certification;
  if (cert && !cert.passed && !opts.override) {
    const fails = cert.checks.filter((c) => c.level === "fail").map((c) => c.title).join(" · ");
    throw new Error(`Certification failed on v${chosen.version} (${fails}). Fix and re-cut, or push with an explicit override.`);
  }

  // Coverage: a WARN with teeth, not a hard block (certification is objective;
  // coverage review is human judgment — hard-gating arrives with role sign-offs).
  // Unreviewed or failing coverage demands an explicit acknowledgement, recorded.
  const coverage = await getCoverage(prototypeKey).catch(() => null);
  const covGate = coverageGate(coverage);
  const covProblem = covGate === "none" ? "no coverage spec has been generated"
    : covGate === "unreviewed" ? "core coverage scenarios are unreviewed"
    : covGate === "failing" ? "coverage has FAILING checks"
    : null;
  if (covProblem && !opts.coverageAck) {
    throw new Error(`COVERAGE_ACK_REQUIRED: ${covProblem} — review the Coverage tab, or acknowledge and push anyway (recorded in the audit log).`);
  }

  const { experimentId, variationId } = proto.experiment;

  // B2 rail: a running experiment is immutable. Pushing would swap the live
  // variation mid-test and corrupt the results. No override — pause it in
  // Optimizely first; that act is the human sign-off this rail exists to force.
  try {
    const status = (await client.getExperiment(experimentId)).status;
    if (status === "running") {
      throw new Error("This experiment is RUNNING. Pushing would change the live variation mid-test and corrupt results — pause it in Optimizely first, then push.");
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("RUNNING")) throw e;
    /* status unreadable → proceed; the push itself will surface real API errors */
  }

  const exp = await client.setVariationCustomCode(experimentId, variationId, chosen.variationJs);
  const stored = OptimizelyClient.customCodeOf(exp, variationId);
  const verified = stored === chosen.variationJs;

  const result: PushResult = {
    pushed: true,
    verified,
    version: chosen.version,
    gitSha: chosen.gitSha,
    bytes: Buffer.byteLength(chosen.variationJs, "utf8"),
    experimentId: String(experimentId),
    variationId: String(variationId),
    certificationPassed: cert?.passed,
    overridden: Boolean(opts.override && cert && !cert.passed),
    at: new Date().toISOString(),
  };
  await store.setFlag(pushFlag(prototypeKey), JSON.stringify(result));
  await audit(orgId, opts.actor ?? "system", "optimizely.push",
    `${prototypeKey} v${chosen.version} → exp ${experimentId}/var ${variationId}`,
    `${result.bytes.toLocaleString()} bytes · ${chosen.gitSha.slice(0, 7)} · read-back ${verified ? "VERIFIED" : "MISMATCH"}${result.overridden ? " · CERT OVERRIDDEN" : ""}${covProblem ? ` · COVERAGE ACK (${covProblem})` : ""}${rollback ? ` · ROLLBACK (latest is v${versions[0].version})` : ""}`);

  if (!verified) throw new Error("Pushed, but the read-back did not byte-match what Optimizely stored. Re-open the variation in Optimizely and inspect before publishing.");
  return result;
}
