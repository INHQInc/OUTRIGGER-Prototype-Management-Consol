"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BOARD_COLUMNS, type BoardCard, type BoardColumn } from "@/lib/prototypes/board-model";
import { StageStrip } from "@/components/StageStrip";

type Filter = "all" | "blocked" | BoardColumn;

/**
 * The Prototypes table — Optimizely's Optimizations grammar, our ground truth.
 * Name + brief description · Status (the canonical stage, severity-colored,
 * LIVE-locked badge) · primary metric · versions · experiment state. One row =
 * the whole story; clicking opens the prototype. The board remains as a lens.
 */
export function PrototypeTable({ cards }: { cards: BoardCard[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const blockedOf = (c: BoardCard) => c.pipeline.steps.some((s) => s.state === "blocked");
  const shown = cards
    .filter((c) => (filter === "all" ? true : filter === "blocked" ? blockedOf(c) : c.column === filter))
    .filter((c) => {
      const needle = q.trim().toLowerCase();
      if (!needle) return true;
      return c.name.toLowerCase().includes(needle) || (c.description ?? "").toLowerCase().includes(needle);
    });

  const chipTone = (c: BoardCard) =>
    blockedOf(c) ? "border-danger/40 text-danger bg-[color-mix(in_srgb,var(--danger)_6%,transparent)]"
    : c.locked || c.column === "handoff" ? "border-ok/40 text-ok bg-[color-mix(in_srgb,var(--ok)_7%,transparent)]"
    : "border-warn/40 text-warn bg-[color-mix(in_srgb,var(--warn)_7%,transparent)]";
  const dotTone = (c: BoardCard) => (blockedOf(c) ? "bg-danger" : c.locked || c.column === "handoff" ? "bg-ok" : "bg-warn");
  const label = (c: BoardCard) => {
    const col = BOARD_COLUMNS.find((x) => x.id === c.column)?.label ?? c.column;
    if (blockedOf(c)) return `Blocked at ${col}`;
    return c.locked ? `${col} · LIVE 🔒` : col;
  };

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      {/* Toolbar — Opti's: search · status · create */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-2.5 flex-wrap">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name or description"
          className="flex-1 min-w-[200px] max-w-sm rounded-lg bg-background border border-border px-3 py-2 text-[14px] text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none" />
        <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}
          className="rounded-lg bg-surface border border-border px-2.5 py-2 text-[13.5px] text-muted focus:border-accent focus:outline-none">
          <option value="all">Status · All</option>
          <option value="blocked">⚠ Blocked</option>
          {BOARD_COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <span className="ml-auto text-[12.5px] text-muted-2 hidden md:block" title="Each prototype's five lifecycle stages, colored by status — hover a segment for detail.">
          stage strip: Brief · Build · Review · Experimentation · Handoff
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px] border-collapse">
          <thead>
            <tr className="border-b border-border">
              {["Name", "Status", "Primary metric", "Versions", "Experiment"].map((h, i) => (
                <th key={h} className={`px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-muted-2 whitespace-nowrap ${i === 3 ? "text-right" : "text-left"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-[14px] text-muted-2">No prototypes match{q ? ` “${q}”` : ""}.</td></tr>
            ) : shown.map((c) => (
              <tr key={c.key} onClick={() => router.push(`/prototypes/${c.key}`)}
                className="border-b border-border/60 last:border-0 hover:bg-surface-2/40 cursor-pointer transition-colors">
                <td className="px-4 py-3.5 align-top min-w-[16rem]">
                  <Link href={`/prototypes/${c.key}`} onClick={(e) => e.stopPropagation()} className="text-[14.5px] font-semibold text-accent hover:text-accent-hover">{c.name}</Link>
                  {c.description && <div className="text-[12.5px] text-muted-2 mt-0.5 max-w-[42ch] line-clamp-2">{c.description}</div>}
                  <StageStrip pipeline={c.pipeline} className="mt-2 max-w-[150px]" />
                </td>
                <td className="px-4 py-3.5 align-top whitespace-nowrap">
                  <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-[12.5px] font-semibold ${chipTone(c)}`}>
                    <span className={`w-2 h-2 rounded-full ${dotTone(c)}`} />{label(c)}
                  </span>
                </td>
                <td className="px-4 py-3.5 align-top max-w-[24ch]">
                  {c.metric
                    ? <><div className="text-foreground/90 truncate">{c.metric}</div>{c.guardrailCount ? <div className="text-[12px] text-muted-2">{c.guardrailCount} guardrail{c.guardrailCount === 1 ? "" : "s"}</div> : null}</>
                    : <span className="text-warn text-[13px]">needs a success metric</span>}
                </td>
                <td className="px-4 py-3.5 align-top text-right tabular-nums font-semibold">{c.versionCount ?? "—"}</td>
                <td className="px-4 py-3.5 align-top whitespace-nowrap">
                  {c.experimentStatus
                    ? <Link href={`/prototypes/${c.key}?tab=optimizely`} onClick={(e) => e.stopPropagation()}
                        className={`text-[13px] font-medium ${c.experimentStatus === "running" ? "text-ok" : "text-accent"} hover:opacity-80`}>
                        {c.experimentStatus === "running" ? "running — results ↗" : c.experimentStatus.replace("_", " ")}
                      </Link>
                    : <span className="text-muted-2 text-[13px]">not bound</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
