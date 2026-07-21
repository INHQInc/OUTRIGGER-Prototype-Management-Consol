/**
 * Create a paused Optimizely draft experiment for a production promotion, using
 * the BRAND's stored credentials + selected project (not env vars). Safety rail:
 * the experiment is created in draft/paused state — no traffic goes live.
 *
 * Variation code: store prototypes don't carry overlay code yet (the overlay-
 * authoring gap). Until that lands, the experiment is created as a paused shell
 * pinned to the version's commit — a human wires the variation, or a later
 * deploy step attaches it. The linkage (experiment id/url) is recorded either
 * way, which is the traceability spine this phase is about.
 */
import { OptimizelyClient } from "../optimizely/api";
import { getExperimentationConfig } from "../experimentation";
import type { Environment } from "../environments";
import type { PrototypeRecord, ArtifactVersion } from "../prototypes/types";

export interface OptimizelyPromotionResult {
  experimentId: string;
  experimentUrl: string;
  detail: string;
}

export async function promoteToOptimizely(input: {
  orgId: string;
  proto: PrototypeRecord;
  version: ArtifactVersion;
  env: Environment;
}): Promise<OptimizelyPromotionResult> {
  const { orgId, proto, version, env } = input;

  const cfg = await getExperimentationConfig(orgId);
  const token = cfg?.optimizely?.apiToken;
  if (!token) throw new Error("Connect Optimizely in Settings → Experimentation before promoting to production.");
  const projectId = cfg.optimizely?.defaultProjectId;
  if (!projectId) throw new Error("Select a default Optimizely project in Settings → Experimentation first.");

  const target = proto.targets[0];
  if (!target?.url) throw new Error("Add a target page to the prototype before promoting to production.");

  let pathSubstring: string;
  let editUrl: string;
  try {
    const u = new URL(target.url);
    pathSubstring = u.pathname === "/" ? "/" : u.pathname;
    editUrl = new URL(u.pathname + u.search, env.url).toString(); // target path on THIS environment
  } catch {
    pathSubstring = target.url;
    editUrl = env.url;
  }

  const client = new OptimizelyClient(token, projectId);
  const page = await client.createPage(`${proto.name} — ${pathSubstring}`, editUrl, pathSubstring);

  // Ship the code SNAPSHOTTED into the promoted version (immutable — build once,
  // promote unchanged). The version's code is pulled from the feature repo when
  // it's cut; if a version has none, guide the user to cut it from the repo.
  let variationJs = version.variationJs;
  const hasCode = Boolean(variationJs);
  if (!variationJs) {
    variationJs = `/* OPMC ${proto.key} · v${version.version} · ${version.gitSha} */\n/* No built variation on this version — cut it from the repo, then re-promote. */`;
  }

  const experiment = await client.createDraftExperiment({
    name: `${proto.name} (v${version.version})`,
    description: `OPMC promotion of ${proto.key} v${version.version} (${version.gitSha}). Draft/paused — no traffic.`,
    pageId: page.id,
    variantName: `v${version.version}`,
    variationJs,
  });

  return {
    experimentId: String(experiment.id),
    experimentUrl: client.experimentAppUrl(experiment.id),
    detail: hasCode
      ? "Paused draft experiment created with the version's built code — review, then start it in Optimizely."
      : "Paused draft created, but this version has no built code — cut a version from the repo, then re-promote.",
  };
}
