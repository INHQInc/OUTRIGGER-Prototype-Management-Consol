import type { FeatureManifest } from "../features/types";
import { readFeatureFile, resolveInjectionFile } from "../features/registry";

export interface LintFinding {
  level: "error" | "warn" | "info";
  message: string;
  selector?: string;
}

export interface VariationExport {
  featureKey: string;
  featureName: string;
  /** Self-contained JS to paste into an Optimizely Web variation's custom code. */
  variationJs: string;
  /** Raw CSS (Optimizely also accepts a dedicated CSS field). */
  css: string;
  /** Live URL activation targets. */
  liveUrls: string[];
  lint: LintFinding[];
  bytes: number;
}

/**
 * Heuristic robustness lint for injection selectors. The clone DOM is frozen
 * and known; the live DOM is dynamic, so brittle anchors that work in preview
 * can fail in the experiment. Flag them before promotion.
 */
function lintSelector(selector: string | undefined): LintFinding[] {
  const out: LintFinding[] = [];
  if (!selector) return out;
  if (/\s>\s|\+|~/.test(selector) || selector.split(/\s+/).length >= 4) {
    out.push({ level: "warn", selector, message: "Deep/combinator selector — fragile if the live DOM shifts. Prefer a single stable class or data attribute." });
  }
  if (/#[A-Za-z0-9_-]*\d{4,}/.test(selector) || /[a-f0-9]{6,}/.test(selector)) {
    out.push({ level: "warn", selector, message: "Selector looks auto-generated/hashed — likely to change between deploys of the live site." });
  }
  if (/^\s*(div|span|section)\s*$/.test(selector)) {
    out.push({ level: "error", selector, message: "Bare tag selector matches too broadly on live — will target the wrong element." });
  }
  if (/nth-child|nth-of-type/.test(selector)) {
    out.push({ level: "warn", selector, message: "Positional selector (nth-*) breaks when the live page adds/reorders siblings." });
  }
  return out;
}

/** JS-string-safe embedding of arbitrary file content. */
function embed(s: string): string {
  return JSON.stringify(s);
}

export async function buildVariationExport(feature: FeatureManifest): Promise<VariationExport> {
  const lint: LintFinding[] = [];
  let css = "";
  const htmlBlocks: { selector: string; mode: string; html: string }[] = [];
  let js = "";

  for (const inj of feature.injections) {
    const file = resolveInjectionFile(inj);
    if (inj.type === "css") {
      const content = file ? await readFeatureFile(feature.key, file) : null;
      if (content == null) { lint.push({ level: "error", message: `Missing CSS file: ${file}` }); continue; }
      css += (css ? "\n" : "") + content;
    } else if (inj.type === "js") {
      const content = file ? await readFeatureFile(feature.key, file) : null;
      if (content == null) { lint.push({ level: "error", message: `Missing JS file: ${file}` }); continue; }
      js += (js ? "\n" : "") + content;
    } else if (inj.type === "html") {
      if (!inj.selector) { lint.push({ level: "error", message: `HTML injection has no anchor selector (fragment ${inj.fragment})` }); continue; }
      const content = file ? await readFeatureFile(feature.key, file) : null;
      if (content == null) { lint.push({ level: "error", message: `Missing fragment: ${inj.fragment}` }); continue; }
      lint.push(...lintSelector(inj.selector));
      htmlBlocks.push({ selector: inj.selector, mode: inj.mode ?? "after", html: content });
    }
  }

  if (!feature.liveUrls?.length) {
    lint.push({ level: "info", message: "No liveUrls set — the experiment will need URL targeting configured manually in Optimizely." });
  }

  const key = feature.key;
  const variationJs = `/* Optimizely Web variation — generated from feature "${key}" by Outrigger Prototype Console.
   Idempotent + dynamic-DOM safe (waits for anchors, re-applies via observer). */
(function () {
  var NS = ${embed(`opmc-${key}`)};
  if (window.__opmc_variations && window.__opmc_variations[NS]) return;
  window.__opmc_variations = window.__opmc_variations || {};
  window.__opmc_variations[NS] = true;

  var CSS = ${embed(css)};
  var BLOCKS = ${JSON.stringify(htmlBlocks)};

  function injectCss() {
    var id = NS + "-css";
    if (document.getElementById(id)) return;
    var style = document.createElement("style");
    style.id = id;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function place(anchor, mode, node) {
    switch (mode) {
      case "before": anchor.parentNode.insertBefore(node, anchor); break;
      case "prepend": anchor.insertBefore(node, anchor.firstChild); break;
      case "append": anchor.appendChild(node); break;
      case "replace": anchor.parentNode.replaceChild(node, anchor); break;
      case "after":
      default: anchor.parentNode.insertBefore(node, anchor.nextSibling);
    }
  }

  function applyBlock(block, idx) {
    var marker = NS + "-block-" + idx;
    if (document.querySelector("[data-" + marker + "]")) return true;
    var anchor = document.querySelector(block.selector);
    if (!anchor) return false;
    var tmp = document.createElement("div");
    tmp.innerHTML = block.html;
    var node = tmp.firstElementChild || tmp;
    node.setAttribute("data-" + marker, "1");
    place(anchor, block.mode, node);
    return true;
  }

  function applyAll() {
    injectCss();
    var allDone = true;
    for (var i = 0; i < BLOCKS.length; i++) {
      if (!applyBlock(BLOCKS[i], i)) allDone = false;
    }
    return allDone;
  }

  function run() {
    if (applyAll()) return;
    // Anchor(s) not present yet — observe the dynamic DOM until they appear.
    var obs = new MutationObserver(function () { if (applyAll()) obs.disconnect(); });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(function () { obs.disconnect(); }, 15000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }

  /* --- feature overlay.js --- */
  try {
${js.split("\n").map((l) => "    " + l).join("\n")}
  } catch (e) { if (window.console) console.warn("[" + NS + "] overlay error", e); }
})();
`;

  return {
    featureKey: key,
    featureName: feature.name,
    variationJs,
    css,
    liveUrls: feature.liveUrls ?? [],
    lint,
    bytes: Buffer.byteLength(variationJs),
  };
}
