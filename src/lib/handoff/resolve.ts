import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { FeatureManifest } from "../features/types";

const execFileAsync = promisify(execFile);

/**
 * Read-only Azure DevOps clone of Outrigger's Optimizely CMS source.
 * NEVER written to — used only to map prototypes onto their conventions.
 */
export function outriggerRepoRoot(): string {
  return join(process.env.HOME ?? "", "Projects", "Outrigger_Website", "OUT.Website");
}

export async function repoAvailable(): Promise<boolean> {
  try { await stat(join(outriggerRepoRoot(), "Features")); return true; } catch { return false; }
}

export interface AnchorMatch {
  selector: string;
  /** Class/id tokens searched for. */
  tokens: string[];
  /** Candidate owning blocks/templates, ranked. */
  candidates: { block: string; file: string; hits: number }[];
  confidence: "high" | "medium" | "low";
}

export interface ResolveResult {
  /** "new-block": self-contained prototype → new CMS block near the anchor.
   *  "modify": prototype changes an existing block's markup/style. */
  kind: "new-block" | "modify";
  anchors: AnchorMatch[];
  /** Nearest owning block for placement guidance (highest-confidence anchor). */
  primaryBlock: string | null;
  notes: string[];
}

function tokensFromSelector(sel: string): string[] {
  // Extract class and id tokens (ignore combinators/tags/pseudos)
  const out = new Set<string>();
  for (const m of sel.matchAll(/[.#]([a-zA-Z0-9_-]+)/g)) out.add(m[1]);
  return [...out];
}

async function grepBlocks(token: string): Promise<{ block: string; file: string; hits: number }[]> {
  const root = outriggerRepoRoot();
  try {
    const { stdout } = await execFileAsync(
      "grep",
      ["-rl", "--include=*.cshtml", "-F", token, join(root, "Features")],
      { maxBuffer: 4 * 1024 * 1024 }
    );
    const files = stdout.trim().split("\n").filter(Boolean);
    return files.map((f) => {
      const rel = f.replace(root + "/", "");
      const m = rel.match(/Blocks\/([^/]+)\//);
      return { block: m ? m[1] : rel.split("/").slice(0, -1).join("/"), file: rel, hits: 1 };
    });
  } catch {
    return [];
  }
}

/** Map a feature's injection anchors onto their Optimizely CMS source. */
export async function resolveFeature(feature: FeatureManifest): Promise<ResolveResult> {
  const anchors: AnchorMatch[] = [];
  const notes: string[] = [];

  const htmlInjections = feature.injections.filter((i) => i.type === "html" && i.selector);
  const overlayIsNamespaced = feature.key.length > 0; // fragments are namespaced (opmc-*) → new component

  for (const inj of htmlInjections) {
    const sel = inj.selector!;
    if (sel === "body" || sel === "head") {
      anchors.push({ selector: sel, tokens: [], candidates: [], confidence: "low" });
      notes.push(`Anchor "${sel}" is page-level — placement is a layout/template decision, not a single block.`);
      continue;
    }
    const tokens = tokensFromSelector(sel);
    const tally = new Map<string, { block: string; file: string; hits: number }>();
    for (const t of tokens) {
      for (const c of await grepBlocks(t)) {
        const cur = tally.get(c.file);
        if (cur) cur.hits += 1;
        else tally.set(c.file, { ...c });
      }
    }
    const candidates = [...tally.values()].sort((a, b) => b.hits - a.hits).slice(0, 6);
    const confidence = candidates.length === 0 ? "low" : candidates[0].hits >= 2 ? "high" : "medium";
    anchors.push({ selector: sel, tokens, candidates, confidence });
  }

  const primaryBlock =
    anchors.map((a) => a.candidates[0]?.block).find(Boolean) ?? null;

  // Classify: a namespaced, self-contained fragment inserted relative to an
  // existing anchor is a NEW block placed near that anchor.
  const kind: ResolveResult["kind"] = overlayIsNamespaced ? "new-block" : "modify";
  if (kind === "new-block" && primaryBlock) {
    notes.push(`Prototype is a self-contained component → ship as a NEW block, placed near "${primaryBlock}" (its injection anchor).`);
  }

  return { kind, anchors, primaryBlock, notes };
}

/** Read one existing block's files as a structural template (conventions only). */
export async function sampleBlock(): Promise<{ name: string; files: string[] } | null> {
  const blocksDir = join(outriggerRepoRoot(), "Features", "Outrigger", "Blocks");
  try {
    const dirs = (await readdir(blocksDir, { withFileTypes: true })).filter((d) => d.isDirectory());
    for (const d of dirs) {
      const files = await readdir(join(blocksDir, d.name));
      if (files.some((f) => f.endsWith(".cshtml")) && files.some((f) => f.endsWith("ViewComponent.cs"))) {
        return { name: d.name, files };
      }
    }
  } catch { /* ignore */ }
  return null;
}
