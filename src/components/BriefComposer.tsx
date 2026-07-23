"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PrototypeBrief, PrototypeHypothesis, PrototypeMetrics } from "@/lib/prototypes/types";
import type { BriefDraft } from "@/lib/ai/brief";

const inp = "w-full rounded-lg bg-background border border-border px-3 py-2 text-[12.5px] text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none";
const ta = inp + " resize-y leading-relaxed";
const lbl = "block text-[11px] text-muted-2 mb-1";

/**
 * The brief composer — the gate, made easy. Explain the experiment in your own
 * words; Claude (initialized by the opmc-brief-author skill from the library)
 * drafts the structured brief: change, where, acceptance criteria, guardrails,
 * a falsifiable hypothesis, one primary metric. Everything stays editable —
 * the AI drafts, the human owns.
 */
export function BriefComposer({ prototypeKey, initialBrief, initialHypothesis, initialMetrics }: {
  prototypeKey: string;
  initialBrief: PrototypeBrief;
  initialHypothesis: PrototypeHypothesis;
  initialMetrics: PrototypeMetrics;
}) {
  const router = useRouter();
  const [explain, setExplain] = useState("");
  const [answers, setAnswers] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);

  const [brief, setBrief] = useState<PrototypeBrief>(initialBrief);
  const [hyp, setHyp] = useState<PrototypeHypothesis>(initialHypothesis);
  const [metrics, setMetrics] = useState<PrototypeMetrics>(initialMetrics);
  const [saved, setSaved] = useState(JSON.stringify({ brief: initialBrief, hyp: initialHypothesis, metrics: initialMetrics }));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showAll, setShowAll] = useState(false);

  const dirty = JSON.stringify({ brief, hyp, metrics }) !== saved;

  async function draft() {
    if (drafting || !explain.trim()) return;
    setDrafting(true); setAiErr(null);
    try {
      const res = await fetch("/api/prototypes/brief-draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: prototypeKey, text: explain, answers: answers.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setAiErr(data.error ?? "Drafting failed"); return; }
      const d = data.draft as BriefDraft;
      setBrief({ change: d.brief.change, problem: d.brief.problem, doneLooksLike: d.brief.doneLooksLike, where: d.brief.where || undefined, constraints: d.brief.constraints || undefined, reference: brief.reference });
      setHyp(d.hypothesis);
      setMetrics({ primary: d.metrics.primary, guardrails: d.metrics.guardrails ?? [] });
      setQuestions(d.clarifying_questions ?? []);
      setShowAll(true);
      setMsg(null);
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : "Drafting failed");
    } finally { setDrafting(false); }
  }

  async function save() {
    if (busy || !dirty) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/prototypes", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: prototypeKey, brief, hypothesis: hyp, metrics }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg({ ok: false, text: data.error ?? "Save failed" }); return; }
      setSaved(JSON.stringify({ brief, hyp, metrics }));
      setMsg({ ok: true, text: "Brief saved — the gate is open. Re-sync the branch so Claude builds against it." });
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      {/* Explain it — the AI on-ramp */}
      <div className="rounded-xl border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] p-3.5 space-y-2">
        <div className="text-[12px] font-semibold">Explain the experiment in your own words</div>
        <textarea value={explain} onChange={(e) => setExplain(e.target.value)} rows={3} className={ta}
          placeholder="e.g. When people click a room card I want a rich overlay with the gallery, amenities and a booking button, instead of losing them to the detail page. Success is more availability checks." />
        {questions.length > 0 && (
          <div className="rounded-lg border border-border bg-surface-2/30 px-3 py-2 space-y-1.5">
            <div className="text-[11px] font-semibold text-warn">Claude asked:</div>
            {questions.map((q, i) => <div key={i} className="text-[11.5px] text-ice text-foreground">· {q}</div>)}
            <textarea value={answers} onChange={(e) => setAnswers(e.target.value)} rows={2} className={ta} placeholder="Answer here (optional), then draft again." />
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-muted-2 min-w-0">{aiErr ? <span className="text-danger">{aiErr}</span> : "Claude drafts the structured brief — change, acceptance criteria, hypothesis, metric. You stay the editor."}</span>
          <button onClick={draft} disabled={drafting || !explain.trim()} className="h-8 px-3.5 rounded-lg bg-accent text-accent-fg text-[12px] font-semibold hover:bg-accent-hover disabled:opacity-40 shrink-0">
            {drafting ? "Drafting…" : questions.length ? "Draft again" : "Draft with AI"}
          </button>
        </div>
      </div>

      {/* The structured brief — always editable, AI or not */}
      <div className="rounded-xl border border-border bg-surface p-3.5 space-y-3">
        <div>
          <label className={lbl}>The change — what we&apos;re building <span className="text-danger">*</span></label>
          <textarea value={brief.change} onChange={(e) => { setBrief({ ...brief, change: e.target.value }); setMsg(null); }} rows={2} className={ta} placeholder="Concrete and visual — a stranger could build from this." />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Where on the page / trigger</label>
            <input value={brief.where ?? ""} onChange={(e) => { setBrief({ ...brief, where: e.target.value || undefined }); setMsg(null); }} className={inp} />
          </div>
          <div>
            <label className={lbl}>Primary metric (the decision)</label>
            <input value={metrics.primary} onChange={(e) => { setMetrics({ ...metrics, primary: e.target.value }); setMsg(null); }} className={inp} placeholder="one measurable event" />
          </div>
        </div>
        <div>
          <label className={lbl}>Done looks like — acceptance criteria a reviewer can check</label>
          <textarea value={brief.doneLooksLike} onChange={(e) => { setBrief({ ...brief, doneLooksLike: e.target.value }); setMsg(null); }} rows={2} className={ta} />
        </div>

        <button onClick={() => setShowAll(!showAll)} className="text-[11px] text-accent hover:text-accent-hover font-medium">{showAll ? "Hide" : "Show"} hypothesis, guardrails &amp; problem</button>
        {showAll && (
          <div className="space-y-3 border-t border-border/60 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>Problem / opportunity</label><textarea value={brief.problem} onChange={(e) => setBrief({ ...brief, problem: e.target.value })} rows={2} className={ta} /></div>
              <div><label className={lbl}>Guardrails / do-not-touch</label><textarea value={brief.constraints ?? ""} onChange={(e) => setBrief({ ...brief, constraints: e.target.value || undefined })} rows={2} className={ta} /></div>
            </div>
            <div className="rounded-lg border border-border/60 bg-surface-2/20 p-3 space-y-2">
              <div className="text-[11px] font-semibold text-muted">Hypothesis — we believe…</div>
              <div className="grid grid-cols-2 gap-2">
                <input value={hyp.change} onChange={(e) => setHyp({ ...hyp, change: e.target.value })} className={inp} placeholder="the change…" />
                <input value={hyp.audience} onChange={(e) => setHyp({ ...hyp, audience: e.target.value })} className={inp} placeholder="for this audience…" />
                <input value={hyp.outcome} onChange={(e) => setHyp({ ...hyp, outcome: e.target.value })} className={inp} placeholder="will cause this outcome…" />
                <input value={hyp.rationale} onChange={(e) => setHyp({ ...hyp, rationale: e.target.value })} className={inp} placeholder="because…" />
              </div>
            </div>
            <div>
              <label className={lbl}>Metric guardrails (comma-separated — what must not regress)</label>
              <input value={metrics.guardrails.join(", ")} onChange={(e) => setMetrics({ ...metrics, guardrails: e.target.value.split(",").map((g) => g.trim()).filter(Boolean) })} className={inp} />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
          <span className={`text-[11px] min-w-0 ${msg ? (msg.ok ? "text-ok" : "text-danger") : dirty ? "text-warn" : brief.change.trim() ? "text-ok" : "text-muted-2"}`}>
            {msg ? msg.text : dirty ? "Unsaved changes — the gate reads the saved brief." : brief.change.trim() ? "Saved — the gate is open." : "The brief is the gate: no build until it's written."}
          </span>
          {dirty ? (
            <button onClick={save} disabled={busy} className="h-8 px-3.5 rounded-lg bg-accent text-accent-fg text-[12px] font-semibold hover:bg-accent-hover disabled:opacity-40 shrink-0">{busy ? "Saving…" : "Save brief"}</button>
          ) : (
            <span className="h-8 px-3 rounded-lg border border-ok/40 text-ok text-[12px] font-semibold flex items-center shrink-0">Saved ✓</span>
          )}
        </div>
      </div>
    </div>
  );
}
