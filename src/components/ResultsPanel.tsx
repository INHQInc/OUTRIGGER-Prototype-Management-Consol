"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ExperimentResults, MetricMap, VariationResult, CompositeMetric } from "@/lib/prototypes/results";
import { computeComposite, compositeMembers, optiPrimaryKeyOf, supportingKeys, roleOf, isCompositeOf, describeComposite, type MetricRole } from "@/lib/prototypes/results";
import type { AttentionItem } from "@/lib/prototypes/attention";
import type { DeepObservation } from "@/lib/ai/observation";
import { MetricBuilder } from "./MetricBuilder";
import { figureValue, templateStory, shortLabel } from "@/lib/ai/results";
import type { StatsReport, CellStats, TrendPoint, DailySnapshot } from "@/lib/prototypes/stats";
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


/** Per-metric daily rate lines (cumulative), two arms — identity, not judgment. */
function MetricTrend({ days, metricName, focusId, baseId, focusName, baseName }: {
  days: DailySnapshot[]; metricName: string; focusId?: string; baseId?: string; focusName: string; baseName: string;
}) {
  const series = (id?: string) => days.map((d) => {
    if (!id) return undefined;
    const n = d.variations.find((v) => v.variationId === id)?.visitors ?? 0;
    const c = d.metrics.find((m) => m.name === metricName)?.perVariation.find((r) => r.variationId === id)?.conversions ?? 0;
    return n > 0 ? c / n : undefined;
  });
  const f = series(focusId);
  const b = series(baseId);
  const defined = [...f, ...b].filter((v): v is number => v !== undefined);
  const points = f.filter((v) => v !== undefined).length;
  if (points < 3) return <p className="text-[12px] text-muted-2 py-3">Daily trend unlocks after 3 days of snapshots ({points} so far).</p>;
  const lo = Math.min(...defined);
  const hi = Math.max(...defined);
  const span = hi - lo || 1;
  const W = 600;
  const H = 96;
  const xPct = (i: number) => (i / (days.length - 1)) * 84 + 2;
  const yPct = (v: number) => 8 + (1 - (v - lo) / span) * 84;
  const path = (arr: (number | undefined)[]) =>
    arr.map((v, i) => (v === undefined ? null : `${(xPct(i) / 100) * W},${(yPct(v) / 100) * H}`)).filter(Boolean).join(" ");
  const lastIdx = (arr: (number | undefined)[]) => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] !== undefined) return i; return -1; };
  const fi = lastIdx(f);
  const bi = lastIdx(b);
  return (
    <div className="relative w-full h-24 my-2">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-hidden>
        <polyline fill="none" stroke="currentColor" className="text-muted-2" strokeWidth={2} strokeOpacity={0.6} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" points={path(b)} />
        <polyline fill="none" stroke="currentColor" className="text-foreground" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" points={path(f)} />
      </svg>
      {fi >= 0 && f[fi] !== undefined && (
        <span className="absolute text-[10.5px] font-medium text-foreground tabular-nums whitespace-nowrap" style={{ left: `calc(${xPct(fi)}% + 6px)`, top: `calc(${yPct(f[fi]!)}% - 8px)` }}>
          {focusName} {(f[fi]! * 100).toFixed(1)}%
        </span>
      )}
      {bi >= 0 && b[bi] !== undefined && (
        <span className="absolute text-[10.5px] text-muted-2 tabular-nums whitespace-nowrap" style={{ left: `calc(${xPct(bi)}% + 6px)`, top: `calc(${yPct(b[bi]!)}% + 2px)` }}>
          {baseName} {(b[bi]! * 100).toFixed(1)}%
        </span>
      )}
    </div>
  );
}

/** One glyph set — inline SVG, currentColor. The ⚠ character risks
 *  rendering as a color emoji outside the palette, so it's banned here. */
/** HIDDEN ON REQUEST while the measurement plan is being rebuilt: mid-rebuild
 *  these fire on every load and drown the readout. The derivations still run
 *  (attention is returned by the API, discoveries by the verdict engine), so
 *  restoring either is this one line. */
const SHOW_ATTENTION = false;
const SHOW_EXPLORATORY = false;
/** The comparison bars + day-by-day card. Hidden on request: the decision
 *  metric's own observation now carries the same story in words, and its
 *  numbers are in the tiles directly above. */
const SHOW_PROOF = false;
/** THE CALL card. Hidden on request: with no decision metric and an
 *  unconfirmed plan it only ever says "not ready", which the experiment block
 *  and the story already convey. Its controls move to the toolbar. */
const SHOW_CALL = false;
/** The four tiles. Hidden on request: visitors, the headline metric's
 *  conversions and its lift are all carried by the beats and the observations,
 *  which say what they mean as well as what they are. */
const SHOW_TILES = false;

/** Confirmation that the background work finished. Auto-dismisses; polite for
 *  screen readers; never covers the metric index. */
function Toast({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3600);
    return () => clearTimeout(t);
  }, [text, onDone]);
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 print:hidden" role="status" aria-live="polite">
      <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 shadow-lg">
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-ok" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8.5 6.5 12 13 4.5" />
        </svg>
        <span className="text-[13px] text-foreground">{text}</span>
      </div>
    </div>
  );
}

function Glyph({ kind }: { kind: "warn" | "check" | "pencil" | "trash" | "grip" | "eye" | "eyeOff" | "watch" | "watchOn" | "chevron" }) {
  if (kind === "chevron") {
    return (
      <svg viewBox="0 0 12 12" className="inline-block w-3 h-3" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 2.5 8 6l-3.5 3.5" />
      </svg>
    );
  }
  if (kind === "watch" || kind === "watchOn") {
    return (
      // A THUMBTACK seen head-on — flat cap, shaft, flared collar, needle.
      // The old angled shape read as a syringe at 12px.
      <svg viewBox="0 0 24 24" className="inline-block w-3.5 h-3.5" fill={kind === "watchOn" ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round">
        <path d="M9 4h6" />
        <path d="M10 4v5.2a2 2 0 0 1-.72 1.54l-2 1.66A2 2 0 0 0 6.5 14h11a2 2 0 0 0-.78-1.6l-2-1.66A2 2 0 0 1 14 9.2V4" />
        <path d="M12 14v6" />
      </svg>
    );
  }
  if (kind === "eye" || kind === "eyeOff") {
    return (
      <svg viewBox="0 0 12 12" className="inline-block w-3 h-3" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 6c1.6-2.7 3.2-4 5-4s3.4 1.3 5 4c-1.6 2.7-3.2 4-5 4S2.6 8.7 1 6Z" />
        <circle cx="6" cy="6" r="1.6" />
        {kind === "eyeOff" && <path d="M2 10.5 10 1.5" />}
      </svg>
    );
  }
  if (kind === "grip") {
    return <svg viewBox="0 0 12 12" className="inline-block w-3 h-3" fill="currentColor"><circle cx="4.2" cy="2.5" r="1" /><circle cx="7.8" cy="2.5" r="1" /><circle cx="4.2" cy="6" r="1" /><circle cx="7.8" cy="6" r="1" /><circle cx="4.2" cy="9.5" r="1" /><circle cx="7.8" cy="9.5" r="1" /></svg>;
  }
  if (kind === "check") {
    return <svg viewBox="0 0 12 12" className="inline-block w-3 h-3 -mt-0.5 mr-0.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M2 6.5 5 9.5 10 3" /></svg>;
  }
  if (kind === "pencil") {
    return <svg viewBox="0 0 12 12" className="inline-block w-3 h-3" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 1.5 10.5 3.5 4 10 1.5 10.5 2 8 8.5 1.5Z" /></svg>;
  }
  if (kind === "trash") {
    return <svg viewBox="0 0 12 12" className="inline-block w-3 h-3" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M1.5 3h9M4.5 3V1.5h3V3M2.5 3l.7 7.5h5.6L9.5 3M5 5v3.5M7 5v3.5" /></svg>;
  }
  return (
    <svg viewBox="0 0 12 12" className="inline-block w-3 h-3 -mt-0.5 mr-0.5" fill="currentColor">
      <path d="M6 1.2 11.3 10.4 H0.7 Z" fillOpacity={0.9} />
      <rect x={5.4} y={4.6} width={1.2} height={2.8} fill="var(--surface)" />
      <rect x={5.4} y={8.2} width={1.2} height={1.2} fill="var(--surface)" />
    </svg>
  );
}

/** Geometry only — no labels, no dot. The observation rows put this beside
 *  running text, and the full Sparkline's HTML overlays land on top of it.
 *
 *  The line is split at every zero crossing so the part above the line and the
 *  part below carry different colour. CHROMA IS STILL EARNED: colour appears
 *  only when the metric's interval excludes zero. A gap that luck could still
 *  produce draws neutral, because a green line is a claim.
 */
function MicroTrend({ trend, earned }: { trend: TrendPoint[]; earned: boolean }) {
  const pts = trend.filter((t) => t.lift !== undefined).map((t) => t.lift!);
  if (pts.length < 3) return null;
  const lo = Math.min(...pts, 0), hi = Math.max(...pts, 0);
  const span = hi - lo || 1;
  const X = (i: number) => (i / (pts.length - 1)) * 100;
  const Y = (v: number) => 28 - ((v - lo) / span) * 24 - 2;

  // Walk the series, cutting a new segment wherever it crosses zero.
  type Seg = { pos: boolean; d: string[] };
  const segs: Seg[] = [];
  let cur: Seg = { pos: pts[0] >= 0, d: [`${X(0)},${Y(pts[0])}`] };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if ((a >= 0) !== (b >= 0)) {
      const t = Math.abs(a) / (Math.abs(a) + Math.abs(b) || 1);      // where it crosses
      const cx = X(i - 1) + (X(i) - X(i - 1)) * t;
      cur.d.push(`${cx},${Y(0)}`);
      segs.push(cur);
      cur = { pos: b >= 0, d: [`${cx},${Y(0)}`] };
    }
    cur.d.push(`${X(i)},${Y(b)}`);
  }
  segs.push(cur);

  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="w-full h-6 overflow-visible" aria-hidden>
      <line x1="0" y1={Y(0)} x2="100" y2={Y(0)} stroke="currentColor" strokeOpacity=".2" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      {segs.map((sg, i) => (
        <polyline key={i} points={sg.d.join(" ")} fill="none" vectorEffect="non-scaling-stroke"
          strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round"
          className={earned ? (sg.pos ? "text-ok" : "text-danger") : ""}
          stroke="currentColor" strokeOpacity={earned ? 0.95 : 0.5} />
      ))}
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
  const [historyDays, setHistoryDays] = useState<DailySnapshot[]>([]);
  // Windowed view — honest date-range analytics from the console's own daily
  // snapshots. View-layer only: the verdict always judges the full run.
  const [windowDays, setWindowDays] = useState<number | null>(null);
  const [windowData, setWindowData] = useState<{ results: ExperimentResults; stats: StatsReport | null; range: { from: string; to: string } } | null>(null);
  const [windowBusy, setWindowBusy] = useState(false);
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);
  const [customMsg, setCustomMsg] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [deleteArmId, setDeleteArmId] = useState<string | null>(null);
  // Drag-to-reorder the All-metrics index — presentation only, persisted on
  // the metric map. The decision metric is pinned to the top and never drags.
  const [orderLocal, setOrderLocal] = useState<string[] | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [builder, setBuilder] = useState<{ editing: CompositeMetric | null } | null>(null);
  const [attention, setAttention] = useState<AttentionItem[]>([]);
  const [protoName, setProtoName] = useState<string | null>(null);
  const [liveHypothesis, setLiveHypothesis] = useState<string | null>(null);
  const [showAllAttention, setShowAllAttention] = useState(false);
  const [showAcked, setShowAcked] = useState(false);
  // The full read of one metric, fetched on demand and cached server-side.
  const [openObs, setOpenObs] = useState<string | null>(null);
  const [deepObs, setDeepObs] = useState<Record<string, DeepObservation>>({});
  const [obsBusy, setObsBusy] = useState<string | null>(null);
  const [threadOpen, setThreadOpen] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  // Ask vs Challenge are different INSTRUCTIONS, not different destinations —
  // metric-building left the chat entirely when the builder arrived.
  const [composerMode, setComposerMode] = useState<"ask" | "challenge" | "reply">("ask");
  const [analystOpen, setAnalystOpen] = useState(false);
  const [clearArmed, setClearArmed] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [replyDurable, setReplyDurable] = useState(false);
  const dragKeyRef = useRef<string | null>(null);
  const [chartType, setChartType] = useState<"line" | "bar">("line");
  const [loading, setLoading] = useState(bound);
  const [busy, setBusy] = useState<string | null>(null);
  // The DECISION METRIC as the server resolved it. Read-only on purpose: the
  // page must never hold Optimizely's synthesized composite, because it
  // round-trips its map through confirm/propose and would persist it.
  const [toast, setToast] = useState<string | null>(null);
  const [decision, setDecision] = useState<{ key: string; label: string; source: "console" | "optimizely"; direction?: "increase" | "decrease"; directionDeclared: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [answer, setAnswer] = useState<AnalystAnswer | string | null>(null);
  const [showGates, setShowGates] = useState(false);
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
      setDecision(data.decision ?? null);
      setStats(data.stats ?? null);
      setVerdict(data.verdict ?? null);
      setReading(data.reading ?? null);
      setReadingStale(Boolean(data.readingStale));
      setReadingBasis(data.readingBasis ?? null);
      setNotebook(data.notebook ?? null);
      setPlanDrift(data.planDrift ?? []);
      setHistoryDays(data.historyDays ?? []);
      setAttention(data.attention ?? []);
      if (data.deepObservations) setDeepObs(data.deepObservations);
      setProtoName(data.prototypeName ?? null);
      setLiveHypothesis(data.liveHypothesis ?? null);
      setOrderLocal(null);
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

  async function selectWindow(days: number | null) {
    setWindowDays(days);
    if (days === null) { setWindowData(null); return; }
    setWindowBusy(true);
    try {
      const res = await fetch(`/api/prototypes/results?key=${encodeURIComponent(prototypeKey)}&window=${days}`);
      const data = await res.json();
      if (res.ok && data.windowResults) {
        setWindowData({ results: data.windowResults, stats: data.windowStats ?? null, range: data.windowRange });
      } else {
        setWindowData(null);
        setWindowDays(null);
        setErr(`Not enough snapshot history for a ${days}-day window yet.`);
      }
    } catch {
      setWindowDays(null);
    } finally { setWindowBusy(false); }
  }

  // Row order and hide/show are presentation-only CAS writes. They must NOT
  // ride the analyst busy gate — a background reading holds it for tens of
  // seconds, and a swallowed drag would leave the table asserting an order the
  // server never stored. They serialize on their own chain, latest wins, and
  // an optimistic order is dropped the moment the server refuses it.
  const quietChain = useRef<Promise<unknown>>(Promise.resolve());
  const pendingOrder = useRef<string[] | null>(null);
  // OPTIMISTIC SUPPORTING SET. The mark used to ride the analyst busy gate,
  // which a background reading holds for tens of seconds — so a click during
  // one was silently DROPPED (`if (busy) return`) and the row appeared to do
  // nothing until a later click happened to land. It is a presentation-layer
  // write like order and hide: it goes on the quiet chain, and the row answers
  // the click on the same frame.
  const [observedLocal, setObservedLocal] = useState<string[] | null>(null);
  const [rolesLocal, setRolesLocal] = useState<Record<string, "supporting" | "guardrail" | "exploratory"> | null>(null);

  async function quietPost(body: Record<string, unknown>): Promise<boolean> {
    try {
      const res = await fetch("/api/prototypes/results", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: prototypeKey, ...body }),
      });
      const data = await res.json();
      if (data.metricMap) setMap(data.metricMap);
      if (!res.ok) { setErr(data.error ?? "That change didn't save."); return false; }
      return true;
    } catch {
      setErr("Network hiccup — that change didn't save.");
      return false;
    }
  }

  function saveOrder(keys: string[]) {
    setOrderLocal(keys);
    pendingOrder.current = keys;
    quietChain.current = quietChain.current.then(async () => {
      const next = pendingOrder.current;
      if (!next) return; // a later drag already superseded this one
      pendingOrder.current = null;
      await quietPost({ orderMetrics: next });
      // Stored map wins either way — on success it mirrors this order, on
      // failure the table stops showing an order that was never saved.
      setOrderLocal(null);
    });
  }

  function toggleSupporting(rowKey: string, on: boolean) {
    const base = observedLocal ?? map?.observed ?? [];
    const next = on ? [...base, rowKey] : base.filter((k) => k !== rowKey);
    setObservedLocal(next);
    quietChain.current = quietChain.current.then(async () => {
      const ok = await quietPost({ observeMetric: { key: rowKey, on } });
      // The stored map wins either way: on success it mirrors this, on failure
      // the row stops asserting a mark the server never took.
      setObservedLocal(null);
      // What the reading is ABOUT just changed, and the observe route answers
      // with the map alone — so the staleness has to be raised here.
      if (ok) { autoReadRef.current = null; setReadingStale(true); }
      return ok;
    });
  }

  function setMetricRole(rowKey: string, role: "supporting" | "guardrail" | "exploratory") {
    const next = { ...(rolesLocal ?? map?.roles ?? {}), [rowKey]: role };
    setRolesLocal(next);
    quietChain.current = quietChain.current.then(async () => {
      const ok = await quietPost({ setMetricRole: { key: rowKey, role } });
      setRolesLocal(null);
      // TYPE decides what the summary is written about, so changing one
      // retires the cached reading exactly as marking used to.
      if (ok) { autoReadRef.current = null; setReadingStale(true); }
      return ok;
    });
  }

  function saveHidden(rowKey: string, hidden: boolean) {
    quietChain.current = quietChain.current.then(async () => {
      const ok = await quietPost({ hideMetric: { key: rowKey, hidden } });
      // Hiding a SUPPORTING metric releases the mark server-side, so what the
      // reading is about just changed — say so, or the summary keeps
      // describing a row that is no longer on the readout.
      if (ok && (observedLocal ?? map?.observed ?? []).includes(rowKey)) { autoReadRef.current = null; setReadingStale(true); }
      return ok;
    });
  }

  async function openObservation(key: string) {
    if (openObs === key) { setOpenObs(null); return; }
    setOpenObs(key);
    if (deepObs[key] || obsBusy) return;
    setObsBusy(key); setErr(null);
    try {
      const res = await fetch("/api/prototypes/results", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: prototypeKey, deepDive: { key } }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? "Couldn't read that metric."); return; }
      if (data.observation) setDeepObs((cur) => ({ ...cur, [key]: data.observation }));
    } catch {
      setErr("Network hiccup — the full read didn't load.");
    } finally { setObsBusy(null); }
  }

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
      if (data.decision !== undefined) setDecision(data.decision);
      if (data.results) setResults(data.results);
      if (data.stats) setStats(data.stats);
      if (data.verdict) setVerdict(data.verdict);
      if (data.reading) setReading(data.reading);
      if (data.readingStale !== undefined) setReadingStale(Boolean(data.readingStale));
      if (data.readingBasis) setReadingBasis(data.readingBasis);
      if (data.notebook) setNotebook(data.notebook);
      if (data.attention) setAttention(data.attention);
      if (data.answer) setAnswer(data.answer);
      if (data.explanation) setCustomMsg(data.explanation);
      if (!res.ok) {
        // A failed reading generation must not poison the retry guard —
        // the next staleness evaluation should try again.
        if (action === "reading") autoReadRef.current = null;
        setErr(data.error ?? "That didn't work.");
        return;
      }
      // A primary swap re-derives the verdict, banner, and tiles server-side —
      // reload the readout in place so a page refresh is never needed.
      if (action === "setPrimary") await load();
      if (action === "reading" && data.reading) setToast("Summary and observations updated");

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
  // ONE WORD. "Live · 2m ago · RUNNING" said the same thing twice — but the
  // word can't just be hardcoded to LIVE either, because a paused or finished
  // run's numbers are exactly what "live" would be lying about. So the state
  // names itself, and LIVE is what a running experiment is called.
  const freshWord =
    !expStatus || expStatus === "running" ? "LIVE"
      : expStatus === "not_started" ? "NOT STARTED"
      : expStatus.replace(/_/g, " ").toUpperCase();
  const pr = verdict?.preRegistration;

  // ── tiles: the numbers a deck leads with, computed not narrated ──
  // FOUR TILES IS A HARD CAP, FOREVER. Fact routing (say-it-once): visitors →
  // tile 1 · conversion counts → tile 2 · relative effect + certainty →
  // tile 3 · time → tile 4 · RATES live in the comparison bars only.
  // With no decision metric set, the readout does NOT quietly pick one: it
  // reads Optimizely's primary and says that is what it is doing.
  const optiKey = optiPrimaryKeyOf(live) || undefined;
  const headlineKey = statsEff?.primaryKey ?? optiKey;
  const headlineIsOpti = !statsEff?.primaryKey && Boolean(optiKey);
  const primaryStats = statsEff?.metrics.find((m) => m.key === headlineKey);
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
    const etaSample = p.daysToTarget ?? p.daysToObserved;
    const dayN = (p.observationDays ?? 0) + 1;
    // ONE definition of "ready" — the tile mirrors the VERDICT's gates, so
    // the banner and the Timeline can never read opposite. The 7-day floor
    // mirrors VERDICT_THRESHOLDS.minRuntimeDays (keep in sync).
    const runtimeLeft = Math.max(0, 7 - dayN);
    const daysLeft = etaSample !== undefined ? Math.max(etaSample, runtimeLeft) : runtimeLeft > 0 ? runtimeLeft : undefined;
    const verdictWaiting = verdict?.verdict === "keep_running" || verdict?.verdict === "not_adjudicable";
    const ready = daysLeft !== undefined && daysLeft <= 0 && !verdictWaiting;
    tiles.push({
      label: "Timeline",
      value: ready ? "Ready to call" : (
        <span>Day {dayN}{daysLeft !== undefined && daysLeft > 0 ? <span className="text-[14px] font-normal text-muted-2"> of ~{dayN + daysLeft}</span> : null}</span>
      ),
      viz: daysLeft !== undefined ? <ProgressMeter daysIn={dayN} daysLeft={ready ? 0 : Math.max(daysLeft, verdictWaiting ? 1 : 0)} /> : undefined,
      sub: ready ? "decision-ready — the verdict gates are clear"
        : daysLeft !== undefined && daysLeft > 0 ? `~${plural(daysLeft, "more day")} to a decision`
        : verdictWaiting ? "waiting on the verdict gates — see the banner"
        : "trend unlocks as daily snapshots accumulate",
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

  if (view === "numbers") {
    const numLive = windowData?.results ?? live;
    const numStats = windowData ? windowData.stats : statsEff;
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
          <div className="px-4 py-2 border-b border-border flex items-center gap-3 flex-wrap">
            <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-2">Raw Optimizely metrics</span>
            {/* the date-range view: computed honestly from the console's own
                daily snapshots — the VERDICT always judges the full run */}
            <span className="flex items-center gap-1">
              {([[null, "All time"], [7, "7d"], [14, "14d"], [30, "30d"]] as [number | null, string][]).map(([d, lbl]) => (
                <button key={lbl} onClick={() => void selectWindow(d)} disabled={windowBusy}
                  className={`px-2 py-0.5 rounded-md text-[11.5px] font-medium border ${windowDays === d ? "border-accent text-accent bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]" : "border-border text-muted-2 hover:text-foreground"} disabled:opacity-50`}>
                  {lbl}
                </button>
              ))}
              {windowBusy && <span className="text-[11px] text-muted-2 ml-1">computing…</span>}
            </span>
            {windowData && (
              <span className="text-[11px] text-warn tabular-nums">window {windowData.range.from} → {windowData.range.to} · from console snapshots · the verdict judges the full run</span>
            )}
            {numStats && numStats.exploratory.length > 0 && (
              <span className="text-[11px] text-muted-2 ml-auto">exploratory — FDR-corrected; ~{numStats.expectedFalsePositives} false mover(s) expected among {numStats.exploratory.length} at raw α=.05</span>
            )}
          </div>
          {numLive ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]" style={{ tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "30%" }} />
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "15%" }} />
                </colgroup>
                {/* ONE table = perfect column alignment; sticky header = the
                    labels never scroll away */}
                <thead className="sticky top-0 z-10 bg-surface shadow-[0_1px_0_var(--border)]">
                  <tr className="text-muted-2 text-left text-[11.5px]">
                    <th className="font-medium py-2 px-4">Metric / Variation</th>
                    <th className="font-medium py-2 pr-3 text-right">Conversions</th>
                    <th className="font-medium py-2 pr-3 text-right">Rate</th>
                    <th className="font-medium py-2 pr-3 text-right">Lift</th>
                    <th className="font-medium py-2 pr-3 text-right">95% CI</th>
                    <th className="font-medium py-2 pr-4 text-right">Opti sig · p</th>
                  </tr>
                </thead>
                <tbody>
                  {numLive.metrics.map((m) => {
                    const ms = numStats?.metrics.find((x) => x.key === `metric:${m.name}`);
                    const focusCell = m.perVariation.find((r) => r.variationId === statsEff?.focusVariationId);
                    const baseCell = m.perVariation.find((r) => r.isBaseline);
                    const expanded = expandedMetric === m.name;
                    return (
                      <React.Fragment key={m.name}>
                        <tr className="border-t border-border/60">
                          <td colSpan={6} className="pt-3 pb-1 px-4">
                            <span className="text-[13px] font-semibold">{m.name}</span>
                            {m.aggregator && <span className="text-[12px] text-muted-2"> · {m.aggregator}</span>}
                            {ms?.featureOnly && (
                              <span className="ml-2 text-[10.5px] font-bold uppercase tracking-wide text-muted-2 border border-border rounded px-1"
                                title={`Fires only in the ${ms.featureOnly === "variation" ? "variation" : "control"} — adoption view, no lift/significance.`}>
                                {ms.featureOnly === "variation" ? "variation-only · adoption" : "control-only · adoption"}
                              </span>
                            )}
                            <button onClick={() => setExpandedMetric(expanded ? null : m.name)}
                              className="ml-3 text-[11.5px] text-accent hover:text-accent-hover font-medium print:hidden">
                              {expanded ? "Hide chart" : "Chart"}
                            </button>
                          </td>
                        </tr>
                        {expanded && (
                          <tr>
                            <td colSpan={6} className="px-4 pb-2">
                              <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
                                <div className="flex items-center gap-1 mb-1 print:hidden">
                                  {(["line", "bar"] as const).map((t) => (
                                    <button key={t} onClick={() => setChartType(t)}
                                      className={`px-2 py-0.5 rounded text-[11px] font-medium border ${chartType === t ? "border-accent text-accent" : "border-border text-muted-2 hover:text-foreground"}`}>
                                      {t === "line" ? "Rate by day" : "Compare"}
                                    </button>
                                  ))}
                                </div>
                                {chartType === "line" ? (
                                  <MetricTrend
                                    days={historyDays}
                                    metricName={m.name}
                                    focusId={statsEff?.focusVariationId}
                                    baseId={statsEff?.baselineVariationId}
                                    focusName={focusCell?.name ?? "Variant"}
                                    baseName={baseCell?.name ?? "Original"}
                                  />
                                ) : focusCell?.rate !== undefined && baseCell?.rate !== undefined ? (
                                  <div className="py-2">
                                    <ComparisonBars
                                      focusName={focusCell.name}
                                      focusRate={focusCell.rate}
                                      focusCount={focusCell.conversions}
                                      focusN={numLive.variations.find((v) => v.variationId === focusCell.variationId)?.visitors ?? 0}
                                      baseName={baseCell.name}
                                      baseRate={baseCell.rate}
                                      baseCount={baseCell.conversions}
                                      baseN={numLive.variations.find((v) => v.variationId === baseCell.variationId)?.visitors ?? 0}
                                      significant={sigOf(numStats?.metrics.find((x) => x.key === `metric:${m.name}`)?.cells.find((c) => c.variationId === focusCell.variationId))}
                                      positive={(numStats?.metrics.find((x) => x.key === `metric:${m.name}`)?.cells.find((c) => c.variationId === focusCell.variationId)?.lift ?? 0) >= 0}
                                    />
                                  </div>
                                ) : (
                                  <p className="text-[12px] text-muted-2 py-2">No comparable rates for this metric.</p>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                        {m.perVariation.map((r) => {
                          const sc = numStats?.metrics.find((x) => x.key === `metric:${m.name}`)?.cells.find((c) => c.variationId === r.variationId);
                          return (
                            <tr key={r.variationId} className="border-t border-border/30">
                              <td className="py-1.5 px-4 pl-7 text-muted">{r.name}{r.isBaseline ? <span className="text-muted-2"> · baseline</span> : ""}</td>
                              <td className="py-1.5 pr-3 text-right tabular-nums">{r.conversions.toLocaleString()}</td>
                              <td className="py-1.5 pr-3 text-right tabular-nums">{r.rate === undefined ? "—" : `${(r.rate * 100).toFixed(2)}%`}</td>
                              <td className={`py-1.5 pr-3 text-right tabular-nums ${toneOf(sc)}`}>{r.isBaseline ? "—" : pctS(sc?.lift)}</td>
                              <td className="py-1.5 pr-3 text-right tabular-nums text-muted-2 whitespace-nowrap">{r.isBaseline || !sc?.liftCi ? "—" : `${pctS(sc.liftCi.lo)} … ${pctS(sc.liftCi.hi)}`}</td>
                              <td className="py-1.5 pr-4 text-right tabular-nums whitespace-nowrap">
                                {r.isBaseline ? "—" : (
                                  <>
                                    <span className={sigClass(r.significance)}>{windowData ? "—" : r.significance === undefined ? "—" : `${(r.significance * 100).toFixed(0)}%`}</span>
                                    {" · "}
                                    <span className={sc?.p !== undefined && sc.p < 0.05 ? "text-ok font-semibold" : "text-muted-2"}>{sc?.p === undefined ? "—" : sc.p < 0.0001 ? "p<0.0001" : `p=${sc.p.toFixed(3)}`}</span>
                                  </>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-4 py-2 text-[12.5px] text-muted-2">No raw metrics to show — the live fetch failed and no snapshot is frozen.</div>
          )}
        </div>
      </div>
    );
  }

  // ── ZONE HELPERS ────────────────────────────────────────────────────────
  // Type ladder (the whole readout obeys it): 26px verdict word · 20px tile
  // values · 15px findings + answer headlines · 14px body · 12.5px labels.
  const ZH = "text-[12.5px] font-bold uppercase tracking-[0.08em] text-muted-2";

  // A zone being REFRESHED is not a zone that is broken: the content on screen
  // is still true, so it is never dimmed or covered. The header says the
  // section is updating and the rule under it pulses — in flow, no scrim, no
  // floating pill, nothing to read around.
  // A COMBINED metric is not the same kind of thing as an Optimizely event, and
  // a reader who doesn't know that will read its rate as a head-count. The flag
  // says so wherever the metric appears; the hover says exactly what it sums.
  const compositeFor = (key: string) =>
    key.startsWith("composite:")
      ? (map?.composites ?? []).find((c) => `composite:${c.id}` === key)
      : undefined;
  const armNameOf = (variationId: string) =>
    live?.variations.find((v) => v.variationId === variationId)?.name ?? variationId;
  const compositeFlag = (key: string, cls = "") => {
    const c = compositeFor(key);
    if (!c || !isCompositeOf(c)) return null;
    return (
      <span className={`ml-1.5 text-[9px] font-bold uppercase tracking-wide border border-accent/50 text-accent rounded px-1 align-middle cursor-help ${cls}`}
        title={describeComposite(c, armNameOf)}>
        combined{c.armEvents?.length ? " · per version" : ""}
      </span>
    );
  };

  const zoneHeader = (label: string, right?: React.ReactNode, id?: string, busyLabel?: string) => (
    <div id={id} className={`flex items-baseline gap-2 border-b pb-1.5 mb-2.5 ${busyLabel ? "border-accent/60 animate-pulse motion-reduce:animate-none" : "border-border"}`}>
      <span className={ZH}>{label}</span>
      {busyLabel && (
        <span className="flex items-center gap-1.5 text-[11px] font-medium normal-case tracking-normal text-accent print:hidden" role="status" aria-live="polite">
          <svg viewBox="0 0 16 16" className="w-3 h-3 animate-spin motion-reduce:animate-none" fill="none" stroke="currentColor" strokeWidth={2.2}>
            <circle cx="8" cy="8" r="6" className="opacity-20" />
            <path d="M14 8a6 6 0 0 0-6-6" strokeLinecap="round" />
          </svg>
          {busyLabel}
        </span>
      )}
      {right}
    </div>
  );

  // The action is COMPUTED from the first failing gate — never narrated, so a
  // model can't recommend shipping past a gate that hasn't passed.
  const actionChip = (): { label: string; href?: string } | null => {
    const failing = verdict?.gates.find((g) => g.pass === false);
    if (!failing) return stamped ? null : { label: verdict ? "Keep running" : "Waiting for data" };
    // The `validity` id is emitted by TWO gates (pre-registration resolved,
    // traffic split) and `significance` by the measurability check — key off
    // the title so the one action we offer is never confidently wrong.
    if (/pre-registration/i.test(failing.title)) return { label: "Re-confirm the plan →", href: "?tab=analytics#measurement" };
    if (/measurable/i.test(failing.title)) return { label: "Remap the primary →", href: "?tab=analytics#measurement" };
    const byGate: Record<string, { label: string; href?: string }> = {
      mapping: { label: "Confirm the measurement plan →", href: "?tab=analytics#measurement" },
      focus: { label: "Rebind the experiment →", href: "?tab=experiment#ship" },
      validity: { label: "Fix the traffic split →", href: "#method" },
      guardrails: { label: "Review the guardrail →", href: "#attention" },
    };
    if (byGate[failing.id]) return byGate[failing.id];
    if (failing.id === "runtime" || failing.id === "sample") {
      // Mirrors the Timeline tile's arithmetic (VERDICT_THRESHOLDS.minRuntimeDays = 7).
      const dayN = (statsEff?.power?.observationDays ?? 0) + 1;
      const eta = statsEff?.power?.daysToTarget ?? statsEff?.power?.daysToObserved;
      const left = Math.max(eta ?? 0, Math.max(0, 7 - dayN));
      return { label: left > 0 ? `Keep running · ~${plural(left, "more day")}` : "Keep running" };
    }
    return { label: "Hold the call" };
  };

  // Severity edge on the decision card — the only place verdict colour lives
  // now that the background wash is gone.
  const edge =
    verdict?.verdict === "confirmed" ? "border-l-ok"
    : verdict?.verdict === "refuted" || verdict?.verdict === "invalid" ? "border-l-danger"
    : verdict?.verdict === "guardrail_breach" || verdict?.verdict === "underpowered" ? "border-l-warn"
    : "border-l-border-strong";

  // The analyst writes the WORDS; every number is resolved here, live, from
  // the metric a beat names. A number copied into saved prose goes stale the
  // moment the counts move.
  const figureFor = (key?: string): string | undefined =>
    key && live ? figureValue(key, { results: live, stats: statsEff }) : undefined;

  type Beat = { key: string; label: string; value: string; qualifier?: string; tone: string };
  const beatFor = (b: { measureKey: string; label: string }): Beat | null => {
    const m = statsEff?.metrics.find((x) => x.key === b.measureKey);
    if (!m) return null;
    const focus = m.cells.find((c) => c.variationId === statsEff?.focusVariationId);
    const sig = sigOf(focus);
    const comp = map?.composites.find((c) => `composite:${c.id}` === b.measureKey);
    // Direction-of-good comes from the plan, so a rising bounce reads red.
    const good = comp?.direction === "decrease" ? (focus?.lift ?? 0) < 0 : (focus?.lift ?? 0) > 0;
    const breach = verdict?.guardrails.find((g) => `composite:${g.compositeId}` === b.measureKey && g.state === "breach");

    if (m.featureOnly) {
      return { key: b.measureKey, label: b.label, tone: "text-muted",
        value: focus?.rate !== undefined ? `${(focus.rate * 100).toFixed(1)}%` : "—",
        qualifier: "new surface" };
    }
    return {
      key: b.measureKey, label: b.label,
      value: pctS(focus?.lift),
      // QUALIFIERS ARE COMPUTED, never written — the analyst cannot drop one
      // to make a story read cleaner.
      qualifier: breach ? "guardrail" : !sig ? "too early" : undefined,
      tone: !sig ? "text-muted" : breach ? "text-danger" : good ? "text-ok" : "text-danger",
    };
  };

  // THE SUPPORTING SET — the metrics the team marked as supporting the
  // hypothesis, plus both primaries. It bounds the beats row AND the
  // observations list: one act, one meaning. ONE DERIVATION — the same
  // function the reading generator and the cache basis use, so what the
  // analyst was asked about and what the page shows can never drift apart.
  const optiPrimaryKey = optiPrimaryKeyOf(live);
  // The optimistic list overrides the stored one until the write lands, so the
  // beats row, the observations and the toggle all move together on click.
  const observedEff = observedLocal ?? map?.observed ?? [];
  const rolesEff = rolesLocal ?? map?.roles ?? {};
  const mapEff = map ? { ...map, observed: observedEff, roles: rolesEff } : null;
  const inheritedPrimary = decision?.source === "optimizely";
  const supporting = supportingKeys({
    map: mapEff,
    optiPrimaryKey,
    decisionKey: statsEff?.primaryKey,
    available: (statsEff?.metrics ?? []).map((m) => m.key),
    order: orderLocal ?? map?.measureOrder ?? [],
    // The page holds the STORED map, which has no synthesized composite in it,
    // so it cannot work this out for itself.
    optiRowIsDecision: inheritedPrimary,
  });

  const story = (() => {
    if (reading?.headline || reading?.beats?.length) {
      // THE ROW IS BUILT FROM THE SET, NOT FROM THE CACHED READING — the same
      // reconciliation the generator runs, so the page and the generator can
      // never resolve different rows from the same set (ONE DERIVATION). The
      // saved reading contributes WORDING for the metrics it happened to
      // cover; a metric marked since it was written still gets its beat,
      // labelled from the metric itself. So the top line answers a toggle
      // immediately, while the prose catches up in the background.
      const written = new Map((reading.beats ?? []).map((b) => [b.measureKey, b.label] as const));
      const rowKeys = supporting.length ? supporting : (reading.beats ?? []).map((b) => b.measureKey);
      const picked = rowKeys
        .map((k) => beatFor({ measureKey: k, label: written.get(k) ?? shortLabel(statsEff?.metrics.find((m) => m.key === k)?.label ?? k) }))
        .filter(Boolean) as Beat[];
      // The decision metric always reads first — it is the one the verdict
      // adjudicates, so it cannot appear third behind a supporting metric.
      picked.sort((a, b) => Number(b.key === headlineKey) - Number(a.key === headlineKey));
      if (picked.length) return { headline: reading.headline, lede: reading.lede, read: reading.read, beats: picked };
    }
    // No reading yet (or a cached one in the old shape): the computed story.
    const t = templateStory({ results: live!, stats: statsEff ?? null, verdict, supporting });
    return {
      headline: reading?.headline || t.headline,
      lede: reading?.lede || t.lede,
      read: reading?.read,
      beats: t.beats.map(beatFor).filter(Boolean) as Beat[],
    };
  })();

  // WATCHED metrics get an observation: the arithmetic in a sentence, plus
  // at most one line of the analyst's own about the mechanism. Observing
  // something never makes it adjudicable — the verdict reads the primary.
  // Optimizely's own primary is ALWAYS at the top, watched or not — whoever
  // opens Optimizely sees that number, so the console shows it beside its own
  // decision metric rather than letting the two disagree in different tools.
  // OBSERVATIONS = the pin, plus the decision metric (the run is being judged
  // on it, so the readout always explains it). TYPE decides what the SUMMARY
  // is about; these two were one control and are now separate, by request.
  const obsRank = new Map((orderLocal ?? map?.measureOrder ?? []).map((k, i) => [k, i] as const));
  const observed = [...new Set([
    ...(statsEff?.primaryKey ? [statsEff.primaryKey] : []),
    ...observedEff,
  ])]
    .filter((k) => statsEff?.metrics.some((m) => m.key === k))
    .sort((a, b) =>
      (a === statsEff?.primaryKey ? -1 : obsRank.get(a) ?? Number.MAX_SAFE_INTEGER)
      - (b === statsEff?.primaryKey ? -1 : obsRank.get(b) ?? Number.MAX_SAFE_INTEGER));
  // What this metric has actually DONE, day by day, from the console's own
  // snapshots — the same source the primary's trend line uses. Deterministic:
  // an observation should never depend on the analyst noticing a shape.
  const seriesFor = (key: string): TrendPoint[] => {
    if (!statsEff?.focusVariationId || !statsEff?.baselineVariationId || historyDays.length < 2) return [];
    const comp = map?.composites.find((c) => `composite:${c.id}` === key);
    const rawName = key.startsWith("metric:") ? key.slice(7) : null;
    const out: TrendPoint[] = [];
    for (const day of historyDays) {
      const visitors = (id: string) => day.variations.find((v) => v.variationId === id)?.visitors ?? 0;
      const conv = (id: string) => {
        const names = comp
          ? (comp.armEvents?.find((a) => a.variationId === id)?.events ?? comp.events)
          : rawName ? [rawName] : [];
        return names.reduce((sum, n) => sum + (day.metrics.find((m) => m.name === n)?.perVariation.find((r) => r.variationId === id)?.conversions ?? 0), 0);
      };
      const fN = visitors(statsEff.focusVariationId!), bN = visitors(statsEff.baselineVariationId!);
      if (!fN || !bN) continue;
      const fRate = conv(statsEff.focusVariationId!) / fN;
      const bRate = conv(statsEff.baselineVariationId!) / bN;
      out.push({ date: day.date, lift: bRate > 0 ? fRate / bRate - 1 : undefined, partial: false } as TrendPoint);
    }
    return out.filter((p) => p.lift !== undefined);
  };

  /** The shape of the run, in a sentence. Thresholds, not adjectives. */
  const trendSentence = (pts: TrendPoint[], sig: boolean): string | null => {
    if (pts.length < 3) return pts.length ? `Only ${plural(pts.length, "day")} of day-by-day data so far.` : null;
    const first = pts[0].lift!, last = pts[pts.length - 1].lift!;
    const flipped = first * last < 0;
    const change = Math.abs(last) - Math.abs(first);
    const rel = Math.abs(first) > 0.01 ? change / Math.abs(first) : change;
    const dir = last >= 0 ? "ahead" : "behind";
    if (flipped) return `It has changed direction since the run began — ${dir} now, the other way at the start.`;
    if (rel > 0.25) return `The gap has widened since the run began, and it is ${dir} on every day of data.`;
    if (rel < -0.25) return `The gap has narrowed since the run began${sig ? ", though it still holds" : ""}.`;
    return `It has held about the same gap every day since the run began.`;
  };

  const observationFor = (key: string) => {
    const m = statsEff?.metrics.find((x) => x.key === key);
    if (!m || !live) return null;
    const focus = m.cells.find((c) => c.variationId === statsEff?.focusVariationId);
    const base = m.cells.find((c) => c.variationId === statsEff?.baselineVariationId);
    const sig = sigOf(focus);
    const comp = map?.composites.find((c) => `composite:${c.id}` === key);
    const good = comp?.direction === "decrease" ? (focus?.lift ?? 0) < 0 : (focus?.lift ?? 0) > 0;
    const breach = verdict?.guardrails.find((g) => `composite:${g.compositeId}` === key && g.state === "breach");
    const rate = (v?: number) => (v === undefined ? "—" : `${(v * 100).toFixed(1)}%`);

    // Fallback only, and it says the same KIND of thing the analyst is asked
    // for: what this metric counts, not how it is doing.
    const focusLabel = focus?.name ?? "the variant";
    const comp2 = map?.composites.find((c) => `composite:${c.id}` === key);
    const eventList = comp2
      ? (comp2.armEvents?.length
          ? comp2.armEvents.map((a) => `${live?.variations.find((v) => v.variationId === a.variationId)?.name ?? "a version"}: ${a.events.join(" + ")}`).join(" · ")
          : comp2.events.join(" + "))
      : key.startsWith("metric:") ? key.slice(7) : m.label;
    const computedLine = m.missingEvents?.length
      ? `Not computing: this metric's definition names ${m.missingEvents.map((e) => `“${e}”`).join(", ")}, which Optimizely isn't reporting under that name.`
      : comp2
        ? `Counts ${eventList}, per visitor.`
        : `Counts every ${eventList}, per visitor.`;
    const oneArmNote = m.featureOnly ? ` Only ${focusLabel} has this surface, so it shows take-up rather than a gap.` : "";

    const pts = m.featureOnly ? [] : seriesFor(key);
    return {
      key, label: m.label,
      points: pts,
      earned: sig && !m.featureOnly,
      trend: m.featureOnly ? null : trendSentence(pts, sig),
      value: m.featureOnly ? rate(focus?.rate) : pctS(focus?.lift),
      tone: m.featureOnly || !sig ? "text-muted" : breach ? "text-danger" : good ? "text-ok" : "text-danger",
      focusRate: rate(focus?.rate),
      baseRate: m.featureOnly ? null : rate(base?.rate),
      computedLine: computedLine + oneArmNote,
      // Collapsed, the row says WHAT THIS METRIC CAPTURES — a definition that
      // reads the same whichever way the number went. What HAPPENED to it is
      // the expanded read's job; putting it in both places said it twice.
      gloss: deepObs[key]?.captures
        ?? reading?.observations?.find((o) => o.measureKey === key)?.note,
    };
  };
  const riskNote = (id: string) => reading?.riskNotes?.find((r) => r.code === id)?.note;

  // ── THE ANALYST THREAD — one conversation, hydrated from the notebook so it
  // survives reloads. Asks, metric definitions, and the analyst's own
  // question all land here; nothing about it prints.
  const entries = notebook?.proto.entries ?? [];
  const lastAnswerIdx = entries.map((e) => e.kind).lastIndexOf("analyst-answer");
  const shownEntries = threadOpen ? entries : entries.slice(-6);

  const sendComposer = () => {
    const text = composerText.trim();
    if (!text || busy) return;
    setComposerText("");

    if (composerMode === "reply" && reading?.question) {
      void post(`tune:${reading.question}`, { tune: { question: reading.question, answer: text, durable: replyDurable } });
      setComposerMode("ask");
      return;
    }
    void post("ask", { ask: text, stance: composerMode === "challenge" ? "challenge" : "ask" });
  };

  const answerBlock = (a: AnalystAnswer) => (
    <div className="space-y-1.5">
      <p className="text-[15px] font-medium leading-snug">{a.headline}</p>
      {a.bullets.length > 0 && (
        <ul className="space-y-1">
          {a.bullets.map((b) => (
            <li key={b} className="flex gap-2 text-[14px] leading-snug text-foreground/90"><span className="text-muted-2 shrink-0">•</span><span>{b}</span></li>
          ))}
        </ul>
      )}
      {a.caveat && <p className="text-[14px] text-warn leading-snug">{a.caveat}</p>}
    </div>
  );

  return (
    <div className="space-y-3">
      {toast && <Toast text={toast} onDone={() => setToast(null)} />}
      {err && <div className="text-[14px] text-danger print:hidden">{err}</div>}

      {builder && live && (
        <MetricBuilder
          results={live}
          editing={builder.editing}
          baselineId={statsEff?.baselineVariationId}
          busy={busy === "build"}
          onClose={() => setBuilder(null)}
          onSave={async (draft) => { setBuilder(null); await post("build", { buildMetric: draft }); }}
        />
      )}

      {/* ═══ THE READOUT — decision band · numbers · attention · findings ═══ */}
      <div className="print-report">
        <div className="min-w-0 space-y-5">

          {/* ── the controls the call card used to hold ── */}
          {!SHOW_CALL && live && (
            <div className="flex items-center gap-3 flex-wrap text-[12.5px] print:hidden pb-1">
              {statsEff && (
                <span className={`font-bold uppercase tracking-[0.08em] ${statsEff.validity.status === "ok" ? "text-ok" : statsEff.validity.status === "unknown" ? "text-muted-2" : statsEff.validity.status === "warn" ? "text-warn" : "text-danger"}`} title={statsEff.validity.detail}>
                  {statsEff.validity.status === "ok" ? "✓ health" : statsEff.validity.status === "unknown" ? "health unchecked" : "⚠ health"}
                </span>
              )}
              <span className="text-muted-2 tabular-nums">
                {stamped ? `Official — ${verdict?.stampedBy} · ${verdict?.stampedAt?.slice(0, 10)}` : `${freshWord} · ${relTime(statsEff?.computedAt) || "—"}`}

              </span>
              <span className="ml-auto flex items-center gap-3">
                {verdict && !stamped && stoppable && (
                  <button onClick={() => { if (confirmAction === "stamp") { setConfirmAction(null); post("stamp", { stamp: true, expectVerdict: verdict.verdict }); } else armConfirm("stamp"); }}
                    disabled={busy !== null}
                    className="h-7 px-2.5 rounded-md bg-accent text-accent-fg font-semibold hover:bg-accent-hover disabled:opacity-40">
                    {busy === "stamp" ? "Stamping…" : confirmAction === "stamp" ? "Yes, make it the record" : "Stamp the verdict"}
                  </button>
                )}
                {stamped && (
                  <button onClick={() => { if (confirmAction === "reopen") { setConfirmAction(null); post("unstamp", { unstamp: true }); } else armConfirm("reopen"); }}
                    disabled={busy !== null} className="text-muted-2 hover:text-foreground underline underline-offset-2 disabled:opacity-40">
                    {busy === "unstamp" ? "Reopening…" : confirmAction === "reopen" ? "Yes, reopen (audited)" : "Reopen"}
                  </button>
                )}
                <button onClick={() => void load()} disabled={loading || busy !== null} className="text-accent hover:text-accent-hover font-medium disabled:opacity-40">{loading ? "Refreshing…" : "Refresh"}</button>
                <button onClick={() => window.print()} className="text-accent hover:text-accent-hover font-medium">Print</button>
              </span>
            </div>
          )}

          {/* ── THE EXPERIMENT — the claim being tested. It leads the page:
                 a result means nothing without the question it answers. ── */}
          {(protoName || pr?.hypothesis || liveHypothesis) && (
            <div className="rounded-xl border border-border bg-surface px-5 py-4">
              <h2 className="text-[19px] font-bold tracking-[-0.01em]">
                Hypothesis: {protoName ?? "this experiment"}
                <span className={`ml-2.5 align-middle text-[11px] font-bold uppercase tracking-[0.07em] border rounded px-1.5 py-0.5 ${pr?.hypothesis ? "border-ok/40 text-ok" : "border-warn/40 text-warn"}`}>
                  {pr?.hypothesis
                    ? `frozen${pr.cutAt ? ` ${pr.cutAt.slice(0, 10)}` : ""}`
                    : "not frozen"}
                </span>
              </h2>
              {(pr?.hypothesis || liveHypothesis) && (
                <p className="text-[16px] leading-relaxed max-w-[92ch] mt-2">{pr?.hypothesis ?? liveHypothesis}</p>
              )}
            </div>
          )}

          {/* ── Z(A) · DECISION ─────────────────────────────────────────── */}
          {SHOW_CALL && (
          <div className={`rounded-xl border border-border border-l-4 ${edge} bg-surface px-5 py-4 flex items-start gap-4 flex-wrap`}>
            <div className="min-w-0 flex-1">
              {/* The call names WHAT IT JUDGES — a verdict with no metric
                  beside it is an opinion about nothing in particular. */}
              <div className={ZH}>
                The call
                {primaryStats && (
                  <span className="ml-2 normal-case tracking-normal text-muted">
                    judged on <span className="font-semibold text-foreground/90">{primaryStats.label}</span>
                    {headlineIsOpti && <span className="text-warn"> · Optimizely&rsquo;s primary, because no decision metric is set</span>}
                  </span>
                )}
              </div>
              {/* SUPREMACY: 26px, exactly once on the page. */}
              {look && <div className={`text-[26px] font-extrabold tracking-[-0.02em] leading-tight mt-1 ${look.cls}`}>{look.label}</div>}
              {verdict && <p className="text-[15px] text-muted mt-1 leading-snug max-w-[76ch]">{verdict.headline}</p>}
              {(() => {
                const chip = actionChip();
                if (!chip) return null;
                const cls = "inline-flex items-center h-7 px-3 mt-2.5 rounded-full border border-border text-[12.5px] font-bold uppercase tracking-[0.08em]";
                return chip.href
                  ? <a href={chip.href} className={`${cls} text-accent hover:border-accent`}>{chip.label}</a>
                  : <span className={`${cls} text-muted-2`}>{chip.label}</span>;
              })()}
            </div>
            <div className="shrink-0 text-right space-y-1.5">
              {statsEff && (
                <a href="#attention" className={`block text-[12.5px] font-bold uppercase tracking-[0.08em] ${statsEff.validity.status === "ok" ? "text-ok" : statsEff.validity.status === "unknown" ? "text-muted-2" : statsEff.validity.status === "warn" ? "text-warn" : "text-danger"}`} title={statsEff.validity.detail}>
                  {statsEff.validity.status === "ok" ? "✓ health" : statsEff.validity.status === "unknown" ? "health unchecked" : "⚠ health"}
                </a>
              )}
              <div className="text-[12.5px] text-muted-2 tabular-nums">
                {stamped
                  ? `Official — ${verdict?.stampedBy} · ${verdict?.stampedAt?.slice(0, 10)}`
                  : `${freshWord} · ${relTime(statsEff?.computedAt) || "—"}`}

              </div>
              <span className="flex items-center gap-2 justify-end print:hidden">
                {verdict && !stamped && stoppable && (confirmAction === "stamp" ? (
                  <span className="flex items-center gap-1.5">
                    <span className="text-[12.5px] text-muted-2">Make it the record?</span>
                    <button onClick={() => { setConfirmAction(null); post("stamp", { stamp: true, expectVerdict: verdict.verdict }); }} className="h-7 px-2.5 rounded-md bg-accent text-accent-fg text-[12.5px] font-semibold hover:bg-accent-hover">Yes, stamp</button>
                    <button onClick={() => setConfirmAction(null)} className="h-7 px-2 rounded-md border border-border text-[12.5px] text-muted hover:text-foreground">Cancel</button>
                  </span>
                ) : (
                  <button onClick={() => armConfirm("stamp")} disabled={busy !== null}
                    className="h-7 px-2.5 rounded-md bg-accent text-accent-fg text-[12.5px] font-semibold hover:bg-accent-hover disabled:opacity-40">
                    {busy === "stamp" ? "Stamping…" : "Stamp the verdict"}
                  </button>
                ))}
                {stamped && (confirmAction === "reopen" ? (
                  <span className="flex items-center gap-1.5">
                    <span className="text-[12.5px] text-muted-2">Reopen? (audited)</span>
                    <button onClick={() => { setConfirmAction(null); post("unstamp", { unstamp: true }); }} className="h-7 px-2 rounded-md border border-danger/50 text-[12.5px] text-danger hover:bg-danger/10">Yes, reopen</button>
                    <button onClick={() => setConfirmAction(null)} className="h-7 px-2 rounded-md border border-border text-[12.5px] text-muted hover:text-foreground">Cancel</button>
                  </span>
                ) : (
                  <button onClick={() => armConfirm("reopen")} disabled={busy !== null} className="text-[12.5px] text-muted-2 hover:text-foreground underline underline-offset-2 disabled:opacity-40">
                    {busy === "unstamp" ? "Reopening…" : "Reopen"}
                  </button>
                ))}
                <button onClick={() => void load()} disabled={loading || busy !== null} className="text-[12.5px] text-accent hover:text-accent-hover font-medium disabled:opacity-40">{loading ? "Refreshing…" : "Refresh"}</button>
                <button onClick={() => window.print()} className="text-[12.5px] text-accent hover:text-accent-hover font-medium">Print</button>
              </span>
            </div>
          </div>
          )}

          {/* ── THE READ — the analyst's interpretation, kept apart from the
                 computed call above it so the two are never confused. ── */}
          {live && (story.headline || story.lede) && (
            <div>
              {zoneHeader("The read",
                <span className="ml-auto text-[12.5px] text-muted-2 print:hidden">
                  {reading?.ledeComputed && (
                    <span className="text-warn/80 mr-2" title="The analyst's paragraph was rejected by the format rules (a digit, over-length, or statistics vocabulary) and the console's computed summary is showing instead. Re-read to try again.">
                      computed summary
                    </span>
                  )}
                  {reading ? `read ${reading.generatedAt.slice(11, 16)}` : "no reading yet"} ·{" "}
                  <button onClick={() => post("reading", { reading: true, force: true })} disabled={busy !== null} className="text-accent hover:text-accent-hover font-medium disabled:opacity-40">
                    {busy === "reading" ? "re-reading…" : "re-read"}
                  </button>
                </span>, undefined, busy === "reading" ? "rewriting" : undefined)}
              <div className="space-y-2">
                {story.headline && <p className="text-[22px] font-bold leading-[1.2] tracking-[-0.015em] text-balance max-w-[64ch]">{story.headline}</p>}
                {story.read && Object.values(story.read).some(Boolean) ? (
                  // FIXED SECTIONS, same four every time. The prose was good and
                  // still unscannable: one block you cannot re-enter at the part
                  // you half-remember.
                  <div className="grid gap-x-10 gap-y-5 md:grid-cols-2 xl:grid-cols-4 pt-1.5">
                    {([
                      ["What the change did", story.read.effect],
                      ["Where the behaviour went", story.read.shift],
                      ["What it cost", story.read.cost],
                      ["Against the prediction", story.read.prediction],
                    ] as const).filter(([, sec]) => Boolean(sec?.text)).map(([label, sec]) => {
                      // THE NUMBER LIVES WITH THE SENTENCE THAT EXPLAINS IT.
                      // A row of lifts underneath was a magnitude with no
                      // meaning, sitting between the prose that gave it meaning
                      // and the table that gave it context.
                      const b = sec!.measureKey ? beatFor({ measureKey: sec!.measureKey, label: "" }) : null;
                      return (
                        <div key={label} className="min-w-0">
                          <div className={`${ZH} mb-1.5 text-muted-2`}>{label}</div>
                          {b && (
                            <div className="flex items-baseline gap-2 mb-1">
                              <span className={`text-[19px] font-extrabold tabular-nums leading-none ${b.tone}`}>{b.value}</span>
                              <span className="text-[12.5px] text-muted-2 min-w-0 truncate" title={statsEff?.metrics.find((m) => m.key === b.key)?.label ?? ""}>
                                {shortLabel(statsEff?.metrics.find((m) => m.key === b.key)?.label ?? "")}
                                {compositeFlag(b.key)}
                                {b.key === statsEff?.primaryKey && (
                                  <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wide border border-ok/40 text-ok rounded px-1 align-middle">decision</span>
                                )}
                                {b.qualifier && <span className="text-muted-2"> — {b.qualifier}</span>}
                              </span>
                            </div>
                          )}
                          <p className="text-[14px] leading-[1.55] text-foreground/90">{sec!.text}</p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  story.lede && <p className="text-[15px] leading-relaxed max-w-[92ch] text-foreground/90">{story.lede}</p>
                )}
                {supporting.length <= 1 && (
                  <p className="text-[12.5px] text-muted-2 pt-1 print:hidden">
                    Only the decision metric is declared. Set a metric&rsquo;s Type to SUPPORTING in All metrics so the read can draw on it.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Z(B) · THE NUMBERS — four tiles, hard cap ─────────────────── */}
          {SHOW_TILES && tiles.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {tiles.map((t) => (
                <div key={t.label} className="rounded-xl border border-border bg-surface px-3.5 py-2.5 min-h-[92px] flex flex-col">
                  <div className={`${ZH} truncate`} title={t.label}>{t.label}</div>
                  <div className={`text-[20px] font-semibold leading-tight tracking-tight tabular-nums mt-0.5 ${t.cls ?? ""}`}>{t.value}</div>
                  {t.viz}
                  {t.sub && <div className={`text-[12.5px] text-muted-2 tabular-nums mt-auto ${t.wrapSub ? "leading-snug" : "truncate"}`}>{t.sub}</div>}
                </div>
              ))}
            </div>
          )}

          {/* ── Z(C) · NEEDS ATTENTION — 100% computed ─────────────────────── */}
          {SHOW_ATTENTION && attention.length > 0 && (() => {
            const ackSet = new Set(map?.acknowledged ?? []);
            // Acknowledged rows leave the WORKING view and still print: the
            // reader has seen them, the record has not lost them.
            const acked = attention.filter((a) => a.severity !== "critical" && ackSet.has(a.id));
            const criticals = attention.filter((a) => a.severity === "critical");
            const rest = attention.filter((a) => a.severity !== "critical" && !ackSet.has(a.id));
            const room = Math.max(1, 4 - criticals.length);
            const shown = [...criticals, ...(showAllAttention ? rest : rest.slice(0, room))];
            if (!shown.length && !acked.length) return null;
            const hiddenCount = rest.length - (showAllAttention ? rest.length : Math.min(room, rest.length));
            const tone = (s: string) => (s === "critical" ? "text-danger" : s === "attention" ? "text-warn" : "text-ok");
            const bar = (s: string) => (s === "critical" ? "bg-danger" : s === "attention" ? "bg-warn" : "bg-ok");
            return (
              <div>
                {zoneHeader("Needs attention", criticals.length + rest.length > 0 && attention[0].severity !== "good"
                  ? <span className="text-[20px] font-semibold tabular-nums leading-none">{criticals.length + rest.length}</span>
                  : undefined, "attention")}
                <div className="divide-y divide-border/40">
                  {shown.map((a) => (
                    <div key={a.id} className="flex items-start gap-3 py-2.5">
                      <span className={`w-[3px] self-stretch rounded-full shrink-0 ${bar(a.severity)}`} />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[14px] font-semibold truncate ${tone(a.severity)}`} title={a.title}>{a.title}</span>
                        <span className="block text-[14px] text-muted leading-snug line-clamp-2">{riskNote(a.id) ?? a.detail}</span>
                      </span>
                      {a.actionLabel && (
                        a.actionHref === "#refresh"
                          ? <button onClick={() => void load()} className="shrink-0 text-[12.5px] font-bold uppercase tracking-[0.08em] text-accent hover:text-accent-hover print:hidden">{a.actionLabel}</button>
                          : <a href={a.actionHref} className="shrink-0 text-[12.5px] font-bold uppercase tracking-[0.08em] text-accent hover:text-accent-hover">{a.actionLabel} →</a>
                      )}
                      {a.severity !== "critical" && a.severity !== "good" && (
                        <button onClick={() => void post("ack", { acknowledge: { id: a.id, on: true } })}
                          title="Mark as seen — it leaves this list and still prints on the report"
                          className="shrink-0 text-[15px] leading-none text-muted-2/60 hover:text-foreground print:hidden">&#215;</button>
                      )}
                    </div>
                  ))}
                  {hiddenCount > 0 && (
                    <button onClick={() => setShowAllAttention(true)} className="py-2 text-[14px] text-muted-2 hover:text-foreground print:hidden">+{hiddenCount} more</button>
                  )}
                  {acked.length > 0 && (
                    <div className="py-2">
                      <button onClick={() => setShowAcked((v) => !v)} className="text-[12.5px] text-muted-2 hover:text-foreground print:hidden">
                        {showAcked ? "Hide" : "Show"} {plural(acked.length, "acknowledged item")}
                      </button>
                      <div className={`${showAcked ? "" : "hidden"} print:block mt-1.5 space-y-1.5`}>
                        {acked.map((a) => (
                          <div key={a.id} className="flex items-start gap-2 text-[13.5px] text-muted-2">
                            <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide border border-border rounded px-1 mt-0.5">seen</span>
                            <span className="min-w-0"><b className="font-semibold">{a.title}</b> — {riskNote(a.id) ?? a.detail}</span>
                            <button onClick={() => void post("ack", { acknowledge: { id: a.id, on: false } })}
                              className="ml-auto shrink-0 text-[12.5px] hover:text-foreground print:hidden">restore</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ── Z(E) · PROOF — see it, don't read it ──────────────────────── */}
          {SHOW_PROOF && (() => {
            const pts = (statsEff?.trend ?? []).filter((t) => t.lift !== undefined);
            const bars = primaryStats && primaryFocus?.rate !== undefined && primaryBase?.rate !== undefined;
            if (!bars && pts.length < 3) return null;
            return (
              <div id="proof" className="rounded-xl border border-border bg-surface p-4 grid gap-5 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                {bars && (
                  <div className="min-w-0">
                    <div className={`${ZH} mb-1.5 truncate`} title={primaryStats!.label}>The comparison — {primaryStats!.label}</div>
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
                <div className={`min-w-0 ${bars ? "md:border-l md:border-border/40 md:pl-5" : ""}`}>
                  <div className={`${ZH} mb-1.5`}>Day by day {pts.length >= 3 && <span className="font-normal normal-case tracking-normal tabular-nums">· {pts[0].date} → {pts[pts.length - 1].date}</span>}</div>
                  {pts.length >= 3 ? (
                    <>
                      <Sparkline trend={pts} significant={liftSig} />
                      {reading?.trend && <p className="text-[14px] text-muted mt-1.5 leading-snug">{reading.trend}</p>}
                    </>
                  ) : (
                    <p className="text-[14px] text-muted-2">Daily trend unlocks after 3 days of snapshots ({pts.length} so far).</p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ── METRIC BY METRIC — one note per observed metric. Noticed,
                 never judged: the verdict reads the decision metric alone. ── */}
          {observed.length > 0 && (
            <div>
              {zoneHeader("Metric by metric", undefined, "observations", busy === "reading" ? "updating" : undefined)}
              <div className="divide-y divide-border/40">
                {observed.map((key) => {
                  const o = observationFor(key);
                  if (!o) return null;
                  return (
                    <div key={key} className="py-2">
                    {/* THE WHOLE ROW IS THE CONTROL. A shouty uppercase link on
                        every row was five calls to action competing with the
                        numbers; the row itself opens, and one chevron says so. */}
                    <div role="button" tabIndex={0}
                      aria-expanded={openObs === key}
                      onClick={() => void openObservation(key)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void openObservation(key); } }}
                      className="group flex items-baseline gap-3 cursor-pointer rounded-lg -mx-2 px-2 py-1 transition-colors hover:bg-foreground/[0.035] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60">
                      <span className={`text-[15px] font-bold tabular-nums w-20 shrink-0 text-right ${o.tone}`}>{o.value}</span>
                      {o.points.length >= 3 && (
                        <span className="hidden md:block w-20 shrink-0 self-center text-muted-2"><MicroTrend trend={o.points} earned={o.earned} /></span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="text-[14px] font-semibold">{o.label}</span>
                        {compositeFlag(key)}
                        {key === optiPrimaryKey && (
                          <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wide border border-border rounded px-1 text-muted-2 align-middle"
                            title="The metric Optimizely reports as this experiment's primary. The console adjudicates its own decision metric — the two may legitimately differ, which is why both are read here.">
                            optimizely&rsquo;s primary
                          </span>
                        )}
                        {key === statsEff?.primaryKey && (
                          <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wide border border-ok/40 text-ok rounded px-1 align-middle"
                            title="The console's decision metric — the one the verdict adjudicates, and the one the summary above is about.">
                            decision metric
                          </span>
                        )}
                        {/* The rates are the thing being compared, so they read
                            like it. Colour stays on the effect: the variant's
                            number takes the earned tone, the control never does,
                            and an unsettled metric stays neutral in both. */}
                        <span className="text-[13.5px] tabular-nums ml-2.5 whitespace-nowrap">
                          <span className={`font-bold ${o.earned ? o.tone : "text-foreground/85"}`}>{o.focusRate}</span>
                          {o.baseRate
                            ? <span className="text-muted"> vs <span className="font-semibold text-foreground/70">{o.baseRate}</span> control</span>
                            : <span className="text-muted-2"> &middot; nothing equivalent in the control</span>}
                        </span>
                        <span className="block text-[14px] text-foreground/85 leading-snug line-clamp-2">{o.gloss ?? o.computedLine}</span>
                        {o.gloss && o.trend && <span className="block text-[12.5px] text-muted-2 leading-snug mt-0.5">{o.trend}</span>}
                      </span>
                      {(key === optiPrimaryKey || key === statsEff?.primaryKey) && !(map?.observed ?? []).includes(key) ? (
                        <span className="shrink-0 self-center text-muted-2/40 print:hidden" title="Always observed — the decision metric is read here whether or not anyone pinned it">
                          <Glyph kind="watchOn" />
                        </span>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); toggleSupporting(key, false); }}
                          title="Stop observing this metric"
                          aria-label="Stop observing this metric"
                          className="shrink-0 self-center text-muted-2/70 hover:text-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity print:hidden">
                          <Glyph kind="watchOn" />
                        </button>
                      )}
                      <span aria-hidden
                        title={openObs === key ? "Close" : "Read the full observation"}
                        className={`shrink-0 self-center grid place-items-center w-6 h-6 rounded-full border border-border text-muted-2 transition-all group-hover:border-accent/60 group-hover:text-accent motion-reduce:transition-none print:hidden ${openObs === key ? "rotate-90 border-accent/60 text-accent" : ""}`}>
                        {obsBusy === key
                          ? <svg viewBox="0 0 16 16" className="w-3 h-3 animate-spin motion-reduce:animate-none" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="8" cy="8" r="6" className="opacity-25" /><path d="M14 8a6 6 0 0 0-6-6" strokeLinecap="round" /></svg>
                          : <Glyph kind="chevron" />}
                      </span>
                    </div>

                    {openObs === key && (
                      <div className="mt-2 ml-[5.75rem] md:ml-[11.5rem] rounded-lg border border-border bg-background/50 px-5 py-4 space-y-2.5">
                        {obsBusy === key && <p className="text-[14px] text-muted-2">Reading this metric against the brief and what was built…</p>}
                        {deepObs[key] && (
                          <>
                            {deepObs[key].inertVariation && (
                              <div className="rounded-md border border-danger/50 bg-danger/5 px-3 py-2">
                                <div className={`${ZH} mb-1 text-danger`}>The code this reads doesn&rsquo;t change the page</div>
                                <p className="text-[14px] leading-[1.55] text-danger/90">
                                  The variation running on this experiment touches nothing on the screen, so no mechanism can be read from it and any gap between the versions is who landed where rather than anything the change did. Check the variation in Optimizely before reading anything into these numbers.
                                </p>
                              </div>
                            )}
                            {deepObs[key].headline && (
                              <p className="text-[17px] font-bold leading-snug max-w-[64ch]">{deepObs[key].headline}</p>
                            )}

                            {/* TWO QUESTIONS the row cannot answer for itself.
                                What happened, what it means and what to watch
                                were all on screen already — in the row above, in
                                THE READ, and in the numbers — so six sections of
                                prose were mostly the page repeating itself. */}
                            <div className="grid gap-x-10 gap-y-4 lg:grid-cols-2 pt-1">
                              {([
                                ["Why", deepObs[key].mechanism, "text-foreground/90"],
                                ["Why it might not be that", deepObs[key].rival, "text-muted"],
                                ["What happened", deepObs[key].observation, "text-foreground/90"],
                                ["What it means", deepObs[key].implication, "text-foreground/90"],
                              ] as const).filter(([, text]) => Boolean(text)).map(([label, text, tone]) => (
                                <div key={label} className="min-w-0">
                                  <div className={`${ZH} mb-1 text-muted-2`}>{label}</div>
                                  <p className={`text-[14px] leading-[1.55] ${tone}`}>{text}</p>
                                </div>
                              ))}
                            </div>
                            {/* a cached read from the previous single-paragraph form */}
                            {!deepObs[key].observation && deepObs[key].read && (
                              <p className="text-[14px] leading-[1.55] text-foreground/90 max-w-[80ch]">{deepObs[key].read}</p>
                            )}
                            {/* The caution and the next move are a different KIND
                                of statement from the analysis — they sit below a
                                rule rather than reading as a fifth paragraph. */}
                            {(deepObs[key].counting || deepObs[key].caution || deepObs[key].watch) && (
                              <div className="grid gap-x-10 gap-y-2.5 lg:grid-cols-2 pt-3 mt-1 border-t border-border/50">
                                {(deepObs[key].counting || deepObs[key].caution) && (
                                  <div className="min-w-0">
                                    <div className={`${ZH} mb-1 text-warn/80`}>How this is counted</div>
                                    <p className="text-[14px] leading-[1.55] text-warn">{deepObs[key].counting ?? deepObs[key].caution}</p>
                                  </div>
                                )}
                                {deepObs[key].watch && (
                                  <div className="min-w-0">
                                    <div className={`${ZH} mb-1 text-muted-2`}>Watch next</div>
                                    <p className="text-[14px] leading-[1.55] text-muted">{deepObs[key].watch}</p>
                                  </div>
                                )}
                              </div>
                            )}
                            <div className="text-[12.5px] text-muted-2 print:hidden">
                              read {deepObs[key].generatedAt.slice(11, 16)} ·{" "}
                              <button onClick={() => { setDeepObs((c) => { const n = { ...c }; delete n[key]; return n; }); void openObservation(key); void openObservation(key); }}
                                className="text-accent hover:text-accent-hover font-medium">re-read</button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Z(F) · EXPLORATORY — never confirmation ───────────────────── */}
          {SHOW_EXPLORATORY && verdict && verdict.discoveries.length > 0 && (
            <details>
              <summary className="cursor-pointer select-none border-b border-border pb-1.5">
                <span className={ZH}>Exploratory signals ({verdict.discoveries.length})</span>
                <span className="block text-[12.5px] text-muted-2 mt-0.5">not pre-registered — candidates for the next test, never confirmation</span>
              </summary>
              <div className="mt-2.5 space-y-2">
                {verdict.discoveries.slice(0, 3).map((d) => (
                  <div key={d.id} className="flex items-center gap-2 text-[14px]">
                    {/* No q-values on a leadership surface — the strength of
                        the signal in words. The number stays in The numbers. */}
                    <span className="min-w-0">{d.label} <span className={`tabular-nums ${liftClass(d.lift)} opacity-70`}>{pctS(d.lift)}</span> on {d.variationName}{" "}
                      <span className="text-muted-2" title={`False-discovery rate q=${(d.q * 100).toFixed(1)}% after correcting for the number of metrics swept`}>
                        {d.q <= 0.01 ? "· very unlikely to be noise" : d.q <= 0.05 ? "· unlikely to be noise" : "· worth a look"}
                      </span>
                    </span>
                    {d.promotedIdeaId
                      ? <span className="ml-auto text-[12.5px] text-ok shrink-0">✓ in the backlog</span>
                      : <button onClick={() => post(`promote:${d.id}`, { promote: d.id })} disabled={busy !== null}
                          className="ml-auto h-7 px-2 rounded-md border border-border text-[12.5px] font-medium text-muted hover:text-foreground hover:border-border-strong disabled:opacity-40 shrink-0 print:hidden">
                          {busy === `promote:${d.id}` ? "Promoting…" : "Promote to backlog →"}
                        </button>}
                  </div>
                ))}
                {verdict.discoveries.length > 3 && <div className="text-[12.5px] text-muted-2">+{verdict.discoveries.length - 3} more in The numbers</div>}
              </div>
            </details>
          )}

          {/* ── Z(G) · ALL MEASURES — every metric, the user's own order ── */}
          <div>
            {zoneHeader("All metrics",
              <span className="ml-auto flex items-center gap-4 print:hidden">
                <button onClick={() => setBuilder({ editing: null })} disabled={!live}
                  className="text-[12.5px] font-bold uppercase tracking-[0.08em] text-accent hover:text-accent-hover disabled:opacity-40">+ Build a metric</button>
                <a href="#numbers" onClick={(e) => { e.preventDefault(); window.location.hash = "numbers"; }} className="text-[12.5px] font-bold uppercase tracking-[0.08em] text-accent hover:text-accent-hover">Open the numbers →</a>
              </span>,
              "metrics")}
          {/* ── the metric INDEX: every metric × every arm, named columns,
                 half-width — the decision metric pinned on top, everything else
                 in the user’s drag-saved order ── */}
          {live && (() => {
            // canonical arm order: focus first, others, control last
            const ordered = [
              ...live.variations.filter((v) => v.variationId === statsEff?.focusVariationId),
              ...live.variations.filter((v) => v.variationId !== statsEff?.focusVariationId && v.variationId !== statsEff?.baselineVariationId),
              ...live.variations.filter((v) => v.variationId === statsEff?.baselineVariationId),
            ].slice(0, 5);
            const isCtl = (id: string) => id === statsEff?.baselineVariationId;

            const composites = map?.composites ?? [];
            // DISPLAY-ONLY row for Optimizely's own primary. It is not in the
            // stored map (deliberately — the page must never be able to post
            // it back), so without this the decision metric the verdict card
            // names would have no row in the table at all.
            const inheritedRow: MetricMap["composites"][number] | null = inheritedPrimary && decision
              ? { id: decision.key.replace(/^composite:/, ""), label: decision.label, events: [decision.label], role: "primary", source: "optimizely", ...(decision.direction ? { direction: decision.direction } : {}) }
              : null;
            const primaryComp = inheritedRow ?? composites.find((cc) => cc.role === "primary");

            // Pinned primary first; the rest in the user’s saved order — new
            // metrics append in default order (composites, then raw events).
            const orderPref = orderLocal ?? map?.measureOrder ?? [];
            const posOf = new Map(orderPref.map((k, i2) => [k, i2] as const));
            const keyed = [
              ...composites.filter((cc) => cc !== primaryComp).map((cc) => ({ kind: "c" as const, c: cc, mi: 0, key: `composite:${cc.id}` })),
              ...live.metrics
                .filter((m) => !(inheritedRow && `metric:${m.name}` === optiPrimaryKey))
                .map((m, mi) => ({ kind: "m" as const, m, mi, key: `metric:${m.name}` })),
            ].sort((a, b) => (posOf.get(a.key) ?? Number.MAX_SAFE_INTEGER) - (posOf.get(b.key) ?? Number.MAX_SAFE_INTEGER));

            const hiddenSet = new Set(map?.hiddenMeasures ?? []);
            const visibleRows = keyed.filter((r) => !hiddenSet.has(r.key));
            const hiddenRows = keyed.filter((r) => hiddenSet.has(r.key));

            const dropOn = (targetKey: string) => {
              const from = dragKeyRef.current;
              dragKeyRef.current = null;
              setDragOverKey(null);
              if (!from || from === targetKey) return;
              const keys = keyed.map((r) => r.key);
              const fromIdx = keys.indexOf(from);
              const toIdx = keys.indexOf(targetKey);
              if (fromIdx < 0 || toIdx < 0) return;
              keys.splice(fromIdx, 1);
              // uniform insert-at-target: drag down lands after it, drag up before
              keys.splice(toIdx, 0, from);
              saveOrder(keys);
            };

            const grip = (rowKey: string) => (
              <span draggable title="Drag to reorder"
                onDragStart={() => { dragKeyRef.current = rowKey; }}
                onDragEnd={() => { dragKeyRef.current = null; setDragOverKey(null); }}
                className="cursor-grab active:cursor-grabbing text-muted-2/70 hover:text-foreground select-none">
                <Glyph kind="grip" />
              </span>
            );
            // toggle · rename · delete · hide — fixed slots, right-aligned.
            const CLUSTER = "grid grid-cols-[0.9rem_1.75rem_0.9rem_0.9rem_0.9rem] gap-2 items-center justify-items-center ml-auto w-fit";
            // SUPPORTING — the one act that says "this metric is part of the
            // story": it enters the readout's top line AND gets an
            // observation. Marking promotes; it never suppresses, so an
            // unmarked metric can still be raised as a contradiction.
            const watch = (rowKey: string) => {
              const on = observedEff.includes(rowKey);
              return (
                <button onClick={() => toggleSupporting(rowKey, !on)}
                  title={on
                    ? "Observed — this metric gets a written read of what guests are doing. Click to stop observing it."
                    : "Observe this metric: it gets a written read in Observations. (What the SUMMARY is about is the Type column.)"}
                  className={on ? "text-accent" : "text-muted-2 hover:text-foreground"}>
                  <Glyph kind={on ? "watchOn" : "watch"} />
                </button>
              );
            };
            // TYPE — what the metric is FOR. Supporting metrics are what the
            // summary is written about; the pin is a separate question (does
            // this one get a written observation). Decision is not selectable
            // here: it is set with the toggle, and there is only ever one.
            const TYPE_STYLE: Record<MetricRole, string> = {
              decision: "border-ok/50 text-ok",
              supporting: "border-accent/50 text-accent",
              guardrail: "border-warn/50 text-warn",
              exploratory: "border-border text-muted-2",
            };
            const typeChip = (rowKey: string) => {
              const role = roleOf(rowKey, { map: mapEff, decisionKey: statsEff?.primaryKey, optiPrimaryKey });
              if (role === "decision") {
                return (
                  <span className={`inline-block text-[9px] font-bold uppercase tracking-wide border rounded px-1 ${TYPE_STYLE.decision}`}
                    title="The decision metric — the one the verdict adjudicates. Set it with the toggle; there is only ever one.">
                    decision
                  </span>
                );
              }
              return (
                <span className={`relative inline-flex items-center text-[9px] font-bold uppercase tracking-wide border rounded px-1 ${TYPE_STYLE[role]}`}>
                  {role}
                  <select
                    value={role}
                    onChange={(e) => setMetricRole(rowKey, e.target.value as "supporting" | "guardrail" | "exploratory")}
                    aria-label={`Type of ${rowKey.replace(/^(metric|composite):/, "")}`}
                    title="SUPPORTING — the summary is written about it · GUARDRAIL — must not drop · EXPLORATORY — watched, never evidence"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer">
                    <option value="supporting">supporting</option>
                    <option value="guardrail">guardrail</option>
                    <option value="exploratory">exploratory</option>
                  </select>
                </span>
              );
            };
            const eye = (rowKey: string, isHidden: boolean) => (
              <button onClick={() => saveHidden(rowKey, !isHidden)}
                title={isHidden ? "Show this metric again" : "Hide from the index (display only — plan metrics still feed the verdict)"}
                className="text-muted-2 hover:text-foreground">
                <Glyph kind={isHidden ? "eyeOff" : "eye"} />
              </button>
            );
            const dragProps = (rowKey: string) => ({
              onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOverKey(rowKey); },
              onDragLeave: () => setDragOverKey((k) => (k === rowKey ? null : k)),
              onDrop: (e: React.DragEvent) => { e.preventDefault(); dropOn(rowKey); },
            });

            const compositeTr = (c: MetricMap["composites"][number], pinned: boolean, isHidden = false) => {
              const rowKey = `composite:${c.id}`;
              // Optimizely's own primary is synthesized at read time and has no
              // stored record, so nothing here may try to edit or delete it.
              const inherited = c.source === "optimizely";
              const cell = cellFor(rowKey, statsEff?.focusVariationId ?? "");
              const rowsC = computeComposite(c, live);
              return (
                <tr key={c.id} title={[c.definition, c.note].filter(Boolean).join(" — ")}
                  {...(pinned || isHidden ? {} : dragProps(rowKey))}
                  className={`border-t ${dragOverKey === rowKey ? "border-accent" : "border-border/40"}${isHidden ? " opacity-55" : ""}`}>
                  <td className="py-1.5 pr-1 print:hidden">{!pinned && !isHidden && grip(rowKey)}</td>
                  <td className="py-1.5 pr-2">
                    {renamingId === c.id ? (
                      <span className="inline-flex items-center gap-1">
                        <input autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && renameVal.trim()) { setRenamingId(null); post("rename", { renameMetric: { id: c.id, label: renameVal } }); }
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          className="h-6 px-1.5 rounded border border-accent bg-background text-[12.5px] focus:outline-none w-48" />
                        <button onClick={() => { if (renameVal.trim()) { setRenamingId(null); post("rename", { renameMetric: { id: c.id, label: renameVal } }); } }} className="text-[11px] text-accent font-medium">Save</button>
                      </span>
                    ) : (
                      <span className="font-medium text-[12.5px]">{c.label}</span>
                    )}{" "}
                    {(() => {
                      const miss = statsEff?.metrics.find((x) => x.key === `composite:${c.id}`)?.missingEvents;
                      return miss?.length ? (
                        <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wide border border-danger/50 text-danger rounded px-1 align-middle"
                          title={`This metric's definition names ${miss.map((e) => `“${e}”`).join(", ")}, which Optimizely is not reporting under that name. Edit it, or remove it if another metric already measures this step.`}>
                          misnamed
                        </span>
                      ) : null;
                    })()}
                    {compositeFlag(rowKey)}
                  </td>
                  <td className="py-1.5 pr-2">{typeChip(rowKey)}</td>
                  <td className="py-1.5 pr-2">
                    {c.source === "optimizely" ? (
                      <span className="text-[9px] font-bold uppercase tracking-wide border border-border rounded px-1 text-muted-2"
                        title="This experiment's own primary metric, declared in Optimizely. The console adjudicates it because it was declared there before traffic — nominate your own metric to judge against a different definition.">
                        optimizely
                      </span>
                    ) : c.source === "custom" ? (
                      <span className="text-[9px] font-bold uppercase tracking-wide border border-accent/40 text-accent rounded px-1"
                        title={`Built here from Optimizely events: ${(c.armEvents?.length ? c.armEvents.flatMap((a) => a.events) : c.events).join(" + ")}`}>
                        console
                      </span>
                    ) : (
                      <a href="?tab=analytics#measurement"
                        className="text-[9px] font-bold uppercase tracking-wide border border-border rounded px-1 text-muted-2 hover:text-foreground hover:border-border-strong"
                        title={`Written by the measurement planner, not by hand. Editable here — redefining it drops the plan to unconfirmed and the change is recorded. = ${(c.armEvents?.length ? c.armEvents.flatMap((a) => a.events) : c.events).join(" + ")}`}>
                        plan →
                      </a>
                    )}
                  </td>
                  {ordered.map((v) => {
                    const r = rowsC.find((x) => x.variationId === v.variationId);
                    return <td key={v.variationId} className="py-1.5 px-1.5 text-right">{r?.rate !== undefined ? `${(r.rate * 100).toFixed(1)}%` : "—"}</td>;
                  })}
                  <td className={`py-1.5 pl-2 text-right font-semibold ${toneOf(cell)}`}>{pctS(cell?.lift)}</td>
                  <td className="py-1.5 pl-2 text-right text-[10.5px] text-muted-2">{sigOf(cell) ? "beyond luck" : "too early"}</td>
                  <td className="py-1.5 pl-2 print:hidden">
                    {deleteArmId === c.id ? (
                      <span className="flex items-center justify-end gap-1 text-[11px] whitespace-nowrap">
                        <button onClick={() => { setDeleteArmId(null); post("remove", { removeMetric: c.id }); }} className="text-danger font-semibold">delete?</button>
                        <button onClick={() => setDeleteArmId(null)} className="text-muted-2">✕</button>
                      </span>
                    ) : (
                      <span className={CLUSTER}>
                        {watch(rowKey)}
                        {/* ONE primary — switch semantics: on = the decision metric;
                            flipping another on moves it (the server keeps exactly one) */}
                        <button
                          onClick={() => {
                            if (inherited) return; // nothing to stand down — it is Optimizely's declaration
                            if (c.role === "primary") void post("setPrimary", { clearPrimary: true });
                            else if (!c.expectedOneArm) void post("setPrimary", { setPrimary: c.id });
                          }}
                          disabled={inherited || Boolean(c.expectedOneArm) || busy !== null}
                          title={inherited
                            ? "INHERITED — Optimizely's own primary metric is the decision metric while the console has no nomination of its own. You can't switch it off; flip another metric on to override it."
                            : c.role === "primary" ? "The console’s decision metric. Flip it off to stand it down — Optimizely's own primary takes over again."
                            : c.expectedOneArm ? "Fires in only one arm — can’t be the decision metric"
                            : "Make this the decision metric (recorded; disclosed if changed after traffic began)"}
                          className={`relative w-7 h-4 rounded-full transition-colors ${inherited ? "bg-border-strong ring-1 ring-inset ring-ok/50 cursor-default" : c.role === "primary" ? "bg-ok" : c.expectedOneArm ? "bg-border opacity-40 cursor-not-allowed" : "bg-border-strong hover:bg-accent/60"}`}>
                          <span className={`absolute top-0.5 h-3 w-3 rounded-full shadow-sm transition-[left] ${inherited ? "bg-muted-2 left-3.5" : "bg-white " + (c.role === "primary" ? "left-3.5" : "left-0.5")}`} />
                        </button>
                        {inherited
                          ? <span title="Declared in Optimizely — change it there, or nominate your own decision metric here." className="text-muted-2/25 cursor-not-allowed"><Glyph kind="pencil" /></span>
                          : <button onClick={(e) => { e.stopPropagation(); setBuilder({ editing: c }); }}
                              title={c.source === "custom"
                                ? "Edit this metric"
                                : "Edit this metric. The planner wrote it, so redefining it moves the contract — the plan drops to unconfirmed and the change is recorded."}
                              className="text-muted-2 hover:text-foreground"><Glyph kind="pencil" /></button>}
                        {c.role === "primary"
                          ? <span title="The decision metric — stand it down with its toggle first, then remove it" className="text-muted-2/25 cursor-not-allowed"><Glyph kind="trash" /></span>
                          : <button onClick={() => setDeleteArmId(c.id)}
                              title={c.source === "custom" ? "Remove this metric" : "Remove it from the measurement plan — the plan drops to unconfirmed and the change is disclosed"}
                              className="text-muted-2 hover:text-danger"><Glyph kind="trash" /></button>}
                        {pinned ? <span /> : eye(rowKey, isHidden)}
                      </span>
                    )}
                  </td>
                </tr>
              );
            };

            const metricTr = (m: ExperimentResults["metrics"][number], mi: number, isHidden = false) => {
              const rowKey = `metric:${m.name}`;
              const ms = statsEff?.metrics.find((x) => x.key === rowKey);
              const cell = ms?.cells.find((x) => x.variationId === statsEff?.focusVariationId);
              return (
                <tr key={m.name} {...(isHidden ? {} : dragProps(rowKey))}
                  className={`border-t ${dragOverKey === rowKey ? "border-accent" : "border-border/40"}${isHidden ? " opacity-55" : ""}`}>
                  <td className="py-1.5 pr-1 print:hidden">{!isHidden && grip(rowKey)}</td>
                  <td className="py-1.5 pr-2 text-muted">
                    {m.name}
                    {ms?.featureOnly && <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wide border border-border rounded px-1 text-muted-2 align-middle">{ms.featureOnly}-only</span>}
                  </td>
                  <td className="py-1.5 pr-2">{typeChip(rowKey)}</td>
                  <td className="py-1.5 pr-2">
                    <span className="text-[9px] font-bold uppercase tracking-wide border border-border rounded px-1 text-muted-2" title="Reported by Optimizely exactly as it fires">optimizely</span>
                    {/* IDENTITY, never array position. This was `mi === 0`, so
                        once the inherited decision metric was pulled out of the
                        raw list the badge slid onto whatever row happened to
                        land in slot zero. */}
                    {rowKey === optiPrimaryKey && <span className="ml-1 text-[9px] font-bold uppercase tracking-wide text-muted-2" title="Optimizely’s own primary metric for this experiment. The console adjudicates its own decision metric when one is nominated — the two may legitimately differ.">· primary</span>}
                  </td>
                  {ordered.map((v) => {
                    const r = m.perVariation.find((x) => x.variationId === v.variationId);
                    return <td key={v.variationId} className="py-1.5 px-1.5 text-right">{r?.rate !== undefined ? `${(r.rate * 100).toFixed(1)}%` : "—"}</td>;
                  })}
                  <td className={`py-1.5 pl-2 text-right font-semibold ${toneOf(cell)}`}>{ms?.featureOnly ? "—" : pctS(cell?.lift)}</td>
                  <td className="py-1.5 pl-2 text-right text-[10.5px] text-muted-2">{ms?.featureOnly ? "adoption" : sigOf(cell) ? "beyond luck" : "too early"}</td>
                  <td className="py-1.5 pl-2 print:hidden">
                    <span className={CLUSTER}>
                      {watch(rowKey)}
                      {/* a raw Optimizely event can't be the console's decision
                          metric — the slot stays empty so the column holds */}
                      <span /><span /><span />
                      {eye(rowKey, isHidden)}
                    </span>
                  </td>
                </tr>
              );
            };

            return (
              <div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="text-[10.5px] text-muted-2 text-left">
                        <th className="w-5 print:hidden" />
                        <th className="font-medium py-1 pr-2">Metric</th>
                        <th className="font-medium py-1 pr-2 w-24">Type</th>
                        <th className="font-medium py-1 pr-2 w-24">Source</th>
                        {ordered.map((v) => (
                          <th key={v.variationId} className="font-medium py-1 px-1.5 text-right max-w-24">
                            <span className="block truncate" title={v.name}>{v.name}</span>
                            {isCtl(v.variationId) && <span className="font-normal">(control)</span>}
                          </th>
                        ))}
                        <th className="font-medium py-1 pl-2 text-right">Δ vs control</th>
                        <th className="font-medium py-1 pl-2 text-right w-20"></th>
                        <th className="font-medium py-1 pl-2 w-[8rem] print:hidden"></th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {primaryComp && compositeTr(primaryComp, true)}
                      {visibleRows.map((r) => (r.kind === "c" ? compositeTr(r.c, false) : metricTr(r.m, r.mi)))}
                      {showHidden && hiddenRows.map((r) => (r.kind === "c" ? compositeTr(r.c, false, true) : metricTr(r.m, r.mi, true)))}
                    </tbody>
                  </table>
                </div>
                {hiddenRows.length > 0 && (
                  <button onClick={() => setShowHidden((h) => !h)} className="mt-1 text-[11px] text-muted-2 hover:text-foreground print:hidden">
                    {showHidden ? "Collapse" : "Show"} {plural(hiddenRows.length, "hidden metric")}
                  </button>
                )}
              </div>
            );
          })()}
          </div>
          {/* ── Z(H) · HOW THESE NUMBERS WERE COMPUTED — folded, prints ──── */}
          <details id="method">
            <summary className="cursor-pointer select-none border-b border-border pb-1.5">
              <span className={ZH}>How these numbers were computed</span>
            </summary>
            <div className="mt-2.5 space-y-2 text-[14px] text-muted leading-snug">
              {pr && <p><span className="font-semibold text-foreground">The hypothesis:</span> {pr.hypothesis} <span className="text-muted-2">Primary metric: {pr.primaryMetric}.</span></p>}
              {verdict && (
                <ul className="space-y-1">
                  {verdict.gates.map((g) => (
                    <li key={g.id} className="flex gap-2">
                      <span className={`shrink-0 font-semibold ${g.pass === true ? "text-ok" : g.pass === false ? "text-danger" : "text-muted-2"}`}>{g.pass === true ? "PASS" : g.pass === false ? "FAIL" : "n/a"}</span>
                      <span>{g.title} — {g.detail}</span>
                    </li>
                  ))}
                </ul>
              )}
              {statsEff?.flags
                // the SRM flags ARE validity.detail — the line below owns it
                .filter((f) => f.code !== "SRM_FAIL" && f.code !== "SRM_WARN" && f.code !== "SRM_ASSUMED_EQUAL")
                .map((f, i) => <p key={`${f.code}:${i}`} className="text-muted-2">{f.text}</p>)}
              {statsEff && <p className="text-muted-2">Validity: {statsEff.validity.detail} · expected false movers among the exploratory sweep: {statsEff.expectedFalsePositives.toFixed(1)}.</p>}
            </div>
          </details>
        </div>

      </div>

      {/* ── THE ANALYST — a drawer, not a column. It slides in when you want
             it, so the readout owns the full width the rest of the time. ── */}
      <button onClick={() => setAnalystOpen(true)}
        className="fixed bottom-5 right-5 z-30 h-11 px-4 rounded-full bg-accent text-accent-fg text-[13.5px] font-semibold shadow-lg hover:bg-accent-hover print:hidden flex items-center gap-2">
        Ask the analyst
        {entries.length > 0 && <span className="text-[11.5px] font-bold opacity-80">{Math.floor(entries.length / 2) || ""}</span>}
      </button>

      {analystOpen && (
        <div className="fixed inset-0 z-40 print:hidden" role="dialog" aria-label="Analyst">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAnalystOpen(false)} />
          <aside className="absolute inset-y-0 right-0 w-full max-w-[30rem] bg-surface border-l border-border shadow-2xl flex flex-col animate-[slidein_.18s_ease-out]">
            <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-border">
              <span className={ZH}>Analyst</span>
              {(notebook?.org.preferences.length || notebook?.proto.dataWishes.length) ? (
                <button onClick={() => setShowMemory((m) => !m)} className="text-[12.5px] text-muted-2 hover:text-foreground">
                  Memory ({(notebook?.org.preferences.length ?? 0) + (notebook?.proto.dataWishes.length ?? 0)})
                </button>
              ) : null}
              <span className="ml-auto flex items-center gap-3">
                {entries.length > 0 && (clearArmed ? (
                  <span className="flex items-center gap-1.5 text-[12.5px]">
                    <button onClick={() => { setClearArmed(false); void post("clearThread", { clearThread: true }); }} className="text-danger font-semibold">clear it?</button>
                    <button onClick={() => setClearArmed(false)} className="text-muted-2">&#215;</button>
                  </span>
                ) : (
                  <button onClick={() => setClearArmed(true)} className="text-[12.5px] text-muted-2 hover:text-danger">Clear history</button>
                ))}
                <button onClick={() => setAnalystOpen(false)} aria-label="Close" className="text-[18px] leading-none text-muted-2 hover:text-foreground">&#215;</button>
              </span>
            </div>
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="shrink-0 flex items-center gap-2 px-4 pt-3 pb-2 border-b border-border">
              <span className={ZH}>Analyst</span>
              {(notebook?.org.preferences.length || notebook?.proto.dataWishes.length) ? (
                <button onClick={() => setShowMemory((m) => !m)} className="ml-auto text-[12.5px] text-muted-2 hover:text-foreground">
                  Memory ({(notebook?.org.preferences.length ?? 0) + (notebook?.proto.dataWishes.length ?? 0)})
                </button>
              ) : null}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
              {entries.length === 0 && !busy && (
                <div className="space-y-2">
                  <p className="text-[14px] text-muted-2 leading-snug">Ask anything about this experiment, or describe a metric you want tracked.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      verdict?.verdict === "not_adjudicable" ? "What’s blocking the call?" : "Why isn’t this ready to call?",
                      "What’s driving the difference?",
                      "Is this safe to ship?",
                    ].map((q) => (
                      <button key={q} onClick={() => { setComposerMode("ask"); setComposerText(q); }}
                        className="h-7 px-2.5 rounded-full border border-border text-[12.5px] text-muted hover:text-foreground hover:border-border-strong">{q}</button>
                    ))}
                  </div>
                </div>
              )}

              {entries.length > 6 && !threadOpen && (
                <button onClick={() => setThreadOpen(true)} className="text-[12.5px] text-muted-2 hover:text-foreground">Show earlier ({entries.length - 6})</button>
              )}

              {shownEntries.map((e, i) => {
                const idx = threadOpen ? i : entries.length - shownEntries.length + i;
                if (e.kind === "user-question" || e.kind === "answer") {
                  return (
                    <div key={`${e.at}:${idx}`} className="flex justify-end">
                      <p className="max-w-[85%] rounded-lg bg-background px-3 py-1.5 text-[14px] font-medium leading-snug">{e.text}</p>
                    </div>
                  );
                }
                if (e.kind === "analyst-answer") {
                  // The live structured answer replaces the flattened stored
                  // copy for the most recent turn — same content, real bullets.
                  if (idx === lastAnswerIdx && answer && typeof answer !== "string") return <div key={`${e.at}:${idx}`}>{answerBlock(answer)}</div>;
                  return <p key={`${e.at}:${idx}`} className="text-[14px] leading-snug text-foreground/90">{e.text}</p>;
                }
                if (e.kind === "ai-question") {
                  return <p key={`${e.at}:${idx}`} className="text-[14px] leading-snug text-muted"><span className={ZH}>asked you</span><br />{e.text}</p>;
                }
                return <p key={`${e.at}:${idx}`} className="text-[14px] leading-snug text-ok">{e.text}</p>;
              })}

              {busy === "ask" && <p className="text-[14px] text-muted-2">Reading the numbers…</p>}

              {customMsg && <p className="text-[14px] leading-snug text-ok">{customMsg}</p>}

              {/* the analyst's own question — answering it tunes future readings */}
              {reading?.question && (
                <div className="rounded-lg border border-border bg-background/60 px-3 py-2 space-y-1.5">
                  <div className={ZH}>The analyst wants to know</div>
                  <p className="text-[14px] leading-snug">{reading.question}</p>
                  {composerMode === "reply" ? (
                    <label className="flex items-center gap-1.5 text-[12.5px] text-muted-2">
                      <input type="checkbox" checked={replyDurable} onChange={(e) => setReplyDurable(e.target.checked)} />
                      apply to all experiments
                    </label>
                  ) : (
                    <button onClick={() => setComposerMode("reply")} className="text-[12.5px] font-bold uppercase tracking-[0.08em] text-accent hover:text-accent-hover">Answer this →</button>
                  )}
                </div>
              )}

              {showMemory && (
                <div className="border-t border-border/60 pt-2 flex flex-wrap gap-1.5 text-[12.5px] text-muted-2">
                  {notebook?.org.preferences.map((p) => (
                    <span key={p} className="border border-border rounded px-1.5 py-0.5 inline-flex items-center gap-1 max-w-full">
                      <span className="truncate" title={p}>{p}</span>
                      <button onClick={() => post("forget", { forgetPreference: p })} disabled={busy !== null} title="Forget this preference" className="hover:text-danger shrink-0">×</button>
                    </span>
                  ))}
                  {notebook?.proto.dataWishes.map((w) => (
                    <span key={w} className="border border-warn/40 text-warn rounded px-1.5 py-0.5 max-w-full truncate" title={`Wanted, but not measurable with today's data: ${w}`}>wish: {w}</span>
                  ))}
                </div>
              )}
            </div>

            {/* composer — the MODE CHIP routes the action, never the text. A
                question can't silently create a metric. */}
            <div className="shrink-0 border-t border-border p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                {([["ask", "Ask"], ["challenge", "Challenge this"]] as const).map(([m, label]) => (
                  <button key={m} onClick={() => setComposerMode(m)}
                    className={`h-6 px-2 rounded-full border text-[12.5px] font-bold uppercase tracking-[0.08em] ${composerMode === m ? "border-accent text-accent" : "border-border text-muted-2 hover:text-foreground"}`}>
                    {label}
                  </button>
                ))}
                {composerMode === "reply" && (
                  <span className="text-[12.5px] font-bold uppercase tracking-[0.08em] text-accent">Answering the analyst</span>
                )}
              </div>
              <div className="flex items-end gap-2">
                <textarea
                  value={composerText}
                  onChange={(e) => setComposerText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendComposer(); } }}
                  rows={2}
                  placeholder={composerMode === "challenge"
                    ? "Anything specific to press on? (or just send — it will argue against the current call)"
                    : composerMode === "reply" ? "Your answer…" : "Ask about these results…"}
                  className="flex-1 min-w-0 max-h-24 px-2.5 py-1.5 rounded-lg border border-border bg-background text-[14px] leading-snug placeholder:text-muted-2 focus:border-accent focus:outline-none resize-none"
                />
                <button onClick={sendComposer} disabled={busy !== null || !composerText.trim()}
                  className="h-8 px-3 rounded-lg bg-accent text-accent-fg text-[12.5px] font-semibold hover:bg-accent-hover disabled:opacity-40 shrink-0">
                  {busy ? "…" : "Send"}
                </button>
              </div>
              {composerMode === "challenge" && (
                <p className="text-[12.5px] text-muted-2 leading-snug">Runs the analyst against its own conclusion — the strongest honest case that this call is wrong, from the same numbers.</p>
              )}
            </div>
          </div>
          </aside>
        </div>
      )}
      <style>{`@keyframes slidein { from { transform: translateX(16px); opacity: .6 } to { transform: none; opacity: 1 } }`}</style>
    </div>
  );
}
