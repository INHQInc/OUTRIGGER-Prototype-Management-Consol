"use client";

/**
 * MEASUREMENT — the plan, and the metric index.
 *
 * Built to parity with what Beta 1 actually does (39 catalogued capabilities),
 * not to what an architecture doc describes. The invariants that carry the most
 * weight, and why:
 *
 *  · BINDABLE vs ASKABLE. The planner may only bind events the EXPERIMENT
 *    reports; anything else it must ask about. Binding a project event the
 *    experiment does not report yields a metric that reads as a dash forever
 *    while Optimizely's own primary reports fine.
 *  · Choices survive the confidence gate — "which event means this" is not a
 *    preference a model can resolve by being more confident.
 *  · Roles are ENFORCED, not requested: a second primary is demoted, and a
 *    composite whose surfaces all live in one arm can never be primary.
 *  · Direction is the most verdict-inverting control in the product, and a
 *    DEFAULTED direction must look different from a DECLARED one.
 *  · Hiding is presentation only. A hidden guardrail still vetoes.
 *  · The index order IS the order the readout narrates in.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/ui/cn";
import { METRIC_INDEX, PROJECT_EVENTS, type IndexRow, type MetricRole } from "@/lib/console/fake";
import { Pill, Section } from "./ui";
import { logActivity } from "./config";
import { MetricBuilder } from "./metric-builder";

const TODAY = "10 Sep 2026";

const Mono = ({ children }: { children: React.ReactNode }) => (
  <span className="font-mono text-[11px] text-muted-2 bg-surface-2 rounded px-1.5 py-0.5">{children}</span>
);

/** A frozen thing reads as a receipt: mono, locked, nothing to click. */
const Receipt = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-1.5 rounded border border-border bg-surface-2/60 px-2 py-1 font-mono text-[11.5px] text-muted-2">
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
    {children}
  </span>
);

const ROLE_LABEL: Record<MetricRole, string> = {
  decision: "Decides it", supporting: "Supporting", guardrail: "Guardrail", exploratory: "Exploratory",
};

/* ── The plan ──────────────────────────────────────────────────────── */

/** The gaps, in the words you paste into a ticket for whoever owns the site's code. */
const INSTRUMENTATION_ASK = `Instrumentation ask — outrigger.com, Optimizely project 24138040550

Two things this experiment wants to measure that nothing on the site records yet:

1. A completed booking. Fire an event when a reservation is confirmed — on the confirmation page or the booking engine's success response. Not on a Book Now click: that is an intention, not a booking.

2. Hesitation at the rate calendar. Nothing fires for it today. One definition that would work: a guest opens the rate calendar and leaves the page without choosing dates.

Report both as project events and attach them to this experiment. Until they are attached the plan cannot bind them — a metric on either would read as a dash.`;

interface Freeze { at: string; revision: number }
interface Plan { answered: string | null; revision: number; frozen: Freeze | null }
const FRESH_PLAN: Plan = { answered: null, revision: 1, frozen: null };

type Ask = "freeze" | "replan" | "restart" | null;
type CopyState = "idle" | "copied" | "failed";

export function MeasurementPlan({ confirmed }: { confirmed: boolean }) {
  const [plan, setPlan] = useState<Plan>(FRESH_PLAN);
  const [ask, setAsk] = useState<Ask>(null);
  const [replanning, setReplanning] = useState(false);
  const [copy, setCopy] = useState<CopyState>("idle");

  const { answered, revision, frozen } = plan;
  // Every re-plan reads your words again with one more answer in hand.
  const understanding = Math.min(99, (answered ? 94 : 82) + (revision - 1) * 3);
  const attached = PROJECT_EVENTS.filter((e) => e.attached);
  const open = !answered;
  const sealed = confirmed || frozen !== null;

  const copyAsk = () => {
    navigator.clipboard.writeText(INSTRUMENTATION_ASK)
      .then(() => setCopy("copied"), () => setCopy("failed"))
      .then(() => setTimeout(() => setCopy("idle"), 1500));
  };

  const freeze = () => {
    setPlan((p) => ({ ...p, frozen: { at: TODAY, revision: p.revision } }));
    setAsk(null);
    logActivity(`Froze the measurement plan at revision ${revision}, before any traffic.`);
  };

  const replan = () => {
    setAsk(null);
    setReplanning(true);
    setTimeout(() => {
      setPlan((p) => ({ ...p, revision: p.revision + 1 }));
      setReplanning(false);
      logActivity(`Re-planned the measurement — revision ${revision + 1}.`);
    }, 1500);
  };

  const startOver = () => {
    setPlan(FRESH_PLAN);
    setAsk(null);
    logActivity("Started the measurement plan over.");
  };

  return (
    <Section title="How we&rsquo;ll know — the measurement plan"
      action={sealed
        ? <Pill tone="ok">Confirmed before traffic</Pill>
        : <Pill tone="warn">Not confirmed — this is not a contract yet</Pill>}>

      <div className="px-5 py-4 border-b border-border">
        <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-1.5">WHAT YOU ASKED FOR, IN YOUR WORDS</div>
        <p className="text-[14.5px] leading-relaxed">
          More guests get all the way through to a completed booking — not just more people starting one.
        </p>

        {/* Computed, therefore shown. */}
        <div className="flex items-center gap-3 mt-3.5">
          <div className="h-1.5 w-32 rounded-full bg-surface-2 overflow-hidden">
            <div className={cn("h-full transition-all", understanding >= 90 ? "bg-ok" : "bg-warn")} style={{ width: `${understanding}%` }} />
          </div>
          <span className="text-[12.5px] text-muted">
            Prism is <span className="text-foreground font-medium">{understanding}%</span> sure it understood you
            {open ? " — one thing it still has to ask" : " — nothing left to ask"}
          </span>
        </div>

        <p className="text-[12.5px] text-muted-2 mt-3 leading-relaxed">
          It can only use measurements this experiment actually reports — <span className="text-foreground">{attached.length} of your
          project&rsquo;s 48</span>. It is not allowed to bind one of the other {48 - attached.length}: a metric bound to an event this
          experiment does not report reads as a dash forever, and looks like a broken test rather than a wrong plan.
        </p>
      </div>

      {/* The question. A choice, not an essay — and it survives the confidence gate. */}
      {open && (
        <div className="px-5 py-4 border-b border-border bg-warn/5">
          <div className="text-[10.5px] font-semibold tracking-[0.06em] text-warn mb-2">ONE THING PRISM CANNOT WORK OUT ON ITS OWN</div>
          <p className="text-[14.5px] mb-1">Two of your events are both called &ldquo;Offer Detail Book Now Button Clicks&rdquo;. Which one means the action that matters?</p>
          <p className="text-[12.5px] text-muted-2 mb-3">Being more confident would not answer this. Only you know.</p>
          {PROJECT_EVENTS.filter((e) => e.name === "Offer Detail Book Now Button Clicks").map((e) => (
            <button key={e.key} onClick={() => setPlan((p) => ({ ...p, answered: e.key }))}
              className="w-full flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 mb-1.5 text-left hover:border-border-strong">
              <span className="w-4 h-4 rounded-full border-2 border-border-strong shrink-0" />
              <Mono>{e.key}</Mono>
              {e.attached
                ? <span className="text-[12px] text-ok ml-auto">this experiment reports it · {e.rate}</span>
                : <span className="text-[12px] text-warn ml-auto">not attached — would read as a dash</span>}
            </button>
          ))}
        </div>
      )}

      {/* The plan itself */}
      {[
        { role: "DECIDES IT", label: "Reached the booking step", events: ["24138040550_book_now_button_clicks", "24138040550_animated_cta_book_now_clicks"], arms: "both versions", mde: "≥ 2%" },
        { role: "SUPPORTING", label: "Hero engagement", events: ["24138040550_hero_cta_click"], arms: "both versions" },
        { role: "GUARDRAIL", label: "Reached the offers page", events: ["24138040550_all_offers_page"], arms: "both versions" },
      ].map((r) => (
        <div key={r.label} className="flex items-start gap-3 px-5 py-3.5 border-b border-border">
          <span className="text-[10.5px] font-semibold tracking-[0.06em] text-muted-2 w-[74px] shrink-0 pt-0.5">{r.role}</span>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-medium">{r.label}</div>
            <div className="mt-1.5 flex flex-wrap gap-1">{r.events.map((k) => <Mono key={k}>{k}</Mono>)}</div>
            {r.mde && <div className="text-[12.5px] text-muted-2 mt-1.5">Worth shipping at <span className="text-foreground">{r.mde}</span> — you said so, so power is measured against your number, not a generic one.</div>}
          </div>
          <Pill tone="ok">{r.arms}</Pill>
        </div>
      ))}

      {/* One-arm demotion, explained rather than silent */}
      <div className="flex items-start gap-3 px-5 py-3.5 border-b border-border bg-surface-2/40">
        <span className="text-[10.5px] font-semibold tracking-[0.06em] text-muted-2 w-[74px] shrink-0 pt-0.5">ADOPTION</span>
        <div className="flex-1">
          <div className="text-[14px] font-medium">Trip planner opened</div>
          <div className="mt-1.5"><Mono>24138040550_opmc__trip_planner_cta_target</Mono></div>
          <div className="text-[12.5px] text-warn mt-1.5">
            Only exists in the new version, so it cannot decide the experiment — the old version has no way to convert on it.
            Prism moved it to adoption rather than dropping it.
          </div>
        </div>
        <Pill tone="warn">new version only</Pill>
      </div>

      {/* Gaps — the anti-silent-drop mechanism */}
      <div className="px-5 py-4 border-b border-border">
        <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-2">WHAT NOBODY MEASURES YET</div>
        <p className="text-[13.5px] text-muted leading-relaxed mb-1">
          <span className="text-foreground">A completed booking.</span> Nothing on this site records one — the closest thing is a
          click on Book Now, which is an intention, not a booking. Prism will not stand a lookalike event in for it.
        </p>
        <p className="text-[13.5px] text-muted leading-relaxed">
          <span className="text-foreground">Hesitation at the rate calendar.</span> Nothing fires for it.
        </p>
        <Button size="sm" variant="outline" className="mt-3" onClick={copyAsk}>
          {copy === "copied" ? "Copied" : copy === "failed" ? "Couldn't copy" : "Copy the instrumentation ask"}
        </Button>
      </div>

      <div className="px-5 py-4">
        {confirmed ? (
          <div className="flex items-center gap-2.5">
            <Pill tone="ok">Frozen</Pill>
            <span className="text-[13px] text-muted">Confirmed by Malia K. on 26 Aug, before any traffic. This is what the result will be judged against.</span>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              {frozen
                ? <Receipt>Frozen by you · {frozen.at} · revision {frozen.revision}</Receipt>
                : <Button disabled={open} onClick={() => setAsk("freeze")}>Confirm — freeze it before traffic</Button>}
              {open && <span className="text-[13px] text-warn">Answer the open question first. A stamped plan with an unresolved question isn&rsquo;t a contract.</span>}
              {!open && !frozen && <span className="text-[12.5px] text-muted-2">Once frozen, changing it is allowed — but the change is disclosed on the result.</span>}
              {frozen && revision === frozen.revision && <span className="text-[12.5px] text-muted-2">This is what the result will be judged against.</span>}
              {frozen && revision > frozen.revision && (
                <span className="text-[12.5px] text-muted-2">
                  Revision {revision} is the working plan. The run is still judged against revision {frozen.revision}; the change is disclosed on the result.
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
              <button onClick={() => setAsk("replan")} disabled={replanning} className="text-[13px] text-accent disabled:text-muted-2">
                {replanning ? "Re-planning…" : "Re-plan"}
              </button>
              <button onClick={() => setAsk("restart")} disabled={replanning} className="text-[13px] text-muted-2 hover:text-foreground disabled:opacity-50">Start over…</button>
              {!replanning && revision > 1 && <span className="text-[12.5px] text-muted-2 ml-auto">Re-planned just now · revision {revision}</span>}
            </div>
          </>
        )}
      </div>

      <Dialog open={ask === "freeze"} onOpenChange={(o) => !o && setAsk(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Freeze the plan before traffic?</DialogTitle>
            <DialogDescription>Freezing is what turns this plan into a contract. Three things happen:</DialogDescription>
          </DialogHeader>
          <ul className="list-disc pl-5 space-y-2 text-[13.5px] text-muted leading-relaxed">
            <li><span className="text-foreground">The plan is sealed.</span> Revision {revision} is what the result is judged against. You can re-plan later, but the change is disclosed on the result.</li>
            <li><span className="text-foreground">Open questions are settled or recorded.</span> Every question Prism had to ask is answered or written into the plan as open. Nothing gets answered quietly later.</li>
            <li><span className="text-foreground">Index order becomes readout order.</span> The order of the metric index below is the order the readout tells it in.</li>
          </ul>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAsk(null)}>Not yet</Button>
            <Button onClick={freeze}>Freeze it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ask === "replan"} onOpenChange={(o) => !o && setAsk(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-plan the measurement?</DialogTitle>
            <DialogDescription>
              Makes plan revision {revision + 1}. The frozen plan stays; a run is judged against what it was frozen with.
              Prism reads your words again with everything you have answered so far.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAsk(null)}>Keep revision {revision}</Button>
            <Button onClick={replan}>Re-plan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ask === "restart"} onOpenChange={(o) => !o && setAsk(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start the plan over?</DialogTitle>
            <DialogDescription>
              Throws away every answer and every revision of this plan and goes back to what Prism first read from your words.
              {frozen && ` It also lifts the freeze on revision ${frozen.revision} — nothing is judged against this plan until you freeze it again.`}
              {" "}The metric index is not touched.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAsk(null)}>Keep it</Button>
            <Button variant="danger" onClick={startOver}>Start over</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

/* ── The metric index ──────────────────────────────────────────────── */

/** What the metric builder announces when a metric is saved. This side only listens.
 *  The builder refuses to save until a direction is stated, so the one it sends is declared, not assumed. */
interface MetricSaved { name: string; event: string; direction: "up" | "down"; type: string }

/** An index row, plus the one thing the fixture never carries: that you added it this session. */
interface IndexEntry extends IndexRow { justAdded?: boolean }

const Glyph = ({ on, title, onClick, children }: { on?: boolean; title: string; onClick?: () => void; children: React.ReactNode }) => (
  <button title={title} onClick={onClick}
    className={cn("w-7 h-7 grid place-items-center rounded-md shrink-0", on ? "text-accent bg-accent/10" : "text-muted-2 hover:text-foreground hover:bg-surface-2")}>
    {children}
  </button>
);

export function MetricIndex() {
  const [rows, setRows] = useState<IndexEntry[]>(METRIC_INDEX);
  const [showHidden, setShowHidden] = useState(false);
  const [building, setBuilding] = useState(false);
  const visible = rows.filter((r) => !r.hidden);
  const hidden = rows.filter((r) => r.hidden);
  const patch = (k: string, p: Partial<IndexRow>) => setRows((rs) => rs.map((r) => (r.key === k ? { ...r, ...p } : r)));

  const flipDirection = (r: IndexRow) => patch(r.key, { direction: r.direction === "up" ? "down" : "up", directionDeclared: true });
  const nominate = (r: IndexRow) => setRows((rs) => rs.map((x) => ({ ...x, role: x.key === r.key ? "decision" : x.role === "decision" ? "supporting" : x.role })));

  // A saved metric joins the index as supporting, below the decision metric and after
  // the other supporting ones — the position its role gives it. No data yet, so it reads as a dash.
  useEffect(() => {
    const on = (ev: Event) => {
      const d = (ev as CustomEvent<MetricSaved>).detail;
      if (!d?.name || !d.event) return;
      setRows((rs) => {
        const base = `custom:${d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
        const key = rs.some((r) => r.key === base) ? `${base}-${rs.length + 1}` : base;
        const row: IndexEntry = { key, label: d.name, role: "supporting", source: "custom", direction: d.direction, directionDeclared: true, observed: false, hidden: false, value: "—", tone: "flat", events: [d.event], justAdded: true };
        const after = Math.max(rs.map((r) => r.role).lastIndexOf("supporting"), rs.findIndex((r) => r.role === "decision"));
        return [...rs.slice(0, after + 1), row, ...rs.slice(after + 1)];
      });
    };
    window.addEventListener("console:metric-saved", on);
    return () => window.removeEventListener("console:metric-saved", on);
  }, []);

  const Row = ({ r }: { r: IndexEntry }) => (
    <div className={cn("flex items-center gap-2 px-4 py-3 border-b border-border last:border-0", r.role === "decision" && "bg-accent/[0.04]")}>
      <svg width="12" height="12" viewBox="0 0 24 24" className={cn("shrink-0", r.role === "decision" ? "opacity-0" : "text-border-strong cursor-grab")} fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-medium truncate">{r.label}</span>
          {r.source === "optimizely" && <Pill tone="muted">from Optimizely</Pill>}
          {r.oneArm && <Pill tone="warn">new version only</Pill>}
          {r.justAdded && <Pill tone="accent">just added</Pill>}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">{r.events.map((k) => <Mono key={k}>{k}</Mono>)}</div>
      </div>

      <select value={r.role} onChange={(e) => patch(r.key, { role: e.target.value as MetricRole, hidden: false })}
        disabled={r.role === "decision"}
        className="h-7 px-2 rounded-md border border-border bg-surface text-[12.5px] text-muted disabled:opacity-60 focus:border-accent focus:outline-none">
        {(["decision", "supporting", "guardrail", "exploratory"] as MetricRole[]).map((v) => (
          <option key={v} value={v} disabled={v === "decision"}>{ROLE_LABEL[v]}</option>
        ))}
      </select>

      <Glyph on={r.observed} title={r.observed ? "Written about in the readout" : "Write about this in the readout"} onClick={() => patch(r.key, { observed: !r.observed })}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="2.6"/></svg>
      </Glyph>

      <button onClick={() => flipDirection(r)}
        title={r.directionDeclared ? `A win means this goes ${r.direction}` : "Nobody said which way this should move — Prism assumed up"}
        className={cn("h-7 px-2 rounded-md text-[12.5px] font-semibold flex items-center gap-1 shrink-0",
          r.directionDeclared ? "text-foreground hover:bg-surface-2" : "text-warn bg-warn/10")}>
        {r.direction === "up" ? "↑" : "↓"}{!r.directionDeclared && <span className="text-[11px] font-normal">assumed</span>}
      </button>

      <button onClick={() => !r.oneArm && nominate(r)} disabled={r.oneArm}
        title={r.oneArm ? "The old version couldn't convert on this, so it can't decide the experiment" : "Make this the number that decides it"}
        className={cn("h-7 px-2.5 rounded-full text-[11.5px] font-semibold shrink-0",
          r.role === "decision" ? "bg-accent text-accent-fg" : r.oneArm ? "bg-surface-2 text-muted-2 cursor-not-allowed" : "bg-surface-2 text-muted hover:text-foreground")}>
        {r.role === "decision" ? "Decides it" : "Make it decide"}
      </button>

      <span className={cn("text-[13.5px] tabular-nums w-14 text-right shrink-0", r.tone === "ok" ? "text-ok" : r.tone === "danger" ? "text-danger" : "text-muted-2")}>{r.value}</span>

      <Glyph title={r.role === "decision" ? "Move the decision metric first" : "Hide from this list — it still counts"} onClick={() => r.role !== "decision" && patch(r.key, { hidden: true, observed: false })}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="m3 3 18 18M10.6 10.7a2.6 2.6 0 0 0 3.7 3.7M9.4 5.3A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.2 6.3A17 17 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 3.4-.6"/></svg>
      </Glyph>
    </div>
  );

  return (
    <Section title="Every number this experiment reports"
      action={<div className="flex items-center gap-3">
        <span className="text-[12.5px] text-muted-2">This order is the order the readout tells it in</span>
        <Button size="sm" variant="outline" onClick={() => setBuilding(true)}>+ Build a metric</Button>
      </div>}>
      {building && (
        <div className="border-b border-border"><MetricBuilder onClose={() => setBuilding(false)} /></div>
      )}
      {visible.map((r) => <Row key={r.key} r={r} />)}

      {hidden.length > 0 && (
        <div className="border-t border-border">
          <button onClick={() => setShowHidden(!showHidden)} className="w-full px-4 py-2.5 text-left text-[13px] text-muted hover:text-foreground">
            {showHidden ? "Hide" : `Show ${hidden.length} hidden metric${hidden.length > 1 ? "s" : ""}`}
            <span className="text-muted-2"> · hiding is presentation only, a hidden guardrail still vetoes a win</span>
          </button>
          {showHidden && hidden.map((r) => <Row key={r.key} r={r} />)}
        </div>
      )}
    </Section>
  );
}
