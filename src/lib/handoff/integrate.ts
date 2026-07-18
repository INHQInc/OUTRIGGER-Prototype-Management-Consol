import { diffLines, createTwoFilesPatch } from "diff";

export interface DiffRow {
  left: string | null;
  right: string | null;
  type: "same" | "add" | "del";
}

/**
 * Insert a prototype fragment into a target source file at the anchor.
 * Insertion point is a best-effort match on the anchor's class token — the
 * dev confirms/adjusts. Returns the proposed integrated file.
 */
export function integrateHtml(
  original: string,
  fragment: string,
  featureKey: string,
  anchorTokens: string[]
): { integrated: string; anchorLine: number | null } {
  const lines = original.split("\n");
  let anchorLine: number | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (anchorTokens.some((t) => t && new RegExp(`\\b${t}\\b`).test(lines[i]))) { anchorLine = i; break; }
  }
  const indent = anchorLine != null ? (lines[anchorLine].match(/^\s*/)?.[0] ?? "") : "";
  const block = [
    `${indent}@* ── BEGIN prototype: ${featureKey} (from OUTRIGGER Prototype Console — confirm placement) ──`,
    ...fragment.trimEnd().split("\n").map((l) => `${indent}${l}`),
    `${indent}@* ── END prototype: ${featureKey} ── *@`,
  ];
  const at = anchorLine != null ? anchorLine + 1 : lines.length;
  const integrated = [...lines.slice(0, at), ...block, ...lines.slice(at)].join("\n");
  return { integrated, anchorLine };
}

/** Whole-file addition (new CSS/JS partial): left empty, right = our code. */
export function newFileContent(header: string, code: string): string {
  return `${header}\n${code.trimEnd()}\n`;
}

/** Side-by-side rows for the two-pane compare. */
export function sideBySide(oldText: string, newText: string): DiffRow[] {
  const rows: DiffRow[] = [];
  for (const part of diffLines(oldText, newText)) {
    const lines = part.value.replace(/\n$/, "").split("\n");
    for (const line of lines) {
      if (part.added) rows.push({ left: null, right: line, type: "add" });
      else if (part.removed) rows.push({ left: line, right: null, type: "del" });
      else rows.push({ left: line, right: line, type: "same" });
    }
  }
  return rows;
}

/** Unified patch (git apply-able). */
export function unifiedPatch(path: string, oldText: string, newText: string): string {
  return createTwoFilesPatch(`a/${path}`, `b/${path}`, oldText, newText, "", "", { context: 3 });
}
