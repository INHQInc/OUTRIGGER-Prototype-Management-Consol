"use client";

/**
 * THE READOUT — the shareable artifact.
 *
 * ONE interpretation model, three skins: this page, the email that goes to the
 * distribution list, and the signed public link a recipient without an account
 * opens. The skins differ in WIDTH and CHROME and in nothing else — the moment
 * a skin is allowed to re-derive a number, the page and the inbox start
 * disagreeing about the same run, which is the defect the model exists to
 * prevent.
 *
 * Four things are load-bearing here, and each one is a rule rather than a
 * layout preference:
 *
 *  · THE HEADLINE IS A CLAIM THE VERDICT PERMITS. It is not re-derived from
 *    whichever metric looks most quotable. "Nothing separated the two
 *    versions" once shipped above a table showing two metrics that moved; that
 *    sentence was not bland, it was false. The claims this headline makes are
 *    printed underneath it so a reader can check the permission for themselves.
 *  · PRE-REGISTRATION IS COMPUTED, NEVER CLAIMED. The gap between the freeze
 *    and the first moment a number existed is arithmetic over two timestamps
 *    that are on the page. "Pre-registered" as a badge is worth nothing; the
 *    subtraction is the whole argument.
 *  · FROZEN FACTS LOOK FROZEN. A sealed brief, a build SHA and a session count
 *    render as a bordered mono receipt with a lock. Anything a person can
 *    still change is plain text. A reader must be able to tell which is which
 *    without reading a word.
 *  · AN UNWATCHED GUARDRAIL IS DISCLOSED, NOT OMITTED. Two of the four the
 *    brief named were never measurable on this site. A readout that quietly
 *    dropped them would read as four green rows.
 *
 * No Date.now(): every date is a constant, so the document renders identically
 * on the server, in the browser and on paper.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";
import { Pill, Section, Meta, Th, PageHeader, Toolbar, Chip, Empty } from "./ui";

/* ── Fixture: one closed run, and the project it ran in ─────────────── */

const utc = (s: string) => new Date(`${s}Z`);
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (d: Date) => `${d.getUTCDate()} ${MONTH[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
const clock = (d: Date) => `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
const stamp = (d: Date) => `${day(d)}, ${clock(d)}`;
const spanDays = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 86_400_000;

const FROZE = utc("2026-08-26T09:14:00");    // Brief 3 sealed; Run 4 opened in the same action
const UNSEALED = utc("2026-09-06T09:14:00"); // pre-set sample floor reached — results readable for the first time
const CLOSED = utc("2026-09-08T06:00:00");
const ISSUED = utc("2026-09-08T14:12:00");
const NOW = utc("2026-09-10T09:00:00");      // passed in, never read from the clock
const LINK_DAYS = 90;
const EXPIRES = new Date(ISSUED.getTime() + LINK_DAYS * 86_400_000);
const LINK = "https://prism.outrigger.com/r/ey9Kx4tR2mQ";

const RUN = {
  experiment: "Rate-calendar best-price promise",
  site: "outrigger.com",
  path: "/hawaii/oahu/outrigger-reef-waikiki-beach-resort",
  env: "Production",
  run: "Run 4",
  build: "8c1d7e2",
  buildSize: "2.4 KB",
  brief: "Brief 3",
  briefDigest: "a41f0c9",
  project: "24138040550",
  org: "OUTRIGGER Hotels and Resorts",
  author: "Malia K.",
  reviewer: "Dana R.",
  approver: "Bryan Hopkins",
  recipients: 4,
  sampleFloor: 16_000,
};

/** Verbatim from Brief 3. Never re-worded here — a readout that paraphrases the
 *  hypothesis is judging the run against a sentence nobody froze. */
const HYPOTHESIS =
  "If we promise guests we will match a lower rate found after booking, hesitation at the rate calendar drops and completed bookings rise. Success is completed bookings, not booking starts.";

const ARMS = { control: 9218, variation: 9194 };
const SESSIONS = ARMS.control + ARMS.variation;

const PROJECT_EVENTS = 48;
const PROJECT_BOOKING_EVENTS = 0;
const PROJECT_DUPLICATE_NAMES = 7;

/** Only the events this readout touches. `name` collisions are the project's,
 *  not ours — the plan binds KEYS, so a duplicate display name cannot silently
 *  swap one event for another between the plan and this document. */
const EVENTS = [
  { key: "24138040550_book_now_button_clicks", name: "Offer Detail Book Now Button Clicks", used: true },
  { key: "24138040550_offer_detail_book_now_button_clicks", name: "Offer Detail Book Now Button Clicks", used: false },
  { key: "24138040550_animated_cta_book_now_clicks", name: "Animated Book Now CTA Clicks", used: true },
  { key: "24138040550_hero_cta_click", name: "Hero CTA Click", used: true },
  { key: "24138040550_hero_cta_click_1", name: "Hero CTA Click", used: false },
  { key: "24138040550_all_offers_page", name: "All Offers Page", used: true },
  { key: "24138040550_opmc__trip_planner_cta_target", name: "Trip Planner CTA", used: true },
  { key: "24138040550_home", name: "All Outrigger", used: true },
];

type Role = "Decides it" | "Supporting" | "Guardrail" | "Adoption" | "Exploratory";

interface Finding {
  key: string;
  label: string;
  role: Role;
  events: string[];
  /** Conversion rate in that arm, as a percentage of the arm's sessions. */
  control: number | null;
  variation: number;
  /** 95% interval on the RELATIVE lift, in percent. */
  ci: readonly [number, number] | null;
  p: number | null;
  note?: string;
}

/** Index order is narration order — the same order the measurement plan set. */
const FINDINGS: Finding[] = [
  {
    key: "reach-booking", label: "Reached the booking step", role: "Decides it",
    events: ["24138040550_book_now_button_clicks", "24138040550_animated_cta_book_now_clicks"],
    control: 6.28, variation: 6.43, ci: [0.3, 4.5], p: 0.031,
  },
  {
    key: "hero", label: "Hero engagement", role: "Supporting",
    events: ["24138040550_hero_cta_click"],
    control: 18.32, variation: 18.67, ci: [0.4, 3.4], p: 0.018,
  },
  {
    key: "offers", label: "Reached the offers page", role: "Guardrail",
    events: ["24138040550_all_offers_page"],
    control: 24.15, variation: 24.05, ci: [-2.1, 1.3], p: 0.62,
  },
  {
    key: "planner", label: "Trip planner opened", role: "Adoption",
    events: ["24138040550_opmc__trip_planner_cta_target"],
    control: null, variation: 5.51, ci: null, p: null,
    note: "Only the new version can fire this. The old version has no way to convert on it, so there is nothing to compare it against — it is adoption, not evidence.",
  },
  {
    key: "home", label: "Visit Page: All Outrigger", role: "Exploratory",
    events: ["24138040550_home"],
    control: 41.20, variation: 41.24, ci: [-1.6, 1.8], p: 0.91,
    note: "Attached in Optimizely, not authored here. Nobody declared which way it should move, so it is reported and not judged.",
  },
];

type GuardState = "holding" | "at-risk" | "unwatched";

const GUARDRAILS: { name: string; tolerance: string; observed: string; interval: string | null; state: GuardState; watcher: string | null; detail: string }[] = [
  {
    name: "Reached the offers page", tolerance: "no worse than −2.0%", observed: "−0.4%", interval: "−2.1 to +1.3",
    state: "at-risk", watcher: "24138040550_all_offers_page",
    detail: "The point estimate sits inside the tolerance; the interval still reaches past it. It clears nothing and it blocks nothing.",
  },
  {
    name: "Page errors", tolerance: "no increase over baseline", observed: "0", interval: null,
    state: "holding", watcher: "Prism loader",
    detail: "Counted by the loader on every impression rather than by an Optimizely event — 0 in 18,412 sessions.",
  },
  {
    name: "Revenue per visit", tolerance: "no worse than −1.0%", observed: "—", interval: null,
    state: "unwatched", watcher: null,
    detail: "Named in Brief 3 and never watched. Nothing in this project reports revenue, so no value was ever available to breach it.",
  },
  {
    name: "Cancellation rate", tolerance: "no worse than +5.0%", observed: "—", interval: null,
    state: "unwatched", watcher: null,
    detail: "Named in Brief 3 and never watched. Nothing records a completed booking, so nothing can record a cancellation of one.",
  },
];

/* ── Derivations. Every one of these is rendered somewhere below. ───── */

const liftOf = (f: Finding) => (f.control === null ? null : (f.variation / f.control - 1) * 100);
const isSettled = (f: Finding) => f.ci !== null && f.ci[0] * f.ci[1] > 0;

const DECISION = FINDINGS[0];
const DECISION_LIFT = liftOf(DECISION) ?? 0;
const DECISION_CI = DECISION.ci ?? ([0, 0] as const);

const preRegDays = Math.round(spanDays(FROZE, UNSEALED));
const runDays = Math.round(spanDays(FROZE, CLOSED));
const linkDaysLeft = Math.floor(spanDays(NOW, EXPIRES));

const controlShare = (ARMS.control / SESSIONS) * 100;
const variationShare = (ARMS.variation / SESSIONS) * 100;

/** The decision metric's lift, restated as guests. A relative percentage on a
 *  6% base is a number people over-read; the counterfactual count is the same
 *  fact at a size a human can hold. */
const reachedActual = Math.round(ARMS.variation * (DECISION.variation / 100));
const reachedCounterfactual = Math.round(ARMS.variation * ((DECISION.control ?? 0) / 100));
const extraGuests = reachedActual - reachedCounterfactual;

const settledCount = FINDINGS.filter(isSettled).length;
const unwatchedCount = GUARDRAILS.filter((g) => g.state === "unwatched").length;
const usedEvents = EVENTS.filter((e) => e.used).length;

const nameCounts = EVENTS.reduce<Record<string, number>>((acc, e) => {
  acc[e.name] = (acc[e.name] ?? 0) + 1;
  return acc;
}, {});
const collidingHere = Array.from(new Set(EVENTS.filter((e) => e.used && nameCounts[e.name] > 1).map((e) => e.name)));

/* ── Formatting ────────────────────────────────────────────────────── */

const signed = (v: number, digits = 1) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}%`;
const rate = (v: number) => `${v.toFixed(2)}%`;
const count = (n: number) => n.toLocaleString("en-US");
const interval = (ci: readonly [number, number]) => `${signed(ci[0])} to ${signed(ci[1])}`;

/* ── Document primitives ───────────────────────────────────────────── */

const Lock = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
    <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

/** Immutable facts wear a receipt. Mutable ones are plain text — the reader has
 *  to be able to tell them apart at a glance, so this styling is not decoration. */
const Frozen = ({ children, block }: { children: React.ReactNode; block?: boolean }) => (
  <div className={cn(
    "items-start gap-2 rounded border border-border bg-surface-2/60 px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-muted-2",
    block ? "flex" : "inline-flex",
  )}>
    <span className="pt-[3px] shrink-0"><Lock /></span>
    <span className="min-w-0">{children}</span>
  </div>
);

const Label = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted-2", className)}>{children}</div>
);

const Key = ({ children }: { children: React.ReactNode }) => (
  <span className="font-mono text-[11px] text-muted-2 bg-surface-2 rounded px-1.5 py-0.5">{children}</span>
);

/* ── Live figures ──────────────────────────────────────────────────── */

/** Every interval is drawn on ONE domain so movements are visually comparable.
 *  A per-figure domain makes a hairline interval and a wide one look alike. */
const CI_LO = -6;
const CI_HI = 6;
const at = (v: number) => ((v - CI_LO) / (CI_HI - CI_LO)) * 100;

function CiFigure({ ci, point, settled, dense }: { ci: readonly [number, number]; point: number; settled: boolean; dense: boolean }) {
  return (
    <div>
      <div className={cn("relative rounded-md bg-surface-2", dense ? "h-7" : "h-9")} data-viz-track>
        {/* Every drawn mark carries data-viz-fill: print strips backgrounds, and an
            unlabelled fill would leave the interval as an empty grey slot on paper. */}
        <div className="absolute inset-y-0 w-px bg-border-strong" data-viz-fill="" style={{ left: `${at(0)}%` }} />
        <div
          className={cn("absolute top-1/2 -translate-y-1/2 h-2 rounded-full", settled ? "bg-ok" : "bg-border-strong")}
          data-viz-fill={settled ? "ok" : ""}
          style={{ left: `${at(ci[0])}%`, width: `${at(ci[1]) - at(ci[0])}%` }}
        />
        <div
          className={cn("absolute top-1/2 -translate-y-1/2 w-[3px] rounded-sm", dense ? "h-4" : "h-5", settled ? "bg-ok" : "bg-foreground")}
          data-viz-fill={settled ? "ok" : ""}
          style={{ left: `${at(point)}%` }}
        />
      </div>
      <div className="flex justify-between mt-1 text-[10.5px] tabular-nums text-muted-2">
        <span>−6%</span><span>no change</span><span>+6%</span>
      </div>
      <div className="mt-2 text-[12.5px] tabular-nums">
        <span className={cn("font-semibold", settled ? "text-ok" : "text-foreground")}>{signed(point)}</span>
        <span className="text-muted-2"> · 95% {interval(ci)}</span>
      </div>
    </div>
  );
}

function ArmsFigure({ control, variation, dense }: { control: number; variation: number; dense: boolean }) {
  const ceiling = Math.max(control, variation) * 1.18;
  const rows: [string, number, boolean][] = [["Old version", control, false], ["New version", variation, true]];
  return (
    <div className="space-y-2">
      {rows.map(([label, value, isNew]) => (
        <div key={label} className="flex items-center gap-3">
          <span className="text-[11.5px] text-muted-2 w-[76px] shrink-0">{label}</span>
          <div className={cn("relative flex-1 rounded bg-surface-2 overflow-hidden", dense ? "h-4" : "h-5")} data-viz-track>
            <div
              className={cn("h-full rounded", isNew ? "bg-ok" : "bg-border-strong")}
              data-viz-fill={isNew ? "ok" : ""}
              style={{ width: `${(value / ceiling) * 100}%` }}
            />
          </div>
          <span className="text-[12.5px] tabular-nums w-[52px] text-right">{rate(value)}</span>
        </div>
      ))}
    </div>
  );
}

/** Coverage, drawn as the project rather than described as a shortfall: one cell
 *  per event, filled where this readout uses it. Nothing here is a booking. */
function CoverageFigure() {
  return (
    <div>
      <div className="flex flex-wrap gap-[3px]">
        {Array.from({ length: PROJECT_EVENTS }, (_, i) => (
          <span
            key={i}
            className={cn("w-[9px] h-[9px] rounded-[2px]", i < usedEvents ? "bg-accent" : "bg-surface-2")}
            {...(i < usedEvents ? { "data-viz-fill": "" } : { "data-viz-track": "" })}
          />
        ))}
      </div>
      <div className="mt-2.5 text-[12.5px] text-muted-2 tabular-nums">
        <span className="text-foreground font-semibold">{usedEvents}</span> of {PROJECT_EVENTS} events in project {RUN.project} carry this readout ·{" "}
        <span className="text-warn font-semibold">{PROJECT_BOOKING_EVENTS}</span> of {PROJECT_EVENTS} record a booking
      </div>
    </div>
  );
}

/* ── Movements ─────────────────────────────────────────────────────── */

function Movement({ n, of, title, tag, figure, dense, children }: {
  n: number; of: number; title: string; tag: React.ReactNode; figure: React.ReactNode; dense: boolean; children: React.ReactNode;
}) {
  return (
    <div className={cn("flex gap-4 px-5 border-b border-border last:border-0", dense ? "py-4" : "py-5")}>
      <div className="w-[30px] shrink-0 pt-[3px] tabular-nums">
        <div className="text-[15px] font-semibold leading-none">{n}</div>
        <div className="text-[10.5px] text-muted-2 mt-1">of {of}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-3">
          <h3 className="text-[15px] font-semibold leading-snug flex-1">{title}</h3>
          <div className="shrink-0">{tag}</div>
        </div>
        <div className="text-[13.5px] text-muted leading-relaxed mt-2 space-y-2">{children}</div>
        <div className={cn("mt-3.5", dense ? "max-w-full" : "max-w-[440px]")}>{figure}</div>
      </div>
    </div>
  );
}

/* ── The document ──────────────────────────────────────────────────── */

type Skin = "page" | "email" | "link";

const SKIN_WIDTH: Record<Skin, string> = {
  page: "max-w-[900px]",
  email: "max-w-[620px]",
  link: "max-w-[780px]",
};

const SKIN_NOTE: Record<Skin, string> = {
  page: "As it reads in the console, for the people who ran it.",
  email: "As it lands in the inbox of the four people on the distribution list.",
  link: "As a recipient without a Prism account sees it, on a signed link.",
};

export function Readout({ compact }: { compact?: boolean }) {
  const dense = Boolean(compact);
  const [skin, setSkin] = useState<Skin>(dense ? "email" : "page");
  const [copied, setCopied] = useState(false);
  const [linkLive, setLinkLive] = useState(true);

  const copyLink = () => { void navigator.clipboard?.writeText(LINK); setCopied(true); };
  const revoked = skin === "link" && !linkLive;

  return (
    <>
      {!compact && (
        <PageHeader
          title="Readout"
          count={RUN.experiment}
          actions={<Pill tone="ok">Result frozen {day(CLOSED)}</Pill>}
        />
      )}

      <Toolbar>
        <Button size="sm" variant="outline" onClick={() => window.print()}>Print / PDF</Button>
        <Button size="sm" variant="outline" onClick={copyLink}>{copied ? "Link copied" : "Copy link"}</Button>
        <span className="mx-1 h-5 w-px bg-border" />
        {(["page", "email", "link"] as Skin[]).map((s) => (
          <Chip key={s} on={skin === s} onClick={() => setSkin(s)}>
            {s === "page" ? "Page" : s === "email" ? "Email" : "Public link"}
          </Chip>
        ))}
        <span className="ml-auto flex items-center gap-3">
          {linkLive ? (
            <span className="text-[12.5px] text-muted-2 tabular-nums">
              Link expires {day(EXPIRES)} · <span className="text-foreground">{linkDaysLeft} days</span> left of {LINK_DAYS}
            </span>
          ) : (
            <span className="text-[12.5px] text-danger">Public link revoked · the document still exists here</span>
          )}
          <Button size="sm" variant="ghost" onClick={() => setLinkLive(!linkLive)}>
            {linkLive ? "Revoke link" : "Issue a new link"}
          </Button>
        </span>
      </Toolbar>

      <div className="flex-1 overflow-auto bg-background flex flex-col">
        {revoked ? (
          <Empty
            title="This link no longer opens the readout"
            body={`Issued ${stamp(ISSUED)} to ${RUN.recipients} recipients and revoked before its ${LINK_DAYS}-day expiry. Recipients keep whatever they already printed — a revoked link ends access, it does not unsend a document.`}
            action={<Button onClick={() => setLinkLive(true)}>Issue a new link</Button>}
          />
        ) : (
          <article className={cn("print-report mx-auto w-full rounded-xl border border-border bg-surface my-6", SKIN_WIDTH[skin])}>
            <table className="print-frame">
              <tfoot className="print-legal"><tr><td><div className="print-foot-spacer" /></td></tr></tfoot>
              <tbody><tr><td>

                {/* Masthead */}
                <div className={cn("border-b border-border", dense ? "px-5 py-4" : "px-6 py-5")}>
                  <div className="flex items-start gap-4">
                    <div className="min-w-0 flex-1">
                      <Label>{RUN.org} · Experiment readout</Label>
                      <h1 className={cn("font-semibold tracking-[-0.02em] mt-1.5", dense ? "text-[19px]" : "text-[22px]")}>{RUN.experiment}</h1>
                      <p className="text-[13px] text-muted-2 mt-1.5 break-words">
                        {RUN.site}{RUN.path} · {RUN.env} · {RUN.run}, closed {stamp(CLOSED)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <Label>Same model, three skins</Label>
                      <div className="text-[12.5px] text-muted mt-1 max-w-[190px] leading-relaxed">{SKIN_NOTE[skin]}</div>
                    </div>
                  </div>
                </div>

                {/* Status band — the verdict word, and the one sentence it licenses */}
                <div className={cn("border-b border-border flex items-start gap-5", dense ? "px-5 py-4 flex-col" : "px-6 py-5")}>
                  <div className="shrink-0">
                    <Label>Verdict · statistical</Label>
                    <div className={cn("font-semibold text-ok tracking-[-0.02em] leading-none mt-2", dense ? "text-[24px]" : "text-[30px]")}>
                      Confirmed
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <Pill tone="ok">decision metric settled</Pill>
                      <Pill tone="warn">decision not recorded</Pill>
                    </div>
                  </div>

                  <div className={cn("flex-1 min-w-0", dense ? "border-t border-border pt-4 w-full" : "border-l border-border pl-5")}>
                    <p className={cn("font-medium leading-snug", dense ? "text-[15.5px]" : "text-[17px]")}>
                      More guests reached the booking step. Whether more of them booked is not something this site records.
                    </p>
                    <p className="text-[12.5px] text-muted-2 mt-2.5 leading-relaxed">
                      A confirmed verdict may not be told its decision metric lost or went quiet. This sentence claims neither: it
                      claims a gain on the metric the plan nominated, and an absence of instrumentation. Both are shown below.
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <Pill tone="accent">claims: gain on the decision metric</Pill>
                      <Pill tone="muted">claims: no test exists for bookings</Pill>
                    </div>
                  </div>
                </div>

                {/* Disclosure — never a footnote */}
                <div className="px-6 py-3.5 border-b border-border bg-warn/5">
                  <div className="flex items-start gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-warn mt-[7px] shrink-0" />
                    <p className="text-[13.5px] leading-relaxed">
                      <span className="font-semibold">{unwatchedCount} of the {GUARDRAILS.length} guardrails Brief 3 named were never watched.</span>{" "}
                      <span className="text-muted">Nothing vetoed this result, but on those two nothing could have. They are listed with the rest rather than dropped.</span>
                    </p>
                  </div>
                </div>

                {/* Vitals */}
                <div className={cn("grid border-b border-border", dense ? "grid-cols-2" : "grid-cols-4")}>
                  {[
                    { k: "Sessions", v: count(SESSIONS), sub: `${count(ARMS.control)} old · ${count(ARMS.variation)} new` },
                    { k: "Days of traffic", v: String(runDays), sub: `${day(FROZE)} ${clock(FROZE)} → ${day(CLOSED)} ${clock(CLOSED)}` },
                    { k: "Split", v: "50 / 50", sub: `delivered ${controlShare.toFixed(1)} / ${variationShare.toFixed(1)}` },
                    { k: "Confidence", v: "95%", sub: `p ${DECISION.p?.toFixed(3)} on the decision metric` },
                  ].map((c, i) => (
                    <div key={c.k} className={cn("px-6 py-4 border-border", i % (dense ? 2 : 4) !== 0 && "border-l", dense && i < 2 && "border-b")}>
                      <Label>{c.k}</Label>
                      <div className="text-[22px] font-semibold tabular-nums tracking-[-0.02em] mt-1.5">{c.v}</div>
                      <div className="text-[12px] text-muted-2 mt-1 tabular-nums">{c.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Pre-registration */}
                <Section title="What was promised, before any of this existed" className="rounded-none border-0 border-b border-border bg-transparent">
                  <div className={cn("py-4", dense ? "px-5" : "px-6")}>
                    <Label>The hypothesis, verbatim from {RUN.brief}</Label>
                    <div className="mt-2">
                      <Frozen block>{HYPOTHESIS}</Frozen>
                    </div>

                    <div className="mt-4 rounded-lg border border-border bg-surface-2/40 p-4">
                      <div className="flex items-baseline gap-2.5 flex-wrap">
                        <span className="text-[19px] font-semibold tabular-nums text-ok">{preRegDays} days</span>
                        <span className="text-[14px] font-medium">frozen before the numbers existed</span>
                      </div>
                      <p className="text-[13px] text-muted mt-2 leading-relaxed">
                        Not a badge — a subtraction, and here are both of its operands. The brief sealed at{" "}
                        <span className="text-foreground tabular-nums">{stamp(FROZE)}</span>, in the same action that opened {RUN.run}.
                        Results stayed sealed until the pre-registered floor of {count(RUN.sampleFloor)} sessions was reached at{" "}
                        <span className="text-foreground tabular-nums">{stamp(UNSEALED)}</span> — the first moment anyone could read a
                        number. That is {preRegDays} days; the run then closed {runDays} days after the freeze.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Frozen>{RUN.brief} · {RUN.briefDigest} · sealed {stamp(FROZE)}</Frozen>
                        <Frozen>build {RUN.build} · {RUN.buildSize} · this exact code ran</Frozen>
                        <Frozen>{count(SESSIONS)} sessions · sealed at close</Frozen>
                      </div>
                    </div>

                    <p className="text-[13px] text-muted mt-4 leading-relaxed">
                      {PROJECT_DUPLICATE_NAMES} of this project&rsquo;s {PROJECT_EVENTS} event names are shared by more than one event, and{" "}
                      <span className="text-foreground">{collidingHere.length} of them are in this readout</span> —{" "}
                      {collidingHere.map((n) => `“${n}”`).join(" and ")}. The plan binds keys, so the document below can name{" "}
                      <Key>24138040550_book_now_button_clicks</Key> without any chance that a reader, or a later run, resolves it to the
                      identically-named event this experiment never reported.
                    </p>
                  </div>
                </Section>

                {/* Movements */}
                <Section title="What moved" className="rounded-none border-0 border-b border-border bg-transparent">
                  <Movement
                    n={1} of={4} dense={dense}
                    title="Guests reached the booking step more often, and the interval clears zero."
                    tag={<Pill tone="ok">settled</Pill>}
                    figure={<CiFigure ci={DECISION_CI} point={DECISION_LIFT} settled dense={dense} />}
                  >
                    <p>
                      {rate(DECISION.control ?? 0)} of the old version&rsquo;s guests reached it against{" "}
                      {rate(DECISION.variation)} of the new version&rsquo;s — a lift of{" "}
                      <span className="text-foreground font-medium tabular-nums">{signed(DECISION_LIFT)}</span> at p{" "}
                      <span className="tabular-nums">{DECISION.p?.toFixed(3)}</span>.
                    </p>
                    <p>
                      In guests: {count(reachedActual)} of the {count(ARMS.variation)} people who saw the new version reached the booking
                      step, where the old version&rsquo;s rate would have produced {count(reachedCounterfactual)} —{" "}
                      <span className="text-foreground font-medium tabular-nums">{extraGuests} more guests</span>. Read the low end of the
                      interval, not the middle: the honest floor of this change is {signed(DECISION_CI[0])}.
                    </p>
                  </Movement>

                  <Movement
                    n={2} of={4} dense={dense}
                    title="The hero moved with it, which is what you would expect if guests read the promise before they clicked."
                    tag={<Pill tone="ok">settled</Pill>}
                    figure={<ArmsFigure control={FINDINGS[1].control ?? 0} variation={FINDINGS[1].variation} dense={dense} />}
                  >
                    <p>
                      <Key>24138040550_hero_cta_click</Key> rose {signed(liftOf(FINDINGS[1]) ?? 0)} (95%{" "}
                      {interval(FINDINGS[1].ci ?? [0, 0])}, p {FINDINGS[1].p?.toFixed(3)}). It corroborates the decision metric rather
                      than adding to it.
                    </p>
                    <p>
                      It was named <span className="text-foreground">supporting</span> before traffic, so it stays supporting now that it
                      looks good. A metric promoted after the fact is a metric chosen by its result.
                    </p>
                  </Movement>

                  <Movement
                    n={3} of={4} dense={dense}
                    title="The offers page did not lose anyone it can prove it lost."
                    tag={<Pill tone="warn">not settled</Pill>}
                    figure={<CiFigure ci={FINDINGS[2].ci ?? [0, 0]} point={liftOf(FINDINGS[2]) ?? 0} settled={false} dense={dense} />}
                  >
                    <p>
                      The guardrail moved {signed(liftOf(FINDINGS[2]) ?? 0)} — inside the −2.0% tolerance on the point estimate, but the
                      interval still reaches {signed(FINDINGS[2].ci?.[0] ?? 0)} at its low end.
                    </p>
                    <p>
                      So it blocks nothing and it clears nothing. It is drawn without colour on purpose: chroma is earned, and this
                      number has not earned it.
                    </p>
                  </Movement>

                  <Movement
                    n={4} of={4} dense={dense}
                    title="Nobody can say whether one extra booking happened."
                    tag={<Pill tone="danger">no measurement</Pill>}
                    figure={<CoverageFigure />}
                  >
                    <p>
                      Brief 3 named completed bookings as success, in those words. This project has {PROJECT_EVENTS} events and{" "}
                      {PROJECT_BOOKING_EVENTS} of them record a booking — the nearest thing is a click on Book Now, which is an intention.
                    </p>
                    <p>
                      The measurement plan said so before the run rather than after it, and this readout will not stand a click in for a
                      booking to make the sentence above it stronger. The gap is the finding.
                    </p>
                  </Movement>
                </Section>

                {/* Findings */}
                <Section
                  title="Every metric this run reported"
                  className="rounded-none border-0 border-b border-border bg-transparent"
                  action={<span className="text-[12.5px] text-muted-2 tabular-nums">{settledCount} of {FINDINGS.length} settled</span>}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <Th first>Metric</Th>
                          <Th>Role</Th>
                          <Th>Old</Th>
                          <Th>New</Th>
                          <Th>Change</Th>
                          <Th>95% interval</Th>
                          <Th>Settled</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {FINDINGS.map((f) => {
                          const l = liftOf(f);
                          const s = isSettled(f);
                          return (
                            <tr key={f.key} className={cn(f.role === "Decides it" && "bg-accent/[0.04]")}>
                              <td className="px-4 pl-6 py-3 border-b border-border align-top">
                                <div className="text-[13.5px] font-medium">{f.label}</div>
                                <div className="mt-1.5 flex flex-wrap gap-1">{f.events.map((k) => <Key key={k}>{k}</Key>)}</div>
                                {f.note && <div className="text-[12px] text-muted-2 mt-1.5 max-w-[380px] leading-relaxed">{f.note}</div>}
                              </td>
                              <td className="px-4 py-3 border-b border-border align-top text-[13px] text-muted whitespace-nowrap">{f.role}</td>
                              <td className="px-4 py-3 border-b border-border align-top text-[13.5px] tabular-nums whitespace-nowrap">
                                {f.control === null ? <span className="text-muted-2">—</span> : rate(f.control)}
                              </td>
                              <td className="px-4 py-3 border-b border-border align-top text-[13.5px] tabular-nums whitespace-nowrap">{rate(f.variation)}</td>
                              <td className={cn("px-4 py-3 border-b border-border align-top text-[13.5px] font-medium tabular-nums whitespace-nowrap", s ? "text-ok" : "text-muted-2")}>
                                {l === null ? "—" : signed(l)}
                              </td>
                              <td className="px-4 py-3 border-b border-border align-top text-[13px] tabular-nums text-muted whitespace-nowrap">
                                {f.ci ? interval(f.ci) : "—"}
                              </td>
                              <td className="px-4 py-3 border-b border-border align-top">
                                {s ? <Pill tone="ok">Settled</Pill>
                                  : f.ci === null ? <Pill tone="danger">Cannot settle</Pill>
                                  : <Pill tone="muted">Not settled</Pill>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-6 py-3 text-[12.5px] text-muted-2 leading-relaxed">
                    Settled means the 95% interval keeps its whole width on one side of zero after the run&rsquo;s multiple-comparison
                    correction — the same test the verdict used. It is not a second opinion computed for this table.
                  </div>
                </Section>

                {/* Guardrails */}
                <Section
                  title="What was not allowed to get worse"
                  className="rounded-none border-0 border-b border-border bg-transparent"
                  action={<span className="text-[12.5px] text-muted-2 tabular-nums">{GUARDRAILS.length - unwatchedCount} of {GUARDRAILS.length} watched</span>}
                >
                  {GUARDRAILS.map((g) => (
                    <div key={g.name} className="flex items-start gap-3.5 px-5 py-3.5 border-b border-border last:border-0">
                      <span className={cn("w-1.5 h-1.5 rounded-full mt-[7px] shrink-0",
                        g.state === "holding" ? "bg-ok" : g.state === "at-risk" ? "bg-warn" : "bg-danger")} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="text-[14px] font-medium">{g.name}</span>
                          <span className="text-[12.5px] text-muted-2">tolerance {g.tolerance}</span>
                        </div>
                        <p className="text-[13px] text-muted mt-1 leading-relaxed">{g.detail}</p>
                        {g.watcher && <div className="mt-1.5"><Key>{g.watcher}</Key></div>}
                      </div>
                      <div className="text-right shrink-0 w-[124px]">
                        <div className={cn("text-[14px] font-semibold tabular-nums",
                          g.state === "holding" ? "text-ok" : g.state === "at-risk" ? "text-warn" : "text-muted-2")}>{g.observed}</div>
                        {g.interval && <div className="text-[12px] text-muted-2 tabular-nums mt-0.5">{g.interval}</div>}
                        <div className="mt-1.5">
                          {g.state === "holding" ? <Pill tone="ok">Holding</Pill>
                            : g.state === "at-risk" ? <Pill tone="warn">Not yet cleared</Pill>
                            : <Pill tone="danger">Never watched</Pill>}
                        </div>
                      </div>
                    </div>
                  ))}
                </Section>

                {/* Provenance */}
                <Section title="Who owns this, and what it is made of" className="rounded-none border-0 bg-transparent">
                  <div className={cn("py-3", dense ? "px-5" : "px-6")}>
                    <Meta k="Experiment" v={`${RUN.experiment} · ${RUN.run}`} />
                    <Meta k="Page" v={`${RUN.site}${RUN.path} · ${RUN.env}`} mono />
                    <Meta k="Written by" v={`${RUN.author} · Author`} />
                    <Meta k="Reviewed by" v={`${RUN.reviewer} · Reviewer, on the real page, 16 Aug 2026`} />
                    <Meta k="Decided by" v={<span className="text-warn">Not yet recorded — {RUN.approver} is the approver. This document states the result; it is not the decision.</span>} />
                    <Meta k="Brief" v={`${RUN.brief} · ${RUN.briefDigest} · sealed ${stamp(FROZE)}`} mono />
                    <Meta k="Build" v={`${RUN.build} · ${RUN.buildSize}`} mono />
                    <Meta k="Figures" v={`Frozen at the ${stamp(CLOSED)} close. Re-running the experiment produces a new document; it does not change this one.`} />
                    <Meta k="Link" v={linkLive ? `${LINK} · expires ${day(EXPIRES)} (${linkDaysLeft} days left)` : `${LINK} · revoked`} mono />
                  </div>

                  <div className={cn("border-t border-border py-3.5", dense ? "px-5" : "px-6")}>
                    <p className="text-[11.5px] text-muted-2 leading-relaxed">
                      {RUN.org} · Prism experiment record · {RUN.experiment} · {RUN.run} · {RUN.brief} {RUN.briefDigest} · build{" "}
                      {RUN.build} · figures frozen {stamp(CLOSED)} · issued {stamp(ISSUED)} to {RUN.recipients} recipients · link expires{" "}
                      {day(EXPIRES)} · confidential, internal experiment record.
                    </p>
                  </div>
                </Section>

              </td></tr></tbody>
            </table>

            {/* Paper only: the same ownership line, repeated at the foot of every sheet. */}
            <div className="print-legal-fixed print-legal-block">
              {RUN.org} · Prism experiment record · {RUN.experiment} · {RUN.run} · {RUN.brief} {RUN.briefDigest} · build {RUN.build} ·
              figures frozen {stamp(CLOSED)} · issued {stamp(ISSUED)} · link expires {day(EXPIRES)} · confidential.
            </div>
          </article>
        )}
      </div>
    </>
  );
}
