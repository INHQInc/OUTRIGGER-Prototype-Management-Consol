"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { MetricMap, CompositeMetric } from "@/lib/prototypes/results";

/**
 * Experiment → Measurement: author the measurement plan BEFORE traffic.
 *
 * The AI decomposes the brief's outcome-in-words onto the experiment's
 * REAL events (zero traffic needed — enumeration reads the experiment
 * definition + project registry), interviews until it understands, and the
 * human confirms — stamping the plan pre-start. Gaps become
 * instrumentation asks; new events appearing later trip the drift banner.
 */
export function MeasurementPanel({ prototypeKey, bound, running, onPending }: {
  prototypeKey: string;
  /** Open-question count, reported up so the tab can carry the badge —
   *  an unanswered plan question is invisible from the other views. */
  onPending?: (n: number) => void;
  bound: boolean;
  running: boolean;
}) {
  const [plan, setPlan] = useState<MetricMap | null>(null);
  const [attached, setAttached] = useState<string[]>([]);
  const [drift, setDrift] = useState<string[]>([]);
  const [enumError, setEnumError] = useState<string | null>(null);
  const [loading, setLoading] = useState(bound);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [firstObservedAt, setFirstObservedAt] = useState<string | null>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/prototypes/measurement?key=${encodeURIComponent(prototypeKey)}`);
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? "Couldn't load the measurement plan."); return; }
      setPlan(data.plan ?? null);
      setAttached(data.attachedNames ?? []);
      setDrift(data.drift ?? []);
      setEnumError(data.enumerationError ?? null);
      setFirstObservedAt(data.firstObservedAt ?? null);
    } catch {
      setErr("Couldn't load the measurement plan — check the connection.");
    } finally {
      setLoading(false);
    }
  }, [prototypeKey]);

  useEffect(() => {
    if (bound) void load();
  }, [bound, load]);

  async function post(action: string, body: Record<string, unknown>) {
    if (busy) return;
    setBusy(action); setErr(null);
    try {
      const res = await fetch("/api/prototypes/measurement", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: prototypeKey, ...body }),
      });
      const data = await res.json();
      if (data.plan) { setPlan(data.plan); setAnswers({}); }
      if (data.drift) setDrift(data.drift);
      if (!res.ok) { setErr(data.error ?? "That didn't work."); return; }
      // The rail's conductor ("Confirm the measurement plan" → "Start") is
      // server-derived — refresh it so the queue ticks without a reload.
      router.refresh();
    } catch {
      setErr("Network hiccup — try again.");
    } finally { setBusy(null); }
  }

  if (!bound) {
    return <p className="text-[13.5px] text-muted-2">The measurement plan needs a bound experiment (Ship section above) — its events are what the plan binds to.</p>;
  }
  if (loading && !plan) return <p className="text-[13.5px] text-muted-2">Loading the plan and the experiment&apos;s events…</p>;

  const pending = plan?.pendingQuestions ?? [];
  const pendingCount = plan?.confirmed ? 0 : pending.length;
  useEffect(() => { onPending?.(pendingCount); }, [pendingCount, onPending]);
  const allAnswered = pending.length > 0 && pending.every((q) => (answers[q] ?? "").trim().length > 0);
  const gapPaste = plan?.gaps?.length
    ? `The measurement plan needs events that nothing currently fires. Instrument these in the variation (and where they describe shared behavior, note that the control equivalent must be measurable too), then tell me the event names you registered in Optimizely: ${plan.gaps.join(" · ")}`
    : null;

  const compositeRow = (c: CompositeMetric) => (
    <div key={c.id} className="px-3.5 py-2.5 border-t border-border/50 first:border-t-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[10.5px] font-bold uppercase tracking-wide ${c.role === "primary" ? "text-accent" : c.role === "guardrail" ? "text-warn" : "text-muted-2"}`}>{c.role}</span>
        {c.expectedOneArm && <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted-2 border border-border rounded px-1">{c.expectedOneArm}-only · adoption</span>}
        {c.direction === "decrease" && <span className="text-[10.5px] text-muted-2">↓ decrease is good</span>}
        <span className="text-[13.5px] font-semibold">{c.label}</span>
        <span className="text-[11.5px] text-muted-2 font-mono min-w-0 truncate">= {c.events.join(" + ")}</span>
        {c.mdeRel !== undefined && <span className="text-[11px] text-muted-2 ml-auto shrink-0">ship-worthy lift: ≥{(c.mdeRel * 100).toFixed(0)}%</span>}
      </div>
      {c.definition && <p className="text-[12.5px] text-muted mt-1">{c.definition}</p>}
      {Boolean(c.surfaces?.length) && (
        <div className="flex items-center gap-1.5 flex-wrap mt-1">
          {c.surfaces!.map((s, i) => (
            <span key={i} className="text-[11px] text-muted-2 border border-border rounded px-1.5 py-0.5">
              {s.description} <span className="font-semibold">({s.arm === "both" ? "both arms" : `${s.arm} only`})</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      {err && <div className="text-[13px] text-danger">{err}</div>}
      {enumError && <div className="text-[13px] text-warn">{enumError}</div>}

      {/* Drift: the build (or Opti config) moved past the stamped plan. */}
      {drift.length > 0 && plan?.plannedAt && (
        <div className="rounded-lg border border-warn/50 bg-surface px-3.5 py-2.5 text-[13px]">
          <span className="text-warn font-semibold">⚠ The plan doesn&apos;t know these attached events:</span>{" "}
          <span className="font-mono text-[12px]">{drift.join(" · ")}</span>
          <span className="text-muted-2"> — the build or the Optimizely config moved after the plan was made. Re-plan to classify them (intent, adoption, or noise).</span>
        </div>
      )}

      {!plan?.composites.length ? (
        // ── nothing yet: the invitation ──
        <div className="rounded-xl border border-border bg-surface px-4 py-3 flex items-center gap-3">
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold">Plan the measurement before traffic runs</div>
            <p className="text-[13px] text-muted-2 mt-0.5">Claude decomposes the brief&apos;s outcome onto the experiment&apos;s real events — declaring which surfaces exist in which arm, what counts as the decision metric, and what&apos;s only adoption — then asks you the few questions that change the plan. Confirming it BEFORE start is what makes the final verdict defensible: you declared how you&apos;d judge it before seeing a single visitor.</p>
          </div>
          <button onClick={() => post("plan", { plan: true })} disabled={busy !== null}
            className="ml-auto h-9 px-3.5 rounded-lg bg-accent text-accent-fg text-[13.5px] font-semibold hover:bg-accent-hover disabled:opacity-40 shrink-0">
            {busy === "plan" ? "Reading the brief & events…" : "Draft the measurement plan"}
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-accent/40 bg-surface overflow-hidden">
          <div className="px-3.5 py-2 border-b border-border flex items-center gap-2.5 flex-wrap">
            <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-2">Measurement plan</span>
            {plan.confirmed
              // "Before start" is OBSERVATION truth, not live status — a
              // paused experiment isn't pre-start.
              ? <span className="text-[11.5px] text-ok font-medium">✓ Confirmed by {plan.confirmedBy}{plan.confirmedAt ? ` · ${plan.confirmedAt.slice(0, 10)}` : ""}{!firstObservedAt || (plan.confirmedAt && plan.confirmedAt.slice(0, 10) <= firstObservedAt) ? " — stamped before traffic" : " — post-start (disclosed in the verdict)"}</span>
              : <span className="text-[11.5px] text-warn font-medium">
                  {pending.length > 0
                    ? `Draft — ${pending.length === 1 ? "one answer" : `${pending.length} answers`} needed to finish it`
                    : `Draft — not confirmed yet${firstObservedAt ? " (observation has begun: confirming now will be disclosed as post-start)" : ""}`}
                </span>}
            {plan.understanding !== undefined && !plan.confirmed && (
              <span className="text-[11px] text-muted-2 ml-auto">understanding: {plan.understanding}/100</span>
            )}
          </div>

          {/* THE INTERVIEW — first thing in the card. These answers are the
              only thing between a draft and a frozen contract; buried under
              the measures they were unfindable. */}
          {!plan.confirmed && pending.length > 0 && (
            <div id="plan-questions" className="px-3.5 py-3 border-b-2 border-accent bg-[color-mix(in_srgb,var(--accent)_7%,transparent)] space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-accent text-accent-fg text-[11.5px] font-bold tabular-nums">{pending.length}</span>
                <span className="text-[13.5px] font-semibold text-foreground">
                  {pending.length === 1 ? "One answer" : `${pending.length} answers`} needed before this plan can be confirmed
                </span>
              </div>
              {pending.map((q) => (
                <div key={q} className="space-y-1">
                  <div className="text-[13px] text-muted">{q}</div>
                  <input value={answers[q] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [q]: e.target.value }))}
                    placeholder="Your answer…"
                    className="w-full h-9 px-3 rounded-lg border border-border bg-background text-[13.5px] placeholder:text-muted-2 focus:border-accent focus:outline-none" />
                </div>
              ))}
              <button onClick={() => post("plan", { plan: true, answers: pending.map((q) => ({ question: q, answer: answers[q] ?? "" })) })}
                disabled={busy !== null || !allAnswered}
                className="h-9 px-3.5 rounded-lg bg-accent text-accent-fg text-[13.5px] font-semibold hover:bg-accent-hover disabled:opacity-40">
                {busy === "plan" ? "Finalizing…" : "Answer & finalize the plan"}
              </button>
            </div>
          )}

          {plan.composites.map(compositeRow)}

          {/* Gaps: wanted measurements nothing fires — the instrumentation ask. */}
          {Boolean(plan.gaps?.length) && (
            <div className="px-3.5 py-2.5 border-t border-border space-y-1.5">
              <div className="text-[11px] font-bold uppercase tracking-wide text-warn">Instrumentation gaps — wanted, but nothing fires an event</div>
              {plan.gaps!.map((gap) => <div key={gap} className="text-[12.5px] text-muted">• {gap}</div>)}
              {gapPaste && (
                <button onClick={() => navigator.clipboard?.writeText(gapPaste)}
                  className="text-[11.5px] text-accent hover:text-accent-hover font-medium">
                  Copy the instrumentation ask for your agent
                </button>
              )}
            </div>
          )}

          <div className="px-3.5 py-2.5 border-t border-border flex items-center gap-3 flex-wrap text-[12px] text-muted-2">
            {plan.known && <span>{plan.known.length} event(s) reviewed · {attached.length} attached to the experiment</span>}
            <span className="ml-auto flex items-center gap-3">
              <button onClick={() => {
                const risky = plan.confirmed || pending.length > 0 || Object.values(answers).some((a) => a.trim());
                const msg = plan.confirmed
                  ? "Re-plan? The confirmed plan will be replaced by a fresh unconfirmed draft (the earlier stamp is archived; the interview history is kept)."
                  : "Re-plan? Open questions and any typed answers will be replaced by a fresh draft (answered interview history is kept).";
                if (!risky || window.confirm(msg)) post("replan", { plan: true });
              }}
                disabled={busy !== null}
                className="hover:text-foreground underline underline-offset-2 disabled:opacity-40">
                {busy === "replan" ? "Re-planning…" : "Re-plan"}
              </button>
              {!plan.confirmed && pending.length === 0 && (
                <button onClick={() => post("confirm", { confirm: true, expectPlannedAt: plan.plannedAt })} disabled={busy !== null}
                  className="h-8 px-3 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40">
                  {busy === "confirm" ? "Stamping…" : firstObservedAt ? "Confirm the plan" : "Confirm — freeze it before traffic"}
                </button>
              )}
              {plan.confirmed && !plan.briefAtConfirm && (
                // One-time upgrade: plans confirmed before brief-freezing
                // existed re-confirm to freeze the contract (old stamp archived).
                <button onClick={() => post("confirm", { confirm: true })} disabled={busy !== null}
                  className="h-8 px-3 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40"
                  title="This plan was confirmed before the console froze the brief with it — re-confirm once to freeze the contract for the verdict.">
                  {busy === "confirm" ? "Freezing…" : "Re-confirm — freeze the brief"}
                </button>
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
