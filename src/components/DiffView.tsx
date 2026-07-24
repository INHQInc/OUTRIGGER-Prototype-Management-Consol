"use client";

interface DiffRow {
  left: string | null;
  right: string | null;
  type: "same" | "add" | "del";
}

/** VS Code / git-style side-by-side compare: origin (left) vs integrated (right). */
export function DiffView({ rows, leftLabel, rightLabel }: { rows: DiffRow[]; leftLabel: string; rightLabel: string }) {
  let ln = 0, rn = 0;
  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="grid grid-cols-2 text-[13px] font-medium border-b border-border">
        <div className="px-3 py-2 text-muted-2 border-r border-border">{leftLabel}</div>
        <div className="px-3 py-2 text-muted-2">{rightLabel}</div>
      </div>
      <div className="overflow-auto max-h-[560px] font-mono text-[13px] leading-[1.6]">
        {rows.map((r, i) => {
          const leftNo = r.left != null ? ++ln : null;
          const rightNo = r.right != null ? ++rn : null;
          const leftBg = r.type === "del" ? "bg-[color-mix(in_srgb,var(--danger)_14%,transparent)]" : "";
          const rightBg = r.type === "add" ? "bg-[color-mix(in_srgb,var(--ok)_14%,transparent)]" : "";
          return (
            <div key={i} className="grid grid-cols-2">
              <div className={`flex border-r border-border ${leftBg}`}>
                <span className="w-9 shrink-0 text-right pr-2 text-muted-2 select-none">{leftNo ?? ""}</span>
                <span className="px-2 whitespace-pre text-muted">{r.left ?? ""}</span>
              </div>
              <div className={`flex ${rightBg}`}>
                <span className="w-9 shrink-0 text-right pr-2 text-muted-2 select-none">{rightNo ?? ""}</span>
                <span className={`px-2 whitespace-pre ${r.type === "add" ? "text-foreground" : "text-muted"}`}>{r.right ?? ""}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
