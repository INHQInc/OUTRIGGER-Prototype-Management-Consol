import { readFeatureFile, resolveInjectionFile } from "../features/registry";
import type { FeatureManifest, Injection } from "../features/types";
import { resolveFeature, type ResolveResult } from "./resolve";

/**
 * The handoff is what a dev integrates natively into the Optimizely CMS.
 * We prototype in HTML/CSS/JS, so we ship exactly those three — each mapped to
 * WHERE it slots into their source. We do NOT generate C# content types; making
 * a feature an editor-managed CMS block is a separate call their devs own.
 */

export type PieceKind = "html" | "css" | "js";

export interface HandoffPiece {
  kind: PieceKind;
  /** The prototype code to integrate. */
  code: string;
  /** Resolved location in their repo, or null if it needs a dev decision. */
  targetFile: string | null;
  /** Human label for the target. */
  targetLabel: string;
  /** How it integrates (for HTML: insert mode + anchor). */
  placement: string;
  confidence: "high" | "medium" | "low";
  note?: string;
}

export interface HandoffPackage {
  featureKey: string;
  featureName: string;
  summary: string;
  primaryBlock: string | null;
  resolution: ResolveResult;
  pieces: HandoffPiece[];
  warnings: string[];
}

function placementText(inj: Injection): string {
  const sel = inj.selector ?? "";
  const mode = inj.mode ?? "after";
  if (sel === "body" && mode === "append") return "at the end of the page body";
  if (sel === "body" && mode === "prepend") return "at the start of the page body";
  if (sel === "head") return "in the document <head>";
  const modeWord: Record<string, string> = {
    after: "immediately after", before: "immediately before",
    prepend: "as the first child of", append: "as the last child of", replace: "replacing",
  };
  return `${modeWord[mode] ?? "after"} the element matching \`${sel}\``;
}

export async function buildHandoff(feature: FeatureManifest): Promise<HandoffPackage> {
  const resolution = await resolveFeature(feature);
  const warnings: string[] = [...resolution.notes];
  const pieces: HandoffPiece[] = [];

  // --- HTML piece(s): each html injection → the resolved owning Razor view ---
  const htmlInjections = feature.injections.filter((i) => i.type === "html");
  for (const inj of htmlInjections) {
    const file = resolveInjectionFile(inj);
    const code = file ? await readFeatureFile(feature.key, file) : null;
    if (code == null) continue;
    const anchor = resolution.anchors.find((a) => a.selector === inj.selector);
    const target = anchor?.candidates[0];
    pieces.push({
      kind: "html",
      code,
      targetFile: target ? target.file : null,
      targetLabel: target
        ? `Razor view of ${target.block} (renders the anchor)`
        : "a dev decides which Razor view/template owns this area",
      placement: `Add this markup ${placementText(inj)}.`,
      confidence: anchor?.confidence ?? "low",
      note: target
        ? undefined
        : "Anchor didn't resolve to a single block — likely a page template or layout; confirm with a dev.",
    });
  }

  // --- CSS piece ---
  const css = await readFeatureFile(feature.key, "overlay.css");
  if (css) {
    pieces.push({
      kind: "css",
      code: css,
      targetFile: `wwwroot/assets/scss/ (their SCSS pipeline)`,
      targetLabel: "Their SCSS/asset pipeline",
      placement: "Add these rules to their stylesheet build (selectors are namespaced, so no collisions).",
      confidence: "medium",
      note: "Exact SCSS path depends on their webpack/sass setup — confirm the styles entry location.",
    });
  }

  // --- JS piece ---
  const js = await readFeatureFile(feature.key, "overlay.js");
  if (js) {
    pieces.push({
      kind: "js",
      code: js,
      targetFile: `Features/**/*.ts (their script build)`,
      targetLabel: "Their TypeScript/JS build",
      placement: "Port this behavior into their module build (webpack globs Features/**/*.ts).",
      confidence: "medium",
      note: "Behavior is dependency-free; adapt to their module conventions.",
    });
  }

  const summary =
    resolution.kind === "new-block" && resolution.primaryBlock
      ? `Front-end feature — integrate near "${resolution.primaryBlock}". Ship the HTML into that area's Razor view, the CSS into the SCSS build, the JS into the script build.`
      : "Front-end feature — integrate the HTML/CSS/JS into the relevant template and asset builds (owning template needs a dev decision).";

  return {
    featureKey: feature.key,
    featureName: feature.name,
    summary,
    primaryBlock: resolution.primaryBlock,
    resolution,
    pieces,
    warnings,
  };
}
