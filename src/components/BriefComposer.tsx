"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { referenceKind, normalizeReferenceUrl, isBriefComplete, type PrototypeBrief, type PrototypeHypothesis, type PrototypeMetrics, type BriefReference, type BriefReferenceKind } from "@/lib/prototypes/types";
import type { BriefDraft, BriefSection, BriefDriftReport } from "@/lib/ai/brief";
import { TimeAgo } from "@/components/ui";

const REF_META: Record<BriefReferenceKind, { icon: string; label: string }> = {
  figma: { icon: "🎨", label: "Figma" },
  image: { icon: "🖼", label: "Screenshot" },
  design: { icon: "✎", label: "Design" },
  doc: { icon: "📄", label: "Doc" },
  link: { icon: "🔗", label: "Link" },
};

/**
 * Supporting links on the brief — Figma, design files, screenshots, reference
 * pages. Links only (no upload — no blob store yet); a screenshot is added by
 * its URL. Each is typed from its URL so the building agent knows what it is.
 */
function ReferencesEditor({ references, onAdd, onRemove }: {
  references: BriefReference[];
  onAdd: (url: string, label?: string) => void;
  onRemove: (i: number) => void;
}) {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [hint, setHint] = useState(false);
  // Smart: accept "figma.com/…", "www.foo.com", a bare domain, or a full link.
  const normalized = normalizeReferenceUrl(url);
  // No w-full here — appending it to `inp` collided with flex-1/w-40 and
  // collapsed the URL field to nothing.
  const field = "rounded-lg bg-background border border-border px-3 py-2 text-[13px] text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none";
  // Never a greyed always-disabled button — click always does something, and
  // an invalid/empty URL explains itself instead of looking broken.
  function add() {
    if (!normalized) { setHint(true); return; }
    onAdd(normalized, label.trim() || undefined); setUrl(""); setLabel(""); setHint(false);
  }
  return (
    <div className="space-y-2">
      {references.length > 0 && (
        <div className="space-y-1">
          {references.map((r, i) => {
            const m = REF_META[r.kind] ?? REF_META.link;
            return (
              <div key={`${r.url}-${i}`} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2/30 px-2.5 py-1.5">
                <span className="shrink-0" title={m.label}>{m.icon}</span>
                <span className="text-[12px] px-1.5 py-0.5 rounded bg-surface-2 text-muted-2 font-medium shrink-0">{m.label}</span>
                <a href={r.url} target="_blank" rel="noreferrer" className="text-[13px] text-accent hover:text-accent-hover truncate min-w-0 flex-1">{r.label || r.url}</a>
                <button onClick={() => onRemove(i)} className="text-[13px] text-muted-2 hover:text-danger shrink-0">Remove</button>
              </div>
            );
          })}
        </div>
      )}
      {/* URL is the field — full width, on its own line. Label + Add below. */}
      <div className="space-y-1.5">
        <input value={url} onChange={(e) => { setUrl(e.target.value); setHint(false); }} onKeyDown={(e) => e.key === "Enter" && add()} spellCheck={false}
          placeholder="Paste a link — figma.com/…, a screenshot, a page (no https:// needed)" className={`${field} w-full`} />
        <div className="flex items-center gap-2">
          <input value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} spellCheck={false}
            placeholder="Label (optional)" className={`${field} flex-1 min-w-0`} />
          <button onClick={add} className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover shrink-0">Add link</button>
        </div>
        {hint && !normalized && <div className="text-[12.5px] text-warn">That doesn&apos;t look like a web address — try something like <span className="font-mono">figma.com/file/…</span> or a full URL.</div>}
      </div>
    </div>
  );
}

const inp = "w-full rounded-lg bg-background border border-border px-3 py-2 text-[14px] text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none";
const ta = inp + " resize-y leading-relaxed";
const lbl = "block text-[13px] text-muted-2 mb-1";
// Every brief section is this card, so they read as independent parts.
const card = "rounded-lg bg-surface-2/40 border border-border/60 px-3.5 py-3";

/** Split a stored criteria string back into checkable lines. */
function criteriaLines(s: string): string[] {
  return s.split(/\n+/).map((l) => l.replace(/^[-•]\s*/, "").trim()).filter(Boolean);
}

/**
 * A section header with an inline Refine affordance + popover. Module-level so
 * its identity is stable — if it were declared inside BriefComposer, every
 * keystroke in the textarea would remount it (caret jumps to end, selection
 * lost, IME broken).
 */
function SectionHead({ label, section, open, text, busy, err, onToggle, onChangeText, onCancel, onSubmit }: {
  label: string;
  section: BriefSection;
  open: boolean;
  text: string;
  busy: boolean;
  err: string | null;
  onToggle: () => void;
  onChangeText: (v: string) => void;
  onCancel: () => void;
  onSubmit: (s: BriefSection) => void;
}) {
  return (
    <div className="mb-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[12.5px] font-semibold uppercase tracking-wider text-muted-2">{label}</div>
        <button onClick={onToggle}
          className={`text-[12.5px] font-medium shrink-0 ${open ? "text-accent" : "text-muted-2 hover:text-accent"}`}>
          {open ? "Close" : "Refine ✎"}
        </button>
      </div>
      {open && (
        <div className="mt-2 rounded-lg border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] p-2.5 space-y-2">
          <textarea value={text} onChange={(e) => onChangeText(e.target.value)} rows={2} autoFocus
            className={ta + " text-[13px]"} placeholder={`What's off about ${label.toLowerCase()}? e.g. "the audience is returning guests, not first-timers"`} />
          {err && <div className="text-[13px] text-danger">{err}</div>}
          <div className="flex items-center justify-end gap-2">
            <button onClick={onCancel} className="text-[13px] text-muted hover:text-foreground">Cancel</button>
            <button onClick={() => onSubmit(section)} disabled={busy || !text.trim()}
              className="h-7 px-3 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40">
              {busy ? "Refining…" : "Refine this"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
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
        <span className="text-muted-2">{drafting ? "Reading your idea…" : "Confidence this is buildable"}</span>
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
export function BriefComposer({ prototypeKey, initialBrief, initialHypothesis, initialMetrics, buildAvailable = false, initialDrift = null, initialAudit = null }: {
  prototypeKey: string;
  initialBrief: PrototypeBrief;
  initialHypothesis: PrototypeHypothesis;
  initialMetrics: PrototypeMetrics;
  /** A built variation exists — enables the brief↔build drift audit. */
  buildAvailable?: boolean;
  /** Persisted drift verdict from a previous audit — survives refresh; blocks re-sync until resolved. */
  initialDrift?: { report: BriefDriftReport; builtSha?: string } | null;
  /** The console's last SELF-audit of this (build, brief) pair — proof the
   *  system is watching. `current` = the pair on screen is the judged one. */
  initialAudit?: { inSync: boolean; builtSha?: string; checkedAt: string; checkedBy?: string; current: boolean } | null;
}) {
  const router = useRouter();
  const [explain, setExplain] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [qAnswers, setQAnswers] = useState<string[]>([]);
  const [readiness, setReadiness] = useState<number | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);

  const [brief, setBrief] = useState<PrototypeBrief>(initialBrief);
  const [hyp, setHyp] = useState<PrototypeHypothesis>(initialHypothesis);
  const [metrics, setMetrics] = useState<PrototypeMetrics>(initialMetrics);
  const [saved, setSaved] = useState(JSON.stringify({ brief: initialBrief, hyp: initialHypothesis, metrics: initialMetrics }));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState(false);

  // Brief ↔ Build drift audit — the API-side Claude compares the brief to the
  // actual built variation.js and reports mismatches.
  const [drift, setDrift] = useState<{ report: BriefDriftReport; builtSha?: string } | null>(initialDrift);
  const [driftBusy, setDriftBusy] = useState(false);
  const [driftErr, setDriftErr] = useState<string | null>(null);
  const [appliedDrift, setAppliedDrift] = useState(false);

  /** Human override: the audit is wrong, the brief IS accurate. Audited server-side. */
  async function dismissDrift() {
    if (driftBusy) return;
    setDriftBusy(true); setDriftErr(null);
    try {
      const res = await fetch("/api/prototypes/brief-drift", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: prototypeKey, dismiss: true }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setDriftErr(d.error ?? "Couldn't dismiss"); return; }
      setDrift(null);
      router.refresh(); // unblocks the rail + re-sync immediately
    } finally { setDriftBusy(false); }
  }

  // Per-section "Refine" — correct one output in place.
  const [refineOpen, setRefineOpen] = useState<BriefSection | null>(null);
  const [refineText, setRefineText] = useState("");
  const [refining, setRefining] = useState<BriefSection | null>(null);
  const [justRefined, setJustRefined] = useState<BriefSection | null>(null);
  const [refineErr, setRefineErr] = useState<string | null>(null);

  const dirty = JSON.stringify({ brief, hyp, metrics }) !== saved;
  const hasContent = Boolean(brief.change?.trim());   // enough to render the document
  const gateOpen = isBriefComplete(brief, metrics);   // change + metric — the real gate
  // Once a COMPLETE brief is SAVED, drafting retires: "Draft with AI" replaces
  // the whole document — a destructive action once the brief has matured.
  // Refine + the drift audit are the evolution tools from then on. Clearing the
  // change and saving brings the drafting drawer back (the natural start-over).
  const [savedComplete, setSavedComplete] = useState(() => isBriefComplete(initialBrief, initialMetrics));
  const refs = brief.references ?? [];
  const addRef = (url: string, label?: string) => { setBrief((b) => ({ ...b, references: [...(b.references ?? []), { url, label, kind: referenceKind(url) }] })); setMsg(null); };
  const removeRef = (i: number) => { setBrief((b) => ({ ...b, references: (b.references ?? []).filter((_, j) => j !== i) })); setMsg(null); };

  /** Fold a returned draft into the split state. Defensive: the server already
   *  normalizes, but a missing field must never crash the render (black screen). */
  function applyDraft(d: BriefDraft) {
    const db = d.brief ?? ({} as BriefDraft["brief"]);
    setBrief((b) => ({
      change: db.change ?? "",
      problem: db.problem ?? "",
      doneLooksLike: (db.doneLooksLike ?? []).join("\n"),
      where: db.where || undefined,
      constraints: db.constraints || undefined,
      reference: b.reference,
      references: b.references, // links are the user's, never rewritten by a draft
    }));
    setHyp(d.hypothesis ?? { change: "", audience: "", outcome: "", rationale: "" });
    setMetrics({ primary: d.metrics?.primary ?? "", guardrails: d.metrics?.guardrails ?? [] });
    setReadiness(typeof d.readiness === "number" ? d.readiness : null);
  }

  /** Reassemble current state as a BriefDraft to send for refinement. */
  function currentDraft(): BriefDraft {
    return {
      brief: {
        change: brief.change ?? "",
        problem: brief.problem ?? "",
        where: brief.where ?? "",
        doneLooksLike: criteriaLines(brief.doneLooksLike ?? ""),
        constraints: brief.constraints ?? "",
      },
      hypothesis: hyp,
      metrics: { primary: metrics.primary, guardrails: metrics.guardrails },
      clarifying_questions: [],
      readiness: readiness ?? 0,
    };
  }

  async function checkDrift() {
    if (driftBusy) return;
    setDriftBusy(true); setDriftErr(null);
    try {
      const res = await fetch("/api/prototypes/brief-drift", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: prototypeKey }),
      });
      const data = await res.json();
      if (!res.ok) { setDriftErr(data.error ?? "Drift check failed"); return; }
      setDrift({ report: data.report, builtSha: data.builtSha });
      router.refresh(); // the verdict persists — rail dot + re-sync gate update now
    } catch (e) {
      setDriftErr(e instanceof Error ? e.message : "Drift check failed");
    } finally { setDriftBusy(false); }
  }

  /** Adopt the audit's design-layer suggestion — human clicks, save bar takes over. */
  function applyDriftSuggestion() {
    const s = drift?.report.suggested;
    if (!s) return;
    setBrief((b) => ({
      ...b,
      change: s.change || b.change,
      where: s.where || b.where,
      doneLooksLike: s.doneLooksLike.length ? s.doneLooksLike.join("\n") : b.doneLooksLike,
    }));
    setMsg(null);
    setDrift(null);
    // Remember: on save, the pair gets marked judged-in-sync WITHOUT another
    // LLM pass — the saved brief IS the audit's own remedy; re-judging it
    // invites verdict noise to reopen the loop (audit → fix → sync → audit…).
    setAppliedDrift(true);
  }

  async function runRefine(section: BriefSection) {
    if (refining || !refineText.trim()) return;
    setRefining(section); setRefineErr(null);
    try {
      const res = await fetch("/api/prototypes/brief-draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: prototypeKey, refine: { section, correction: refineText, current: currentDraft(), references: refs } }),
      });
      const data = await res.json();
      if (!res.ok) { setRefineErr(data.error ?? "Couldn't refine"); return; }
      applyDraft(data.draft as BriefDraft);
      setQuestions([]); setQAnswers([]); // the refined brief supersedes any open question round
      setRefineOpen(null); setRefineText("");
      setJustRefined(section);
      setTimeout(() => setJustRefined((s) => (s === section ? null : s)), 1400);
    } catch (e) {
      setRefineErr(e instanceof Error ? e.message : "Couldn't refine");
    } finally { setRefining(null); }
  }

  const sectionHead = (label: string, section: BriefSection) => (
    <SectionHead
      label={label} section={section} open={refineOpen === section}
      text={refineText} busy={refining === section} err={refineOpen === section ? refineErr : null}
      onToggle={() => { setRefineOpen(refineOpen === section ? null : section); setRefineText(""); setRefineErr(null); }}
      onChangeText={setRefineText}
      onCancel={() => { setRefineOpen(null); setRefineText(""); }}
      onSubmit={runRefine}
    />
  );
  /** Fade-swap wrapper for a section that was just refined. */
  const refinedCls = (s: BriefSection) => `transition-opacity duration-500 ${refining === s ? "opacity-40" : justRefined === s ? "opacity-100" : "opacity-100"}`;

  async function draft() {
    if (drafting || !explain.trim()) return;
    setDrafting(true); setAiErr(null);
    const answers = questions
      .map((q, i) => (qAnswers[i]?.trim() ? `Q: ${q}\nA: ${qAnswers[i].trim()}` : null))
      .filter(Boolean).join("\n\n");
    try {
      const res = await fetch("/api/prototypes/brief-draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: prototypeKey, text: explain, answers: answers || undefined, references: refs }),
      });
      const data = await res.json();
      if (!res.ok) { setAiErr(data.error ?? "Drafting failed"); return; }
      const d = data.draft as BriefDraft;
      applyDraft(d);
      setQuestions(d.clarifying_questions ?? []);
      setQAnswers(new Array((d.clarifying_questions ?? []).length).fill(""));
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
      setSavedComplete(isBriefComplete(brief, metrics));
      // Applied the audit's own suggestion? Close the loop deterministically:
      // the pair is recorded judged-in-sync, no re-audit fires for it.
      if (appliedDrift) {
        setAppliedDrift(false);
        await fetch("/api/prototypes/brief-drift", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: prototypeKey, applied: true }),
        }).catch(() => { /* best-effort — the auto-audit remains the fallback */ });
      }
      setMsg({ ok: true, text: isBriefComplete(brief, metrics) ? "Brief saved — the gate is open." : "Saved — now add a success metric to open the gate." });
      router.refresh();
    } finally { setBusy(false); }
  }

  const saveBar = (
    <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
      <span className={`text-[13px] min-w-0 ${msg ? (msg.ok ? "text-ok" : "text-danger") : dirty ? "text-warn" : gateOpen ? "text-ok" : "text-warn"}`}>
        {msg ? msg.text
          : dirty ? "Unsaved changes — the gate reads the saved brief."
          : gateOpen ? "Saved — the gate is open."
          : hasContent ? "Add a success metric to finish the brief — how do we know it worked?"
          : "The brief is the gate: no build until it's written."}
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
      {/* AI on-ramp — the drafting phase only. Once a complete brief is SAVED
          it retires (a redraft would clobber the matured document); Refine and
          the drift audit take over. */}
      {!savedComplete && (
      <div className="rounded-xl border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_4%,transparent)]">
        <div className="px-3.5 py-2.5 flex items-center gap-2">
          <span className="text-[14px] font-semibold">✦ Draft with AI</span>
          <span className="text-[13px] text-muted-2">explain it in your own words — AI writes the structured brief</span>
        </div>
        <div className="px-3.5 pb-3.5 space-y-2.5">
          <textarea value={explain} onChange={(e) => setExplain(e.target.value)} rows={3} className={ta}
            placeholder="e.g. When people click a room card I want a rich overlay with the gallery, amenities and a booking button, instead of losing them to the detail page. Success is more availability checks." />
          <div className="space-y-1.5">
            <div className="text-[13px] text-muted-2">Supporting files — Figma, designs, screenshots, reference pages. The AI reads these when drafting and may ask about them.</div>
            <ReferencesEditor references={refs} onAdd={addRef} onRemove={removeRef} />
          </div>
          {(readiness != null || drafting) && <ReadinessMeter readiness={readiness} drafting={drafting} />}
          {questions.length > 0 && (
            <div className="rounded-lg border border-warn/30 bg-surface-2/30 px-3 py-2.5 space-y-3">
              <div className="text-[13px] font-semibold text-warn">The AI asked {questions.length} question{questions.length === 1 ? "" : "s"} — answer any of them and draft again:</div>
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
      </div>
      )}

      {/* Brief ↔ Build — the drift audit. Only meaningful once something is built. */}
      {buildAvailable && (
        <div className={`rounded-xl border bg-surface overflow-hidden ${drift ? (drift.report.inSync ? "border-ok/40" : "border-warn/50") : "border-border"}`}>
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-3">
            <span className="text-[14px] font-semibold shrink-0">Brief ↔ Build</span>
            <span className="text-[13px] text-muted-2 min-w-0 truncate">Does the brief still describe what was actually built? The AI reads the built code and compares.</span>
            <button onClick={checkDrift} disabled={driftBusy}
              className="ml-auto h-8 px-3 rounded-lg border border-border text-[14px] font-semibold text-muted hover:text-foreground hover:border-border-strong disabled:opacity-40 shrink-0">
              {driftBusy ? "Auditing…" : drift ? "Re-check" : "Check drift"}
            </button>
          </div>
          {/* The console audits by itself — this line is the proof it's watching. */}
          {!drift && !driftErr && initialAudit && (
            <div className="px-4 py-2.5 text-[12.5px] text-muted-2">
              {!initialAudit.current
                ? <>Self-audit queued — the build or brief changed; the console re-audits automatically.</>
                : initialAudit.inSync
                  ? <><span className="text-ok">✓</span> Self-audit: in sync{initialAudit.builtSha ? <> with build <span className="font-mono">{initialAudit.builtSha.slice(0, 7)}</span></> : null} · <TimeAgo iso={initialAudit.checkedAt} /> · re-runs on every new build</>
                  : <>Drift was found and dismissed — brief confirmed accurate{initialAudit.builtSha ? <> vs <span className="font-mono">{initialAudit.builtSha.slice(0, 7)}</span></> : null} · <TimeAgo iso={initialAudit.checkedAt} /></>}
            </div>
          )}
          {(driftErr || drift) && (
            <div className="px-4 py-3 space-y-2.5">
              {driftErr && <div className="text-[14px] text-danger">{driftErr}</div>}
              {drift && (
                <>
                  <div className={`text-[14px] font-semibold ${drift.report.inSync ? "text-ok" : "text-warn"}`}>
                    {drift.report.inSync ? "✓ In sync" : "⚠ Drifted"}{drift.builtSha ? <span className="font-mono font-normal text-muted-2 text-[12.5px]"> · vs build {drift.builtSha.slice(0, 7)}</span> : null}
                  </div>
                  <p className="text-[13.5px] text-muted leading-relaxed">{drift.report.summary}</p>
                  {drift.report.mismatches.length > 0 && (
                    <div className="rounded-lg border border-border/70 overflow-hidden">
                      {drift.report.mismatches.map((m, i) => (
                        <div key={i} className="px-3 py-2 border-b border-border/60 last:border-0 text-[13px]">
                          <span className="font-semibold uppercase text-[11px] tracking-wide text-warn">{m.aspect}</span>
                          <div className="mt-0.5 text-muted"><span className="text-muted-2">brief says:</span> {m.briefSays}</div>
                          <div className="text-foreground/90"><span className="text-muted-2">build does:</span> {m.buildDoes}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {!drift.report.inSync && (
                    <div className="flex items-center justify-between gap-3 pt-0.5 flex-wrap">
                      <span className="text-[13px] text-muted-2 min-w-0">{drift.report.suggested ? "The audit drafted updated change / where / done-looks-like matching the build. Your hypothesis & metrics stay untouched." : "Update the brief to match the build, or dismiss if the audit is wrong."} Until resolved, re-sync is blocked.</span>
                      <span className="flex items-center gap-2 shrink-0">
                        <button onClick={dismissDrift} disabled={driftBusy} className="h-8 px-3 rounded-lg border border-border text-[13.5px] font-medium text-muted hover:text-foreground hover:border-border-strong disabled:opacity-40">Dismiss — brief is accurate</button>
                        {drift.report.suggested && (
                          <button onClick={applyDriftSuggestion} className="h-8 px-3 rounded-lg bg-accent text-accent-fg text-[14px] font-semibold hover:bg-accent-hover">Update brief to match build</button>
                        )}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* THE BRIEF — a document first, a form only on request. Each section is
          its own card so they read as independent parts, not one flowing page. */}
      {!editing && hasContent ? (
        <div className="space-y-3">
          <div className={`${card} ${refinedCls("change")}`}>
            {sectionHead("The change", "change")}
            <p className="text-[15px] text-foreground leading-relaxed">{brief.change}</p>
          </div>
          {brief.where && (
            <div className={`${card} ${refinedCls("where")}`}>
              {sectionHead("Where · trigger", "where")}
              <p className="text-[14px] text-foreground/90 leading-relaxed">{brief.where}</p>
            </div>
          )}
          {brief.doneLooksLike?.trim() && (
            <div className={`${card} ${refinedCls("doneLooksLike")}`}>
              {sectionHead("Done looks like", "doneLooksLike")}
              <ul className="space-y-1">
                {criteriaLines(brief.doneLooksLike).map((c, i) => (
                  <li key={i} className="text-[14px] text-foreground/90 leading-relaxed flex gap-2"><span className="text-ok shrink-0">✓</span><span>{c}</span></li>
                ))}
              </ul>
            </div>
          )}
          {(hyp.change || hyp.outcome) && (
            <div className={`${card} ${refinedCls("hypothesis")}`}>
              {sectionHead("Hypothesis", "hypothesis")}
              <p className="text-[14px] leading-relaxed text-foreground/90">
                We believe <b className="text-foreground">{hyp.change || "[the change]"}</b> for <b className="text-foreground">{hyp.audience || "[audience]"}</b> will cause <b className="text-foreground">{hyp.outcome || "[outcome]"}</b>{hyp.rationale ? <> because {hyp.rationale}</> : null}.
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {brief.problem?.trim() && (
              <div className={card}>
                <div className="text-[12.5px] font-semibold uppercase tracking-wider text-muted-2 mb-1.5">Problem · opportunity</div>
                <p className="text-[14px] text-muted leading-relaxed">{brief.problem}</p>
              </div>
            )}
            {brief.constraints?.trim() && (
              <div className={card}>
                <div className="text-[12.5px] font-semibold uppercase tracking-wider text-muted-2 mb-1.5">Guardrails · do-not-touch</div>
                <p className="text-[14px] text-muted leading-relaxed">{brief.constraints}</p>
              </div>
            )}
          </div>
          <div className={`${card} ${refinedCls("metrics")}`}>
            {sectionHead("Success metrics", "metrics")}
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
          {refs.length > 0 && (
            <div className={card}>
              <div className="text-[12.5px] font-semibold uppercase tracking-wider text-muted-2 mb-1.5">References</div>
              <div className="space-y-1">
                {refs.map((r, i) => {
                  const m = REF_META[r.kind] ?? REF_META.link;
                  return (
                    <a key={`${r.url}-${i}`} href={r.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[13px] hover:opacity-80">
                      <span>{m.icon}</span>
                      <span className="text-[12px] px-1.5 py-0.5 rounded bg-surface-2 text-muted-2 font-medium shrink-0">{m.label}</span>
                      <span className="text-accent truncate">{r.label || r.url}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          )}
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
