"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, TimeAgo } from "@/components/ui";
import type { Idea, IdeaStatus } from "@/lib/ideas/ideas";

const TONE: Record<IdeaStatus, "accent" | "ok" | "neutral" | "warn"> = {
  new: "accent", planned: "warn", done: "ok", declined: "neutral",
};
const NEXT: { label: string; status: IdeaStatus }[] = [
  { label: "Plan", status: "planned" },
  { label: "Done", status: "done" },
  { label: "Decline", status: "declined" },
];

/** Improvements proposed by the Claude instances doing the work. */
export function IdeaInbox({ initial, canManage }: { initial: Idea[]; canManage: boolean }) {
  const router = useRouter();
  const [ideas, setIdeas] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"open" | "all">("open");

  async function call(method: string, body?: unknown, query = "") {
    setBusy(true);
    try {
      const res = await fetch(`/api/ideas${query}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (res.ok) { setIdeas(data.ideas ?? []); router.refresh(); }
    } finally { setBusy(false); }
  }

  const shown = filter === "open" ? ideas.filter((i) => i.status === "new" || i.status === "planned") : ideas;

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden max-w-3xl">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <div className="text-[15px] font-semibold">Ideas</div>
          <div className="text-[13px] text-muted-2 mt-0.5">Improvements proposed by the Claude instances building prototypes — the friction they hit, sent back instead of lost.</div>
        </div>
        <button onClick={() => setFilter(filter === "open" ? "all" : "open")} className="text-[14px] text-accent hover:text-accent-hover font-medium shrink-0">
          {filter === "open" ? `Show all (${ideas.length})` : "Show open only"}
        </button>
      </div>

      {shown.length === 0 ? (
        <div className="px-4 py-8 text-center text-[14px] text-muted-2">
          No {filter === "open" ? "open " : ""}ideas yet. They arrive when a prototype-building Claude submits one.
        </div>
      ) : (
        shown.map((i) => (
          <div key={i.id} className="border-b border-border last:border-0">
            <div className="px-4 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[15px] font-medium">{i.title}</span>
                  <Badge tone={TONE[i.status]}>{i.status}</Badge>
                  <Badge tone="neutral">{i.category}</Badge>
                </div>
                <div className="text-[13px] text-muted-2 mt-0.5">
                  {i.source === "claude" ? "Claude" : "human"}
                  {i.prototypeKey ? <> · <span className="font-mono">{i.prototypeKey}</span></> : null} · <TimeAgo iso={i.createdAt} />
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {i.body && <button onClick={() => setOpen(open === i.id ? null : i.id)} className="text-[14px] text-accent hover:text-accent-hover font-medium">{open === i.id ? "Hide" : "Read"}</button>}
                {canManage && NEXT.filter((n) => n.status !== i.status).map((n) => (
                  <button key={n.status} onClick={() => call("PATCH", { id: i.id, status: n.status })} disabled={busy} className="text-[14px] text-muted-2 hover:text-foreground">{n.label}</button>
                ))}
              </div>
            </div>
            {open === i.id && i.body && (
              <div className="border-t border-border/60 bg-background/40">
                <pre className="px-4 py-3 text-[13px] font-mono text-muted leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">{i.body}</pre>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
