"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExperimentResults, MetricMap, VariationResult, CompositeMetric } from "@/lib/prototypes/results";
import { computeComposite, compositeMembers } from "@/lib/prototypes/results";
import type { StatsReport, CellStats, TrendPoint } from "@/lib/prototypes/stats";
import type { VerdictRecord, VerdictState } from "@/lib/prototypes/verdict";
import type { Reading, OrgNotebook, ProtoNotebook } from "@/lib/prototypes/notebook";
import type { AnalystAnswer } from "@/lib/ai/results";

/**
 * Experiment results — READOUT-FIRST.
 *
 * The top of this panel is the leadership view: the goal, the verdict, the
 * few numbers that matter as tiles, the trend, and the analyst's standing
 * READING (cached; regenerates only when the data materially moves). The
 * statistical machinery — composites, CIs, raw tables, gate trace — folds
 * into "All the numbers" below. Every figure is computed server-side; the
 * notebook tunes voice and emphasis, never the verdict.
 */

const pctS = (v: number | undefined, digits = 1, signed = true) =>
  v === undefined ? "—" : `${signed && v > 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`;

const VERDICT_LOOK: Record<VerdictState, { label: string; cls: string; border: string; bg: string }> = {
  confirmed: { label: "HYPOTHESIS CONFIRMED", cls: "text-ok", border: "border-ok/50", bg: "bg-[color-mix(in_srgb,var(--ok)_9%,transparent)]" },
  refuted: { label: "HYPOTHESIS DISPROVEN", cls: "text-danger", border: "border-danger/50", bg: "bg-[color-mix(in_srgb,var(--danger)_8%,transparent)]" },
  guardrail_breach: { label: "WON, BUT BROKE A GUARDRAIL", cls: "text-warn", border: "border-warn/60", bg: "bg-[color-mix(in_srgb,var(--warn)_8%,transparent)]" },
  keep_running: { label: "TOO EARLY — KEEP RUNNING", cls: "text-muted", border: "border-border", bg: "bg-surface-2/40" },
  underpowered: { label: "INCONCLUSIVE — NOT ENOUGH TRAFFIC", cls: "text-warn", border: "border-border", bg: "bg-[color-mix(in_srgb,var(--warn)_6%,transparent)]" },
  invalid: { label: "DATA CAN'T BE TRUSTED", cls: "text-danger", border: "border-danger/60", bg: "bg-[color-mix(in_srgb,var(--danger)_8%,transparent)]" },
  not_adjudicable: { label: "NOT READY TO JUDGE YET", cls: "text-muted-2", border: "border-border", bg: "bg-surface-2/40" },
};

/** The primary result as a PICTURE — two bars, rates labeled. The story
 *  lands before anyone reads a word. */
function ComparisonBars({ focusName, focusRate, focusCount, focusN, baseName, baseRate, baseCount, baseN, significant, positive }: {
  focusName: string; focusRate: number; focusCount: number; focusN: number;
  baseName: string; baseRate: number; baseCount: number; baseN: number;
  significant: boolean; positive: boolean;
}) {
  const max = Math.max(focusRate, baseRate) || 1;
  // Chroma is earned: gray until the CI clears zero; the full-chroma END CAP
  // is the datum, the fill stays a wash (solid blocks vibrate on dark).
  const focusFill = !significant ? "bg-foreground/25" : positive ? "bg-ok/30" : "bg-danger/30";
  const focusCap = !significant ? "bg-foreground/90" : positive ? "bg-ok" : "bg-danger";
  const focusText = !significant ? "text-muted-2" : positive ? "text-ok" : "text-danger";
  const row = (name: string, rate: number, count: number, n: number, fill: string, cap: string, txt: string) => (
    <div className="flex items-center gap-2" title={`${name}: ${(rate * 100).toFixed(2)}% · ${count.toLocaleString()} / ${n.toLocaleString()}`}>
      <span className="w-36 shrink-0 text-[11.5px] text-muted-2 truncate text-right" title={name}>{name}</span>
      <div className="flex-1 h-4 bg-surface-2/40 rounded-r relative" data-viz-track>
        <div className={`h-full rounded-r ${fill}`} style={{ width: `${Math.max(2, (rate / max) * 100)}%` }} data-viz-fill={!significant ? undefined : positive ? "ok" : "danger"} />
        <div className={`absolute top-0 h-full w-0.5 ${cap}`} style={{ left: `calc(${Math.max(2, (rate / max) * 100)}% - 2px)` }} data-viz-fill={!significant ? undefined : positive ? "ok" : "danger"} />
      </div>
      <span className={`w-12 shrink-0 text-[12.5px] font-semibold tabular-nums ${txt}`}>{(rate * 100).toFixed(1)}%</span>
    </div>
  );
  return (
    <div className="space-y-1.5">
      {row(focusName, focusRate, focusCount, focusN, focusFill, focusCap, focusText)}
      {row(baseName, baseRate, baseCount, baseN, "bg-muted-2/40", "bg-muted-2", "text-muted-2")}
    </div>
  );
}

/** Chroma is earned: color only when the CI excludes zero. */
const sigOf = (c?: CellStats) => Boolean(c?.liftCi && (c.liftCi.lo > 0 || c.liftCi.hi < 0));
const toneOf = (c?: CellStats) => (!sigOf(c) ? "text-muted-2" : (c!.lift ?? 0) >= 0 ? "text-ok" : "text-danger");

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

const relTime = (iso?: string) => {
  if (!iso) return "";
  const ms = Date.now() - Date.parse(iso);
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min ago`;
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

/** The CI gauge — significance as a picture: the band clearing zero IS the verdict. */
function CiGauge({ lo, hi, lift, significant, positive }: { lo: number; hi: number; lift: number; significant: boolean; positive: boolean }) {
  const dLo = Math.min(lo, 0) * 1.15;
  const dHi = Math.max(hi, 0) * 1.15;
  const span = dHi - dLo || 1;
  const X = (v: number) => ((v - dLo) / span) * 100;
  const tone = !significant ? "text-muted-2" : positive ? "text-ok" : "text-danger";
  return (
    <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="w-full h-2.5 mt-1" role="img" aria-label="Plausible range for the lift">
      <rect x={X(lo)} y={3} width={Math.max(0.5, X(hi) - X(lo))} height={4} className={tone} fill="currentColor" fillOpacity={0.22} />
      <rect x={Math.min(98, Math.max(0, X(lift) - 1))} y={0} width={2} height={10} className={tone} fill="currentColor" />
      <rect x={Math.min(99, Math.max(0, X(0) - 0.5))} y={0} width={1} height={10} className="text-foreground" fill="currentColor" fillOpacity={0.4} />
    </svg>
  );
}

/** Progress-to-decision meter — time expressed as a fill, not a formula. */
function ProgressMeter({ daysIn, daysLeft }: { daysIn: number; daysLeft: number }) {
  const ready = daysLeft <= 0;
  const pct = ready ? 100 : Math.min(100, Math.max(4, (daysIn / (daysIn + daysLeft)) * 100));
  return (
    <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mt-1" data-viz-track>
      <div className={`h-full rounded-full ${ready ? "bg-ok" : "bg-accent"}`} style={{ width: `${pct}%` }} data-viz-fill={ready ? "ok" : undefined} />
    </div>
  );
}

/** One glyph set — inline SVG, currentColor. The ⚠ character risks
 *  rendering as a color emoji outside the palette, so it's banned here. */
function Glyph({ kind }: { kind: "warn" | "check" }) {
  if (kind === "check") {
    return <svg viewBox="0 0 12 12" className="inline-block w-3 h-3 -mt-0.5 mr-0.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M2 6.5 5 9.5 10 3" /></svg>;
  }
  return (
    <svg viewBox="0 0 12 12" className="inline-block w-3 h-3 -mt-0.5 mr-0.5" fill="currentColor">
      <path d="M6 1.2 11.3 10.4 H0.7 Z" fillOpacity={0.9} />
      <rect x={5.4} y={4.6} width={1.2} height={2.8} fill="var(--surface)" />
      <rect x={5.4} y={8.2} width={1.2} height={1.2} fill="var(--surface)" />
    </svg>
  );
}

function Sparkline({ trend, significant }: { trend: TrendPoint[]; significant: boolean }) {
  const pts = trend.filter((t) => t.lift !== undefined);
  // A two-point "trend" is a coin flip drawn as a line — don't chart it.
  if (pts.length < 3) return null;
  const W = 600;
  const H = 56;
  const lifts = pts.map((p) => p.lift!);
  const lo = Math.min(...lifts, 0);
  const hi = Math.max(...lifts, 0);
  const span = hi - lo || 1;
  const xPct = (i: number) => (i / (pts.length - 1)) * 88 + 2; // % of width; right 10% reserved for the label
  const yPct = (v: number) => 10 + (1 - (v - lo) / span) * 80;  // % of height
  const X = (i: number) => (xPct(i) / 100) * W;
  const Y = (v: number) => (yPct(v) / 100) * H;
  const zeroY = Y(0);
  const last = lifts[lifts.length - 1];
  const tone = !significant ? "text-muted-2" : last >= 0 ? "text-ok" : "text-danger";
  const today = new Date().toISOString().slice(0, 10);
  const partial = pts[pts.length - 1].date === today;
  const lineTo = partial ? pts.length - 2 : pts.length - 1;
  return (
    <div className="relative w-full h-14">
      {/* geometry only in the stretched SVG — text and dots would distort */}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-hidden>
        <line x1={X(0)} x2={(0.9) * W} y1={zeroY} y2={zeroY} stroke="currentColor" strokeOpacity={0.14} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {/* wash fills to the chart FLOOR (a sliver under a flat line), never
            to zero — an all-negative day must not paint the whole panel */}
        <polygon
          className="text-muted-2"
          fill="currentColor"
          fillOpacity={0.07}
          points={`${X(0)},${H - 2} ${pts.map((p, i) => `${X(i)},${Y(p.lift!)}`).join(" ")} ${X(pts.length - 1)},${H - 2}`}
        />
        <polyline
          fill="none" stroke="currentColor" className="text-muted-2"
          strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"
          points={pts.slice(0, lineTo + 1).map((p, i) => `${X(i)},${Y(p.lift!)}`).join(" ")}
        />
        {partial && (
          <polyline
            fill="none" stroke="currentColor" className="text-muted-2"
            strokeWidth={2} strokeOpacity={0.5} strokeDasharray="3 4" strokeLinecap="round" vectorEffect="non-scaling-stroke"
            points={pts.slice(lineTo).map((p, i) => `${X(lineTo + i)},${Y(p.lift!)}`).join(" ")}
          />
        )}
      </svg>
      {/* endpoint dot + label live in HTML — pixel-true at any width */}
      <span
        className={`absolute w-2.5 h-2.5 rounded-full ring-2 ring-[var(--surface)] ${tone} ${partial ? "opacity-60" : ""}`}
        style={{ left: `calc(${xPct(pts.length - 1)}% - 5px)`, top: `calc(${yPct(last)}% - 5px)`, backgroundColor: "currentColor" }}
      />
      <span
        className={`absolute text-[11px] font-semibold tabular-nums ${tone}`}
        style={{ left: `calc(${xPct(pts.length - 1)}% + 8px)`, top: `calc(${yPct(last)}% - 8px)` }}
      >
        {`${last > 0 ? "+" : ""}${(last * 100).toFixed(1)}%`}
      </span>
    </div>
  );
}

export function ResultsPanel({ prototypeKey, bound, running, view = "readout", hidden = false }: {
  prototypeKey: string;
  bound: boolean;
  running: boolean;
  /** "readout" = the presentation screen; "numbers" = the analyst workbench. */
  view?: "readout" | "numbers";
  /** Kept mounted while another Analytics view shows — state survives. */
  hidden?: boolean;
}) {
  const [results, setResults] = useState<ExperimentResults | null>(null);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [map, setMap] = useState<MetricMap | null>(null);
  const [stats, setStats] = useState<StatsReport | null>(null);
  const [verdict, setVerdict] = useState<VerdictRecord | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [readingStale, setReadingStale] = useState(false);
  const [readingBasis, setReadingBasis] = useState<string | null>(null);
  const [notebook, setNotebook] = useState<{ org: OrgNotebook; proto: ProtoNotebook } | null>(null);
  const [expStatus, setExpStatus] = useState<string | null>(running ? "running" : null);
  const [planDrift, setPlanDrift] = useState<string[]>([]);
  const [loading, setLoading] = useState(bound);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AnalystAnswer | string | null>(null);
  const [showGates, setShowGates] = useState(false);
  const [tuneA, setTuneA] = useState<Record<string, string>>({});
  const [tuneDurable, setTuneDurable] = useState<Record<string, boolean>>({});
  const autoReadRef = useRef<string | null>(null);
  // Inline two-step confirm (native window.confirm breaks the shell at the
  // most ceremonial action); auto-reverts after 5s.
  const [confirmAction, setConfirmAction] = useState<"stamp" | "reopen" | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armConfirm = (a: "stamp" | "reopen") => {
    setConfirmAction(a);
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => setConfirmAction(null), 5000);
  };

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
      setReading(data.reading ?? null);
      setReadingStale(Boolean(data.readingStale));
      setReadingBasis(data.readingBasis ?? null);
      setNotebook(data.notebook ?? null);
      setPlanDrift(data.planDrift ?? []);
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
      // Conflict responses (409) ship the fresh record — apply before erroring.
      if (data.metricMap) setMap(data.metricMap);
      if (data.results) setResults(data.results);
      if (data.stats) setStats(data.stats);
      if (data.verdict) setVerdict(data.verdict);
      if (data.reading) setReading(data.reading);
      if (data.readingStale !== undefined) setReadingStale(Boolean(data.readingStale));
      if (data.readingBasis) setReadingBasis(data.readingBasis);
      if (data.notebook) setNotebook(data.notebook);
      if (data.answer) setAnswer(data.answer);
      if (!res.ok) {
        // A failed reading generation must not poison the retry guard —
        // the next staleness evaluation should try again.
        if (action === "reading") autoReadRef.current = null;
        setErr(data.error ?? "That didn't work.");
        return;
      }
    } catch {
      if (action === "reading") autoReadRef.current = null;
      setErr("Network hiccup — try again.");
    } finally { setBusy(null); }
  }

  // Auto-regenerate the reading when it's stale — once per staleness episode,
  // in the background, so the panel is instant and the bill is bounded.
  useEffect(() => {
    if (loading || busy || !results || !readingStale) return;
    // The marker is the regeneration TARGET (the current basis) — a failed
    // attempt in one episode can never suppress the next episode.
    const marker = readingBasis ?? "unknown";
    if (autoReadRef.current === marker) return;
    autoReadRef.current = marker;
    void post("reading", { reading: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, busy, results, readingStale, readingBasis]);

  if (hidden) return <div className="hidden" />;
  if (!bound) {
    return <p className="text-[13.5px] text-muted-2">Results appear once an experiment is bound (Experiment room) and has traffic.</p>;
  }
  if (loading && !results && !verdict) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading results">
        <div className="h-[88px] rounded-xl bg-surface-2/60 animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-[92px] rounded-lg bg-surface-2/60 animate-pulse" />)}
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="h-[104px] rounded-lg bg-surface-2/60 animate-pulse" />
          <div className="h-[104px] rounded-lg bg-surface-2/60 animate-pulse" />
        </div>
      </div>
    );
  }
  if (!results && !verdict) {
    return <div className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-[13.5px] text-muted-2">{resultsError ?? "No results yet."}</div>;
  }
  const live = results ?? (verdict?.state === "stamped" ? verdict.frozenResults ?? null : null);
  const statsEff = stats ?? (verdict?.state === "stamped" ? verdict.frozenStats ?? null : null);

  const sigClass = (s: number | undefined) => (s === undefined ? "text-muted-2" : s >= 0.9 ? "text-ok font-semibold" : "text-muted-2");
  const liftClass = (l: number | undefined) => (l === undefined ? "text-muted-2" : l > 0 ? "text-ok" : l < 0 ? "text-danger" : "text-muted-2");
  const statsFor = (key: string): CellStats[] | undefined => statsEff?.metrics.find((m) => m.key === key)?.cells;
  const cellFor = (key: string, variationId: string) => statsFor(key)?.find((c) => c.variationId === variationId);

  const look = verdict ? VERDICT_LOOK[verdict.verdict] ?? VERDICT_LOOK.not_adjudicable : null;
  const stamped = verdict?.state === "stamped";
  const stoppable = expStatus !== null && expStatus !== "running" && expStatus !== "not_started";
  const pr = verdict?.preRegistration;

  // ── tiles: the numbers a deck leads with, computed not narrated ──
  // FOUR TILES IS A HARD CAP, FOREVER. Fact routing (say-it-once): visitors →
  // tile 1 · conversion counts → tile 2 · relative effect + certainty →
  // tile 3 · time → tile 4 · RATES live in the comparison bars only.
  const primaryStats = statsEff?.metrics.find((m) => m.key === statsEff.primaryKey);
  const primaryFocus = primaryStats?.cells.find((c) => c.variationId === statsEff?.focusVariationId);
  const primaryBase = primaryStats?.cells.find((c) => c.variationId === statsEff?.baselineVariationId);
  const focusVar = live?.variations.find((v) => v.variationId === statsEff?.focusVariationId);
  const baseVar = live?.variations.find((v) => v.variationId === statsEff?.baselineVariationId);
  const liftSig = sigOf(primaryFocus);
  const liftTone = toneOf(primaryFocus);
  const ciWide = Boolean(primaryFocus?.liftCi && primaryFocus.liftCi.hi - primaryFocus.liftCi.lo > 0.2);
  const fmtLift = (v: number) => `${v >= 0 ? "▲ +" : "▼ "}${(v * 100).toFixed(ciWide ? 0 : 1)}%`;

  const tiles: { label: string; value: React.ReactNode; sub?: React.ReactNode; cls?: string; viz?: React.ReactNode; wrapSub?: boolean }[] = [];
  if (live && focusVar && baseVar) {
    const others = live.variations.length - 2;
    tiles.push({
      label: "Visitors",
      value: (focusVar.visitors + baseVar.visitors).toLocaleString(),
      sub: `${focusVar.visitors.toLocaleString()} ${focusVar.name} · ${baseVar.visitors.toLocaleString()} ${baseVar.name}${others > 0 ? ` · +${plural(others, "more arm")} below` : ""}`,
    });
  }
  if (primaryStats && primaryFocus && primaryBase) {
    tiles.push({
      label: primaryStats.label,
      value: primaryFocus.count.toLocaleString(),
      sub: `vs ${primaryBase.count.toLocaleString()} control`,
    });
    if (primaryFocus.lift !== undefined) {
      tiles.push({
        label: "Lift",
        value: (
          <span className="inline-flex items-center gap-2">
            <span>{fmtLift(primaryFocus.lift)}</span>
            {primaryFocus.pBeat !== undefined && (primaryFocus.pBeat >= 0.95 || primaryFocus.pBeat <= 0.05) && (
              <span className={`text-[11px] px-1.5 py-0.5 rounded border font-medium ${primaryFocus.pBeat >= 0.95 ? "border-ok/40 text-ok" : "border-danger/40 text-danger"}`}>
                {(primaryFocus.pBeat * 100).toFixed(0)}% to beat control
              </span>
            )}
          </span>
        ),
        cls: liftTone,
        viz: primaryFocus.liftCi ? (
          <CiGauge lo={primaryFocus.liftCi.lo} hi={primaryFocus.liftCi.hi} lift={primaryFocus.lift} significant={liftSig} positive={(primaryFocus.lift ?? 0) >= 0} />
        ) : undefined,
        sub: primaryFocus.liftCi ? `plausible range ${pctS(primaryFocus.liftCi.lo)} to ${pctS(primaryFocus.liftCi.hi)}` : undefined,
        wrapSub: true, // NEVER truncate an uncertainty statement
      });
    }
  }
  if (statsEff?.power) {
    const p = statsEff.power;
    const eta = p.daysToTarget ?? p.daysToObserved;
    const dayN = (p.observationDays ?? 0) + 1;
    const ready = eta !== undefined && eta <= 0;
    tiles.push({
      label: "Timeline",
      value: ready ? "Ready to call" : (
        <span>Day {dayN}{eta !== undefined && eta > 0 ? <span className="text-[14px] font-normal text-muted-2"> of ~{dayN + eta}</span> : null}</span>
      ),
      viz: eta !== undefined ? <ProgressMeter daysIn={dayN} daysLeft={eta} /> : undefined,
      sub: ready ? "decision-ready sample reached" : eta !== undefined ? `~${plural(eta, "more day")} to a decision` : "trend unlocks as daily snapshots accumulate",
    });
  }

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

  const readingBlock = (part: "main" | "side") => (
    <div className="space-y-3">
      {reading ? (
        <>
          {/* The SAME sections, every experiment — leaders learn where to look. */}
          {part === "main" && reading.summary && (
            <div className={`border-t border-border/50 pt-3 ${busy === "reading" ? "opacity-60" : ""}`}>
              <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-2 mb-1">Summary{busy === "reading" && <span className="ml-2 normal-case font-normal tracking-normal text-muted-2">Updating the reading…</span>}</div>
              <p className="text-[15px] leading-relaxed font-medium text-foreground max-w-3xl">{reading.summary}</p>
            </div>
          )}
          {part === "main" && (reading.keyPoints?.length || reading.dataRead?.length || reading.story?.length) ? (
            <div className="border-t border-border/50 pt-3">
              <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-2 mb-1.5">What the data shows</div>
              {reading.keyPoints?.length ? (
                <ul className="space-y-1">
                  {reading.keyPoints.map((k) => (
                    <li key={k} className="flex gap-2 text-[13.5px] leading-snug text-foreground/90">
                      <span className="text-accent shrink-0">•</span>
                      <span>{k}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                (reading.dataRead?.length ? reading.dataRead : reading.story ?? []).map((p, i) => <p key={i} className="text-[13.5px] leading-relaxed text-foreground/90 mb-1.5 last:mb-0">{p}</p>)
              )}
            </div>
          ) : null}
          {part === "side" && reading.trendLine && (
            <div className="border-t border-border/50 pt-3">
              <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-2 mb-1">Trend</div>
              <p className="text-[13px] text-muted max-w-3xl">{reading.trendLine}</p>
            </div>
          )}
          {part === "side" && reading.watchItems.length > 0 && (
            <div className="border-t border-border/50 pt-3">
              <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-2 mb-1">Watching</div>
              <ul className="space-y-1">
                {reading.watchItems.map((w) => (
                  <li key={w} className="flex gap-2 text-[12.5px] text-warn leading-snug"><span className="shrink-0">▸</span><span>{w}</span></li>
                ))}
              </ul>
            </div>
          )}
          {part === "main" && reading.nextStep && (
            <div className="border-l-2 border-accent bg-[color-mix(in_srgb,var(--accent)_6%,transparent)] rounded-r-lg pl-3 pr-3 py-2">
              <div className="text-[10.5px] font-bold uppercase tracking-wide text-accent mb-0.5">Next step</div>
              <p className="text-[13.5px] font-medium">{reading.nextStep}</p>
            </div>
          )}
          {part === "main" && <div className="text-[11px] text-muted-2 print:hidden">
            Reading from {reading.generatedAt.slice(0, 16).replace("T", " ")} · regenerates when the data moves ·{" "}
            <button onClick={() => post("reading", { reading: true, force: true })} disabled={busy !== null} className="text-accent hover:text-accent-hover font-medium disabled:opacity-40">
              {busy === "reading" ? "Re-reading the data…" : "Refresh the reading"}
            </button>
            {" · "}
            <button onClick={() => window.print()} className="text-accent hover:text-accent-hover font-medium">Print / PDF</button>
          </div>}
        </>
      ) : part === "side" ? null : (
        <p className="text-[13px] text-muted-2">
          {busy === "reading" ? "The analyst is reading the data…" : <>No reading yet — <button onClick={() => post("reading", { reading: true, force: true })} disabled={busy !== null} className="text-accent hover:text-accent-hover font-medium disabled:opacity-40">generate it now</button>.</>}
        </p>
      )}
    </div>
  );

  if (view === "numbers") {
    return (
      <div className="space-y-3">
        {err && <div className="text-[13px] text-danger">{err}</div>}
        {resultsError && <div className="text-[13px] text-warn">{resultsError}</div>}
        {planDrift.length > 0 && (
          <div className="rounded-lg border border-warn/50 bg-surface px-3.5 py-2.5 text-[13px]">
            <span className="text-warn font-semibold">⚠ Results report events the measurement plan never reviewed:</span>{" "}
            <span className="font-mono text-[12px]">{planDrift.join(" · ")}</span>
            <span className="text-muted-2"> — the build moved past the plan. </span>
            <a href="#measurement" className="text-accent hover:text-accent-hover font-medium">Re-plan to classify them →</a>
          </div>
        )}
        {map?.composites.length ? (
          <div className="text-[11.5px] text-muted-2">
            {map.confirmed ? <>Mapping confirmed by {map.confirmedBy}</> : <>Proposed by {map.proposedBy ?? "Claude"} — <button onClick={() => post("confirm", { confirm: { composites: map.composites } })} disabled={busy !== null} className="text-accent hover:text-accent-hover font-medium disabled:opacity-40">{busy === "confirm" ? "Confirming…" : "Confirm this mapping"}</button></>}
            {" · "}
            <button onClick={() => { if (map.confirmed && !window.confirm("Replace the CONFIRMED mapping with a fresh unconfirmed proposal?")) return; post("propose", { propose: true }); }} disabled={busy !== null} className="hover:text-foreground underline underline-offset-2 disabled:opacity-40">{busy === "propose" ? "Proposing…" : "Re-propose"}</button>
          </div>
        ) : null}
        {verdict && (
          <div className="rounded-xl border border-border bg-surface px-4 py-3">
            <button onClick={() => setShowGates((s) => !s)} className="text-[11.5px] text-accent hover:text-accent-hover font-medium">
              {showGates ? "Hide" : "Show"} the verdict gate trace ({verdict.gates.filter((gt) => gt.pass === true).length}/{verdict.gates.length} pass)
            </button>
            {showGates && (
              <div className="space-y-1 mt-1.5">
                {verdict.gates.map((gt) => (
                  <div key={gt.id} className="flex gap-2 text-[12px]">
                    <span className={gt.pass === true ? "text-ok" : gt.pass === false ? "text-danger" : "text-muted-2"}>{gt.pass === true ? "✓" : gt.pass === false ? "✗" : "◦"}</span>
                    <span className="text-muted"><span className="font-medium text-foreground/90">{gt.title}.</span> {gt.detail}</span>
                  </div>
                ))}
              </div>
            )}
            {statsEff?.power && (
              <p className="text-[12px] text-muted-2 mt-2">
                Power: with {statsEff.power.perArmN.toLocaleString()}/arm this experiment can reliably detect ±{statsEff.power.mdeNow !== undefined ? (statsEff.power.mdeNow * 100).toFixed(1) : "?"}% on the primary
                {statsEff.power.observedLift !== undefined ? ` (observed ${pctS(statsEff.power.observedLift)})` : ""}
                {statsEff.power.daysToObserved !== undefined && statsEff.power.daysToObserved > 0 ? ` · ~${statsEff.power.daysToObserved} more day(s) to confirm the observed effect` : ""}
                {statsEff.power.targetLift !== undefined ? ` · your ship-worthy lift (${pctS(statsEff.power.targetLift)})${statsEff.power.daysToTarget !== undefined ? ` needs ~${statsEff.power.daysToTarget} more day(s)` : ""}` : ""}
                {statsEff.power.observationDays !== undefined ? ` · ${statsEff.power.observationDays} day(s) observed` : ""}.
              </p>
            )}
            {statsEff?.flags.filter((f) => f.code !== "SRM_FAIL" && f.code !== "CANNIBALIZATION" && f.code !== "NOVELTY_DECAY").map((f) => (
              <p key={f.code} className="text-[12px] text-muted-2 mt-1">◦ {f.text}</p>
            ))}
          </div>
        )}
        {Boolean(map?.composites.length) && <div className="space-y-2.5">{map!.composites.map(compositeCard)}</div>}
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="px-4 py-2 border-b border-border flex items-center gap-2">
            <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-2">Raw Optimizely metrics</span>
            {statsEff && statsEff.exploratory.length > 0 && (
              <span className="text-[11px] text-muted-2 ml-auto">exploratory — FDR-corrected; ~{statsEff.expectedFalsePositives} false mover(s) expected among {statsEff.exploratory.length} at raw α=.05</span>
            )}
          </div>
          {(live?.metrics ?? []).map((m) => {
            const ms = statsEff?.metrics.find((x) => x.key === `metric:${m.name}`);
            return (
              <div key={m.name} className="px-4 py-2 border-t border-border/50 first:border-t-0">
                <div className="text-[13px] font-semibold mb-1 flex items-center gap-2 flex-wrap">
                  <span>{m.name}{m.aggregator ? <span className="text-muted-2 font-normal"> · {m.aggregator}</span> : null}</span>
                  {ms?.featureOnly && (
                    <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted-2 border border-border rounded px-1"
                      title={`This event fires only in the ${ms.featureOnly === "variation" ? "variation — the control has no such element" : "control — the variation removed it"}. Comparing against a structural zero is meaningless, so no lift/significance is computed; read the rate as feature ADOPTION.`}>
                      {ms.featureOnly === "variation" ? "variation-only · adoption view" : "control-only · adoption view"}
                    </span>
                  )}
                </div>
                {rows(m.perVariation, `metric:${m.name}`, true)}
              </div>
            );
          })}
          {!live && <div className="px-4 py-2 text-[12.5px] text-muted-2">No raw metrics to show — the live fetch failed and no snapshot is frozen.</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {err && <div className="text-[13px] text-danger print:hidden">{err}</div>}

      {/* ═══ THE READOUT — the leadership view ═══ */}
      <div className={`print-report rounded-xl border ${look?.border ?? "border-border"} bg-surface overflow-hidden`}>
        <div className={`px-5 py-3.5 border-b border-border ${look?.bg ?? ""} flex items-start gap-3 flex-wrap`}>
          <div className="min-w-0 flex-1">
            {/* SUPREMACY RULE: the verdict is the biggest thing on the page — 
                KPI values reach 26px, nothing exceeds the verdict word. */}
            {look && <div className={`text-[24px] md:text-[26px] font-extrabold tracking-tight ${look.cls}`}>{look.label}</div>}
            {verdict && (
              <p className="text-[13px] text-muted mt-0.5 leading-snug max-w-3xl">
                {verdict.headline}
                {verdict.verdict === "not_adjudicable" && <> <a href="?tab=analytics#measurement" className="text-accent hover:text-accent-hover font-medium print:hidden">Set it up in the Measurement section →</a></>}
              </p>
            )}
            <div className="text-[11px] text-muted-2 mt-1 tabular-nums">
              {stamped
                ? `Official record — stamped by ${verdict?.stampedBy} · ${verdict?.stampedAt?.slice(0, 10)}`
                : `Live · computed ${relTime(statsEff?.computedAt) || "—"}`}
              {expStatus ? ` · ${expStatus.toUpperCase()}` : ""}
            </div>
          </div>
          <span className="flex items-center gap-2 shrink-0">
            {statsEff && (
              <span className={`text-[11px] ${statsEff.validity.status === "ok" ? "text-ok" : statsEff.validity.status === "unknown" ? "text-muted-2" : statsEff.validity.status === "warn" ? "text-warn font-semibold" : "text-danger font-semibold"}`} title={statsEff.validity.detail}>
                {statsEff.validity.status === "ok" ? "✓ data health OK" : statsEff.validity.status === "unknown" ? "data health: too early to check" : statsEff.validity.status === "warn" ? "data health: traffic split off" : "data health: broken"}
              </span>
            )}
            <span className="flex items-center gap-2 print:hidden">
            {verdict && !stamped && stoppable && (confirmAction === "stamp" ? (
              <span className="flex items-center gap-1.5">
                <span className="text-[11.5px] text-muted-2">Make it the immutable record?</span>
                <button onClick={() => { setConfirmAction(null); post("stamp", { stamp: true, expectVerdict: verdict.verdict }); }} className="h-7 px-2.5 rounded-md bg-accent text-accent-fg text-[12px] font-semibold hover:bg-accent-hover">Yes, stamp</button>
                <button onClick={() => setConfirmAction(null)} className="h-7 px-2 rounded-md border border-border text-[12px] text-muted hover:text-foreground">Cancel</button>
              </span>
            ) : (
              <button onClick={() => armConfirm("stamp")} disabled={busy !== null}
                className="h-7 px-2.5 rounded-md bg-accent text-accent-fg text-[12px] font-semibold hover:bg-accent-hover disabled:opacity-40">
                {busy === "stamp" ? "Stamping…" : "Stamp the verdict"}
              </button>
            ))}
            {stamped && (confirmAction === "reopen" ? (
              <span className="flex items-center gap-1.5">
                <span className="text-[11.5px] text-muted-2">Reopen the record? (audited)</span>
                <button onClick={() => { setConfirmAction(null); post("unstamp", { unstamp: true }); }} className="h-7 px-2 rounded-md border border-danger/50 text-[12px] text-danger hover:bg-danger/10">Yes, reopen</button>
                <button onClick={() => setConfirmAction(null)} className="h-7 px-2 rounded-md border border-border text-[12px] text-muted hover:text-foreground">Cancel</button>
              </span>
            ) : (
              <button onClick={() => armConfirm("reopen")} disabled={busy !== null}
                className="text-[11.5px] text-muted-2 hover:text-foreground underline underline-offset-2 disabled:opacity-40">
                {busy === "unstamp" ? "Reopening…" : "Reopen"}
              </button>
            ))}
            <button onClick={() => void load()} disabled={loading || busy !== null} className="text-[11.5px] text-accent hover:text-accent-hover font-medium disabled:opacity-40">{loading ? "Refreshing…" : "Refresh"}</button>
            </span>
          </span>
        </div>

        {resultsError && <div className="px-5 py-1.5 text-[12px] text-warn border-b border-border/50">{resultsError}</div>}
        <div className="px-5 py-4 space-y-4">
          {pr && (
            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-2 mb-0.5">The hypothesis · {pr.anchor === "cut" ? `frozen at v${pr.version}` : "frozen with the measurement plan"}{pr.cutAt ? ` · ${pr.cutAt.slice(0, 10)}` : ""}</div>
              <p className="text-[13px] text-muted leading-snug max-w-3xl">
                {pr.hypothesis} <span className="text-muted-2">Primary metric: {pr.primaryMetric}.</span>
                {pr.mapConfirmedAfterObservation && <span className="text-warn"> Metric mapping set after observation began (disclosed).</span>}
              </p>
            </div>
          )}

          {tiles.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {tiles.map((t) => (
                <div key={t.label} className="rounded-lg border border-border bg-background/50 px-3.5 py-2.5 min-h-[92px] flex flex-col">
                  <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-2 truncate" title={t.label}>{t.label}</div>
                  <div className={`text-[26px] font-semibold leading-tight tracking-tight tabular-nums ${t.cls ?? ""}`}>{t.value}</div>
                  {t.viz}
                  {t.sub && <div className={`text-[11px] text-muted-2 tabular-nums mt-auto ${t.wrapSub ? "leading-snug" : "truncate"}`}>{t.sub}</div>}
                </div>
              ))}
            </div>
          )}

          {(() => {
            const pts = (statsEff?.trend ?? []).filter((t) => t.lift !== undefined);
            const bars = primaryStats && primaryFocus?.rate !== undefined && primaryBase?.rate !== undefined;
            if (!bars && pts.length < 3) return null;
            return (
              <div className="grid md:grid-cols-2 gap-4">
                {bars && (
                  <div>
                    <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-2 mb-1.5">{primaryStats!.label} — per-visitor rate</div>
                    <ComparisonBars
                      focusName={primaryFocus!.name}
                      focusRate={primaryFocus!.rate!}
                      focusCount={primaryFocus!.count}
                      focusN={primaryFocus!.n}
                      baseName={primaryBase!.name}
                      baseRate={primaryBase!.rate!}
                      baseCount={primaryBase!.count}
                      baseN={primaryBase!.n}
                      significant={liftSig}
                      positive={(primaryFocus!.lift ?? 0) >= 0}
                    />
                  </div>
                )}
                {pts.length >= 3 && (
                  <div>
                    <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-2 mb-1.5">Primary lift by day <span className="font-normal normal-case tracking-normal tabular-nums">· {pts[0].date} → {pts[pts.length - 1].date}</span></div>
                    <Sparkline trend={pts} significant={liftSig} />
                  </div>
                )}
              </div>
            );
          })()}

          <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,3fr)] gap-x-6 gap-y-4 border-t border-border/50 pt-3">
            <div>{readingBlock("main")}</div>
            <div className="space-y-3 lg:border-l lg:border-border/40 lg:pl-5">
              {readingBlock("side")}
              {planDrift.length > 0 && (
                <div className="text-[12px] text-warn leading-snug">
                  <Glyph kind="warn" /> The plan doesn&apos;t know {plural(planDrift.length, "reported event")} ({planDrift.slice(0, 3).join(", ")}{planDrift.length > 3 ? "…" : ""}) — <a href="?tab=analytics#measurement" className="text-accent hover:text-accent-hover font-medium print:hidden">re-plan to classify →</a>
                </div>
              )}
          {verdict && verdict.guardrails.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap text-[12px]">
                  {verdict.guardrails.map((gr) => (
                    <span key={gr.compositeId} title={gr.detail} className={`px-2 py-0.5 rounded-md border text-[11.5px] font-medium ${gr.state === "pass" ? "border-ok/40 text-ok" : gr.state === "breach" ? "border-danger/50 text-danger" : "border-border text-muted-2"}`}>
                      {gr.label}: {gr.state === "pass" ? "holds" : gr.state === "breach" ? "BREACH" : gr.state === "at_risk" ? "at risk" : "unknown"}
                    </span>
                  ))}
                </div>
              )}
              {statsEff?.flags.filter((f) => f.code === "SRM_FAIL" || f.code === "CANNIBALIZATION" || f.code === "NOVELTY_DECAY").map((f) => (
                <p key={f.code} className={`text-[12px] ${f.code === "SRM_FAIL" ? "text-danger" : "text-warn"}`} leading-snug><Glyph kind="warn" /> {f.text}</p>
              ))}

              {verdict && verdict.discoveries.length > 0 && (
                <div className="rounded-lg border border-border bg-background/60 px-3 py-2 space-y-1.5">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-muted-2">Discoveries — exploratory, never confirmation; each is a candidate NEXT experiment</div>
                  {verdict.discoveries.slice(0, 3).map((d) => (
                    <div key={d.id} className="flex items-center gap-2 text-[12.5px]">
                      <span className="min-w-0">{d.label} <span className={`tabular-nums ${liftClass(d.lift)}`}>{pctS(d.lift)}</span> on {d.variationName} <span className="text-muted-2 tabular-nums">(q{d.q * 100 < 0.5 ? "<1" : `=${(d.q * 100).toFixed(0)}`}%)</span></span>
                      {d.promotedIdeaId
                        ? <span className="ml-auto text-[11.5px] text-ok shrink-0">✓ in the backlog</span>
                        : <button onClick={() => post(`promote:${d.id}`, { promote: d.id })} disabled={busy !== null}
                            className="ml-auto h-6 px-2 rounded-md border border-border text-[11.5px] font-medium text-muted hover:text-foreground hover:border-border-strong disabled:opacity-40 shrink-0">
                            {busy === `promote:${d.id}` ? "Promoting…" : "Promote to backlog →"}
                          </button>}
                    </div>
                  ))}
                  {verdict.discoveries.length > 3 && (
                    <div className="text-[11.5px] text-muted-2">+{verdict.discoveries.length - 3} more in The numbers</div>
                  )}
                </div>
              )}

            </div>
          </div>

          {/* the analyst's ask box — every question becomes analyst memory */}
          <div className="space-y-2 border-t border-border/60 pt-2.5 print:hidden">
            <div className="flex items-center gap-2">
              <input value={question} onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && question.trim()) post("ask", { ask: question }); }}
                placeholder="Ask the results anything — the analyst remembers what you care about"
                className="flex-1 h-9 px-3 rounded-lg border border-border bg-background text-[13.5px] placeholder:text-muted-2 focus:border-accent focus:outline-none" />
              <button onClick={() => question.trim() && post("ask", { ask: question })} disabled={busy !== null || !question.trim()}
                className="h-9 px-3.5 rounded-lg bg-accent text-accent-fg text-[13.5px] font-semibold hover:bg-accent-hover disabled:opacity-40 shrink-0">
                {busy === "ask" ? "Thinking…" : "Ask"}
              </button>
            </div>
            {answer && (typeof answer === "string" ? (
              <div className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-foreground/90">{answer}</div>
            ) : (
              <div className="space-y-2">
                <p className="text-[14px] font-medium text-foreground">{answer.headline}</p>
                {answer.bullets.length > 0 && (
                  <ul className="space-y-1">
                    {answer.bullets.map((b) => (
                      <li key={b} className="flex gap-2 text-[13.5px] leading-snug text-foreground/90">
                        <span className="text-accent shrink-0">•</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {answer.caveat && <p className="text-[12.5px] text-warn">{answer.caveat}</p>}
                {answer.nextStep && <p className="text-[13px]"><span className="font-semibold">Next:</span> {answer.nextStep}</p>}
              </div>
            ))}
          </div>

          {/* workflow, not readout: tuning folds away and never prints */}
          {(Boolean(reading?.questionsForYou.length) || Boolean(notebook?.org.preferences.length) || Boolean(notebook?.proto.dataWishes.length)) && (
            <details className="print:hidden">
              <summary className="text-[11.5px] text-muted-2 hover:text-foreground cursor-pointer select-none">Tune the analyst</summary>
              <div className="mt-2 space-y-2.5">
          {Boolean(reading?.questionsForYou.length) && reading && (
            <div className="rounded-lg border border-border bg-background/60 px-3 py-2 space-y-2 print:hidden">
              <div className="text-[11px] font-bold uppercase tracking-wide text-muted-2">The analyst wants to know what you care about</div>
              {reading.questionsForYou.map((q) => (
                <div key={q} className="space-y-1">
                  <div className="text-[13px] text-muted">{q}</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input value={tuneA[q] ?? ""} onChange={(e) => setTuneA((a) => ({ ...a, [q]: e.target.value }))}
                      placeholder="Your answer…"
                      className="flex-1 min-w-40 h-8 px-2.5 rounded-lg border border-border bg-background text-[13px] placeholder:text-muted-2 focus:border-accent focus:outline-none" />
                    <label className="flex items-center gap-1 text-[11.5px] text-muted-2 shrink-0">
                      <input type="checkbox" checked={tuneDurable[q] ?? false} onChange={(e) => setTuneDurable((d) => ({ ...d, [q]: e.target.checked }))} />
                      all experiments
                    </label>
                    <button onClick={() => (tuneA[q] ?? "").trim() && post(`tune:${q}`, { tune: { question: q, answer: tuneA[q], durable: tuneDurable[q] ?? false } })}
                      disabled={busy !== null || !(tuneA[q] ?? "").trim()}
                      className="h-8 px-2.5 rounded-lg border border-border text-[12.5px] font-medium text-muted hover:text-foreground hover:border-border-strong disabled:opacity-40 shrink-0">
                      {busy === `tune:${q}` ? "Saving…" : "Tell the analyst"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {(Boolean(notebook?.org.preferences.length) || Boolean(notebook?.proto.dataWishes.length)) && (
            <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-muted-2 border-t border-border/60 pt-2 print:hidden">
              <span className="font-bold uppercase tracking-wide">Analyst memory</span>
              {notebook!.org.preferences.map((p) => (
                <span key={p} className="border border-border rounded px-1.5 py-0.5 inline-flex items-center gap-1">
                  {p}
                  <button onClick={() => post("forget", { forgetPreference: p })} disabled={busy !== null} title="Forget this preference" className="hover:text-danger">×</button>
                </span>
              ))}
              {notebook!.proto.dataWishes.map((w) => (
                <span key={w} className="border border-warn/40 text-warn rounded px-1.5 py-0.5" title="Wanted, but not measurable with today's data — an instrumentation ask">wish: {w}</span>
              ))}
            </div>
          )}
              </div>
            </details>
          )}

        </div>
      </div>

      {/* the no-mapping invitation is a readout-level CTA — without it nothing adjudicates */}
      {map?.composites.length ? null : (
        <div className="rounded-lg border border-border bg-surface px-3.5 py-2.5 flex items-center gap-3">
          <span className="text-[13px] text-muted-2 min-w-0">Your decision metric probably spans several raw events. Let Claude propose the mapping — or better, author the full plan in the Measurement section above (pre-registered when done before start).</span>
          <button onClick={() => post("propose", { propose: true })} disabled={busy !== null}
            className="ml-auto h-8 px-3 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40 shrink-0">
            {busy === "propose" ? "Reading the numbers…" : "Map my decision metric"}
          </button>
        </div>
      )}

    </div>
  );
}
