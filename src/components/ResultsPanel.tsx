"use client";

import { useCallback, useEffect, useState } from "react";
import type { ExperimentResults, MetricMap, VariationResult, CompositeMetric } from "@/lib/prototypes/results";
import { computeComposite, compositeMembers } from "@/lib/prototypes/results";
import type { StatsReport, CellStats } from "@/lib/prototypes/stats";
import type { VerdictRecord, VerdictState } from "@/lib/prototypes/verdict";

/**
 * Experiment results — the adjudication view over Optimizely's event counts.
 *
 * Top to bottom: the VERDICT card (computed in code against the
 * pre-registered briefSnapshot — the model never decides it), the composite
 * decision metrics with real confidence intervals, the raw event metrics,
 * and the analyst. Every number rendered here was computed server-side in
 * lib/prototypes/stats.ts; this component only formats.
 */

const pctS = (v: number | undefined, digits = 1, signed = true) =>
  v === undefined ? "—" : `${signed && v > 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`;

const VERDICT_LOOK: Record<VerdictState, { label: string; cls: string; border: string }> = {
  confirmed: { label: "HYPOTHESIS CONFIRMED", cls: "text-ok", border: "border-ok/50" },
  refuted: { label: "HYPOTHESIS REFUTED", cls: "text-danger", border: "border-danger/50" },
  guardrail_breach: { label: "GUARDRAIL BREACH", cls: "text-warn", border: "border-warn/60" },
  keep_running: { label: "TOO EARLY — KEEP RUNNING", cls: "text-muted", border: "border-border" },
  underpowered: { label: "INCONCLUSIVE · UNDERPOWERED", cls: "text-warn", border: "border-border" },
  invalid: { label: "INVALID — DATA UNTRUSTWORTHY", cls: "text-danger", border: "border-danger/60" },
  not_adjudicable: { label: "NOT ADJUDICABLE YET", cls: "text-muted-2", border: "border-border" },
};

export function ResultsPanel({ prototypeKey, bound, running }: {
  prototypeKey: string;
  bound: boolean;
  running: boolean;
}) {
  const [results, setResults] = useState<ExperimentResults | null>(null);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [map, setMap] = useState<MetricMap | null>(null);
  const [stats, setStats] = useState<StatsReport | null>(null);
  const [verdict, setVerdict] = useState<VerdictRecord | null>(null);
  const [expStatus, setExpStatus] = useState<string | null>(running ? "running" : null);
  const [loading, setLoading] = useState(bound);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [showGates, setShowGates] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/prototypes/results?key=${encodeURIComponent(prototypeKey)}`);
      const data = await res.json();
      if (!res.ok) { setResultsError(data.error ?? "Couldn't load results."); return; }
      setResults(data.results ?? null);
      setResultsError(data.resultsError ?? null);
      setMap(data.metricMap ?? null);
      setStats(data.stats ?? null);
      setVerdict(data.verdict ?? null);
      if (data.experimentStatus) setExpStatus(data.experimentStatus);
    } catch {
      setResultsError("Couldn't load results — check the connection.");
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
      const res = await fetch("/api/prototypes/results", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: prototypeKey, ...body }),
      });
      const data = await res.json();
      // A 409 (verdict moved / someone else stamped) ships the fresh record
      // alongside the error — apply it so the card shows what to re-review.
      if (data.metricMap) setMap(data.metricMap);
      if (data.results) setResults(data.results);
      if (data.stats) setStats(data.stats);
      if (data.verdict) setVerdict(data.verdict);
      if (data.answer) setAnswer(data.answer);
      if (!res.ok) { setErr(data.error ?? "That didn't work."); return; }
    } catch {
      setErr("Network hiccup — try again.");
    } finally { setBusy(null); }
  }

  if (!bound) {
    return <p className="text-[13.5px] text-muted-2">Results appear once an experiment is bound (Ship section above) and has traffic.</p>;
  }
  if (loading && !results) return <p className="text-[13.5px] text-muted-2">Loading live results from Optimizely…</p>;
  if (!results && !verdict) {
    return <div className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-[13.5px] text-muted-2">{resultsError ?? "No results yet."}</div>;
  }
  // A live-fetch failure must never hide the RECORD — a stamped (or drafted)
  // verdict renders from its own data even when Optimizely is unreachable.
  const live = results ?? (verdict?.state === "stamped" ? verdict.frozenResults ?? null : null);
  const statsEff = stats ?? (verdict?.state === "stamped" ? verdict.frozenStats ?? null : null);

  const sigClass = (s: number | undefined) => (s === undefined ? "text-muted-2" : s >= 0.9 ? "text-ok font-semibold" : "text-muted-2");
  const liftClass = (l: number | undefined) => (l === undefined ? "text-muted-2" : l > 0 ? "text-ok" : l < 0 ? "text-danger" : "text-muted-2");
  const statsFor = (key: string): CellStats[] | undefined => statsEff?.metrics.find((m) => m.key === key)?.cells;
  const cellFor = (key: string, variationId: string) => statsFor(key)?.find((c) => c.variationId === variationId);

  const rows = (perVariation: VariationResult[], statsKey: string | null, withOptiSig: boolean) => (
    <table className="w-full text-[12.5px]">
      <thead>
        <tr className="text-muted-2 text-left">
          <th className="font-medium py-1 pr-3">Variation</th>
          <th className="font-medium py-1 pr-3 text-right">Conversions</th>
          <th className="font-medium py-1 pr-3 text-right">Rate</th>
          <th className="font-medium py-1 pr-3 text-right">Lift</th>
          <th className="font-medium py-1 pr-3 text-right">95% CI</th>
          <th className="font-medium py-1 text-right">{withOptiSig ? "Opti sig · p" : "p"}</th>
        </tr>
      </thead>
      <tbody>
        {perVariation.map((r) => {
          const sc = statsKey ? cellFor(statsKey, r.variationId) : undefined;
          return (
            <tr key={r.variationId} className="border-t border-border/50">
              <td className="py-1.5 pr-3">{r.name}{r.isBaseline ? <span className="text-muted-2"> · baseline</span> : ""}</td>
              <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{r.conversions.toLocaleString()}</td>
              <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{r.rate === undefined ? "—" : `${(r.rate * 100).toFixed(2)}%`}</td>
              <td className={`py-1.5 pr-3 text-right font-mono tabular-nums ${liftClass(sc?.lift ?? r.lift)}`}>{r.isBaseline ? "—" : pctS(sc?.lift ?? r.lift)}</td>
              <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-muted-2 whitespace-nowrap">{r.isBaseline || !sc?.liftCi ? "—" : `${pctS(sc.liftCi.lo)} … ${pctS(sc.liftCi.hi)}`}</td>
              <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                {r.isBaseline ? "—" : (
                  <>
                    {withOptiSig && <span className={sigClass(r.significance)}>{r.significance === undefined ? "—" : `${(r.significance * 100).toFixed(0)}%`}</span>}
                    {withOptiSig && " · "}
                    <span className={sc?.p !== undefined && sc.p < 0.05 ? "text-ok font-semibold" : "text-muted-2"}>{sc?.p === undefined ? "—" : sc.p < 0.0001 ? "p<0.0001" : `p=${sc.p.toFixed(3)}`}</span>
                  </>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  // ── the verdict card ──
  const verdictCard = () => {
    if (!verdict) return null;
    const look = VERDICT_LOOK[verdict.verdict] ?? VERDICT_LOOK.not_adjudicable;
    const stamped = verdict.state === "stamped";
    const stoppable = expStatus !== null && expStatus !== "running" && expStatus !== "not_started";
    const pr = verdict.preRegistration;
    return (
      <div className={`rounded-xl border ${look.border} bg-surface overflow-hidden`}>
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2.5 flex-wrap">
          <span className={`text-[11px] font-bold uppercase tracking-wide ${look.cls}`}>{look.label}</span>
          {stamped
            ? <span className="text-[11px] text-muted-2">STAMPED by {verdict.stampedBy} · {verdict.stampedAt?.slice(0, 10)} — the official record</span>
            : <span className="text-[11px] text-muted-2">draft — re-derives with the numbers{expStatus === "running" ? " while the run continues" : ""}</span>}
          <span className="ml-auto flex items-center gap-2">
            {!stamped && stoppable && (
              <button onClick={() => { if (window.confirm("Stamp this verdict as the experiment's official, immutable record?")) post("stamp", { stamp: true, expectVerdict: verdict.verdict }); }} disabled={busy !== null}
                className="h-7 px-2.5 rounded-md bg-accent text-accent-fg text-[12px] font-semibold hover:bg-accent-hover disabled:opacity-40">
                {busy === "stamp" ? "Stamping…" : "Stamp the verdict"}
              </button>
            )}
            {stamped && (
              <button onClick={() => { if (window.confirm("Reopen the stamped verdict? The stamp is the record — reopening is audited.")) post("unstamp", { unstamp: true }); }} disabled={busy !== null}
                className="text-[11.5px] text-muted-2 hover:text-foreground underline underline-offset-2 disabled:opacity-40">
                {busy === "unstamp" ? "Reopening…" : "Reopen"}
              </button>
            )}
          </span>
        </div>
        <div className="px-4 py-3 space-y-2">
          <p className="text-[13.5px] leading-relaxed">{verdict.headline}</p>
          {pr && (
            <p className="text-[12px] text-muted-2">
              Adjudicated against the brief frozen at <span className="font-semibold text-muted">v{pr.version}</span>{pr.cutAt ? ` on ${pr.cutAt.slice(0, 10)}` : ""} — before traffic. Pre-registered: <span className="italic">{pr.hypothesis}</span> Primary: {pr.primaryMetric}.
              {pr.mapConfirmedAfterObservation && <span className="text-warn"> Disclosure: the metric mapping was confirmed after observation began — the metric words are pre-registered; their operationalization is not.</span>}
            </p>
          )}
          <button onClick={() => setShowGates((s) => !s)} className="text-[11.5px] text-accent hover:text-accent-hover font-medium">
            {showGates ? "Hide" : "Show"} the gate trace ({verdict.gates.filter((gt) => gt.pass === true).length}/{verdict.gates.length} pass)
          </button>
          {showGates && (
            <div className="space-y-1">
              {verdict.gates.map((gt) => (
                <div key={gt.id} className="flex gap-2 text-[12px]">
                  <span className={gt.pass === true ? "text-ok" : gt.pass === false ? "text-danger" : "text-muted-2"}>{gt.pass === true ? "✓" : gt.pass === false ? "✗" : "◦"}</span>
                  <span className="text-muted"><span className="font-medium text-foreground/90">{gt.title}.</span> {gt.detail}</span>
                </div>
              ))}
            </div>
          )}
          {verdict.guardrails.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap text-[12px]">
              {verdict.guardrails.map((gr) => (
                <span key={gr.compositeId} title={gr.detail} className={`px-2 py-0.5 rounded-md border text-[11.5px] font-medium ${gr.state === "pass" ? "border-ok/40 text-ok" : gr.state === "breach" ? "border-danger/50 text-danger" : "border-border text-muted-2"}`}>
                  {gr.label}: {gr.state === "pass" ? "holds" : gr.state === "breach" ? "BREACH" : gr.state === "at_risk" ? "at risk" : "unknown"}
                </span>
              ))}
            </div>
          )}
          {statsEff?.flags.filter((f) => f.code !== "SHORT_OBSERVATION" && f.code !== "ACTION_OVERDISPERSION").map((f) => (
            <p key={f.code} className={`text-[12px] ${f.code === "SRM_FAIL" ? "text-danger" : "text-warn"}`}>⚠ {f.text}</p>
          ))}
          {statsEff?.power && (
            <p className="text-[12px] text-muted-2">
              Power: with {statsEff.power.perArmN.toLocaleString()}/arm this experiment can reliably detect ±{statsEff.power.mdeNow !== undefined ? (statsEff.power.mdeNow * 100).toFixed(1) : "?"}% on the primary
              {statsEff.power.observedLift !== undefined ? ` (observed ${pctS(statsEff.power.observedLift)})` : ""}
              {statsEff.power.daysToObserved !== undefined && statsEff.power.daysToObserved > 0 ? ` · ~${statsEff.power.daysToObserved} more day(s) of traffic to confirm the observed effect` : ""}
              {statsEff.power.observationDays !== undefined ? ` · ${statsEff.power.observationDays} day(s) observed` : ""}.
            </p>
          )}
          {verdict.discoveries.length > 0 && (
            <div className="rounded-lg border border-border bg-background/60 px-3 py-2 space-y-1.5">
              <div className="text-[11px] font-bold uppercase tracking-wide text-muted-2">Discoveries — exploratory, never confirmation; each is a candidate NEXT experiment</div>
              {verdict.discoveries.map((d) => (
                <div key={d.id} className="flex items-center gap-2 text-[12.5px]">
                  <span className="min-w-0">{d.label} <span className={liftClass(d.lift)}>{pctS(d.lift)}</span> on {d.variationName} <span className="text-muted-2">(q={(d.q * 100).toFixed(0)}%)</span></span>
                  {d.promotedIdeaId
                    ? <span className="ml-auto text-[11.5px] text-ok shrink-0">✓ in the backlog</span>
                    : <button onClick={() => post(`promote:${d.id}`, { promote: d.id })} disabled={busy !== null}
                        className="ml-auto h-6 px-2 rounded-md border border-border text-[11.5px] font-medium text-muted hover:text-foreground hover:border-border-strong disabled:opacity-40 shrink-0">
                        {busy === `promote:${d.id}` ? "Promoting…" : "Promote to backlog →"}
                      </button>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const compositeCard = (c: CompositeMetric) => {
    const computed = live ? computeComposite(c, live) : [];
    const { missing, excluded } = live ? compositeMembers(c, live) : { missing: [], excluded: [] };
    const isPrimary = statsEff?.primaryKey === `composite:${c.id}`;
    return (
      <div key={c.id} className="rounded-xl border border-accent/40 bg-surface overflow-hidden">
        <div className="px-4 py-2 border-b border-border flex items-center gap-2 flex-wrap">
          <span className={`text-[10.5px] font-bold uppercase tracking-wide ${c.role === "primary" ? "text-accent" : c.role === "guardrail" ? "text-warn" : "text-muted-2"}`}>{c.role}</span>
          {isPrimary && <span className="text-[10px] font-bold uppercase tracking-wide text-ok border border-ok/40 rounded px-1">pre-registered · full α</span>}
          {c.direction === "decrease" && <span className="text-[10.5px] text-muted-2">↓ decrease is good</span>}
          <span className="text-[13.5px] font-semibold">{c.label}</span>
          <span className="text-[11.5px] text-muted-2 font-mono min-w-0 truncate">= {c.events.join(" + ")}</span>
        </div>
        <div className="px-4 py-2">
          {missing.length > 0 && (
            <p className="text-[12px] text-warn mb-1.5">⚠ {computed.length ? "Partial:" : "Not computable:"} {missing.map((m) => `“${m}”`).join(", ")} no longer report{missing.length === 1 ? "s" : ""} from Optimizely — the metrics may have been renamed. Re-propose the mapping.</p>
          )}
          {excluded.length > 0 && (
            <p className="text-[12px] text-warn mb-1.5">⚠ Excluded from the sum: {excluded.join(", ")} (value-style aggregator — can&apos;t be added to click counts).</p>
          )}
          {computed.length > 0 && rows(computed, `composite:${c.id}`, false)}
          {computed.length > 0 && (
            <p className="text-[11px] text-muted-2 mt-1">Summed ACTIONS, not unique visitors — a guest clicking both counts twice, so the rate is actions-per-visitor and can exceed 100%. CI and p computed by the console (rate-ratio inference on action totals; slightly optimistic under per-guest clustering).</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-[12.5px] text-muted-2 flex-wrap">
        <span>{live ? `${live.variations.map((v) => `${v.name}: ${v.visitors.toLocaleString()} visitors`).join(" · ")}${results ? "" : " (frozen at stamp — live fetch unavailable)"}` : "Live results unavailable"}{expStatus ? ` · ${expStatus.toUpperCase()}` : ""}</span>
        {statsEff && (
          <span className={statsEff.validity.status === "ok" ? "text-ok" : statsEff.validity.status === "unknown" ? "text-muted-2" : statsEff.validity.status === "warn" ? "text-warn font-semibold" : "text-danger font-semibold"} title={statsEff.validity.detail}>
            {statsEff.validity.status === "ok" ? "✓ SRM ok" : statsEff.validity.status === "unknown" ? "SRM: n/a" : "⚠ SRM " + statsEff.validity.status}
          </span>
        )}
        <button onClick={() => void load()} disabled={loading} className="ml-auto text-accent hover:text-accent-hover font-medium disabled:opacity-40">{loading ? "Refreshing…" : "Refresh"}</button>
      </div>
      {resultsError && <div className="text-[13px] text-warn">{resultsError}</div>}
      {err && <div className="text-[13px] text-danger">{err}</div>}

      {/* The verdict — adjudication of the pre-registered hypothesis. */}
      {verdictCard()}

      {/* The semantics layer — decision rows first. */}
      {map?.composites.length ? (
        <div className="space-y-2.5">
          {map.composites.map(compositeCard)}
          <div className="text-[11.5px] text-muted-2">
            {map.confirmed ? <>Mapping confirmed by {map.confirmedBy}</> : <>Proposed by {map.proposedBy ?? "Claude"} — <button onClick={() => post("confirm", { confirm: { composites: map.composites } })} disabled={busy !== null} className="text-accent hover:text-accent-hover font-medium disabled:opacity-40">{busy === "confirm" ? "Confirming…" : "Confirm this mapping"}</button></>}
            {" · "}
            <button onClick={() => { if (map.confirmed && !window.confirm("Replace the CONFIRMED mapping with a fresh unconfirmed proposal?")) return; post("propose", { propose: true }); }} disabled={busy !== null} className="hover:text-foreground underline underline-offset-2 disabled:opacity-40">{busy === "propose" ? "Proposing…" : "Re-propose"}</button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-surface px-3.5 py-2.5 flex items-center gap-3">
          <span className="text-[13px] text-muted-2 min-w-0">Your decision metric probably spans several raw events (the same intent, reachable in more than one place). Let Claude propose the mapping — grounded in the brief, the built code, and the events actually reporting below. Confirming it makes the experiment ADJUDICABLE against its pre-registered hypothesis.</span>
          <button onClick={() => post("propose", { propose: true })} disabled={busy !== null}
            className="ml-auto h-8 px-3 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40 shrink-0">
            {busy === "propose" ? "Reading the numbers…" : "Map my decision metric"}
          </button>
        </div>
      )}

      {/* Raw events — the instrumented truth beneath the business view. */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-4 py-2 border-b border-border flex items-center gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-2">Raw Optimizely metrics</span>
          {statsEff && statsEff.exploratory.length > 0 && (
            <span className="text-[11px] text-muted-2 ml-auto">exploratory — FDR-corrected; ~{statsEff.expectedFalsePositives} false mover(s) expected among {statsEff.exploratory.length} at raw α=.05</span>
          )}
        </div>
        {(live?.metrics ?? []).map((m) => (
          <div key={m.name} className="px-4 py-2 border-t border-border/50 first:border-t-0">
            <div className="text-[13px] font-semibold mb-1">{m.name}{m.aggregator ? <span className="text-muted-2 font-normal"> · {m.aggregator}</span> : null}</div>
            {rows(m.perVariation, `metric:${m.name}`, true)}
          </div>
        ))}
        {!live && <div className="px-4 py-2 text-[12.5px] text-muted-2">No raw metrics to show — the live fetch failed and no snapshot is frozen.</div>}
      </div>

      {/* The analyst. */}
      <div className="rounded-xl border border-border bg-surface px-4 py-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <input value={question} onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && question.trim()) post("ask", { ask: question }); }}
            placeholder="Ask the results anything — “is the overlay cannibalizing the main CTA?”"
            className="flex-1 h-9 px-3 rounded-lg border border-border bg-background text-[13.5px] placeholder:text-muted-2 focus:border-accent focus:outline-none" />
          <button onClick={() => question.trim() && post("ask", { ask: question })} disabled={busy !== null || !question.trim()}
            className="h-9 px-3.5 rounded-lg bg-accent text-accent-fg text-[13.5px] font-semibold hover:bg-accent-hover disabled:opacity-40 shrink-0">
            {busy === "ask" ? "Thinking…" : "Ask"}
          </button>
          <button onClick={() => post("explain", { explain: true })} disabled={busy !== null}
            className="h-9 px-3.5 rounded-lg border border-border text-[13.5px] font-semibold text-muted hover:text-foreground hover:border-border-strong disabled:opacity-40 shrink-0">
            {busy === "explain" ? "Reading the numbers…" : "Explain these results"}
          </button>
        </div>
        {answer && <div className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-foreground/90 border-t border-border/60 pt-2.5">{answer}</div>}
      </div>
    </div>
  );
}
