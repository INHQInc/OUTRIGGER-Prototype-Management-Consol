"use client";

import Link from "next/link";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/ui";
import { BOARD_COLUMNS, type BoardCard, type BoardColumn } from "@/lib/prototypes/board-model";
import type { PipelineStep } from "@/lib/prototypes/pipeline";

const DOT: Record<PipelineStep["state"], string> = {
  done: "bg-ok",
  current: "bg-accent",
  todo: "bg-border-strong",
  blocked: "bg-danger",
};

/** Why a cross-column drag bounces: the column is a fact, not an opinion. */
const BOUNCE: Record<BoardColumn, string> = {
  brief: "Brief is where cards start — they move on when a build begins, not when they're dragged.",
  build: "Build means a real build exists on the branch. It moves when Claude pushes one.",
  review: "Review means the pages verify on the real site. Verify them and the card moves itself.",
  launch: "Launch means cut + certified + pushed. Do those and the card arrives on its own.",
  testing: "Only a RUNNING experiment puts a card in Testing — start it in Optimizely.",
  shipped: "Shipped is a decision — but only from Launch: finish the pipeline first.",
};

function MiniPipeline({ steps }: { steps: PipelineStep[] }) {
  return (
    <div className="flex items-center gap-1">
      {steps.map((s) => <span key={s.id} title={`${s.title}: ${s.status}`} className={`w-1.5 h-1.5 rounded-full ${DOT[s.state]}`} />)}
    </div>
  );
}

/**
 * The Program Board — kanban over ground truth, with drag exactly where human
 * judgment lives and nowhere else:
 *   · reorder INSIDE a column = priority (yours to decide)
 *   · Launch → Shipped = "we're calling it" (yours to decide)
 *   · everything else is derived state — a wrong drag bounces with the reason.
 */
export function ProgramBoard({ cards: initial, archivedCount }: { cards: BoardCard[]; archivedCount: number }) {
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [toast, setToast] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<BoardColumn | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function say(text: string) {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }

  const dragging = cards.find((c) => c.key === dragKey) ?? null;
  const dropAllowed = (col: BoardColumn) =>
    dragging !== null && !dragging.locked && (col === dragging.column || (col === "shipped" && dragging.column === "launch"));

  async function persistPriorities(colCards: BoardCard[]) {
    await Promise.all(colCards.map((c, i) =>
      fetch("/api/prototypes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: c.key, priority: (i + 1) * 10 }) }).catch(() => null)
    ));
  }

  async function markShipped(card: BoardCard) {
    setCards((cs) => cs.map((c) => (c.key === card.key ? { ...c, column: "shipped" as BoardColumn } : c)));
    const res = await fetch("/api/prototypes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: card.key, status: "shipped" }) });
    if (!res.ok) {
      setCards((cs) => cs.map((c) => (c.key === card.key ? { ...c, column: card.column } : c)));
      say("Couldn't mark it shipped — try again.");
      return;
    }
    say(`${card.name} marked shipped.`);
    router.refresh();
  }

  function onDrop(col: BoardColumn, beforeKey?: string) {
    setOverCol(null);
    const card = dragging;
    setDragKey(null);
    if (!card) return;
    if (card.locked) { say("The experiment is running — this card is locked until it isn't."); return; }

    if (col === card.column) {
      // Reorder within the column — priority is human judgment.
      const colCards = cards.filter((c) => c.column === col && c.key !== card.key);
      const idx = beforeKey ? colCards.findIndex((c) => c.key === beforeKey) : colCards.length;
      const at = idx < 0 ? colCards.length : idx;
      const next = [...colCards.slice(0, at), card, ...colCards.slice(at)];
      setCards((cs) => [...cs.filter((c) => c.column !== col), ...next]);
      void persistPriorities(next);
      return;
    }
    if (col === "shipped" && card.column === "launch") { void markShipped(card); return; }
    say(BOUNCE[col]);
  }

  return (
    <div className="space-y-4">
      {cards.length === 0 ? (
        <EmptyState title="No prototypes yet." hint="Create one — then build it with Claude and review it on the real site." />
      ) : (
        <div className="grid grid-cols-6 gap-2.5 items-start">
          {BOARD_COLUMNS.map((col) => {
            const items = cards.filter((c) => c.column === col.id);
            const testing = col.id === "testing";
            const highlight = overCol === col.id && dropAllowed(col.id);
            const rejecting = overCol === col.id && dragging !== null && !dropAllowed(col.id);
            return (
              <div
                key={col.id}
                onDragOver={(e) => { e.preventDefault(); setOverCol(col.id); e.dataTransfer.dropEffect = dropAllowed(col.id) ? "move" : "none"; }}
                onDragLeave={() => setOverCol((o) => (o === col.id ? null : o))}
                onDrop={(e) => { e.preventDefault(); onDrop(col.id); }}
                className={`rounded-xl border p-2 min-h-[9rem] transition-colors ${
                  highlight ? "border-accent bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]"
                  : rejecting ? "border-danger/40"
                  : testing ? "border-warn/40 bg-[color-mix(in_srgb,var(--warn)_3%,transparent)]"
                  : "border-border bg-surface/40"}`}
              >
                <div className="px-1.5 pb-2 pt-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[11px] font-semibold ${testing ? "text-warn" : col.id === "shipped" ? "text-ok" : ""}`}>{col.label}</span>
                    {testing && <span className="text-[10px]">🔒</span>}
                    <span className="text-[10px] text-muted-2 tabular-nums ml-auto">{items.length}</span>
                  </div>
                  <div className="text-[9px] text-muted-2 leading-tight">{col.hint}</div>
                </div>
                <div className="space-y-1.5">
                  {items.map((c) => (
                    <div
                      key={c.key}
                      draggable={!c.locked}
                      onDragStart={(e) => { setDragKey(c.key); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", c.key); }}
                      onDragEnd={() => { setDragKey(null); setOverCol(null); }}
                      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(col.id, c.key); }}
                      className={dragKey === c.key ? "opacity-40" : ""}
                    >
                      <Link href={`/prototypes/${c.key}`} draggable={false} className={`block rounded-lg border px-3 py-2.5 bg-surface hover:border-border-strong transition-colors space-y-1.5 ${c.locked ? "border-warn/50" : "border-border cursor-grab active:cursor-grabbing"}`}>
                        <div className="text-[12.5px] font-semibold leading-snug">{c.name}</div>
                        {c.hypothesis && <div className="text-[10.5px] text-muted-2 leading-snug line-clamp-2">{c.hypothesis}</div>}

                        <MiniPipeline steps={c.pipeline.steps} />
                        <div className={`text-[10.5px] leading-tight ${c.locked ? "text-warn font-semibold" : "text-foreground"}`}>
                          {c.locked ? "🔒 experiment LIVE — locked" : <>
                            <span className="text-muted-2">Next: </span>{c.pipeline.primaryAction.label}
                          </>}
                        </div>
                        {!c.locked && c.pipeline.steps.some((s) => s.state === "blocked") && (
                          <div className="text-[10px] text-danger leading-tight">⚠ {c.pipeline.steps.filter((s) => s.state === "blocked").map((s) => `${s.title}: ${s.status}`).join(" · ")}</div>
                        )}
                        {c.pipeline.alerts.filter((a) => a.level === "warn").slice(0, 1).map((a, i) => (
                          <div key={i} className="text-[9.5px] text-warn leading-tight line-clamp-2">{a.text}</div>
                        ))}

                        <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-border/50">
                          {c.pipeline.truth.latestVersion != null && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-2 text-muted font-mono">v{c.pipeline.truth.latestVersion}{c.pipeline.truth.certified === true ? " ✓" : c.pipeline.truth.certified === false ? " ✗" : ""}</span>
                          )}
                          {c.pipeline.truth.pushedVersion != null && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-2 text-muted font-mono">pushed v{c.pipeline.truth.pushedVersion}</span>
                          )}
                          {c.experimentStatus && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${c.experimentStatus === "running" ? "bg-[color-mix(in_srgb,var(--warn)_15%,transparent)] text-warn" : "bg-surface-2 text-muted-2"}`}>{c.experimentStatus.replace("_", " ")}</span>
                          )}
                          {c.metric && <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-2 text-muted-2 truncate max-w-[9rem]" title={`Primary metric: ${c.metric}`}>📊 {c.metric}</span>}
                          {c.owner && <span className="text-[9px] text-muted-2 ml-auto">{c.owner}</span>}
                        </div>
                      </Link>
                    </div>
                  ))}
                  {items.length === 0 && <div className="px-1.5 py-3 text-[10px] text-muted-2/60">—</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {archivedCount > 0 && <p className="text-[10px] text-muted-2">{archivedCount} archived prototype{archivedCount === 1 ? "" : "s"} hidden.</p>}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[12px] text-foreground shadow-lg max-w-md">
          {toast}
        </div>
      )}
    </div>
  );
}
