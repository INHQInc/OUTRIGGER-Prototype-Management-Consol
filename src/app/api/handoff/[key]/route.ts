import { NextRequest, NextResponse } from "next/server";
import { readManifest } from "@/lib/features/registry";
import { buildHandoff } from "@/lib/handoff/handoff";
import { readTargetFile } from "@/lib/handoff/resolve";
import { getChoices, setChoice } from "@/lib/handoff/store";
import { integrateHtml, newFileContent, sideBySide, unifiedPatch, type DiffRow } from "@/lib/handoff/integrate";

interface PieceView {
  kind: "html" | "css" | "js";
  confidence: string;
  placement: string;
  note?: string;
  targetFile: string | null;
  targetLabel: string;
  selector?: string;
  candidates?: { block: string; file: string }[];
  chosen?: string | null;
  hasOriginal: boolean;
  rows: DiffRow[];
}

/** GET compare data for every piece of the handoff. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const manifest = await readManifest(key);
  if (!manifest) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const pkg = await buildHandoff(manifest);
  const choices = await getChoices(key);
  const pieces: PieceView[] = [];

  for (const p of pkg.pieces) {
    if (p.kind === "html") {
      const chosen = (p.selector && choices.targets[p.selector]) || p.targetFile;
      const original = chosen ? await readTargetFile(chosen) : null;
      let rows: DiffRow[] = [];
      if (original != null) {
        const { integrated } = integrateHtml(original, p.code, key, p.anchorTokens ?? []);
        rows = sideBySide(original, integrated);
      } else {
        // No resolvable file — show the markup as a new-file addition
        rows = sideBySide("", newFileContent(`<!-- ${p.placement} -->`, p.code));
      }
      pieces.push({
        kind: "html", confidence: p.confidence, placement: p.placement, note: p.note,
        targetFile: chosen, targetLabel: p.targetLabel, selector: p.selector,
        candidates: (p.candidates ?? []).map((c) => ({ block: c.block, file: c.file })),
        chosen, hasOriginal: original != null, rows,
      });
    } else {
      // CSS / JS ship as new build files → whole-file addition
      const header = p.kind === "css" ? `// ${manifest.name} — from prototype ${key}` : `// ${manifest.name} — from prototype ${key}`;
      const content = newFileContent(header, p.code);
      pieces.push({
        kind: p.kind, confidence: p.confidence, placement: p.placement, note: p.note,
        targetFile: p.targetFile, targetLabel: p.targetLabel, hasOriginal: false,
        rows: sideBySide("", content),
      });
    }
  }

  return NextResponse.json({
    featureKey: pkg.featureKey, featureName: pkg.featureName, summary: pkg.summary,
    primaryBlock: pkg.primaryBlock, warnings: pkg.warnings, pieces,
  });
}

/** POST { selector, targetFile } — remember which candidate view the dev picked. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const { selector, targetFile } = await req.json().catch(() => ({}));
  if (!selector || !targetFile) return NextResponse.json({ error: "selector and targetFile required" }, { status: 400 });
  await setChoice(key, String(selector), String(targetFile));
  return NextResponse.json({ ok: true });
}
