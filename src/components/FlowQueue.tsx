"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FlowAction } from "@/lib/prototypes/flow";

/**
 * "Up next" — the conductor in the rail. The queue RUNS the iteration loop:
 * post-kind actions execute inline (re-sync, QA generation, cut, push) with
 * progress and errors right here; paste-kind actions hand over the exact
 * line for the running agent; await-* wait items genuinely tick themselves
 * (a visibility-gated poll runs ONLY while one is showing); link-kind opens
 * the room where human judgment lives. Rooms remain for depth — the loop
 * runs from one place.
 */
export function FlowQueue({ prototypeKey, actions }: {
  prototypeKey: string;
  actions: FlowAction[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errFor, setErrFor] = useState<{ id: string; text: string; tab?: string } | null>(null);
  // Persistent note (paste line / success flash) — lives OUTSIDE the action
  // cards: a successful action drops out of the refreshed queue, and its
  // note must survive that to be copyable. Dismissed explicitly.
  const [note, setNote] = useState<{ text: string; paste?: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Waits that machines resolve (build lands, audit concludes) really do
  // tick: poll while one is visible and the tab is focused. Human-act items
  // are links, never polls.
  const awaiting = actions.some((a) => a.kind === "wait" && a.id.startsWith("await-"));
  useEffect(() => {
    if (!awaiting) return;
    const tick = () => { if (!document.hidden) router.refresh(); };
    const iv = setInterval(tick, 15_000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", tick); };
  }, [awaiting, router]);

  const busy = busyId !== null || isPending;

  async function run(a: FlowAction) {
    if (!a.post || busy) return;
    setBusyId(a.id); setErrFor(null); setNote(null);
    try {
      const body = a.id === "cut"
        ? { prototypeKey, ...a.post.body }
        : { key: prototypeKey, ...a.post.body };
      const res = await fetch(a.post.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const raw = String(data.error ?? "That didn't work — open the room for details.");
        // The push's warn-with-teeth ack is DELIBERATE friction — never
        // one-click it from the queue; route to the room that owns it. A
        // drift refusal resolves in the Brief room, wherever it surfaced.
        setErrFor({ id: a.id, text: raw.replace(/^COVERAGE_ACK_REQUIRED:\s*/, ""), tab: /drift/i.test(raw) ? "brief" : a.tab });
        return;
      }
      if (a.id === "provision" || a.id === "resync") {
        const r = data.result ?? data;
        if (r?.skillsChanged) setNote({ text: "Synced — skills changed. Paste to your running agent (then restart it):", paste: "The console re-synced the branch and the skill set changed. Run git pull, confirm the new skills under .claude/skills/, summarize what changed in one line, then stop — I'll restart you so the skills load." });
        else if (!r?.noChange) setNote({ text: "Synced. Paste to your running agent:", paste: "The console re-synced the branch — run git pull and continue; the updated .opmc/ files are your current spec." });
        else setNote({ text: "Already up to date — nothing changed." });
      } else if (a.id === "cut") {
        setNote({ text: `v${data.version?.version ?? "?"} cut ✓ — certification ${data.version?.certification?.passed === false ? "FAILED (see Experiment)" : "passed"}` });
      } else if (a.id === "push") {
        const r = data.result ?? data;
        setNote({ text: `v${r.version ?? ""} pushed ✓ · read-back ${r.verified ? "verified" : "MISMATCH — do not start the experiment"}` });
      }
      // Buttons stay disabled until the refreshed queue lands — a re-enabled
      // button over stale actions was a double-cut waiting to happen.
      startTransition(() => router.refresh());
    } catch {
      setErrFor({ id: a.id, text: "Network hiccup — try again.", tab: a.tab });
    } finally { setBusyId(null); }
  }

  async function copyText(id: string, text: string) {
    try { await navigator.clipboard.writeText(text); setCopiedId(id); setTimeout(() => setCopiedId(null), 1500); } catch { /* clipboard blocked */ }
  }

  // ONE action visible; the rest is a preview line. The rail carries one
  // nav (rooms), one status (chip + dots), ONE action surface — stacking a
  // second numbered list next to the room list was a hierarchy mess.
  const shown = expanded ? actions : actions.slice(0, 1);
  const hidden = actions.length - shown.length;
  const preview = expanded ? [] : actions.slice(1, 4);

  return (
    <div className="mt-2.5 space-y-1.5">

      {note && (
        <div className="rounded-lg border border-ok/40 bg-[color-mix(in_srgb,var(--ok)_5%,transparent)] px-2.5 py-2">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-ok min-w-0">{note.text}</span>
            <button onClick={() => setNote(null)} className="ml-auto text-[12px] text-muted-2 hover:text-foreground shrink-0">✕</button>
          </div>
          {note.paste && (
            <div className="mt-1.5 flex items-start gap-1.5 rounded-md border border-border bg-background px-2 py-1.5">
              <code className="text-[11px] text-foreground/90 leading-snug min-w-0 flex-1 whitespace-pre-wrap">{note.paste}</code>
              <button onClick={() => copyText("note", note.paste!)} className="text-[11.5px] text-accent hover:text-accent-hover font-medium shrink-0">{copiedId === "note" ? "Copied" : "Copy"}</button>
            </div>
          )}
        </div>
      )}

      {!actions.length && <div className="text-[12.5px] text-ok">✓ All caught up — nothing pending.</div>}

      {shown.map((a, i) => {
        const first = i === 0;
        const machineWait = a.kind === "wait" && a.id.startsWith("await-");
        return (
          <div key={a.id} className={`rounded-lg border px-2.5 py-2 ${first ? "border-border-strong bg-surface" : "border-border/70 bg-surface/60"}`}>
            <div className="flex items-center gap-2">
              <span className={`text-[9.5px] font-bold uppercase tracking-[0.08em] shrink-0 ${first ? "text-accent" : "text-muted-2"}`}>{first ? "Next" : i + 1}</span>
              {machineWait && <span className="w-1.5 h-1.5 rounded-full bg-warn animate-pulse shrink-0" />}
              <span className={`text-[12.5px] font-semibold min-w-0 ${expanded ? "truncate" : ""} ${first ? "" : "text-muted"}`}>{a.label}</span>
              <span className="ml-auto shrink-0">
                {a.kind === "post" && (
                  <button onClick={() => run(a)} disabled={busy}
                    className={`h-6 px-2.5 rounded-md text-[12px] font-semibold ${first ? "bg-accent text-accent-fg hover:bg-accent-hover" : "border border-border text-muted hover:text-foreground"} disabled:opacity-40`}>
                    {busyId === a.id || (isPending && !busyId) ? "Running…" : "Run"}
                  </button>
                )}
                {a.kind === "paste" && (
                  <button onClick={() => copyText(a.id, a.paste ?? "")}
                    className={`h-6 px-2.5 rounded-md text-[12px] font-semibold ${first ? "bg-accent text-accent-fg hover:bg-accent-hover" : "border border-border text-muted hover:text-foreground"}`}>
                    {copiedId === a.id ? "Copied" : "Copy line"}
                  </button>
                )}
                {(a.kind === "link" || (a.kind === "wait" && !machineWait)) && a.tab && (
                  <Link href={`?tab=${a.tab}${a.anchor ? `#${a.anchor}` : ""}`} className={`inline-flex items-center h-6 px-2.5 rounded-md text-[12px] font-semibold ${first && a.kind === "link" ? "bg-accent text-accent-fg hover:bg-accent-hover" : "border border-border text-muted hover:text-foreground"}`}>Open</Link>
                )}
              </span>
            </div>
            <div className="text-[11.5px] text-muted-2 leading-snug mt-1">{a.why}</div>
            {errFor?.id === a.id && (
              <div className="text-[11.5px] text-danger leading-snug mt-1">
                {errFor.text}{errFor.tab ? <> · <Link href={`?tab=${errFor.tab}`} className="underline underline-offset-2">open the room</Link></> : null}
              </div>
            )}
          </div>
        );
      })}
      {/* The rest of the loop as a PREVIEW LINE, not more cards — order at a
          glance without a second list competing with the rooms below. */}
      {preview.length > 0 && (
        <button onClick={() => setExpanded(true)} className="block text-left text-[11px] text-muted-2 hover:text-foreground leading-snug">
          then: {preview.map((a) => a.label).join(" → ")}{hidden > preview.length ? " → …" : ""}
        </button>
      )}
      {expanded && actions.length > 1 && (
        <button onClick={() => setExpanded(false)} className="text-[11.5px] text-muted-2 hover:text-foreground underline underline-offset-2">show less</button>
      )}
    </div>
  );
}
