"use client";

/**
 * BUILD — CERTIFICATION, VERSIONS, DRIFT.
 *
 * Three surfaces that all answer one question: is the code that runs for a real
 * visitor the code we said we were running? The rules that carry the weight:
 *
 *  · CERTIFICATION IS A GATE, NOT A REPORT. Every check here encodes a bug that
 *    already shipped once. A failure blocks the push for everyone — the only way
 *    past it is an override that names a person and is written to the audit log,
 *    where it stays attached to the cut forever.
 *  · THE LOADER LIES. Our loader runs after the page has settled; Optimizely
 *    injects from <head> before <body> exists. Anything that only works because
 *    the DOM was already there passes by hand and is silently dead in the real
 *    experiment. Three of the eight checks exist for that one difference.
 *  · CUTS ARE APPEND-ONLY. A failed cut and a halted push are evidence. Nothing
 *    in the version list is edited or deleted; a rollback adds a push.
 *  · A PUSH IS NOT DONE WHEN OPTIMIZELY SAYS 200. It is done when the bytes read
 *    back match the bytes we sent, byte for byte.
 *  · THE DRIFT AUDIT MAY REWRITE THE DESIGN LAYER. It may never rewrite the
 *    hypothesis or the metrics — where code contradicts either, it stops.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/ui/cn";
import { ME } from "@/lib/console/fake";
import { logActivity } from "./config";
import { Chip, Empty, Meta, Pill, Section, Th } from "./ui";

/* ── Fixtures ──────────────────────────────────────────────────────── */

const EXPERIMENT = {
  site: "outrigger.com",
  path: "/hawaii/oahu/outrigger-reef-waikiki-beach-resort",
  project: "24138040550",
  briefRev: "Brief revision 3 · frozen 26 Aug 2026, 09:14",
  me: ME.name,
  myRole: ME.role,
  today: "10 Sep 2026",
};

const WARN_BYTES = 150 * 1024;
const CAP_BYTES = 400 * 1024;
const CANDIDATE_BYTES = 222_822;

const kb = (b: number) => (b / 1024).toFixed(1);
const n = (b: number) => b.toLocaleString("en-US");
const pctOfCap = (b: number) => Math.round((b / CAP_BYTES) * 100);

type CheckState = "pass" | "warn" | "fail";

interface Check {
  id: string;
  title: string;
  state: CheckState;
  why: string;
  evidence: string;
  meter?: boolean;
}

/** Eight checks. Each one is a bug that reached a visitor at least once. */
const CHECKS: Check[] = [
  {
    id: "idempotency",
    title: "Runs once, even if the loader applies it twice",
    state: "pass",
    why: "Optimizely re-applies a variation on a soft navigation. With no guard the promise renders twice and both copies bind their own click handler.",
    evidence: "line 3   if (window.opmc_reef_rate_promise) return; window.opmc_reef_rate_promise = 1;",
  },
  {
    id: "body_safety",
    title: "Safe before <body> exists",
    state: "pass",
    why: "Optimizely injects from <head>, so this file runs while document.body is still null. It waits for the element rather than touching the body at parse time.",
    evidence: "0 top-level references to document.body · 1 observer on document.documentElement",
  },
  {
    id: "init_retry",
    title: "Dependency-gated init retries instead of bailing",
    state: "fail",
    why: "init() looks for the rate calendar and returns when it is missing — once, and never again. Through the loader the calendar is already on the page, so this passes by hand every time. In the real experiment it runs before the calendar renders: nothing errors, nothing logs, and the variation quietly does nothing for every visitor in it.",
    evidence: "line 41  if (!document.querySelector('.rate-cal__grid')) return;   // no retry, no observer",
  },
  {
    id: "analytics",
    title: "Makes no analytics calls of its own",
    state: "warn",
    why: "A debug dataLayer push survived the cut. Optimizely attributes this experiment; anything the build reports itself lands outside the arms and double-counts in the site's own reporting.",
    evidence: "line 118 window.dataLayer.push({ event: 'opmc_promise_shown' });",
  },
  {
    id: "assets",
    title: "Every asset is same-origin",
    state: "pass",
    why: "A third-party URL makes the experiment depend on a host the site's content security policy can block, and tells that vendor which visitors are in the test.",
    evidence: "4 assets · 3 inlined as data URIs · 1 from outrigger.com · 0 third-party",
  },
  {
    id: "size",
    title: `Size budget — ${kb(WARN_BYTES)} KB warns, ${kb(CAP_BYTES)} KB is a hard cap`,
    state: "warn",
    why: "This cut inlines the badge artwork so the promise paints without a network fetch, which took it past the warn line. Past the hard cap the snippet holds up first paint and the check fails outright rather than warning.",
    evidence: `${n(CANDIDATE_BYTES)} bytes · ${kb(CANDIDATE_BYTES)} KB · ${pctOfCap(CANDIDATE_BYTES)}% of the hard cap`,
    meter: true,
  },
  {
    id: "namespace",
    title: "Everything it leaves behind is stamped opmc_",
    state: "pass",
    why: "Every global, CSS class and event key carries the namespace, so a year from now anyone can find what this experiment left on the page and take it off cleanly.",
    evidence: "14 identifiers · 14 prefixed opmc_ / .opmc- · 0 bare",
  },
  {
    id: "eval",
    title: "No eval, no document.write",
    state: "pass",
    why: "document.write during an async injection blanks the page it lands on, and eval fails outright under this site's content security policy.",
    evidence: "0 eval · 0 new Function · 0 document.write",
  },
];

/** The built file the checks point at. An excerpt: the lines the evidence cites, in context. `null` is an elision. */
const FILE_EXCERPT: ([number, string] | null)[] = [
  [1, "/* opmc_reef_rate_promise · cut d40b9f5 · built 9 Sep 2026 14:22 */"],
  [2, "(function () {"],
  [3, "  if (window.opmc_reef_rate_promise) return; window.opmc_reef_rate_promise = 1;"],
  [4, "  var BADGE = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCI…';"],
  [5, "  var COPY = 'Best price guaranteed — or we match it.';"],
  [6, "  var URGENCY = 'Only 2 rooms left at this rate';"],
  null,
  [40, "  function init() {"],
  [41, "    if (!document.querySelector('.rate-cal__grid')) return;   // no retry, no observer"],
  [42, "    var cal = document.querySelector('.rate-cal__grid');"],
  [43, "    var host = document.createElement('div');"],
  [44, "    host.className = 'opmc-promise' + (window.innerWidth < 480 ? ' opmc-promise--sheet' : '');"],
  null,
  [116, "    cell.addEventListener('click', function () {"],
  [117, "      host.hidden = false;"],
  [118, "      window.dataLayer.push({ event: 'opmc_promise_shown' });"],
  [119, "    }, { once: true });"],
  [120, "  }"],
  null,
  [131, "  new MutationObserver(function (_, mo) { if (document.body) { mo.disconnect(); init(); } })"],
  [132, "    .observe(document.documentElement, { childList: true });"],
  [133, "})();"],
];

const FILE = {
  repo: "outrigger-digital/outrigger-prototypes",
  branch: "opmc/reef-rate-calendar-promise",
  path: "dist/variation.js",
  lines: 133,
  /** Which check each cited line belongs to, so the file reads the way the evidence does. */
  flagged: { 3: "pass", 41: "fail", 118: "warn" } as Record<number, CheckState | undefined>,
};

type PushState = "ok" | "bad" | "halted";
interface PushStep { label: string; detail: string; state: PushState }
interface PushAttempt { at: string; by: string; result: "verified" | "mismatch"; steps: PushStep[]; after?: string }

interface Cut {
  sha: string;
  cut: number;
  at: string;
  by: string;
  briefRev: string;
  briefStale?: boolean;
  bytes: number;
  cert: CheckState;
  certNote: string;
  live?: boolean;
  purpose: string;
  attempts: PushAttempt[];
  blocked?: string;
  /** An override travels with the cut forever: which check it waved through, and why. */
  override?: { check: string; why: string };
}

const CUTS: Cut[] = [
  {
    sha: "d40b9f5", cut: 4, at: "9 Sep 2026, 14:22", by: "Prism Agent",
    briefRev: "rev 3", bytes: CANDIDATE_BYTES, cert: "fail",
    certNote: "1 failure · 2 warnings",
    purpose: "Cut for the 100% ship — inlines the badge artwork so the promise paints without waiting on a fetch.",
    blocked: "Certification has a failure. Nothing can be pushed until it is cleared or overridden.",
    attempts: [],
  },
  {
    sha: "8c1d7e2", cut: 3, at: "16 Aug 2026, 16:30", by: "Prism Agent",
    briefRev: "rev 3", bytes: 2_412, cert: "warn", certNote: "1 warning",
    live: true,
    purpose: "Fixes the mobile sheet clipping at 375px that Dana R. caught in review.",
    attempts: [
      {
        at: "26 Aug 2026, 09:14", by: "Malia K.", result: "verified",
        steps: [
          { label: "Sent the cut to Optimizely", detail: `project ${EXPERIMENT.project} · variation “Promise” · ${n(2412)} bytes sent`, state: "ok" },
          { label: "Optimizely accepted the write", detail: "variation 24138040550:v2 · project revision 47", state: "ok" },
          { label: "Read the stored bytes back", detail: `${n(2412)} bytes returned`, state: "ok" },
          { label: "Compared SHA-256, ours against theirs", detail: "sha256 9f21c4…a08e  =  sha256 9f21c4…a08e", state: "ok" },
          { label: "Marked live", detail: "run 4 opened against this cut at 09:14", state: "ok" },
        ],
      },
    ],
  },
  {
    sha: "6b0f4ae", cut: 2, at: "16 Aug 2026, 09:20", by: "Dana R.",
    briefRev: "rev 2", briefStale: true, bytes: 2_352, cert: "fail",
    certNote: "2 failures",
    purpose: "Hand cut in the browser while chasing the 375px clip. Kept because cuts are append-only — a failed cut is evidence of what was tried.",
    blocked: "Failed early-injection body safety and the retry check. Never pushed.",
    attempts: [],
  },
  {
    sha: "4f2a91c", cut: 1, at: "15 Aug 2026, 14:02", by: "Prism Agent",
    briefRev: "rev 2", briefStale: true, bytes: 2_216, cert: "warn", certNote: "1 warning",
    purpose: "First build. Ran run 3 on production for eleven days before cut 3 replaced it.",
    attempts: [
      {
        at: "15 Aug 2026, 16:41", by: "Malia K.", result: "mismatch",
        after: "Turned off “minify variation JS” on the Optimizely project, then pushed the same cut again — no new cut, because the code never changed.",
        steps: [
          { label: "Sent the cut to Optimizely", detail: `project ${EXPERIMENT.project} · variation “Promise” · ${n(2216)} bytes sent`, state: "ok" },
          { label: "Optimizely accepted the write", detail: "variation 24138040550:v1 · project revision 44", state: "ok" },
          { label: "Read the stored bytes back", detail: `${n(2204)} bytes returned — 12 fewer than we sent`, state: "bad" },
          { label: "Compared SHA-256, ours against theirs", detail: "sha256 c7ab19…4d02  ≠  sha256 41e0bd…9c77", state: "bad" },
          { label: "Halted. Nothing was marked live.", detail: "Optimizely's variation editor re-wrapped the file and dropped the trailing source comment. The bytes a visitor would have run are not the bytes we certified.", state: "halted" },
        ],
      },
      {
        at: "15 Aug 2026, 17:04", by: "Malia K.", result: "verified",
        steps: [
          { label: "Sent the cut to Optimizely", detail: `${n(2216)} bytes sent, unchanged`, state: "ok" },
          { label: "Optimizely accepted the write", detail: "variation 24138040550:v1 · project revision 45", state: "ok" },
          { label: "Read the stored bytes back", detail: `${n(2216)} bytes returned`, state: "ok" },
          { label: "Compared SHA-256, ours against theirs", detail: "sha256 c7ab19…4d02  =  sha256 c7ab19…4d02", state: "ok" },
          { label: "Marked live", detail: "run 3 opened against this cut · superseded 26 Aug 2026", state: "ok" },
        ],
      },
    ],
  },
];

type Layer = "design" | "hypothesis" | "metric";
interface Drift { id: string; field: string; layer: Layer; brief: string; build: string; note: string }

const DESIGN_DRIFT: Drift[] = [
  {
    id: "wording", field: "Promise wording", layer: "design",
    brief: "“We'll match a lower rate you find after booking.”",
    build: "“Best price guaranteed — or we match it.”",
    note: "Design-layer wording. The audit can rewrite the brief to say what the build actually shows.",
  },
  {
    id: "placement", field: "Placement at 375px", layer: "design",
    brief: "Sits directly under the rate calendar on every width.",
    build: "Below the calendar on desktop; a bottom sheet that covers the calendar on phones until it is dismissed.",
    note: "Came out of Dana R.'s review note about the 375px clip. The build is right and the brief was never updated.",
  },
  {
    id: "trigger", field: "When it appears", layer: "design",
    brief: "Shows as soon as the rate calendar opens.",
    build: "Shows on the first date cell a visitor taps.",
    note: "Design-layer trigger. It does not change what is being tested or how the result is read.",
  },
];

const CONTRADICTIONS: Drift[] = [
  {
    id: "metric", field: "The number that decides it", layer: "metric",
    brief: "Completed bookings.",
    build: "Fires 24138040550_book_now_button_clicks.",
    note: "A click on Book Now is an intention, not a booking — and this project has 48 events with nothing that records one. The audit will not quietly redefine a decision metric to match whatever the code happened to fire. Someone has to choose: instrument a booking, or say out loud that the experiment is judged on intent.",
  },
  {
    id: "scope", field: "What is being tested", layer: "hypothesis",
    brief: "A price promise removes hesitation at the rate calendar.",
    build: "Renders the promise and a “Only 2 rooms left at this rate” urgency line beside it.",
    note: "The build tests a second idea nobody wrote down. A win could belong to either. The audit will not widen a hypothesis to cover code that outran it.",
  },
];

/* ── Session memory ────────────────────────────────────────────────── */

/** The cuts list is read by two panels and appended to by one of them, and both
 *  are mounted by the stage, not by each other — so it lives here, the way
 *  Activity does in config.tsx. What someone did this session survives leaving
 *  the stage; nothing here is ever edited or removed, only added to. */
interface Store<T> { get: () => T; set: (next: T) => void; subscribe: (fn: () => void) => () => void }

function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => { value = next; subs.forEach((fn) => fn()); },
    subscribe: (fn) => { subs.add(fn); return () => { subs.delete(fn); }; },
  };
}
function useStore<T>(s: Store<T>): T { return useSyncExternalStore(s.subscribe, s.get, s.get); }

const cutsStore = createStore<Cut[]>(CUTS);
/** The audit line written when the build was taken back to the brief — null until it happens. */
const reopenedStore = createStore<string | null>(null);

/** Seven hex characters that look like git's and stay the same for the same input. */
const shortSha = (seed: string) => {
  let h = 0x811c9dc5;
  for (const ch of seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0").slice(0, 7);
};

/* ── Local primitives ──────────────────────────────────────────────── */

const Lock = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
    <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

/** Immutable fact. If it can still change, it is plain text instead. */
const Receipt = ({ children, tone }: { children: React.ReactNode; tone?: "danger" }) => (
  <span className={cn("inline-flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[11px]",
    tone === "danger" ? "border-danger/40 bg-danger/5 text-danger" : "border-border bg-surface-2/60 text-muted-2")}>
    <Lock />{children}
  </span>
);

const Mono = ({ children }: { children: React.ReactNode }) => (
  <span className="font-mono text-[11px] text-muted-2 bg-surface-2 rounded px-1.5 py-0.5">{children}</span>
);

const FieldLabel = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("text-[10.5px] font-semibold tracking-[0.07em] text-muted-2", className)}>{children}</div>
);

const TONE: Record<CheckState, { pill: "ok" | "warn" | "danger"; text: string; bg: string }> = {
  pass: { pill: "ok", text: "text-ok", bg: "bg-ok/10" },
  warn: { pill: "warn", text: "text-warn", bg: "bg-warn/10" },
  fail: { pill: "danger", text: "text-danger", bg: "bg-danger/10" },
};

const StateGlyph = ({ s }: { s: CheckState }) => (
  <span className={cn("w-[18px] h-[18px] rounded-full grid place-items-center shrink-0 mt-[3px]", TONE[s].bg, TONE[s].text)}>
    {s === "pass" && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
    {s === "warn" && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 7v6M12 17v.01" /></svg>}
    {s === "fail" && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>}
  </span>
);

/** One numbered list for every sequence of moves — a push that already happened,
 *  a push in flight, a cut coming through the gate. `running` and `pending` exist
 *  so an in-flight sequence reads with the same grammar as a finished receipt. */
type StepTone = "ok" | "danger" | "running" | "pending";

const STEP_TONE: Record<StepTone, { circle: string; label: string; detail: string }> = {
  ok: { circle: "bg-ok/10 text-ok", label: "text-foreground", detail: "text-muted-2" },
  danger: { circle: "bg-danger/10 text-danger", label: "font-medium text-danger", detail: "text-danger" },
  running: { circle: "bg-accent/10 text-accent animate-pulse", label: "font-medium text-foreground", detail: "text-muted-2" },
  pending: { circle: "bg-surface-2 text-muted-2", label: "text-muted-2", detail: "text-muted-2" },
};

/** Which tone the i-th of a live sequence carries when step `at` is the one running. */
const liveTone = (i: number, at: number): StepTone => (i < at ? "ok" : i === at ? "running" : "pending");

function StepList({ steps }: { steps: { label: string; detail: string; tone: StepTone }[] }) {
  return (
    <ol className="space-y-2.5">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-start gap-2.5">
          <span className={cn("w-[18px] h-[18px] rounded-full grid place-items-center shrink-0 mt-[1px] text-[10.5px] font-semibold tabular-nums", STEP_TONE[s.tone].circle)}>{i + 1}</span>
          <div className="min-w-0">
            <div className={cn("text-[13.5px]", STEP_TONE[s.tone].label)}>{s.label}</div>
            <div className={cn("text-[12px] font-mono mt-0.5 leading-relaxed", STEP_TONE[s.tone].detail)}>{s.detail}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ── Certification ─────────────────────────────────────────────────── */

/** A cut coming through the gate. Steps 0–2 run in turn; step 4 means it exists.
 *  The gate is only reachable with a failing check ticked past, so every cut that
 *  comes through it carries an override — there is no un-overridden path. */
interface GateRun { n: number; sha: string; step: number; override: NonNullable<Cut["override"]> }
const GATE_DONE = 4;

export function CertificationPanel() {
  const [override, setOverride] = useState(false);
  const [reason, setReason] = useState("");
  const [gate, setGate] = useState<GateRun | null>(null);
  const [fileOpen, setFileOpen] = useState(false);
  const cuts = useStore(cutsStore);

  // Timers this panel started, cleared on unmount — leaving the stage mid-cut
  // leaves nothing ticking behind it.
  const timers = useRef<number[]>([]);
  useEffect(() => { const t = timers.current; return () => t.forEach(window.clearTimeout); }, []);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };

  const passed = CHECKS.filter((c) => c.state === "pass").length;
  const warned = CHECKS.filter((c) => c.state === "warn").length;
  const failed = CHECKS.filter((c) => c.state === "fail").length;
  const worst: CheckState = failed ? "fail" : warned ? "warn" : "pass";
  const blocked = failed > 0 && !override;
  const failing = CHECKS.filter((c) => c.state === "fail");
  const next = Math.max(...cuts.map((c) => c.cut)) + 1;
  // Once a cut has been queued on this override, the override is on the record — it cannot be unticked.
  const locked = gate !== null;
  const done = gate !== null && gate.step >= GATE_DONE;

  /** Queues cut n+1 from this one and re-runs all eight checks. About three seconds, then it is in Versions. */
  const cutFromGate = () => {
    const n = next;
    const sha = shortSha(`cut-${n}`);
    const run: GateRun = { n, sha, step: 0, override: { check: failing.map((c) => c.id).join(", "), why: reason.trim() } };
    setGate(run);
    [700, 1800].forEach((ms, i) => later(() => setGate({ ...run, step: i + 1 }), ms));
    later(() => {
      setGate({ ...run, step: GATE_DONE });
      cutsStore.set([{
        sha, cut: n, at: "just now", by: "Prism Agent", briefRev: "rev 3", bytes: CANDIDATE_BYTES,
        cert: "warn", certNote: "certified · 1 override",
        purpose: `Cut from the certification gate on ${EXPERIMENT.today}. Same source as d40b9f5; all eight checks re-run from scratch.`,
        override: run.override, attempts: [],
      }, ...cutsStore.get()]);
      logActivity(`Overrode the ${run.override.check} check on d40b9f5 (“${run.override.why}”) and cut ${n} (${sha}) came out certified.`);
    }, 3000);
  };

  const gateSteps = gate ? [
    { label: "Queued the cut", detail: `cut ${gate.n} · from d40b9f5 · override on ${gate.override.check}, on ${EXPERIMENT.me}` },
    { label: "Building", detail: "one self-contained file · same source as d40b9f5 · nothing minified" },
    { label: "Certifying — all eight checks from scratch", detail: `${passed} pass · ${warned} warn · ${gate.override.check} fails again · the override carries it` },
    { label: "Done", detail: `cut ${gate.n} · ${gate.sha} · certified · the override travels with the cut` },
  ] : [];

  return (
    <Section
      title="Certification — cut d40b9f5"
      action={<Pill tone={TONE[worst].pill}>{failed ? `${failed} failure${failed > 1 ? "s" : ""} — push blocked` : warned ? `${warned} warning${warned > 1 ? "s" : ""}` : "All eight passed"}</Pill>}
    >
      <div className="px-5 py-4 border-b border-border flex items-center gap-5 flex-wrap">
        {([["passed", passed, "text-ok"], ["warnings", warned, "text-warn"], ["failures", failed, "text-danger"]] as const).map(([label, value, tone]) => (
          <div key={label}>
            <div className={cn("text-[19px] font-semibold tabular-nums tracking-[-0.02em]", value === 0 ? "text-muted-2" : tone)}>{value}</div>
            <FieldLabel className="mt-0.5">{label.toUpperCase()}</FieldLabel>
          </div>
        ))}
        <p className="text-[12.5px] text-muted-2 leading-relaxed max-w-[300px] ml-auto">
          Every check is a bug that reached a visitor once. Three of them exist because our loader runs after the page settles and Optimizely does not.
        </p>
      </div>

      {CHECKS.map((c) => (
        <div key={c.id} className={cn("flex items-start gap-3 px-5 py-3.5 border-b border-border last:border-0", c.state === "fail" && "bg-danger/[0.04]")}>
          <StateGlyph s={c.state} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[14px] font-medium">{c.title}</span>
              {c.state === "fail" && <Pill tone="danger">blocks the push</Pill>}
            </div>
            <p className="text-[13px] text-muted leading-relaxed mt-1">{c.why}</p>
            <div className="mt-2"><Mono>{c.evidence}</Mono></div>
            {c.meter && (
              <div className="mt-2.5 max-w-[420px]">
                <div className="relative h-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <div className="h-full bg-warn" style={{ width: `${pctOfCap(CANDIDATE_BYTES)}%` }} />
                  <span className="absolute inset-y-0 w-px bg-border-strong" style={{ left: `${pctOfCap(WARN_BYTES)}%` }} />
                </div>
                <div className="flex justify-between text-[11px] text-muted-2 tabular-nums mt-1">
                  <span>0</span>
                  <span>{kb(WARN_BYTES)} KB warn</span>
                  <span>{kb(CAP_BYTES)} KB hard cap</span>
                </div>
              </div>
            )}
          </div>
          <span className={cn("text-[11.5px] font-semibold uppercase tracking-[0.06em] shrink-0 pt-1", TONE[c.state].text)}>{c.state}</span>
        </div>
      ))}

      {/* The gate. A failure stops everyone — the only way past it is signed. */}
      <div className={cn("px-5 py-4 border-t border-border", blocked ? "bg-danger/[0.05]" : override ? "bg-warn/[0.06]" : "bg-surface-2/40")}>
        {failed > 0 ? (
          <>
            <div className="flex items-center gap-2.5 mb-1.5">
              <Pill tone={override ? "warn" : "danger"}>{override ? "Override recorded" : "Push blocked"}</Pill>
              <span className="text-[13.5px] font-medium">
                {failing.map((c) => c.title).join(" · ")}
              </span>
            </div>
            <p className="text-[13px] text-muted leading-relaxed max-w-[640px]">
              A failing check blocks this cut for everyone, not just for you. Fixing the code is the way through. The override exists because
              sometimes a check is wrong about a specific page — it is not a way to hurry.
            </p>

            <label className={cn("flex items-start gap-2.5 mt-3.5 select-none", locked ? "cursor-default" : "cursor-pointer")}>
              <input type="checkbox" className="sr-only" checked={override} disabled={locked} onChange={(e) => setOverride(e.target.checked)} />
              <span className={cn("mt-[1px] w-4 h-4 rounded border grid place-items-center shrink-0",
                override ? "bg-danger border-danger text-accent-fg" : "bg-surface border-border-strong")}>
                {override && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
              </span>
              <span className="text-[13.5px] leading-snug">
                Override the block and cut {next} from d40b9f5 anyway.
                <span className="text-muted-2"> This is written to the audit log with my name on it.</span>
              </span>
            </label>

            {override && (
              <div className="mt-3.5 space-y-3">
                <div>
                  <Label htmlFor="override-why" className="mb-1.5 text-[10.5px] font-semibold tracking-[0.07em] text-muted-2">WHY — GOES IN THE LOG AND ON THE READOUT</Label>
                  <input
                    id="override-why"
                    value={reason}
                    disabled={locked}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. the element it waits for is server-rendered on this page, so init cannot race it"
                    className="w-full h-9 px-3 rounded-lg border border-border bg-surface text-[13px] placeholder:text-muted-2 focus:border-accent focus:outline-none disabled:opacity-60"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Receipt tone="danger">
                    opmc.audit · certification.override · cut d40b9f5 · check init_retry · {EXPERIMENT.me} ({EXPERIMENT.myRole}) · {EXPERIMENT.today}
                  </Receipt>
                  <span className="text-[12.5px] text-muted-2">travels with the cut · cannot be cleared</span>
                </div>
              </div>
            )}

            {/* The cut coming through, in the same grammar as a push receipt. */}
            {gate && (
              <div className={cn("mt-4 rounded-lg border p-4", done ? "border-border bg-surface-2/40" : "border-accent/40 bg-accent/[0.04]")}>
                <div className="flex items-center gap-2.5 mb-3 flex-wrap">
                  <Pill tone={done ? "ok" : "accent"}>{done ? `Cut ${gate.n} certified` : `Cutting ${gate.n}…`}</Pill>
                  <span className="text-[12.5px] text-muted-2">{EXPERIMENT.today} · override on {gate.override.check} · {EXPERIMENT.me} ({EXPERIMENT.myRole})</span>
                </div>
                <StepList steps={gateSteps.map((s, i) => ({ ...s, tone: liveTone(i, gate.step) }))} />
                {done && (
                  <p className="text-[13px] text-muted leading-relaxed mt-3 pt-3 border-t border-border">
                    Cut {gate.n} is certified and sits in Versions below, with the override on your name. Nothing reaches a visitor until you push it from there.
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 mt-4 flex-wrap">
              {!gate && (
                <>
                  <Button variant={override ? "danger" : "default"} disabled={blocked || (override && reason.trim().length === 0)} onClick={cutFromGate}>
                    {override ? `Override and cut ${next} — on my name` : `Cut ${next} and re-certify`}
                  </Button>
                  {blocked && <span className="text-[13px] text-danger">Blocked by 1 of 8 checks.</span>}
                  {override && reason.trim().length === 0 && <span className="text-[13px] text-warn">An override with no reason is not a record. Say why.</span>}
                  {override && reason.trim().length > 0 && <span className="text-[12.5px] text-muted-2">Cut {next} will re-run all eight checks from scratch.</span>}
                </>
              )}
              <Button variant="outline" className="ml-auto" onClick={() => setFileOpen(true)}>Open the file</Button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <Pill tone="ok">Clear to push</Pill>
            <span className="text-[13px] text-muted">All eight checks passed on this cut.</span>
          </div>
        )}
      </div>

      <Dialog open={fileOpen} onOpenChange={setFileOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>The file behind cut d40b9f5</DialogTitle>
            <DialogDescription>
              <span className="font-mono text-[12px] text-foreground">{FILE.repo} · {FILE.branch} · {FILE.path}</span>
              <span> — {FILE.lines} lines, {n(CANDIDATE_BYTES)} bytes. The lines the checks cite, in context; the badge artwork on line 4 is most of the weight.</span>
            </DialogDescription>
          </DialogHeader>
          <pre className="rounded-lg border border-border bg-surface-2/60 p-4 font-mono text-[12px] leading-relaxed overflow-x-auto max-h-[60vh] overflow-y-auto">
            {FILE_EXCERPT.map((row, i) => {
              if (!row) return <div key={`gap-${i}`} className="text-muted-2 select-none">      ⋯</div>;
              const [line, text] = row;
              const flag = FILE.flagged[line];
              return (
                <div key={line} className={cn("flex", flag && TONE[flag].bg)}>
                  <span className={cn("w-9 shrink-0 text-right pr-3 select-none tabular-nums", flag ? TONE[flag].text : "text-muted-2")}>{line}</span>
                  <span className="whitespace-pre">{text}</span>
                </div>
              );
            })}
          </pre>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    </Section>
  );
}

/* ── Versions ──────────────────────────────────────────────────────── */

type PushKind = "push" | "rollback";

/** The five moves of a push, in the words the fixture records them. The last one says what the push was for. */
function pushSteps(c: Cut, kind: PushKind, cuts: Cut[]): PushStep[] {
  const prev = cuts.find((x) => x.live);
  const attemptsSoFar = cuts.reduce((a, x) => a + x.attempts.length, 0);
  const version = 1 + cuts.reduce((a, x) => a + x.attempts.filter((t) => t.result === "verified").length, 0);
  const digest = `sha256 ${shortSha(`sha256-${c.sha}`).slice(0, 6)}…${shortSha(c.sha).slice(0, 4)}`;
  return [
    { label: "Sent the cut to Optimizely", detail: `project ${EXPERIMENT.project} · variation “Promise” · ${n(c.bytes)} bytes sent`, state: "ok" },
    { label: "Optimizely accepted the write", detail: `variation ${EXPERIMENT.project}:v${version} · project revision ${45 + attemptsSoFar}`, state: "ok" },
    { label: "Read the stored bytes back", detail: `${n(c.bytes)} bytes returned`, state: "ok" },
    { label: "Compared SHA-256, ours against theirs", detail: `${digest}  =  ${digest}`, state: "ok" },
    {
      label: "Marked live",
      detail: kind === "rollback"
        ? `rolled back${prev ? ` from cut ${prev.cut} (${prev.sha})` : ""} · run 4 kept flowing`
        : `run 4 continues against this cut${prev ? ` · cut ${prev.cut} (${prev.sha}) stays in the list` : ""}`,
      state: "ok",
    },
  ];
}

function PushReceipt({ a }: { a: PushAttempt }) {
  return (
    <div className={cn("rounded-lg border p-4", a.result === "verified" ? "border-border bg-surface-2/40" : "border-danger/40 bg-danger/[0.04]")}>
      <div className="flex items-center gap-2.5 mb-3">
        <Pill tone={a.result === "verified" ? "ok" : "danger"}>{a.result === "verified" ? "Read-back verified" : "Read-back MISMATCH"}</Pill>
        <span className="text-[12.5px] text-muted-2">{a.at} · pushed by {a.by}</span>
      </div>
      <StepList steps={a.steps.map((s) => ({ label: s.label, detail: s.detail, tone: s.state === "ok" ? "ok" : "danger" }))} />
      {a.after && <p className="text-[13px] text-muted leading-relaxed mt-3 pt-3 border-t border-border">{a.after}</p>}
    </div>
  );
}

export function VersionsPanel() {
  const cuts = useStore(cutsStore);
  const [selected, setSelected] = useState("8c1d7e2");
  const [confirm, setConfirm] = useState<{ sha: string; kind: PushKind } | null>(null);
  const [pushing, setPushing] = useState<{ sha: string; kind: PushKind; step: number } | null>(null);
  const cut = cuts.find((c) => c.sha === selected) ?? cuts[0];
  const live = cuts.find((c) => c.live);
  const livePush = live?.attempts.filter((a) => a.result === "verified").pop();
  const verified = cut.attempts.some((a) => a.result === "verified");
  const canRollBack = verified && !cut.live;
  const target = confirm ? cuts.find((c) => c.sha === confirm.sha) : undefined;
  const busy = pushing !== null;
  const inFlight = pushing !== null && pushing.sha === cut.sha;

  // Timers this panel started, cleared on unmount — leaving the stage mid-push
  // leaves nothing ticking behind it.
  const timers = useRef<number[]>([]);
  useEffect(() => { const t = timers.current; return () => t.forEach(window.clearTimeout); }, []);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };

  /** Sends the cut, reads it back, and only then marks it live. About three seconds.
   *  A rollback is the same push with a different last line — it never removes a cut. */
  const push = (c: Cut, kind: PushKind) => {
    setConfirm(null);
    const steps = pushSteps(c, kind, cuts);
    const prev = live;
    setPushing({ sha: c.sha, kind, step: 0 });
    [550, 1100, 1700, 2300].forEach((ms, i) => later(() => setPushing({ sha: c.sha, kind, step: i + 1 }), ms));
    later(() => {
      const attempt: PushAttempt = { at: "just now", by: EXPERIMENT.me, result: "verified", steps };
      cutsStore.set(cutsStore.get().map((x) => x.sha === c.sha ? { ...x, live: true, attempts: [...x.attempts, attempt] } : x.live ? { ...x, live: false } : x));
      setPushing(null);
      logActivity(kind === "rollback"
        ? `Rolled back to cut ${c.cut} (${c.sha}). It is live${prev ? `; cut ${prev.cut} (${prev.sha}) stays in the list` : ""}.`
        : `Pushed cut ${c.cut} (${c.sha}) to Optimizely. It is live${prev ? `; cut ${prev.cut} (${prev.sha}) stays available` : ""}.`);
    }, 2900);
  };

  return (
    <Section
      title="Versions"
      action={<span className="text-[12.5px] text-muted-2 tabular-nums">{cuts.length} cuts · append-only</span>}
    >
      <div className="px-5 py-3.5 border-b border-border flex items-center gap-3 flex-wrap">
        <Pill tone="ok">Live now</Pill>
        {live && livePush && <Receipt>{live.sha} · pushed {livePush.at} · byte-verified</Receipt>}
        <span className="text-[13px] text-muted">
          on {EXPERIMENT.site}<span className="text-muted-2">{EXPERIMENT.path}</span>
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="bg-surface-2/60">
            <tr><Th first>Cut</Th><Th>Brief</Th><Th>Certification</Th><Th>Size</Th><Th>Cut by</Th><Th>Cut at</Th><Th>State</Th></tr>
          </thead>
          <tbody>
            {cuts.map((c) => (
              <tr key={c.sha} onClick={() => setSelected(c.sha)}
                className={cn("cursor-pointer border-b border-border last:border-0 hover:bg-surface-2/60", c.sha === selected && "bg-accent/[0.05]")}>
                <td className="pl-6 pr-4 py-3">
                  <div className="flex items-center gap-2">
                    <Receipt>{c.sha}</Receipt>
                    <span className="text-[12.5px] text-muted-2 tabular-nums">cut {c.cut}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-[13.5px]">
                  {c.briefStale
                    ? <span className="text-warn">{c.briefRev} · superseded</span>
                    : <span className="text-muted">{c.briefRev} · frozen</span>}
                </td>
                <td className="px-4 py-3"><Pill tone={TONE[c.cert].pill}>{c.certNote}</Pill></td>
                <td className="px-4 py-3 text-[13.5px] tabular-nums whitespace-nowrap">
                  {kb(c.bytes)} KB
                  {c.bytes > WARN_BYTES && <span className="text-warn"> · over warn</span>}
                </td>
                <td className="px-4 py-3 text-[13.5px] text-muted whitespace-nowrap">{c.by}</td>
                <td className="px-4 py-3 text-[13px] text-muted-2 whitespace-nowrap tabular-nums">{c.at}</td>
                <td className="px-4 py-3">
                  {c.live ? <Pill tone="ok">LIVE</Pill>
                    : c.blocked ? <Pill tone="danger">Blocked</Pill>
                      : c.attempts.some((a) => a.result === "verified") ? <Pill tone="muted">Superseded</Pill>
                        : <Pill tone="muted">Never pushed</Pill>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* The selected cut, and what happened when it was pushed. */}
      <div className="border-t border-border p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <Receipt>{cut.sha}</Receipt>
          <span className="text-[14px] font-medium">Cut {cut.cut}</span>
          {cut.live && <Pill tone="ok">running for visitors right now</Pill>}
        </div>
        <p className="text-[13.5px] text-muted leading-relaxed mb-4 max-w-[680px]">{cut.purpose}</p>
        {cut.override && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Receipt tone="danger">opmc.audit · certification.override · cut {cut.sha} · check {cut.override.check} · {EXPERIMENT.me} ({EXPERIMENT.myRole}) · {EXPERIMENT.today}</Receipt>
            <span className="text-[13px] text-muted">Override: {cut.override.why}</span>
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
          <div>
            <Meta k="Brief" v={cut.briefStale ? <span className="text-warn">{cut.briefRev} — not what the run is judged against</span> : EXPERIMENT.briefRev} />
            <Meta k="Size" v={<span className="tabular-nums">{n(cut.bytes)} bytes · {kb(cut.bytes)} KB · {pctOfCap(cut.bytes)}% of cap</span>} />
            <Meta k="Cut by" v={`${cut.by} · ${cut.at}`} />
            <Meta k="Pushes" v={<span className="tabular-nums">{cut.attempts.length === 0 ? "never pushed" : `${cut.attempts.length} attempt${cut.attempts.length > 1 ? "s" : ""}`}</span>} />
          </div>

          <div className="space-y-3">
            {pushing && pushing.sha === cut.sha && (
              <div className="rounded-lg border border-accent/40 bg-accent/[0.04] p-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <Pill tone="accent">{pushing.kind === "rollback" ? "Rolling back…" : "Pushing…"}</Pill>
                  <span className="text-[12.5px] text-muted-2">{EXPERIMENT.today} · pushed by {EXPERIMENT.me}</span>
                </div>
                <StepList steps={pushSteps(cut, pushing.kind, cuts).map((s, i) => ({ label: s.label, detail: s.detail, tone: liveTone(i, pushing.step) }))} />
              </div>
            )}
            {cut.attempts.map((a, i) => <PushReceipt key={`${a.at}-${i}`} a={a} />)}
            {cut.attempts.length === 0 && !inFlight && (
              <div className="rounded-lg border border-border bg-surface-2/40 p-4">
                <div className="text-[13.5px] font-medium mb-1">This cut has never reached Optimizely.</div>
                <p className="text-[13px] text-muted leading-relaxed">{cut.blocked ?? "It is certified. Push it when you are ready — nothing reaches a visitor until then."}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 mt-5 pt-4 border-t border-border flex-wrap">
          <Button disabled={Boolean(cut.blocked) || cut.live || busy} onClick={() => setConfirm({ sha: cut.sha, kind: "push" })}>
            {cut.live ? "Already live" : "Push to Optimizely"}
          </Button>
          <Button variant="outline" disabled={!canRollBack || busy} onClick={() => setConfirm({ sha: cut.sha, kind: "rollback" })}>Roll back to this cut</Button>
          {cut.blocked && <span className="text-[13px] text-danger">{cut.blocked}</span>}
          {canRollBack && cut.briefStale && (
            <span className="text-[13px] text-warn">
              Rolling back puts {cut.briefRev} code back on the page while run 4 is judged against brief revision 3. The readout will say so.
            </span>
          )}
          <span className="text-[12.5px] text-muted-2 ml-auto">A rollback adds a push. It never removes a cut.</span>
        </div>
      </div>

      <Dialog open={Boolean(confirm)} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          {confirm && target && (
            <>
              <DialogHeader>
                <DialogTitle>{confirm.kind === "rollback" ? `Roll back to cut ${target.cut}?` : `Push cut ${target.cut} to Optimizely?`}</DialogTitle>
                <DialogDescription>
                  {confirm.kind === "rollback"
                    ? `Traffic keeps flowing. The live cut becomes cut ${target.cut} (${target.sha})${live ? `; cut ${live.cut} (${live.sha}) stops serving and stays in the list` : ""}. Nothing is deleted — a rollback adds a push.`
                    : `Cut ${target.cut} (${target.sha}) goes live for every visitor in the experiment${live ? `, and cut ${live.cut} (${live.sha}) stops serving. It stays in the list, so you can roll back to it` : ""}. It is live only once the bytes read back match, byte for byte.`}
                </DialogDescription>
              </DialogHeader>
              {target.override && (
                <p className="text-[13px] text-warn leading-relaxed">The override on {target.override.check} travels with this cut and shows on the readout.</p>
              )}
              {confirm.kind === "rollback" && target.briefStale && (
                <p className="text-[13px] text-warn leading-relaxed">This puts {target.briefRev} code on the page while run 4 is judged against brief revision 3. The readout will say so.</p>
              )}
              <DialogFooter>
                <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
                <Button onClick={() => push(target, confirm.kind)}>
                  {confirm.kind === "rollback" ? `Roll back — push cut ${target.cut}` : `Push cut ${target.cut}`}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Section>
  );
}

/* ── Drift ─────────────────────────────────────────────────────────── */

type Resolution = "applied" | "dismissed";

function DriftRow({ d, resolution, onApply, onDismiss }: {
  d: Drift; resolution?: Resolution; onApply?: () => void; onDismiss?: () => void;
}) {
  return (
    <div className="px-5 py-3.5 border-b border-border last:border-0">
      <div className="flex items-center gap-2 mb-2.5 flex-wrap">
        <span className="text-[14px] font-medium">{d.field}</span>
        <Pill tone={d.layer === "design" ? "muted" : "danger"}>{d.layer === "design" ? "design layer" : `${d.layer} — locked`}</Pill>
        {resolution === "applied" && <Pill tone="ok">applied</Pill>}
        {resolution === "dismissed" && <Pill tone="muted">dismissed</Pill>}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface-2/40 p-3">
          <FieldLabel className="mb-1.5">THE BRIEF SAYS</FieldLabel>
          <p className="text-[13.5px] leading-relaxed">{d.brief}</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <FieldLabel className="mb-1.5">THE BUILD DOES</FieldLabel>
          <p className="text-[13.5px] leading-relaxed">{d.build}</p>
        </div>
      </div>

      <p className="text-[13px] text-muted leading-relaxed mt-2.5">{d.note}</p>

      {resolution === "applied" && (
        <div className="mt-2.5"><Receipt>opmc.audit · drift.apply · {d.id} · into brief rev 4 (draft) · rev 3 stays frozen</Receipt></div>
      )}

      {!resolution && (onApply || onDismiss) && (
        <div className="flex items-center gap-2.5 mt-3">
          {onApply && <Button size="sm" onClick={onApply}>Apply — rewrite the brief field</Button>}
          {onDismiss && <Button size="sm" variant="outline" onClick={onDismiss}>Dismiss</Button>}
          {onApply && <span className="text-[12.5px] text-muted-2">Writes into revision 4, a draft. It cannot touch the frozen revision 3.</span>}
        </div>
      )}
    </div>
  );
}

export function DriftPanel() {
  const [resolved, setResolved] = useState<Record<string, Resolution>>({});
  const [tab, setTab] = useState<"open" | "resolved">("open");
  const [sendingBack, setSendingBack] = useState(false);
  const reopened = useStore(reopenedStore);

  const resolve = (id: string, r: Resolution) => setResolved((s) => ({ ...s, [id]: r }));
  const open = DESIGN_DRIFT.filter((d) => !resolved[d.id]);
  const done = DESIGN_DRIFT.filter((d) => resolved[d.id]);
  const applied = done.filter((d) => resolved[d.id] === "applied").length;
  const shown = tab === "open" ? open : done;

  /** Writes the contradictions down as drift and reopens the brief as revision 4. Revision 3 is not touched. */
  const sendBack = () => {
    reopenedStore.set(`opmc.audit · drift.contradiction · ${CONTRADICTIONS.map((d) => d.id).join(", ")} · brief reopened as rev 4 · rev 3 stays frozen · ${EXPERIMENT.me} · ${EXPERIMENT.today}`);
    setSendingBack(false);
    logActivity(`Took the build back to the brief: recorded ${CONTRADICTIONS.length} contradictions as drift and reopened the brief as revision 4.`);
  };

  return (
    <div className="space-y-4">
      <Section title="Brief ↔ build audit" action={<Receipt>{EXPERIMENT.briefRev}</Receipt>}>
        <div className="px-5 py-4 border-b border-border">
          <p className="text-[14px] leading-relaxed max-w-[720px]">
            Read the brief, read cut d40b9f5, and list every place they say different things. The audit may rewrite a
            <span className="font-medium"> design-layer field</span> so the brief matches what was actually built. It may
            <span className="font-medium"> never</span> rewrite the hypothesis or a metric — where the code contradicts either, it stops and flags it for a person.
          </p>
          <div className="flex items-center gap-4 mt-3.5">
            <span className="text-[13px] text-muted-2 tabular-nums">
              {DESIGN_DRIFT.length} design-layer differences · {CONTRADICTIONS.length} contradictions · {applied} queued into revision 4
            </span>
          </div>
        </div>

        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          <Chip on={tab === "open"} onClick={() => setTab("open")}>Open · {open.length}</Chip>
          <Chip on={tab === "resolved"} onClick={() => setTab("resolved")}>Resolved · {done.length}</Chip>
        </div>

        {shown.length === 0 ? (
          <Empty
            title={tab === "open" ? "No design-layer drift left" : "Nothing resolved yet"}
            body={tab === "open"
              ? `All ${DESIGN_DRIFT.length} differences have been applied or dismissed. ${applied} of them are queued into brief revision 4 as a draft — revision 3 is still frozen, and run 4 is still judged against it.`
              : "Apply or dismiss a difference and it moves here, with the audit line it wrote."}
          />
        ) : shown.map((d) => (
          <DriftRow key={d.id} d={d} resolution={resolved[d.id]}
            onApply={() => resolve(d.id, "applied")} onDismiss={() => resolve(d.id, "dismissed")} />
        ))}
      </Section>

      <Section
        title="Contradictions — not the audit's to resolve"
        action={reopened ? <Pill tone="muted">Back with the brief</Pill> : <Pill tone="danger">{CONTRADICTIONS.length} need a person</Pill>}
      >
        {CONTRADICTIONS.map((d) => <DriftRow key={d.id} d={d} />)}
        <div className="px-5 py-4 border-t border-border bg-danger/[0.04] flex items-center gap-3 flex-wrap">
          <span className="text-[13px] text-muted leading-relaxed flex-1 min-w-[280px]">
            There is no Apply on these. Rewriting a hypothesis or a metric to match the code is how an experiment ends up proving
            whatever it happened to do — so the audit stops here on purpose.
          </span>
          {reopened
            ? <Receipt>{reopened}</Receipt>
            : <Button variant="outline" onClick={() => setSendingBack(true)}>Take it back to the brief</Button>}
        </div>
      </Section>

      <Dialog open={sendingBack} onOpenChange={setSendingBack}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Take it back to the brief?</DialogTitle>
            <DialogDescription>
              Records that the page moved under the brief — drift on {CONTRADICTIONS.length} fields the audit is not allowed to rewrite — and reopens the brief as revision 4.
              The frozen revision 3 stays exactly as it was, and run 4 is still judged against it.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-1.5">
            {CONTRADICTIONS.map((d) => (
              <li key={d.id} className="flex items-center gap-2 text-[13px]">
                <Pill tone="danger">{d.layer}</Pill>
                <span>{d.field}</span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSendingBack(false)}>Cancel</Button>
            <Button onClick={sendBack}>Reopen the brief as revision 4</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
