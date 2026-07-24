"use client";

import Link from "next/link";
import { useState } from "react";
import { BOARD_COLUMNS, type BoardCard, type BoardColumn } from "@/lib/prototypes/board-model";
import type { PipelineStep } from "@/lib/prototypes/pipeline";

const DOT: Record<PipelineStep["state"], string> = {
  done: "bg-ok", current: "bg-accent", todo: "bg-border-strong", blocked: "bg-danger",
};

type Filter = "all" | "blocked" | BoardColumn;

/** The list lens on the same truth the board renders — with status filters. */
export function PrototypeList({ cards }: { cards: BoardCard[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const blockedCount = cards.filter((c) => c.pipeline.steps.some((s) => s.state === "blocked")).length;
  const chips: { id: Filter; label: string; count: number; tone?: string }[] = [
    { id: "all", label: "All", count: cards.length },
    ...(blockedCount ? [{ id: "blocked" as Filter, label: "⚠ Blocked", count: blockedCount, tone: "text-danger" }] : []),
    ...BOARD_COLUMNS.map((c) => ({ id: c.id as Filter, label: c.label, count: cards.filter((x) => x.column === c.id).length })),
  ];

  const order = new Map(BOARD_COLUMNS.map((c, i) => [c.id, i]));
  const shown = cards
    .filter((c) => filter === "all" ? true : filter === "blocked" ? c.pipeline.steps.some((s) => s.state === "blocked") : c.column === filter)
    .sort((a, b) => (order.get(a.column)! - order.get(b.column)!) || ((a.priority ?? 1e9) - (b.priority ?? 1e9)));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        {chips.map((ch) => (
          <button key={ch.id} onClick={() => setFilter(ch.id)}
            className={`px-2.5 py-1 rounded-full border text-[13px] font-medium transition-colors ${filter === ch.id ? "border-accent bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-foreground" : `border-border text-muted hover:text-foreground ${ch.tone ?? ""}`}`}>
            {ch.label} <span className="text-muted-2 tabular-nums">{ch.count}</span>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="grid grid-cols-[1fr_6.2rem_7.2rem_1fr_8rem] gap-3 px-4 py-2 border-b border-border text-[12.5px] font-semibold uppercase tracking-wider text-muted-2">
          <span>Prototype</span><span>Stage</span><span>Pipeline</span><span>Next</span><span>Truth</span>
        </div>
        {shown.length === 0 ? (
          <div className="px-4 py-8 text-center text-[14px] text-muted-2">Nothing matches this filter.</div>
        ) : shown.map((c) => {
          const blocked = c.pipeline.steps.filter((s) => s.state === "blocked");
          const col = BOARD_COLUMNS.find((x) => x.id === c.column)!;
          return (
            <Link key={c.key} href={`/prototypes/${c.key}`} className="grid grid-cols-[1fr_6.2rem_7.2rem_1fr_8rem] gap-3 px-4 py-3 border-b border-border/60 last:border-0 items-center hover:bg-surface-2/30 transition-colors">
              <span className="min-w-0">
                <span className="text-[14px] font-semibold block truncate">{c.name}</span>
                {c.hypothesis && <span className="text-[12.5px] text-muted-2 block truncate">{c.hypothesis}</span>}
              </span>
              <span className={`text-[13px] font-medium ${c.column === "testing" ? "text-warn" : c.column === "shipped" ? "text-ok" : "text-muted"}`}>
                {c.locked ? "🔒 " : ""}{col.label}
              </span>
              <span className="flex items-center gap-1">
                {c.pipeline.steps.map((s) => <span key={s.id} title={`${s.title}: ${s.status}`} className={`w-1.5 h-1.5 rounded-full ${DOT[s.state]}`} />)}
              </span>
              <span className="min-w-0">
                <span className={`text-[13px] block truncate ${blocked.length ? "text-danger" : "text-muted"}`}>
                  {blocked.length ? `⚠ ${blocked.map((s) => `${s.title}: ${s.status}`).join(" · ")}` : c.pipeline.primaryAction.label}
                </span>
              </span>
              <span className="flex items-center gap-1 flex-wrap">
                {c.pipeline.truth.latestVersion != null && <span className="text-[12.5px] px-1.5 py-0.5 rounded bg-surface-2 text-muted font-mono">v{c.pipeline.truth.latestVersion}{c.pipeline.truth.certified === true ? "✓" : c.pipeline.truth.certified === false ? "✗" : ""}</span>}
                {c.experimentStatus && <span className={`text-[12.5px] px-1.5 py-0.5 rounded ${c.experimentStatus === "running" ? "text-warn bg-[color-mix(in_srgb,var(--warn)_12%,transparent)]" : "bg-surface-2 text-muted-2"}`}>{c.experimentStatus.replace("_", " ")}</span>}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
