"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PrototypeRecord } from "@/lib/prototypes/types";

const inp = "w-full rounded-lg bg-background border border-border px-3 py-2 text-[15px] text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none";
const lbl = "block text-[13px] text-muted-2 mb-1";

/**
 * Experiment definition — the hypothesis + metrics + ownership an experiment
 * needs before it graduates to a paused Optimizely draft. The build brief lives
 * on the Setup tab and the target pages on the Pages tab; this is the rest.
 */
export function DetailsEditor({ p }: { p: PrototypeRecord }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [hChange, setHChange] = useState(p.hypothesis.change);
  const [hAudience, setHAudience] = useState(p.hypothesis.audience);
  const [hOutcome, setHOutcome] = useState(p.hypothesis.outcome);
  const [hRationale, setHRationale] = useState(p.hypothesis.rationale);
  const [primary, setPrimary] = useState(p.metrics.primary);
  const [guardrails, setGuardrails] = useState(p.metrics.guardrails.join(", "));
  const [owner, setOwner] = useState(p.owner ?? "");
  const [ticketUrl, setTicketUrl] = useState(p.ticketUrl ?? "");

  async function save() {
    if (busy) return;
    setBusy(true); setError(null); setSaved(false);
    try {
      const res = await fetch("/api/prototypes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: p.key,
          hypothesis: { change: hChange, audience: hAudience, outcome: hOutcome, rationale: hRationale },
          metrics: { primary, guardrails: guardrails.split(",").map((s) => s.trim()).filter(Boolean) },
          owner, ticketUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Save failed"); return; }
      setSaved(true); setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const empty = <span className="text-muted-2">—</span>;

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <div>
          <span className="text-[14px] font-semibold">Experiment definition</span>
          <span className="text-[13px] text-muted-2 ml-2">Hypothesis + metrics — needed before you promote to Optimizely.</span>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-[13px] text-ok">Saved</span>}
          {editing ? (
            <>
              <button onClick={() => setEditing(false)} disabled={busy} className="text-[14px] text-muted-2 hover:text-foreground">Cancel</button>
              <button onClick={save} disabled={busy} className="h-7 px-3 rounded-lg bg-accent text-accent-fg text-[14px] font-semibold hover:bg-accent-hover disabled:opacity-40">{busy ? "Saving…" : "Save"}</button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="text-[14px] text-accent hover:text-accent-hover font-medium">Edit</button>
          )}
        </div>
      </div>

      {error && <div className="px-4 py-2 text-[14px] text-danger border-b border-border">{error}</div>}

      {!editing ? (
        <div className="divide-y divide-border">
          <div className="px-4 py-3">
            <div className={lbl}>Hypothesis</div>
            {p.hypothesis.change || p.hypothesis.outcome ? (
              <div className="text-[15px] leading-relaxed">
                We believe <span className="font-medium">{p.hypothesis.change || "[change]"}</span> for{" "}
                <span className="font-medium">{p.hypothesis.audience || "[audience]"}</span> will cause{" "}
                <span className="font-medium">{p.hypothesis.outcome || "[outcome]"}</span>
                {p.hypothesis.rationale ? <> because <span className="font-medium">{p.hypothesis.rationale}</span></> : ""}.
              </div>
            ) : empty}
          </div>
          <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2">
            <div><div className={lbl}>Primary metric</div><div className="text-[15px]">{p.metrics.primary || empty}</div></div>
            <div><div className={lbl}>Guardrails</div><div className="text-[15px]">{p.metrics.guardrails.join(", ") || empty}</div></div>
            <div><div className={lbl}>Owner</div><div className="text-[15px]">{p.owner || empty}</div></div>
            <div><div className={lbl}>Ticket</div><div className="text-[15px]">{p.ticketUrl ? <a href={p.ticketUrl} target="_blank" rel="noreferrer" className="text-accent hover:text-accent-hover font-mono break-all">{p.ticketUrl}</a> : empty}</div></div>
          </div>
        </div>
      ) : (
        <div className="p-4 space-y-4">
          <div>
            <span className={lbl}>Hypothesis — we believe [change] for [audience] will cause [outcome] because [rationale]</span>
            <div className="grid grid-cols-2 gap-2">
              <input className={inp} value={hChange} onChange={(e) => setHChange(e.target.value)} placeholder="change" />
              <input className={inp} value={hAudience} onChange={(e) => setHAudience(e.target.value)} placeholder="audience" />
              <input className={inp} value={hOutcome} onChange={(e) => setHOutcome(e.target.value)} placeholder="outcome" />
              <input className={inp} value={hRationale} onChange={(e) => setHRationale(e.target.value)} placeholder="rationale" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><span className={lbl}>Primary metric</span><input className={inp} value={primary} onChange={(e) => setPrimary(e.target.value)} placeholder="room-detail click-through" /></div>
            <div><span className={lbl}>Guardrails (comma-separated)</span><input className={inp} value={guardrails} onChange={(e) => setGuardrails(e.target.value)} placeholder="bounce rate, load time" /></div>
            <div><span className={lbl}>Owner</span><input className={inp} value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="name / squad" /></div>
            <div><span className={lbl}>Ticket URL</span><input className={`${inp} font-mono`} value={ticketUrl} onChange={(e) => setTicketUrl(e.target.value)} spellCheck={false} placeholder="jira / linear" /></div>
          </div>
        </div>
      )}
    </div>
  );
}
