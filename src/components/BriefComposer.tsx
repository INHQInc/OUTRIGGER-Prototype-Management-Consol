"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PrototypeBrief, PrototypeHypothesis, PrototypeMetrics } from "@/lib/prototypes/types";
import type { BriefDraft } from "@/lib/ai/brief";

const inp = "w-full rounded-lg bg-background border border-border px-3 py-2 text-[14px] text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none";
const ta = inp + " resize-y leading-relaxed";
const lbl = "block text-[13px] text-muted-2 mb-1";

/** Split a stored criteria string back into checkable lines. */
function criteriaLines(s: string): string[] {
  return s.split(/\n+/).map((l) => l.replace(/^[-•]\s*/, "").trim()).filter(Boolean);
}

/** Claude's own readiness → the band shown on the meter. */
function readinessBand(r: number): { label: string; color: string; track: string } {
  if (r >= 90) return { label: "Ready to build", color: "var(--ok)", track: "bg-ok" };
  if (r >= 70) return { label: "Nearly there", color: "var(--accent)", track: "bg-accent" };
  if (r >= 40) return { label: "Taking shape", color: "var(--warn)", track: "bg-warn" };
  return { label: "Getting oriented", color: "var(--warn)", track: "bg-warn" };
}

/**
 * A meter that fills to Claude's OWN reported confidence that the brief is
 * buildable — not a fake timer. It animates toward the returned value, so
 * answering questions and re-drafting visibly climbs (or honestly dips) it.
 */
function ReadinessMeter({ readiness, drafting }: { readiness: number | null; drafting: boolean }) {
  const [fill, setFill] = useState(0);
  useEffect(() => { if (readiness != null) { const t = setTimeout(() => setFill(readiness), 60); return () => clearTimeout(t); } }, [readiness]);
  if (readiness == null && !drafting) return null;
  const band = readinessBand(readiness ?? 0);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[12.5px]">
        <span className="text-muted-2">{drafting ? "Reading your idea…" : "Claude's confidence this is buildable"}</span>
        {readiness != null && !drafting && <span className="font-semibold" style={{ color: band.color }}>{band.label} · {readiness}%</span>}
      </div>
      <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
        {drafting ? (
          <div className="h-full w-1/3 rounded-full bg-accent/60 animate-pulse" />
        ) : (
          <div className={`h-full rounded-full ${band.track} transition-[width] duration-700 ease-out`} style={{ width: `${fill}%` }} />
        )}
      </div>
    </div>
  );
}

/**
 * The brief composer — the gate, made easy, in two honest layers:
 *
 *   READ — the brief as a document (headers, bullets, the hypothesis as a
 *   sentence). This is what a brief IS; it's what reviewers and agents consume.
 *   EDIT — the form, for surgical changes.
 *
 * Claude (initialized by the opmc-brief-author library skill) drafts; each
 * clarifying question gets its own answer box; the human stays the editor.
 */
export function BriefComposer({ prototypeKey, initialBrief, initialHypothesis, initialMetrics }: {
  prototypeKey: string;
  initialBrief: PrototypeBrief;
  initialHypothesis: PrototypeHypothesis;
  initialMetrics: PrototypeMetrics;
}) {
  const router = useRouter();
  const [explain, setExplain] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [qAnswers, setQAnswers] = useState<string[]>([]);
  const [readiness, setReadiness] = useState<number | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(!initialBrief.change?.trim());

  const [brief, setBrief] = useState<PrototypeBrief>(initialBrief);
  const [hyp, setHyp] = useState<PrototypeHypothesis>(initialHypothesis);
  const [metrics, setMetrics] = useState<PrototypeMetrics>(initialMetrics);
  const [saved, setSaved] = useState(JSON.stringify({ brief: initialBrief, hyp: initialHypothesis, metrics: initialMetrics }));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState(false);

  const dirty = JSON.stringify({ brief, hyp, metrics }) !== saved;
  const hasContent = Boolean(brief.change?.trim());

  async function draft() {
    if (drafting || !explain.trim()) return;
    setDrafting(true); setAiErr(null);
    const answers = questions
      .map((q, i) => (qAnswers[i]?.trim() ? `Q: ${q}\nA: ${qAnswers[i].trim()}` : null))
      .filter(Boolean).join("\n\n");
    try {
      const res = await fetch("/api/prototypes/brief-draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: prototypeKey, text: explain, answers: answers || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setAiErr(data.error ?? "Drafting failed"); return; }
      const d = data.draft as BriefDraft;
      setBrief({
        change: d.brief.change,
        problem: d.brief.problem,
        doneLooksLike: (d.brief.doneLooksLike ?? []).join("\n"),
        where: d.brief.where || undefined,
        constraints: d.brief.constraints || undefined,
        reference: brief.reference,
      });
      setHyp(d.hypothesis);
      setMetrics({ primary: d.metrics.primary, guardrails: d.metrics.guardrails ?? [] });
      setQuestions(d.clarifying_questions ?? []);
      setQAnswers(new Array((d.clarifying_questions ?? []).length).fill(""));
      setReadiness(typeof d.readiness === "number" ? d.readiness : null);
      setEditing(false); // land on the DOCUMENT, not the form
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
      setMsg({ ok: true, text: "Brief saved — the gate is open." });
      router.refresh();
    } finally { setBusy(false); }
  }

  const saveBar = (
    <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
      <span className={`text-[13px] min-w-0 ${msg ? (msg.ok ? "text-ok" : "text-danger") : dirty ? "text-warn" : hasContent ? "text-ok" : "text-muted-2"}`}>
        {msg ? msg.text : dirty ? "Unsaved changes — the gate reads the saved brief." : hasContent ? "Saved — the gate is open." : "The brief is the gate: no build until it's written."}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={() => setEditing(!editing)} className="h-8 px-3 rounded-lg border border-border text-[14px] text-muted hover:text-foreground hover:border-border-strong">{editing ? "Read view" : "Edit fields"}</button>
        {dirty ? (
          <button onClick={save} disabled={busy} className="h-8 px-3.5 rounded-lg bg-accent text-accent-fg text-[14px] font-semibold hover:bg-accent-hover disabled:opacity-40">{busy ? "Saving…" : "Save brief"}</button>
        ) : (
          <span className="h-8 px-3 rounded-lg border border-ok/40 text-ok text-[14px] font-semibold flex items-center">Saved ✓</span>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* AI on-ramp — prominent when empty, a quiet drawer once the brief exists */}
      <details open={aiOpen} onToggle={(e) => setAiOpen((e.target as HTMLDetailsElement).open)} className="group rounded-xl border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_4%,transparent)]">
        <summary className="px-3.5 py-2.5 cursor-pointer select-none list-none flex items-center gap-2">
          <span className="text-[14px] font-semibold">✦ Draft with AI</span>
          <span className="text-[13px] text-muted-2">explain it in your own words — Claude writes the structured brief</span>
          <span className="ml-auto text-[12.5px] text-muted-2 group-open:hidden">open</span>
        </summary>
        <div className="px-3.5 pb-3.5 space-y-2.5">
          <textarea value={explain} onChange={(e) => setExplain(e.target.value)} rows={3} className={ta}
            placeholder="e.g. When people click a room card I want a rich overlay with the gallery, amenities and a booking button, instead of losing them to the detail page. Success is more availability checks." />
          {(readiness != null || drafting) && <ReadinessMeter readiness={readiness} drafting={drafting} />}
          {questions.length > 0 && (
            <div className="rounded-lg border border-warn/30 bg-surface-2/30 px-3 py-2.5 space-y-3">
              <div className="text-[13px] font-semibold text-warn">Claude asked {questions.length} question{questions.length === 1 ? "" : "s"} — answer any of them and draft again:</div>
              {questions.map((q, i) => (
                <div key={i} className="space-y-1">
                  <div className="text-[13px] text-foreground leading-snug">{i + 1} · {q}</div>
                  <input value={qAnswers[i] ?? ""} onChange={(e) => setQAnswers((a) => a.map((v, j) => (j === i ? e.target.value : v)))} className={inp} placeholder="Your answer (optional)" />
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-muted-2 min-w-0">{aiErr ? <span className="text-danger">{aiErr}</span> : "The draft lands as a readable brief below — you stay the editor."}</span>
            <button onClick={draft} disabled={drafting || !explain.trim()} className="h-8 px-3.5 rounded-lg bg-accent text-accent-fg text-[14px] font-semibold hover:bg-accent-hover disabled:opacity-40 shrink-0">
              {drafting ? "Drafting…" : questions.length ? "Draft again" : "Draft with AI"}
            </button>
          </div>
        </div>
      </details>

      {/* THE BRIEF — a document first, a form only on request */}
      {!editing && hasContent ? (
        <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
          <div>
            <div className="text-[12.5px] font-semibold uppercase tracking-wider text-muted-2 mb-1">The change</div>
            <p className="text-[15px] text-foreground leading-relaxed">{brief.change}</p>
          </div>
          {brief.where && (
            <div>
              <div className="text-[12.5px] font-semibold uppercase tracking-wider text-muted-2 mb-1">Where · trigger</div>
              <p className="text-[14px] text-foreground/90 leading-relaxed">{brief.where}</p>
            </div>
          )}
          {brief.doneLooksLike?.trim() && (
            <div>
              <div className="text-[12.5px] font-semibold uppercase tracking-wider text-muted-2 mb-1.5">Done looks like</div>
              <ul className="space-y-1">
                {criteriaLines(brief.doneLooksLike).map((c, i) => (
                  <li key={i} className="text-[14px] text-foreground/90 leading-relaxed flex gap-2"><span className="text-ok shrink-0">✓</span><span>{c}</span></li>
                ))}
              </ul>
            </div>
          )}
          {(hyp.change || hyp.outcome) && (
            <div className="rounded-lg bg-surface-2/40 border border-border/60 px-3.5 py-3">
              <div className="text-[12.5px] font-semibold uppercase tracking-wider text-muted-2 mb-1">Hypothesis</div>
              <p className="text-[14px] leading-relaxed text-foreground/90">
                We believe <b className="text-foreground">{hyp.change || "[the change]"}</b> for <b className="text-foreground">{hyp.audience || "[audience]"}</b> will cause <b className="text-foreground">{hyp.outcome || "[outcome]"}</b>{hyp.rationale ? <> because {hyp.rationale}</> : null}.
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            {brief.problem?.trim() && (
              <div>
                <div className="text-[12.5px] font-semibold uppercase tracking-wider text-muted-2 mb-1">Problem · opportunity</div>
                <p className="text-[14px] text-muted leading-relaxed">{brief.problem}</p>
              </div>
            )}
            {brief.constraints?.trim() && (
              <div>
                <div className="text-[12.5px] font-semibold uppercase tracking-wider text-muted-2 mb-1">Guardrails · do-not-touch</div>
                <p className="text-[14px] text-muted leading-relaxed">{brief.constraints}</p>
              </div>
            )}
          </div>
          <div>
            <div className="text-[12.5px] font-semibold uppercase tracking-wider text-muted-2 mb-1.5">Success metrics</div>
            {metrics.primary || metrics.guardrails.length ? (
              <div className="space-y-1.5">
                {metrics.primary && (
                  <div className="text-[14px] text-foreground/90 leading-relaxed flex gap-2">
                    <span className="text-[12.5px] px-1.5 py-0.5 rounded bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-accent font-semibold shrink-0 h-fit">DECISION</span>
                    <span>{metrics.primary}</span>
                  </div>
                )}
                {metrics.guardrails.map((g, i) => (
                  <div key={i} className="text-[14px] text-muted leading-relaxed flex gap-2">
                    <span className="text-[12.5px] px-1.5 py-0.5 rounded bg-surface-2 text-muted-2 font-medium shrink-0 h-fit">GUARDRAIL</span>
                    <span>{g}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[14px] text-muted-2">No metric set yet — add the one event that decides this experiment.</p>
            )}
          </div>
          {saveBar}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface p-3.5 space-y-3">
          <div>
            <label className={lbl}>The change — what we&apos;re building <span className="text-danger">*</span></label>
            <textarea value={brief.change} onChange={(e) => { setBrief({ ...brief, change: e.target.value }); setMsg(null); }} rows={4} className={ta} placeholder="Concrete and visual — a stranger could build from this." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Where on the page / trigger</label>
              <textarea value={brief.where ?? ""} onChange={(e) => { setBrief({ ...brief, where: e.target.value || undefined }); setMsg(null); }} rows={2} className={ta} />
            </div>
            <div>
              <label className={lbl}>Primary metric (the decision)</label>
              <textarea value={metrics.primary} onChange={(e) => { setMetrics({ ...metrics, primary: e.target.value }); setMsg(null); }} rows={2} className={ta} placeholder="one measurable event" />
            </div>
          </div>
          <div>
            <label className={lbl}>Done looks like — one criterion per line</label>
            <textarea value={brief.doneLooksLike} onChange={(e) => { setBrief({ ...brief, doneLooksLike: e.target.value }); setMsg(null); }} rows={5} className={ta} placeholder={"Every room card shows a View Room Details CTA\nClicking opens the modal with that room's data\n…"} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>Problem / opportunity</label><textarea value={brief.problem} onChange={(e) => setBrief({ ...brief, problem: e.target.value })} rows={3} className={ta} /></div>
            <div><label className={lbl}>Guardrails / do-not-touch</label><textarea value={brief.constraints ?? ""} onChange={(e) => setBrief({ ...brief, constraints: e.target.value || undefined })} rows={3} className={ta} /></div>
          </div>
          <div className="rounded-lg border border-border/60 bg-surface-2/20 p-3 space-y-2">
            <div className="text-[13px] font-semibold text-muted">Hypothesis — we believe…</div>
            <div className="grid grid-cols-2 gap-2">
              <textarea value={hyp.change} onChange={(e) => setHyp({ ...hyp, change: e.target.value })} rows={2} className={ta} placeholder="the change…" />
              <textarea value={hyp.audience} onChange={(e) => setHyp({ ...hyp, audience: e.target.value })} rows={2} className={ta} placeholder="for this audience…" />
              <textarea value={hyp.outcome} onChange={(e) => setHyp({ ...hyp, outcome: e.target.value })} rows={2} className={ta} placeholder="will cause this outcome…" />
              <textarea value={hyp.rationale} onChange={(e) => setHyp({ ...hyp, rationale: e.target.value })} rows={2} className={ta} placeholder="because…" />
            </div>
          </div>
          <div>
            <label className={lbl}>Metric guardrails (comma-separated — what must not regress)</label>
            <input value={metrics.guardrails.join(", ")} onChange={(e) => setMetrics({ ...metrics, guardrails: e.target.value.split(",").map((g) => g.trim()).filter(Boolean) })} className={inp} />
          </div>
          {saveBar}
        </div>
      )}
    </div>
  );
}
