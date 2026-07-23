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

export async function pushToOptimizely(prototypeKey: string, opts: { override?: boolean; actor?: string } = {}): Promise<PushResult> {
  const store = await getContentStore();
  const proto = await store.getPrototype(prototypeKey);
  if (!proto) throw new Error("Unknown prototype");
  const orgId = await resolvePrototypeOrg(proto);
  if (!orgId) throw new Error("This prototype has no owning customer.");
  if (!proto.experiment?.experimentId || !proto.experiment?.variationId) {
    throw new Error("No experiment bound — pick the Optimizely experiment and variation in the Ship panel first.");
  }
  const client = await getOptimizelyClientForOrg(orgId);
  if (!client) throw new Error("Optimizely isn't connected for this customer (Settings → Experimentation).");

  const versions = await listArtifactVersions(prototypeKey);
  const latest = versions[0];
  if (!latest?.variationJs) throw new Error("No cut version with code — cut a version from the repo first.");

  // The gate: a failed certification blocks the push unless explicitly overridden.
  const cert = latest.certification;
  if (cert && !cert.passed && !opts.override) {
    const fails = cert.checks.filter((c) => c.level === "fail").map((c) => c.title).join(" · ");
    throw new Error(`Certification failed (${fails}). Fix and re-cut, or push with an explicit override.`);
  }

  const { experimentId, variationId } = proto.experiment;
  const exp = await client.setVariationCustomCode(experimentId, variationId, latest.variationJs);
  const stored = OptimizelyClient.customCodeOf(exp, variationId);
  const verified = stored === latest.variationJs;

  const result: PushResult = {
    pushed: true,
    verified,
    version: latest.version,
    gitSha: latest.gitSha,
    bytes: Buffer.byteLength(latest.variationJs, "utf8"),
    experimentId: String(experimentId),
    variationId: String(variationId),
    certificationPassed: cert?.passed,
    overridden: Boolean(opts.override && cert && !cert.passed),
    at: new Date().toISOString(),
  };
  await store.setFlag(pushFlag(prototypeKey), JSON.stringify(result));
  await audit(orgId, opts.actor ?? "system", "optimizely.push",
    `${prototypeKey} v${latest.version} → exp ${experimentId}/var ${variationId}`,
    `${result.bytes.toLocaleString()} bytes · ${latest.gitSha.slice(0, 7)} · read-back ${verified ? "VERIFIED" : "MISMATCH"}${result.overridden ? " · CERT OVERRIDDEN" : ""}`);

  if (!verified) throw new Error("Pushed, but the read-back did not byte-match what Optimizely stored. Re-open the variation in Optimizely and inspect before publishing.");
  return result;
}
