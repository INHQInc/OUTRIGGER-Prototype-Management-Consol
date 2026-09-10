"use client";

/**
 * BUILD — CERTIFICATION, VERSIONS, DRIFT.
 *
 * Three surfaces that all answer one question: is the code that runs for a real
 * guest the code we said we were running? The rules that carry the weight:
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

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";
import { Chip, Empty, Meta, Pill, Section, Th } from "./ui";

/* ── Fixtures ──────────────────────────────────────────────────────── */

const EXPERIMENT = {
  site: "outrigger.com",
  path: "/hawaii/oahu/outrigger-reef-waikiki-beach-resort",
  project: "24138040550",
  briefRev: "Brief revision 3 · frozen 26 Aug 2026, 09:14",
  me: "Bryan Hopkins",
  myRole: "Approver",
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

/** Eight checks. Each one is a bug that reached a guest at least once. */
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
    why: "init() looks for the rate calendar and returns when it is missing — once, and never again. Through the loader the calendar is already on the page, so this passes by hand every time. In the real experiment it runs before the calendar renders: nothing errors, nothing logs, and the variation quietly does nothing for every guest in it.",
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
    why: "A third-party URL makes the experiment depend on a host the site's content security policy can block, and tells that vendor which guests are in the test.",
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
          { label: "Halted. Nothing was marked live.", detail: "Optimizely's variation editor re-wrapped the file and dropped the trailing source comment. The bytes a guest would have run are not the bytes we certified.", state: "halted" },
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
    build: "Shows on the first date cell a guest taps.",
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

/* ── Certification ─────────────────────────────────────────────────── */

export function CertificationPanel() {
  const [override, setOverride] = useState(false);
  const [reason, setReason] = useState("");

  const passed = CHECKS.filter((c) => c.state === "pass").length;
  const warned = CHECKS.filter((c) => c.state === "warn").length;
  const failed = CHECKS.filter((c) => c.state === "fail").length;
  const worst: CheckState = failed ? "fail" : warned ? "warn" : "pass";
  const blocked = failed > 0 && !override;
  const failing = CHECKS.filter((c) => c.state === "fail");

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
          Every check is a bug that reached a guest once. Three of them exist because our loader runs after the page settles and Optimizely does not.
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

            <label className="flex items-start gap-2.5 mt-3.5 cursor-pointer select-none">
              <input type="checkbox" className="sr-only" checked={override} onChange={(e) => setOverride(e.target.checked)} />
              <span className={cn("mt-[1px] w-4 h-4 rounded border grid place-items-center shrink-0",
                override ? "bg-danger border-danger text-surface" : "bg-surface border-border-strong")}>
                {override && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
              </span>
              <span className="text-[13.5px] leading-snug">
                Override the block and push d40b9f5 anyway.
                <span className="text-muted-2"> This is written to the audit log with my name on it.</span>
              </span>
            </label>

            {override && (
              <div className="mt-3.5 space-y-3">
                <div>
                  <FieldLabel className="mb-1.5">WHY — GOES IN THE LOG AND ON THE READOUT</FieldLabel>
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. the rate calendar is server-rendered on this page, so init cannot race it"
                    className="w-full h-9 px-3 rounded-lg border border-border bg-surface text-[13px] placeholder:text-muted-2 focus:border-accent focus:outline-none"
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

            <div className="flex items-center gap-3 mt-4">
              <Button variant={override ? "danger" : "default"} disabled={blocked || (override && reason.trim().length === 0)}>
                {override ? "Push anyway — on my name" : "Push to Optimizely"}
              </Button>
              {blocked && <span className="text-[13px] text-danger">Blocked by 1 of 8 checks.</span>}
              {override && reason.trim().length === 0 && <span className="text-[13px] text-warn">An override with no reason is not a record. Say why.</span>}
              {override && reason.trim().length > 0 && <span className="text-[12.5px] text-muted-2">Cut 5 will re-run all eight checks from scratch.</span>}
              <Button variant="outline" className="ml-auto">Open the file</Button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <Pill tone="ok">Clear to push</Pill>
            <span className="text-[13px] text-muted">All eight checks passed on this cut.</span>
          </div>
        )}
      </div>
    </Section>
  );
}

/* ── Versions ──────────────────────────────────────────────────────── */

const PUSH_GLYPH: Record<PushState, string> = { ok: "text-ok", bad: "text-danger", halted: "text-danger" };

function PushReceipt({ a }: { a: PushAttempt }) {
  return (
    <div className={cn("rounded-lg border p-4", a.result === "verified" ? "border-border bg-surface-2/40" : "border-danger/40 bg-danger/[0.04]")}>
      <div className="flex items-center gap-2.5 mb-3">
        <Pill tone={a.result === "verified" ? "ok" : "danger"}>{a.result === "verified" ? "Read-back verified" : "Read-back MISMATCH"}</Pill>
        <span className="text-[12.5px] text-muted-2">{a.at} · pushed by {a.by}</span>
      </div>
      <ol className="space-y-2.5">
        {a.steps.map((s, i) => (
          <li key={s.label} className="flex items-start gap-2.5">
            <span className={cn("w-[18px] h-[18px] rounded-full grid place-items-center shrink-0 mt-[1px] text-[10.5px] font-semibold tabular-nums",
              s.state === "ok" ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger")}>{i + 1}</span>
            <div className="min-w-0">
              <div className={cn("text-[13.5px]", s.state === "ok" ? "text-foreground" : cn("font-medium", PUSH_GLYPH[s.state]))}>{s.label}</div>
              <div className={cn("text-[12px] font-mono mt-0.5 leading-relaxed", s.state === "ok" ? "text-muted-2" : "text-danger")}>{s.detail}</div>
            </div>
          </li>
        ))}
      </ol>
      {a.after && <p className="text-[13px] text-muted leading-relaxed mt-3 pt-3 border-t border-border">{a.after}</p>}
    </div>
  );
}

export function VersionsPanel() {
  const [selected, setSelected] = useState("8c1d7e2");
  const cut = CUTS.find((c) => c.sha === selected) ?? CUTS[0];
  const live = CUTS.find((c) => c.live);
  const livePush = live?.attempts.find((a) => a.result === "verified");
  const verified = cut.attempts.some((a) => a.result === "verified");
  const canRollBack = verified && !cut.live;

  return (
    <Section
      title="Versions"
      action={<span className="text-[12.5px] text-muted-2 tabular-nums">{CUTS.length} cuts · append-only</span>}
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
            {CUTS.map((c) => (
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
          {cut.live && <Pill tone="ok">running for guests right now</Pill>}
        </div>
        <p className="text-[13.5px] text-muted leading-relaxed mb-4 max-w-[680px]">{cut.purpose}</p>

        <div className="grid gap-5 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
          <div>
            <Meta k="Brief" v={cut.briefStale ? <span className="text-warn">{cut.briefRev} — not what the run is judged against</span> : EXPERIMENT.briefRev} />
            <Meta k="Size" v={<span className="tabular-nums">{n(cut.bytes)} bytes · {kb(cut.bytes)} KB · {pctOfCap(cut.bytes)}% of cap</span>} />
            <Meta k="Cut by" v={`${cut.by} · ${cut.at}`} />
            <Meta k="Pushes" v={<span className="tabular-nums">{cut.attempts.length === 0 ? "never pushed" : `${cut.attempts.length} attempt${cut.attempts.length > 1 ? "s" : ""}`}</span>} />
          </div>

          <div className="space-y-3">
            {cut.attempts.length > 0
              ? cut.attempts.map((a) => <PushReceipt key={a.at} a={a} />)
              : (
                <div className="rounded-lg border border-border bg-surface-2/40 p-4">
                  <div className="text-[13.5px] font-medium mb-1">This cut has never reached Optimizely.</div>
                  <p className="text-[13px] text-muted leading-relaxed">{cut.blocked}</p>
                </div>
              )}
          </div>
        </div>

        <div className="flex items-center gap-3 mt-5 pt-4 border-t border-border flex-wrap">
          <Button disabled={Boolean(cut.blocked) || cut.live}>
            {cut.live ? "Already live" : "Push to Optimizely"}
          </Button>
          <Button variant="outline" disabled={!canRollBack}>Roll back to this cut</Button>
          {cut.blocked && <span className="text-[13px] text-danger">{cut.blocked}</span>}
          {canRollBack && cut.briefStale && (
            <span className="text-[13px] text-warn">
              Rolling back puts {cut.briefRev} code back on the page while run 4 is judged against brief revision 3. The readout will say so.
            </span>
          )}
          <span className="text-[12.5px] text-muted-2 ml-auto">A rollback adds a push. It never removes a cut.</span>
        </div>
      </div>
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

  const resolve = (id: string, r: Resolution) => setResolved((s) => ({ ...s, [id]: r }));
  const open = DESIGN_DRIFT.filter((d) => !resolved[d.id]);
  const done = DESIGN_DRIFT.filter((d) => resolved[d.id]);
  const applied = done.filter((d) => resolved[d.id] === "applied").length;
  const shown = tab === "open" ? open : done;

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
        action={<Pill tone="danger">{CONTRADICTIONS.length} need a person</Pill>}
      >
        {CONTRADICTIONS.map((d) => <DriftRow key={d.id} d={d} />)}
        <div className="px-5 py-4 border-t border-border bg-danger/[0.04] flex items-center gap-3 flex-wrap">
          <span className="text-[13px] text-muted leading-relaxed flex-1 min-w-[280px]">
            There is no Apply on these. Rewriting a hypothesis or a metric to match the code is how an experiment ends up proving
            whatever it happened to do — so the audit stops here on purpose.
          </span>
          <Button variant="outline">Take it back to the brief</Button>
        </div>
      </Section>
    </div>
  );
}
