"use client";

import { useCallback, useEffect, useState } from "react";
import type { ExperimentResults, MetricMap, VariationResult, CompositeMetric } from "@/lib/prototypes/results";
import { computeComposite, compositeMembers } from "@/lib/prototypes/results";

/**
 * Experiment results — the business view over Optimizely's event counts.
 * Composites (Claude-proposed, human-confirmed) render as the DECISION rows
 * on top; the raw event metrics sit beneath them. The analyst answers
 * questions with the full context and stays honest about significance.
 * Fetches on mount (an Optimizely API round-trip must never sit in the
 * workspace's server render).
 */
export function ResultsPanel({ prototypeKey, bound, running }: {
  prototypeKey: string;
  bound: boolean;
  running: boolean;
}) {
  const [results, setResults] = useState<ExperimentResults | null>(null);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [map, setMap] = useState<MetricMap | null>(null);
  const [loading, setLoading] = useState(bound);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/prototypes/results?key=${encodeURIComponent(prototypeKey)}`);
      const data = await res.json();
      if (!res.ok) { setResultsError(data.error ?? "Couldn't load results."); return; }
      setResults(data.results ?? null);
      setResultsError(data.resultsError ?? null);
      setMap(data.metricMap ?? null);
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
      if (!res.ok) { setErr(data.error ?? "That didn't work."); return; }
      if (data.metricMap) setMap(data.metricMap);
      if (data.results) setResults(data.results);
      if (data.answer) setAnswer(data.answer);
    } catch {
      setErr("Network hiccup — try again.");
    } finally { setBusy(null); }
  }

  if (!bound) {
    return <p className="text-[13.5px] text-muted-2">Results appear once an experiment is bound (Ship section above) and has traffic.</p>;
  }
  if (loading) return <p className="text-[13.5px] text-muted-2">Loading live results from Optimizely…</p>;
  if (!results) {
    return <div className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-[13.5px] text-muted-2">{resultsError ?? "No results yet."}</div>;
  }

  const pct = (v: number | undefined, digits = 1) => (v === undefined ? "—" : `${(v * 100).toFixed(digits)}%`);
  const sigClass = (s: number | undefined) => (s === undefined ? "text-muted-2" : s >= 0.9 ? "text-ok font-semibold" : "text-muted-2");
  const liftClass = (l: number | undefined) => (l === undefined ? "text-muted-2" : l > 0 ? "text-ok" : l < 0 ? "text-danger" : "text-muted-2");

  const rows = (perVariation: VariationResult[], withSig: boolean) => (
    <table className="w-full text-[12.5px]">
      <thead>
        <tr className="text-muted-2 text-left">
          <th className="font-medium py-1 pr-3">Variation</th>
          <th className="font-medium py-1 pr-3 text-right">Conversions</th>
          <th className="font-medium py-1 pr-3 text-right">Rate</th>
          <th className="font-medium py-1 pr-3 text-right">Lift</th>
          {withSig && <th className="font-medium py-1 text-right">Significance</th>}
        </tr>
      </thead>
      <tbody>
        {perVariation.map((r) => (
          <tr key={r.variationId} className="border-t border-border/50">
            <td className="py-1.5 pr-3">{r.name}{r.isBaseline ? <span className="text-muted-2"> · baseline</span> : ""}</td>
            <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{r.conversions.toLocaleString()}</td>
            <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{pct(r.rate, 2)}</td>
            <td className={`py-1.5 pr-3 text-right font-mono tabular-nums ${liftClass(r.lift)}`}>{r.isBaseline ? "—" : pct(r.lift)}</td>
            {withSig && <td className={`py-1.5 text-right font-mono tabular-nums ${sigClass(r.significance)}`}>{r.isBaseline ? "—" : pct(r.significance, 0)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );

  const compositeCard = (c: CompositeMetric) => {
    const computed = computeComposite(c, results);
    const { missing, excluded } = compositeMembers(c, results);
    return (
      <div key={c.id} className="rounded-xl border border-accent/40 bg-surface overflow-hidden">
        <div className="px-4 py-2 border-b border-border flex items-center gap-2 flex-wrap">
          <span className={`text-[10.5px] font-bold uppercase tracking-wide ${c.role === "primary" ? "text-accent" : c.role === "guardrail" ? "text-warn" : "text-muted-2"}`}>{c.role}</span>
          <span className="text-[13.5px] font-semibold">{c.label}</span>
          <span className="text-[11.5px] text-muted-2 font-mono min-w-0 truncate">= {c.events.join(" + ")}</span>
        </div>
        <div className="px-4 py-2">
          {/* Staleness is LOUD — a confirmed composite must never silently
              vanish or silently undercount when Optimizely metrics change. */}
          {missing.length > 0 && (
            <p className="text-[12px] text-warn mb-1.5">⚠ {computed.length ? "Partial:" : "Not computable:"} {missing.map((m) => `“${m}”`).join(", ")} no longer report{missing.length === 1 ? "s" : ""} from Optimizely — the metrics may have been renamed. Re-propose the mapping.</p>
          )}
          {excluded.length > 0 && (
            <p className="text-[12px] text-warn mb-1.5">⚠ Excluded from the sum: {excluded.join(", ")} (value-style aggregator — can&apos;t be added to click counts).</p>
          )}
          {computed.length > 0 && rows(computed, false)}
          {computed.length > 0 && (
            <p className="text-[11px] text-muted-2 mt-1">Summed ACTIONS, not unique visitors — a guest clicking both counts twice, so the rate is actions-per-visitor and can exceed 100%. Significance lives on the member events below (stats don&apos;t compose).</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-[12.5px] text-muted-2 flex-wrap">
        <span>{results.variations.map((v) => `${v.name}: ${v.visitors.toLocaleString()} visitors`).join(" · ")}{running ? " · RUNNING" : ""}</span>
        <button onClick={() => void load()} disabled={loading} className="ml-auto text-accent hover:text-accent-hover font-medium disabled:opacity-40">{loading ? "Refreshing…" : "Refresh"}</button>
      </div>
      {resultsError && <div className="text-[13px] text-warn">{resultsError}</div>}
      {err && <div className="text-[13px] text-danger">{err}</div>}

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
          <span className="text-[13px] text-muted-2 min-w-0">Your decision metric probably spans several raw events (the same intent, reachable in more than one place). Let Claude propose the mapping — grounded in the brief, the built code, and the events actually reporting below.</span>
          <button onClick={() => post("propose", { propose: true })} disabled={busy !== null}
            className="ml-auto h-8 px-3 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40 shrink-0">
            {busy === "propose" ? "Reading the numbers…" : "Map my decision metric"}
          </button>
        </div>
      )}

      {/* Raw events — the instrumented truth beneath the business view. */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-4 py-2 border-b border-border text-[12px] font-semibold uppercase tracking-wide text-muted-2">Raw Optimizely metrics</div>
        {results.metrics.map((m) => (
          <div key={m.name} className="px-4 py-2 border-t border-border/50 first:border-t-0">
            <div className="text-[13px] font-semibold mb-1">{m.name}{m.aggregator ? <span className="text-muted-2 font-normal"> · {m.aggregator}</span> : null}</div>
            {rows(m.perVariation, true)}
          </div>
        ))}
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
