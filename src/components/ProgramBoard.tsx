import Link from "next/link";
import { NewPrototype } from "./NewPrototype";
import { EmptyState } from "@/components/ui";
import { BOARD_COLUMNS, type BoardCard } from "@/lib/prototypes/board";
import type { PipelineStep } from "@/lib/prototypes/pipeline";

const DOT: Record<PipelineStep["state"], string> = {
  done: "bg-ok",
  current: "bg-accent",
  todo: "bg-border-strong",
  blocked: "bg-danger",
};

function MiniPipeline({ steps }: { steps: PipelineStep[] }) {
  return (
    <div className="flex items-center gap-1">
      {steps.map((s) => <span key={s.id} title={`${s.title}: ${s.status}`} className={`w-1.5 h-1.5 rounded-full ${DOT[s.state]}`} />)}
    </div>
  );
}

/**
 * The Program Board — kanban over ground truth. Columns are DERIVED from the
 * pipeline and the experiment's live status; nobody drags a card. Testing is
 * locked by the platform: the experiment is running, so the prototype is
 * immutable until it isn't.
 */
export function ProgramBoard({ cards, archivedCount }: { cards: BoardCard[]; archivedCount: number }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-2">Columns are derived from real state — build, verification, certification, the experiment&apos;s live status. Nothing here is dragged.</p>
        <NewPrototype />
      </div>

      {cards.length === 0 ? (
        <EmptyState title="No prototypes yet." hint="Create one — then build it with Claude and review it on the real site." />
      ) : (
        <div className="grid grid-cols-6 gap-2.5 items-start">
          {BOARD_COLUMNS.map((col) => {
            const items = cards.filter((c) => c.column === col.id);
            const testing = col.id === "testing";
            return (
              <div key={col.id} className={`rounded-xl border p-2 min-h-[9rem] ${testing ? "border-warn/40 bg-[color-mix(in_srgb,var(--warn)_3%,transparent)]" : "border-border bg-surface/40"}`}>
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
                    <Link key={c.key} href={`/prototypes/${c.key}`} className={`block rounded-lg border px-2.5 py-2 bg-surface hover:border-border-strong transition-colors ${c.locked ? "border-warn/50" : "border-border"}`}>
                      <div className="text-[11.5px] font-semibold leading-snug">{c.name}</div>
                      <div className={`text-[10px] mt-0.5 leading-tight ${c.locked ? "text-warn" : "text-muted-2"}`}>
                        {c.locked ? "experiment LIVE — locked" : c.pipeline.steps.find((s) => s.state === "current" || s.state === "blocked")?.status ?? c.pipeline.primaryAction.label}
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <MiniPipeline steps={c.pipeline.steps} />
                        {c.metric && <span className="text-[9px] text-muted-2 truncate max-w-[55%]" title={`Primary metric: ${c.metric}`}>{c.metric}</span>}
                      </div>
                    </Link>
                  ))}
                  {items.length === 0 && <div className="px-1.5 py-3 text-[10px] text-muted-2/60">—</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {archivedCount > 0 && <p className="text-[10px] text-muted-2">{archivedCount} archived prototype{archivedCount === 1 ? "" : "s"} hidden.</p>}
    </div>
  );
}
