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
const CATS = ["app", "skill", "workflow", "bug", "other"] as const;

const inp = "w-full rounded-lg bg-background border border-border px-3 py-2 text-[14px] text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none";

/**
 * The build backlog — prototype/feature ideas a human wants to build, org-level.
 * The one action that matters is graduation: turn an item into a real prototype
 * (creates it, pre-filled from the item, and marks the item planned).
 */
export function Backlog({ initial, canManage }: { initial: Idea[]; canManage: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [cat, setCat] = useState<(typeof CATS)[number]>("other");
  const [err, setErr] = useState<string | null>(null);

  async function refresh(next?: Idea[]) {
    if (next) { setItems(next); return; }
    const res = await fetch("/api/ideas");
    const data = await res.json();
    if (res.ok) setItems(data.ideas ?? []);
  }

  async function call(method: string, body?: unknown, query = "") {
    setBusy(true);
    try {
      const res = await fetch(`/api/ideas${query}`, {
        method, headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (res.ok) { setItems(data.ideas ?? []); router.refresh(); }
    } finally { setBusy(false); }
  }

  async function add() {
    if (busy || !title.trim()) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/ideas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, category: cat }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? "Couldn't add"); return; }
      setTitle(""); setBody(""); setCat("other"); setAdding(false);
      await refresh(); router.refresh();
    } finally { setBusy(false); }
  }

  async function promote(i: Idea) {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/prototypes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: i.title, brief: { change: i.body || "", problem: "", doneLooksLike: "" } }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? "Couldn't create the prototype"); return; }
      await fetch("/api/ideas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: i.id, status: "planned" }) });
      router.push(`/prototypes/${data.prototype.key}?tab=brief`);
    } finally { setBusy(false); }
  }

  const shown = filter === "open" ? items.filter((i) => i.status === "new" || i.status === "planned") : items;

  return (
    <div className="space-y-3 max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[14px] text-muted-2">Ideas to build — capture them here, then promote the ones worth testing into prototypes.</p>
        <button onClick={() => setAdding(!adding)} className="h-8 px-3 rounded-lg bg-accent text-accent-fg text-[14px] font-semibold hover:bg-accent-hover shrink-0">{adding ? "Cancel" : "Add idea"}</button>
      </div>

      {adding && (
        <div className="rounded-xl border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] p-4 space-y-2.5">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="One line — the idea" className={inp} autoFocus />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="What it is and why — this becomes the brief's starting point when you promote it." className={inp + " resize-y leading-relaxed"} />
          <div className="flex items-center justify-between gap-3">
            <select value={cat} onChange={(e) => setCat(e.target.value as (typeof CATS)[number])} className="rounded-lg bg-background border border-border px-2.5 py-1.5 text-[13px] text-foreground focus:border-accent focus:outline-none">
              {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={add} disabled={busy || !title.trim()} className="h-8 px-3.5 rounded-lg bg-accent text-accent-fg text-[14px] font-semibold hover:bg-accent-hover disabled:opacity-40">{busy ? "Adding…" : "Add to backlog"}</button>
          </div>
          {err && <div className="text-[13px] text-danger">{err}</div>}
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
          <span className="text-[14px] font-semibold">Backlog</span>
          <button onClick={() => setFilter(filter === "open" ? "all" : "open")} className="text-[14px] text-accent hover:text-accent-hover font-medium shrink-0">
            {filter === "open" ? `Show all (${items.length})` : "Show open only"}
          </button>
        </div>
        {shown.length === 0 ? (
          <div className="px-4 py-8 text-center text-[14px] text-muted-2">No {filter === "open" ? "open " : ""}ideas yet. Add one above — anything worth testing.</div>
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
                  <div className="text-[13px] text-muted-2 mt-0.5"><TimeAgo iso={i.createdAt} /></div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {i.body && <button onClick={() => setOpen(open === i.id ? null : i.id)} className="text-[14px] text-accent hover:text-accent-hover font-medium">{open === i.id ? "Hide" : "Read"}</button>}
                  {canManage && i.status !== "done" && i.status !== "declined" && (
                    <button onClick={() => promote(i)} disabled={busy} className="text-[14px] text-accent hover:text-accent-hover font-semibold">Promote →</button>
                  )}
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
    </div>
  );
}
