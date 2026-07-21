"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PrototypeRecord } from "@/lib/prototypes/types";

const inp = "w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none";
const lbl = "block text-[11px] text-muted-2 mb-1";

type Target = { url: string; source: "clone" | "live" };

/**
 * Editable prototype details — targets, hypothesis, brief, metrics, ownership.
 * Created as a minimal stub; this is where the rest gets filled in as the work
 * matures (an experiment needs the hypothesis + metric before Promote).
 */
export function DetailsEditor({ p }: { p: PrototypeRecord }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [targets, setTargets] = useState<Target[]>(p.targets.length ? p.targets : [{ url: "", source: "live" }]);
  const [hChange, setHChange] = useState(p.hypothesis.change);
  const [hAudience, setHAudience] = useState(p.hypothesis.audience);
  const [hOutcome, setHOutcome] = useState(p.hypothesis.outcome);
  const [hRationale, setHRationale] = useState(p.hypothesis.rationale);
  const [problem, setProblem] = useState(p.brief.problem);
  const [change, setChange] = useState(p.brief.change);
  const [done, setDone] = useState(p.brief.doneLooksLike);
  const [primary, setPrimary] = useState(p.metrics.primary);
  const [guardrails, setGuardrails] = useState(p.metrics.guardrails.join(", "));
  const [owner, setOwner] = useState(p.owner ?? "");
  const [ticketUrl, setTicketUrl] = useState(p.ticketUrl ?? "");

  function setTarget(i: number, patch: Partial<Target>) {
    setTargets((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  }

  async function save() {
    if (busy) return;
    setBusy(true); setError(null); setSaved(false);
    try {
      const res = await fetch("/api/prototypes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: p.key,
          targets: targets.filter((t) => t.url.trim()),
          hypothesis: { change: hChange, audience: hAudience, outcome: hOutcome, rationale: hRationale },
          brief: { problem, change, doneLooksLike: done },
          metrics: { primary, guardrails: guardrails.split(",").map((s) => s.trim()).filter(Boolean) },
          owner, ticketUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Save failed"); return; }
      setSaved(true); setEditing(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const empty = <span className="text-muted-2">—</span>;

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <span className="text-[12px] font-semibold">Details</span>
        <div className="flex items-center gap-3">
          {saved && <span className="text-[11px] text-ok">Saved</span>}
          {editing ? (
            <>
              <button onClick={() => setEditing(false)} disabled={busy} className="text-[12px] text-muted-2 hover:text-foreground">Cancel</button>
              <button onClick={save} disabled={busy} className="h-7 px-3 rounded-lg bg-accent text-accent-fg text-[12px] font-semibold hover:bg-accent-hover disabled:opacity-40">{busy ? "Saving…" : "Save"}</button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="text-[12px] text-accent hover:text-accent-hover font-medium">Edit</button>
          )}
        </div>
      </div>

      {error && <div className="px-4 py-2 text-[12px] text-danger border-b border-border">{error}</div>}

      {!editing ? (
        <div className="divide-y divide-border">
          <div className="px-4 py-3">
            <div className={lbl}>Target page(s)</div>
            {p.targets.length ? p.targets.map((t, i) => (
              <div key={i} className="text-[13px] font-mono">{t.url} <span className="text-muted-2">· {t.source}</span></div>
            )) : empty}
          </div>
          <div className="px-4 py-3">
            <div className={lbl}>Hypothesis</div>
            {p.hypothesis.change || p.hypothesis.outcome ? (
              <div className="text-[13px] leading-relaxed">
                We believe <span className="font-medium">{p.hypothesis.change || "[change]"}</span> for{" "}
                <span className="font-medium">{p.hypothesis.audience || "[audience]"}</span> will cause{" "}
                <span className="font-medium">{p.hypothesis.outcome || "[outcome]"}</span>
                {p.hypothesis.rationale ? <> because <span className="font-medium">{p.hypothesis.rationale}</span></> : ""}.
              </div>
            ) : empty}
          </div>
          <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2">
            <div><div className={lbl}>Primary metric</div><div className="text-[13px]">{p.metrics.primary || empty}</div></div>
            <div><div className={lbl}>Guardrails</div><div className="text-[13px]">{p.metrics.guardrails.join(", ") || empty}</div></div>
            <div><div className={lbl}>Owner</div><div className="text-[13px]">{p.owner || empty}</div></div>
            <div><div className={lbl}>Ticket</div><div className="text-[13px]">{p.ticketUrl ? <a href={p.ticketUrl} target="_blank" rel="noreferrer" className="text-accent hover:text-accent-hover font-mono break-all">{p.ticketUrl}</a> : empty}</div></div>
          </div>
          {(p.brief.problem || p.brief.change || p.brief.doneLooksLike) && (
            <div className="px-4 py-3 space-y-2">
              {p.brief.problem && <div><div className={lbl}>Problem / opportunity</div><div className="text-[13px] leading-relaxed">{p.brief.problem}</div></div>}
              {p.brief.change && <div><div className={lbl}>What it changes</div><div className="text-[13px] leading-relaxed">{p.brief.change}</div></div>}
              {p.brief.doneLooksLike && <div><div className={lbl}>Done looks like</div><div className="text-[13px] leading-relaxed">{p.brief.doneLooksLike}</div></div>}
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className={lbl}>Target page(s)</span>
              <button type="button" onClick={() => setTargets((ts) => [...ts, { url: "", source: "live" }])} className="text-[12px] text-accent hover:text-accent-hover">+ Add page</button>
            </div>
            {targets.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className={`${inp} font-mono`} value={t.url} onChange={(e) => setTarget(i, { url: e.target.value })} spellCheck={false} placeholder="https://…/rooms or /rooms/*" />
                <button type="button" onClick={() => setTarget(i, { source: t.source === "live" ? "clone" : "live" })} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border shrink-0 ${t.source === "live" ? "border-accent text-accent" : "border-border text-muted"}`}>{t.source}</button>
                {targets.length > 1 && <button type="button" onClick={() => setTargets((ts) => ts.filter((_, j) => j !== i))} className="text-[13px] text-danger px-1">✕</button>}
              </div>
            ))}
          </div>

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

          <div className="space-y-2">
            <div><span className={lbl}>Problem / opportunity</span><textarea className={inp} rows={2} value={problem} onChange={(e) => setProblem(e.target.value)} /></div>
            <div><span className={lbl}>What it changes</span><textarea className={inp} rows={2} value={change} onChange={(e) => setChange(e.target.value)} /></div>
            <div><span className={lbl}>Done looks like</span><input className={inp} value={done} onChange={(e) => setDone(e.target.value)} /></div>
          </div>
        </div>
      )}
    </div>
  );
}
