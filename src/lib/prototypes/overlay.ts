/**
 * Prototype overlay code: author, persist, and compile to the self-contained
 * variation JS (shared engine with the legacy feature export). This variation
 * is what the loader injects on staging and what ships into the Optimizely
 * experiment on production — one artifact, both surfaces.
 */
import { getContentStore } from "../content/store";
import { renderVariationJs, lintSelector, type LintFinding, type VariationBlock } from "../optimizely/export";
import type { PrototypeOverlay, OverlayBlock } from "./types";

export async function getPrototypeOverlay(prototypeKey: string): Promise<PrototypeOverlay | null> {
  return (await getContentStore()).getPrototypeOverlay(prototypeKey);
}

export async function savePrototypeOverlay(prototypeKey: string, siteKey: string, input: { css?: string; js?: string; blocks?: OverlayBlock[] }): Promise<PrototypeOverlay> {
  const overlay: PrototypeOverlay = {
    prototypeKey,
    siteKey,
    css: input.css ?? "",
    js: input.js ?? "",
    blocks: (input.blocks ?? [])
      .filter((b) => b.selector?.trim() && b.html?.trim())
      .map((b) => ({ selector: b.selector.trim(), mode: b.mode, html: b.html })),
    updatedAt: new Date().toISOString(),
  };
  await (await getContentStore()).putPrototypeOverlay(overlay);
  return overlay;
}

export interface OverlayVariation {
  variationJs: string;
  css: string;
  lint: LintFinding[];
  bytes: number;
  isEmpty: boolean;
}

/** Compile an overlay to injectable variation JS + selector lint. */
export function buildOverlayVariation(prototypeKey: string, overlay: PrototypeOverlay | null): OverlayVariation {
  const lint: LintFinding[] = [];
  const blocks: VariationBlock[] = (overlay?.blocks ?? []).map((b) => {
    lint.push(...lintSelector(b.selector));
    return { selector: b.selector, mode: b.mode, html: b.html };
  });
  const css = overlay?.css ?? "";
  const js = overlay?.js ?? "";
  const isEmpty = !css.trim() && !js.trim() && blocks.length === 0;
  const variationJs = renderVariationJs(prototypeKey, css, blocks, js);
  return { variationJs, css, lint, bytes: Buffer.byteLength(variationJs), isEmpty };
}
