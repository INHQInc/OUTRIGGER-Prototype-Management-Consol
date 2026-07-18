import type { FeatureManifest } from "../features/types";
import { buildVariationExport } from "./export";
import { createPage, createDraftExperiment, experimentAppUrl } from "./api";

export interface PromoteResult {
  experimentId: number;
  status: string;
  appUrl: string;
  pageId: number;
  variations: { variation_id: number; name: string }[];
  lintErrors: string[];
}

function pathFrom(url: string): string {
  try { return new URL(url).pathname.replace(/\/$/, "") || "/"; } catch { return url; }
}

/**
 * Promote a prototype to a PAUSED Optimizely experiment in the configured
 * project. Creates a Page (URL targeting) + a draft A/B experiment whose
 * variant runs our variation JS. Never starts it — a human does that.
 */
export async function promoteFeature(feature: FeatureManifest): Promise<PromoteResult> {
  const exp = await buildVariationExport(feature);
  const lintErrors = exp.lint.filter((l) => l.level === "error").map((l) => l.message);
  if (lintErrors.length) {
    throw new Error(`Fix these before promoting: ${lintErrors.join("; ")}`);
  }

  const liveUrl = feature.liveUrls?.[0];
  if (!liveUrl) throw new Error("Feature has no liveUrls — set the URL(s) the experiment targets.");
  const pathSubstring = pathFrom(liveUrl);

  const page = await createPage(
    `OPMC — ${feature.name} target`,
    liveUrl,
    pathSubstring
  );

  const experiment = await createDraftExperiment({
    name: `OPMC — ${feature.name}`,
    description: `Prototype "${feature.key}" from the Outrigger Prototype Console. Paused draft — review and start in Optimizely.`,
    pageId: page.id,
    variantName: feature.name,
    variationJs: exp.variationJs,
  });

  return {
    experimentId: experiment.id,
    status: experiment.status,
    appUrl: experimentAppUrl(experiment.id),
    pageId: page.id,
    variations: (experiment.variations ?? []).map((v) => ({ variation_id: v.variation_id, name: v.name })),
    lintErrors,
  };
}
