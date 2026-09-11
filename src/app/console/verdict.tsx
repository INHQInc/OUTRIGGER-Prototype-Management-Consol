"use client";

/**
 * THE TYPED VERDICT — nine ordered gates, one of seven words.
 *
 * Beta 1's verdict.ts does not "decide if it won". It walks NINE GATES IN A
 * FIXED ORDER and returns the first word the ladder produces. The order is the
 * whole design:
 *
 *  · VALIDITY (gates 1-5) runs before significance is ever consulted. That is
 *    what makes CONFIRMED structurally unreachable on a broken run — not a rule
 *    someone remembers to apply, an ordering nothing can route around.
 *  · A gate has THREE outcomes, not two. "Could not be evaluated" is first
 *    class: it is not a fail, it carries the gate that blocked it, and it must
 *    never look like a fail — a fail is a finding, an unevaluated gate is an
 *    absence. Rendering them the same way is how a broken run gets read as a
 *    negative result.
 *  · Some gates still resolve downstream of a fail (pre-registration does not
 *    depend on the numbers). Blanking everything after a fail would be a lie in
 *    the other direction.
 *  · PRE-REGISTRATION is a duration, not a checkbox. The only thing that makes
 *    a frozen plan mean anything is how long it was frozen BEFORE the numbers
 *    existed, so that gap is computed and shown, never asserted.
 *  · DISCLOSURES are not warnings. A disclosed change can sit on a valid
 *    result; it is shown so the reader can discount it themselves.
 *
 * Frozen artefacts render as a bordered mono receipt with a lock. Anything
 * still moving renders as plain text. On an open run the numbers are plain.
 *
 * Every button under the word DOES what it says, inside the session. A recorded
 * decision seals; a stop, an extension or a split reset leaves a fact on the
 * run; a button that names a stage goes there. Whoever wrote the experiment
 * cannot record its result — the panel holds that rule, not the reader.
 */

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label as FieldLabel } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/ui/cn";
import { EXPERIMENTS, ME, authoredByMe, type Stage } from "@/lib/console/fake";
import { logActivity } from "./config";
import { Pill, Section, Meta, Th, PageHeader, Toolbar, Chip, Empty } from "./ui";

/* ── Fixtures ──────────────────────────────────────────────────────── */

export type Verdict =
  | "confirmed" | "refuted" | "guardrail_breach" | "keep_running"
  | "underpowered" | "invalid" | "not_adjudicable";

type GateResult = "pass" | "fail" | "unevaluated";
type Band = "validity" | "statistics" | "provenance";

type Outcome = { result: GateResult; saw: string; blockedBy?: string; pct?: number };
type Arm = { arm: string; sub: string; sessions: string; share: string; hits: string; rate: string; vs: string; tone?: "ok" | "danger" };
type Disclosure = { kind: string; when: string; body: string; tone: "warn" | "danger" };

const EXPERIMENT = "Rate-calendar best-price promise";
const PAGE = "outrigger.com/hawaii/oahu/outrigger-reef-waikiki-beach-resort";
const BUILD = "8c1d7e2";
const TODAY = "10 Sep 2026";

/* The pre-registration timeline. The gaps below are computed from these. */
const FROZE_AT = "2026-08-26T09:14:00Z";
const FIRST_TRAFFIC_AT = "2026-08-27T06:00:00Z";
const FIRST_NUMBER_AT = "2026-08-27T14:22:00Z";
const RUN_CLOSED_AT = "2026-09-08T17:00:00Z";

const gap = (from: string, to: string) => {
  const mins = Math.round((Date.parse(to) - Date.parse(from)) / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  return `${d ? `${d}d ` : ""}${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
};

const TO_TRAFFIC = gap(FROZE_AT, FIRST_TRAFFIC_AT);   // 20h 46m
const TO_NUMBERS = gap(FROZE_AT, FIRST_NUMBER_AT);    // 1d 05h 08m
const TO_CLOSE = gap(FROZE_AT, RUN_CLOSED_AT);        // 13d 07h 46m

/* Closed-run volume, and the rate everything downstream is projected at. */
const SESSIONS = 18412;
const RUN_DAYS = 12;
const PER_DAY = Math.round(SESSIONS / RUN_DAYS);      // 1,534 a day

/* The open run, for keep_running. */
const FLOOR = 16000;
const OPEN_SESSIONS = 9140;
const OPEN_DAYS = 6;
const OPEN_PCT = Math.round((OPEN_SESSIONS / FLOOR) * 100);           // 57%
const OPEN_PER_DAY = Math.round(OPEN_SESSIONS / OPEN_DAYS);           // 1,523 a day
const OPEN_DAYS_LEFT = Math.ceil((FLOOR - OPEN_SESSIONS) / OPEN_PER_DAY); // 5

/* Power projection. Three targets, one run — the recommendation is different
 * for each, and that difference is the whole point of the underpowered word. */
const KEEP_RUNNING_CEILING = 90;
const TARGETS = [
  { id: "planned", effect: "≥ 2.0%", label: "what you said in the brief was worth shipping", need: 16000 },
  { id: "refrozen", effect: "≥ 1.2%", label: "what the brief was re-frozen to on 3 Sep, after numbers existed", need: 32900 },
  { id: "observed", effect: "+ 0.6%", label: "what run 4 actually saw", need: 366000 },
] as const;
type TargetId = (typeof TARGETS)[number]["id"];

const shortBy = (need: number) => Math.max(0, need - SESSIONS);
const daysFor = (need: number) => Math.ceil(shortBy(need) / PER_DAY);

/** What extending run 4 means for a target: a day to extend to, or the reason it cannot be. */
const extension = (id: TargetId) => {
  const t = TARGETS.find((x) => x.id === id) ?? TARGETS[1];
  const short = shortBy(t.need);
  const days = daysFor(t.need);
  if (short === 0) {
    return { ok: false as const, body: `Nothing to extend for — ${SESSIONS.toLocaleString()} sessions already cleared the ${t.need.toLocaleString()} that ${t.effect} needed. More traffic cannot make run 4 answer a question it was not asked. Record the null, or pick the target the brief was re-frozen to.` };
  }
  if (days > KEEP_RUNNING_CEILING) {
    return { ok: false as const, body: `Confirming the ${t.effect} run 4 actually saw would take about ${days} more days. Past ${KEEP_RUNNING_CEILING}, a run stops being a run and becomes a standing change to the page, so Prism will not extend to it. Accept the null, or redesign the change to move the number further.` };
  }
  return {
    ok: true as const, day: RUN_DAYS + days, short, effect: t.effect,
    body: `Run 4 reopens on build ${BUILD} at the same 50 / 50 and keeps collecting until ${t.need.toLocaleString()} sessions — ${short.toLocaleString()} more, about ${days} days at ${PER_DAY.toLocaleString()} a day. That is day ${RUN_DAYS + days}. The brief stays as it is and the ${SESSIONS.toLocaleString()} sessions already run count; the verdict is derived again when the floor is reached.`,
  };
};

/* The nine gates, in the order beta 1 walks them. */
const GATES: { n: number; name: string; sub: string; band: Band }[] = [
  { n: 1, name: "Traffic split sane", sub: "sample-ratio mismatch against the declared 50 / 50", band: "validity" },
  { n: 2, name: "Enough traffic", sub: "sessions against the floor this plan set", band: "validity" },
  { n: 3, name: "Metric adjudicable", sub: "the deciding number exists in both versions", band: "validity" },
  { n: 4, name: "Plan confirmed before traffic", sub: "pre-registered, not chosen once the numbers were visible", band: "validity" },
  { n: 5, name: "Guardrails", sub: "nothing the brief said must not get worse got worse", band: "validity" },
  { n: 6, name: "Significance", sub: "does the 95% interval exclude zero", band: "statistics" },
  { n: 7, name: "Direction declared", sub: "which way counts as a win, said before any number existed", band: "statistics" },
  { n: 8, name: "Power", sub: "could this run ever have detected the effect you called worth shipping", band: "statistics" },
  { n: 9, name: "Brief ↔ build drift", sub: "the code that ran is the code the brief describes", band: "provenance" },
];

const BAND_LABEL: Record<Band, string> = {
  validity: "VALIDITY · GATES 1–5",
  statistics: "STATISTICS · GATES 6–8",
  provenance: "PROVENANCE · GATE 9",
};

const BAND_NOTE: Record<Band, string> = {
  validity: "Runs first, before any number is interpreted. A fail here is not a bad result — it is the absence of a result.",
  statistics: "Consulted only after every validity gate above has resolved. That ordering is the design: on a broken run these cannot resolve, so CONFIRMED cannot be reached.",
  provenance: "Runs last and can void everything above it — if the code that ran is not the code the brief describes, there is nothing to attribute.",
};

const pass = (saw: string): Outcome => ({ result: "pass", saw });
const fail = (saw: string, pct?: number): Outcome => ({ result: "fail", saw, pct });
const unev = (blockedBy: string): Outcome => ({ result: "unevaluated", saw: "—", blockedBy });

const SPLIT_OK = "9,206 / 9,206 — 50.0 / 50.0 against a declared 50 / 50, χ² p 1.00";
const FLOOR_OK = `${SESSIONS.toLocaleString()} sessions against a floor of ${FLOOR.toLocaleString()}`;
const METRIC_BOTH = "24138040550_book_now_button_clicks fires in both versions";
const PREREG_OK = `Revision 3 frozen 26 Aug 09:14 HST — ${TO_TRAFFIC} before the first guest saw it`;
const GUARDRAILS_OK = "Both holding — Reached the offers page +0.4%, Hero engagement +1.1%";
const DIRECTION_OK = "up declared 26 Aug 09:14, before any number existed";
const POWER_OK = `80% power at ≥ 2.0% needed ${FLOOR.toLocaleString()} sessions; ${SESSIONS.toLocaleString()} ran`;
const DRIFT_OK = `Build ${BUILD} is the build the brief describes — no drift`;

/* ── What a click does ─────────────────────────────────────────────── */

type Variant = "default" | "outline" | "danger";
type Decision = "ship" | "accept_null" | "refuted";

/** A click that asks first. Every one of these is consequential, so it confirms in a dialog that names what it does. */
type Ask =
  | { kind: "decide"; which: Decision }   // recorded and sealed — never by whoever wrote or built it
  | { kind: "roll_off" }                  // a safety action: anyone, now, unsealed
  | { kind: "leave" }
  | { kind: "stop" }
  | { kind: "extend" }
  | { kind: "reset" }
  | { kind: "fix_plan" };
/** A click that just goes, or copies. Nothing to confirm. */
type Direct = { kind: "readout" } | { kind: "go"; stage: Stage } | { kind: "copy" };
type Do = Ask | Direct;
type Action = { label: string; variant?: Variant; do: Do };

/** What a click left behind. `decided` is sealed; the rest are facts about the run — on record, not a verdict. */
type Done = { kind: "decided" | "rolled" | "left" | "stopped" | "extended" | "reset"; line: string; sub?: string; head?: string; next?: string };

const BOOK_NOW = "24138040550_book_now_button_clicks";
const TRIP_PLANNER = "24138040550_opmc__trip_planner_cta_target";

/** The three decisions this fixture can record, and what each one seals. */
const DECISIONS: Record<Decision, { title: string; body: string; confirm: string; variant: Variant; busy: string; sub: string; next: string; logged: string }> = {
  ship: {
    title: "Record the decision: ship it",
    body: `Seals run 4 with the verdict Confirmed and the numbers above — +2.4% on Reached the booking step, ${SESSIONS.toLocaleString()} sessions — and writes the readout, under your name, ${ME.name}, on ${TODAY}. Recording does not touch the page: moving build ${BUILD} to every guest is a build step that comes after.`,
    confirm: "Record: ship it",
    variant: "default",
    busy: "Sealing run 4 and writing the readout…",
    sub: `Confirmed — ship it. The result and the statistics are frozen with the verdict, and the readout is written. Rolling build ${BUILD} out to every guest is the next step on Build.`,
    next: `Move build ${BUILD} to every guest on the Reef Waikiki rate calendar — the decision is recorded, and the roll-out is the next build step.`,
    logged: "ship it",
  },
  accept_null: {
    title: "Record the decision: accept the null",
    body: `Seals run 4 with the verdict Underpowered and +0.6% (95% CI −2.2 to +3.4) as the answer it gave — not evidence the promise does nothing, evidence a run this size could not tell. Build ${BUILD} comes off the page and the hypothesis stays open. Recorded under your name, ${ME.name}, on ${TODAY}.`,
    confirm: "Record: accept the null",
    variant: "default",
    busy: `Sealing run 4 and taking ${BUILD} off the page…`,
    sub: `Underpowered — the null is accepted. Build ${BUILD} is off the page, and the readout says what this run could and could not see.`,
    next: `Nothing more to run on this plan — the null is recorded and build ${BUILD} is off the page. If the promise is worth another try, redesign it to move the number further and start from a new brief.`,
    logged: "accepted the null",
  },
  refuted: {
    title: `Roll build ${BUILD} off the page`,
    body: `Every guest sees the rate calendar without the promise. Run 4 is sealed with the verdict Refuted — −1.9% on Reached the booking step, ${SESSIONS.toLocaleString()} sessions — and the hypothesis is filed as answered so nobody runs it again. This is a recorded decision, made under your name, ${ME.name}, on ${TODAY}.`,
    confirm: `Roll ${BUILD} off the page`,
    variant: "danger",
    busy: `Taking ${BUILD} off the page and sealing run 4…`,
    sub: `Refuted — build ${BUILD} is off the page and the hypothesis is filed as answered. The result and the statistics are frozen with the verdict.`,
    next: `Nothing — build ${BUILD} is off the page and the hypothesis is filed as answered.`,
    logged: `refuted, build ${BUILD} rolled off`,
  },
};

/** For NOT ADJUDICABLE: the ask, addressed to whoever can change the old page.
 *  Prism cannot instrument a page it does not build — that is a message to the one person who can. */
const INSTRUMENTATION_ASK = [
  `Instrumentation ask — ${EXPERIMENT}, run 4`,
  `Page: ${PAGE}`,
  "",
  `Run 4 could not be adjudicated. The deciding event, ${TRIP_PLANNER}, fires only in the new build (${BUILD}). The page as it is today has no trip-planner surface, so the control never fired it and there is no contrast to judge.`,
  "",
  "Before a new run opens, one of these has to be true:",
  `  1. The page as it is today fires ${TRIP_PLANNER} from an equivalent trip-planner entry point, or`,
  `  2. The brief nominates a deciding number both versions can move — ${BOOK_NOW} fires in both today.`,
  "",
  `Brief revision 3 · build ${BUILD} · asked by ${ME.name} on ${TODAY}`,
].join("\n");

/** The one navigation event. The shell routes {nav} and {expId}; the open experiment routes {stage}. */
const go = (detail: { nav?: string; expId?: string; stage?: Stage }) => window.dispatchEvent(new CustomEvent("console:go", { detail }));

/** The experiment a verdict belongs to, when the fixture has it — by name, because the panel is handed a title, not an id. */
const experimentNamed = (name: string) => EXPERIMENTS.find((e) => e.name === name);

type Config = {
  word: string;
  tone: "ok" | "danger" | "warn" | "accent" | "muted";
  means: string;
  next: string;
  closed: boolean;
  result: string;
  metricLabel: string;
  metricKey: string;
  arms: Arm[];
  armsNote: string;
  trace: Outcome[];
  resolvedBy: string;
  disclosures: Disclosure[];
  actions: Action[];
};

const CONFIG: Record<Verdict, Config> = {
  confirmed: {
    word: "Confirmed",
    tone: "ok",
    means: "The change did what the brief said it would, and the run was clean enough for that to mean something.",
    next: `Ship ${EXPERIMENT.toLowerCase()} to 100% of the Reef Waikiki rate calendar and close run 4 — nine gates cleared and the interval sits entirely above zero.`,
    closed: true,
    result: `run 4 · closed 8 Sep 2026 17:00 HST · ${SESSIONS.toLocaleString()} sessions · +2.4% (95% CI +0.3 to +4.5, p 0.031)`,
    metricLabel: "Reached the booking step",
    metricKey: BOOK_NOW,
    arms: [
      { arm: "Control", sub: "the rate calendar as it is today", sessions: "9,206", share: "50.0%", hits: "1,231", rate: "13.37%", vs: "—" },
      { arm: "Variation", sub: "best-price promise above the calendar", sessions: "9,206", share: "50.0%", hits: "1,261", rate: "13.70%", vs: "+2.4%", tone: "ok" },
    ],
    armsNote: "Reaching the booking step is a click on Book Now — an intention, not a booking. This project has 48 events and not one of them records a completed booking or any revenue, so the verdict is about intent and says so rather than standing a lookalike event in for the thing you actually care about.",
    trace: [
      pass(SPLIT_OK), pass(FLOOR_OK), pass(METRIC_BOTH), pass(PREREG_OK), pass(GUARDRAILS_OK),
      pass("+2.4%, 95% CI +0.3 to +4.5, p 0.031 — the interval is entirely above zero"),
      pass(DIRECTION_OK), pass(POWER_OK), pass(DRIFT_OK),
    ],
    resolvedBy: "Gate 6 — reached only because gates 1 to 5 all passed. Nine of nine cleared and the movement runs in the direction declared before traffic.",
    disclosures: [],
    actions: [
      { label: "Record: ship it", do: { kind: "decide", which: "ship" } },
      { label: "Open the readout", variant: "outline", do: { kind: "readout" } },
    ],
  },

  refuted: {
    word: "Refuted",
    tone: "danger",
    means: "The change moved the deciding number the wrong way, and the run was clean enough for that to be believed.",
    next: `Roll build ${BUILD} off the page and file the hypothesis as answered — the effect is real and it is −1.9%, opposite the direction declared before traffic.`,
    closed: true,
    result: `run 4 · closed 8 Sep 2026 17:00 HST · ${SESSIONS.toLocaleString()} sessions · −1.9% (95% CI −3.6 to −0.2, p 0.041)`,
    metricLabel: "Reached the booking step",
    metricKey: BOOK_NOW,
    arms: [
      { arm: "Control", sub: "the rate calendar as it is today", sessions: "9,206", share: "50.0%", hits: "1,231", rate: "13.37%", vs: "—" },
      { arm: "Variation", sub: "best-price promise above the calendar", sessions: "9,206", share: "50.0%", hits: "1,208", rate: "13.12%", vs: "−1.9%", tone: "danger" },
    ],
    armsNote: "A refutation is a result, not a failure. Nine gates cleared, so this number is as trustworthy as a win would have been — the page is measurably worse with the promise on it, and the cheapest thing this run produced is the knowledge that you do not have to try it again.",
    trace: [
      pass(SPLIT_OK), pass(FLOOR_OK), pass(METRIC_BOTH), pass(PREREG_OK),
      pass("Both holding — nothing got worse outside the deciding number itself"),
      pass("−1.9%, 95% CI −3.6 to −0.2, p 0.041 — the interval is entirely below zero"),
      pass("up declared 26 Aug 09:14 — six days after the brief was written, but still before any number existed"),
      pass(POWER_OK), pass(DRIFT_OK),
    ],
    resolvedBy: "Gate 6 passed and gate 7 settles the sign: a real effect, moving opposite the direction declared before traffic. That is a refutation, not a null.",
    disclosures: [
      { kind: "Direction declared late", when: "26 Aug 09:14 HST", tone: "warn", body: "up was named six days after the brief was written rather than with it. Gate 7 still passes — no arm-level number existed on 26 Aug — but it is disclosed, because a direction named late is the single most verdict-inverting edit in the product and the reader is entitled to discount it." },
    ],
    actions: [
      { label: `Roll build ${BUILD} off the page`, variant: "danger", do: { kind: "decide", which: "refuted" } },
      { label: "Open the readout", variant: "outline", do: { kind: "readout" } },
    ],
  },

  guardrail_breach: {
    word: "Guardrail breach",
    tone: "danger",
    means: "Something the brief said must not get worse got worse. The win is not available.",
    next: `Roll build ${BUILD} off the page now — Reached the offers page fell 6.1%, and a breached guardrail vetoes a win, so the +2.4% is not yours to ship.`,
    closed: true,
    result: `run 4 · closed 8 Sep 2026 17:00 HST · ${SESSIONS.toLocaleString()} sessions · +2.4% (95% CI +0.3 to +4.5, p 0.031) · guardrail breached`,
    metricLabel: "Reached the booking step",
    metricKey: BOOK_NOW,
    arms: [
      { arm: "Control", sub: "the rate calendar as it is today", sessions: "9,206", share: "50.0%", hits: "1,231", rate: "13.37%", vs: "—" },
      { arm: "Variation", sub: "best-price promise above the calendar", sessions: "9,206", share: "50.0%", hits: "1,261", rate: "13.70%", vs: "+2.4%", tone: "ok" },
    ],
    armsNote: "The deciding number went up. It is rendered here in full, and it changes nothing: the promise pulled guests straight past the offers page, which the brief listed as a thing that must not get worse. Hiding the +2.4% would only guarantee somebody asks for it later.",
    trace: [
      pass(SPLIT_OK), pass(FLOOR_OK), pass(METRIC_BOTH), pass(PREREG_OK),
      fail("Reached the offers page fell 6.1% (95% CI −9.8 to −2.3) on 24138040550_all_offers_page. It was declared before traffic as a number that must not get worse."),
      pass("+2.4%, 95% CI +0.3 to +4.5, p 0.031 — computed, and vetoed by gate 5"),
      pass(DIRECTION_OK), pass(POWER_OK), pass(DRIFT_OK),
    ],
    resolvedBy: "Gate 5. The deciding number rose and it does not matter — a breached guardrail vetoes a win. Gate 6 is still shown, resolved, so nobody has to wonder what it said.",
    disclosures: [
      { kind: "Decision metric changed mid-run", when: "2 Sep 2026 11:40 HST · day 6 of 12", tone: "danger", body: "The deciding number moved from 24138040550_hero_cta_click to 24138040550_book_now_button_clicks six days in. The +2.4% is computed on the new metric across the whole run, including the six days before anyone chose it." },
    ],
    actions: [
      { label: `Roll build ${BUILD} off the page`, variant: "danger", do: { kind: "roll_off" } },
      { label: "Open the guardrail detail", variant: "outline", do: { kind: "go", stage: "Run" } },
    ],
  },

  keep_running: {
    word: "Keep running",
    tone: "accent",
    means: "Nothing is wrong. The run has not yet earned the right to be read.",
    next: `Leave run 4 alone for ${OPEN_DAYS_LEFT} more days — ${OPEN_SESSIONS.toLocaleString()} of the ${FLOOR.toLocaleString()} sessions this plan needs, and reading significance before the floor is how a coin flip becomes a launch.`,
    closed: false,
    result: `run 4 · open · day ${OPEN_DAYS} of 14 · ${OPEN_SESSIONS.toLocaleString()} sessions so far · +2.8% (95% CI −0.7 to +6.4)`,
    metricLabel: "Reached the booking step",
    metricKey: BOOK_NOW,
    arms: [
      { arm: "Control", sub: "the rate calendar as it is today", sessions: "4,570", share: "50.0%", hits: "611", rate: "13.37%", vs: "—" },
      { arm: "Variation", sub: "best-price promise above the calendar", sessions: "4,570", share: "50.0%", hits: "628", rate: "13.74%", vs: "+2.8%" },
    ],
    armsNote: "These numbers are not frozen and they will move. The +2.8% is shown because hiding a mid-flight number does not stop anyone looking — it just sends them to Optimizely to look at it without this warning attached.",
    trace: [
      pass("4,570 / 4,570 — 50.0 / 50.0 against a declared 50 / 50, χ² p 1.00"),
      fail(`${OPEN_SESSIONS.toLocaleString()} of the ${FLOOR.toLocaleString()} sessions this plan needs — ${OPEN_PCT}% of the floor`, OPEN_PCT),
      pass(METRIC_BOTH), pass(PREREG_OK),
      pass(`Both holding at day ${OPEN_DAYS} of 14 — Reached the offers page +0.2%, Hero engagement +0.9%`),
      unev("gate 2 has not passed. Reading significance before the floor is peeking, and peeking turns a 5% false-positive rate into roughly 30% across a fourteen-day run."),
      pass(DIRECTION_OK),
      pass(`At ${OPEN_PER_DAY.toLocaleString()} sessions a day the floor arrives in ${OPEN_DAYS_LEFT} more days, inside the fourteen-day window`),
      pass(DRIFT_OK),
    ],
    resolvedBy: `Gate 2. Nothing has gone wrong — the only gate not passed is the one that time passes on its own, in about ${OPEN_DAYS_LEFT} days.`,
    disclosures: [],
    actions: [
      { label: "Leave it running", variant: "outline", do: { kind: "leave" } },
      { label: "Stop this run", variant: "danger", do: { kind: "stop" } },
    ],
  },

  underpowered: {
    word: "Underpowered",
    tone: "warn",
    means: "The run ended without the sensitivity to answer the question it was re-frozen to ask.",
    next: "",
    closed: true,
    result: `run 4 · closed 8 Sep 2026 17:00 HST · ${SESSIONS.toLocaleString()} sessions · +0.6% (95% CI −2.2 to +3.4, p 0.71)`,
    metricLabel: "Reached the booking step",
    metricKey: BOOK_NOW,
    arms: [
      { arm: "Control", sub: "the rate calendar as it is today", sessions: "9,206", share: "50.0%", hits: "1,231", rate: "13.37%", vs: "—" },
      { arm: "Variation", sub: "best-price promise above the calendar", sessions: "9,206", share: "50.0%", hits: "1,238", rate: "13.45%", vs: "+0.6%" },
    ],
    armsNote: "This is not evidence that the promise does nothing. It is evidence that a run this size could not tell a +0.6% apart from nothing — a statement about the run, not about the change.",
    trace: [
      pass(SPLIT_OK), pass(FLOOR_OK), pass(METRIC_BOTH), pass(PREREG_OK), pass(GUARDRAILS_OK),
      fail("+0.6%, 95% CI −2.2 to +3.4, p 0.71 — the interval straddles zero"),
      pass(DIRECTION_OK),
      fail(`The brief was re-frozen to ≥ 1.2% on 3 Sep. 80% power at 1.2% needs 32,900 sessions; ${SESSIONS.toLocaleString()} ran — 56% of the way there.`),
      pass(DRIFT_OK),
    ],
    resolvedBy: "Gate 6 did not pass, and gate 8 says why. Beta 1 returns UNDERPOWERED rather than REFUTED whenever the run could not have detected the effect the brief asks for, because those two words send you to opposite decisions.",
    disclosures: [
      { kind: "Brief re-frozen after observation", when: "3 Sep 2026 16:05 HST · day 7 of 12", tone: "warn", body: "The smallest effect worth shipping was lowered from ≥ 2.0% to ≥ 1.2% a week into the run, with arm-level numbers already on screen. Every power figure below is computed against the re-frozen 1.2%, which is why a run that cleared its original floor still fails gate 8." },
    ],
    actions: [
      { label: "Extend run 4", do: { kind: "extend" } },
      { label: "Record: accept the null", variant: "outline", do: { kind: "decide", which: "accept_null" } },
    ],
  },

  invalid: {
    word: "Invalid",
    tone: "danger",
    means: "The run did not produce evidence. Not a null — no evidence at all.",
    next: `Discard run 4 and re-run from build ${BUILD} — a 54.6 / 45.4 split against a declared 50 / 50 means the two columns are not two versions of the same audience, so nothing computed on them can be attributed to the change.`,
    closed: true,
    result: `run 4 · closed 8 Sep 2026 17:00 HST · ${SESSIONS.toLocaleString()} sessions · split 54.6 / 45.4 · numbers not attributable`,
    metricLabel: "Reached the booking step",
    metricKey: BOOK_NOW,
    arms: [
      { arm: "Control", sub: "the rate calendar as it is today", sessions: "10,053", share: "54.6%", hits: "1,344", rate: "13.37%", vs: "—" },
      { arm: "Variation", sub: "best-price promise above the calendar", sessions: "8,359", share: "45.4%", hits: "1,168", rate: "13.97%", vs: "+4.5%" },
    ],
    armsNote: "The +4.5% is arithmetic, not evidence. Two arms that were never the same size were never the same audience either, and the difference between them is at least partly the allocation fault rather than the change. It is rendered because a number that exists and is withheld gets recovered from Optimizely without this sentence attached.",
    trace: [
      fail("10,053 / 8,359 — 54.6 / 45.4 against a declared 50 / 50. χ² p < 0.0001; a split this skewed arrives by chance about once in forty thousand runs."),
      unev("gate 1 failed. A session count you cannot attribute to an arm is not evidence of enough traffic."),
      unev("gate 1 failed. Whether a metric can adjudicate is a question about two comparable arms, and there are not two comparable arms."),
      pass("Revision 3 frozen 26 Aug 09:14 HST — this gate does not depend on the numbers, so it still resolves even here."),
      unev("gate 1 failed. A guardrail movement computed across a broken split is not a movement."),
      unev("gate 1 failed. Significance is never consulted on a run that failed validity — this is the ordering, and it is the reason CONFIRMED cannot be reached from here."),
      fail("up was declared 26 Aug 09:14, then changed to down on 4 Sep — eight days after traffic began, with arm-level numbers already on screen."),
      unev("gate 1 failed, and gate 7 no longer names a stable direction to compute power against."),
      pass(`Build ${BUILD} · no drift — the skewed split is an allocation fault, not a code fault, so the build is not what has to change.`),
    ],
    resolvedBy: "Gate 1. Everything computed on run 4 describes two populations that were never the same. Gate 7 would have voided the run independently, which is why it is still evaluated and shown rather than blanked.",
    disclosures: [
      { kind: "Direction flipped after traffic", when: "4 Sep 2026 08:30 HST · day 8 of 12", tone: "danger", body: "The declared direction was changed from up to down after arm-level numbers were visible. Whichever way the number had gone, the flipped direction would have made it a win — which is the definition of a result that cannot be trusted." },
      { kind: "Sample-ratio mismatch", when: "detected 29 Aug 2026 03:12 HST · day 2", tone: "danger", body: "The split alarm fired on day 2 and the run continued for ten more days. Ten days of traffic were spent on a run that could never have produced a verdict." },
    ],
    actions: [
      { label: "Discard run 4 and re-run", variant: "danger", do: { kind: "reset" } },
      { label: "Open the split detail", variant: "outline", do: { kind: "go", stage: "Run" } },
    ],
  },

  not_adjudicable: {
    word: "Not adjudicable",
    tone: "muted",
    means: "There was never a comparison here to adjudicate.",
    next: "Nominate a deciding number both versions can move, or instrument the old one — the trip-planner event only exists in the new build, so the control had no surface that could fire it and there is no contrast to judge.",
    closed: true,
    result: `run 4 · closed 8 Sep 2026 17:00 HST · ${SESSIONS.toLocaleString()} sessions · one arm only · no contrast`,
    metricLabel: "Trip planner opened",
    metricKey: TRIP_PLANNER,
    arms: [
      { arm: "Control", sub: "the rate calendar as it is today", sessions: "9,206", share: "50.0%", hits: "—", rate: "—", vs: "—" },
      { arm: "Variation", sub: "best-price promise above the calendar", sessions: "9,206", share: "50.0%", hits: "1,102", rate: "11.97%", vs: "—" },
    ],
    armsNote: "The control column is dashes rather than zeroes, and the difference matters: zero would mean guests were offered the trip planner and did not open it. There was nothing on the old page to open. A dash is the honest cell.",
    trace: [
      pass(SPLIT_OK), pass(FLOOR_OK),
      fail(`The deciding number is ${TRIP_PLANNER}, which only exists in the new version. The old page had no surface that could fire it, so there is a variation number and a dash, not a comparison.`),
      pass("Revision 3 frozen 26 Aug 09:14 HST, before traffic — the plan was pre-registered. It was pre-registered around a number only one version could ever move."),
      pass(GUARDRAILS_OK),
      unev("gate 3 failed. There is one arm's number and a dash; an interval needs two."),
      pass(DIRECTION_OK),
      unev("gate 3 failed. Power is computed against a difference worth detecting, and no difference is defined here."),
      pass(DRIFT_OK),
    ],
    resolvedBy: "Gate 3. This is neither a null nor a failure of the change — it is a measurement plan that could only ever have produced one number, and eighteen thousand sessions were spent proving it.",
    disclosures: [],
    actions: [
      { label: "Fix the measurement plan", do: { kind: "fix_plan" } },
      { label: "Copy the instrumentation ask", variant: "outline", do: { kind: "copy" } },
    ],
  },
};

const ORDER: Verdict[] = ["confirmed", "refuted", "guardrail_breach", "keep_running", "underpowered", "invalid", "not_adjudicable"];

const TONE: Record<Config["tone"], { word: string; frame: string; pill: "ok" | "warn" | "danger" | "muted" | "accent" }> = {
  ok: { word: "text-ok", frame: "border-ok/40 bg-ok/[0.05]", pill: "ok" },
  danger: { word: "text-danger", frame: "border-danger/40 bg-danger/[0.05]", pill: "danger" },
  warn: { word: "text-warn", frame: "border-warn/40 bg-warn/[0.05]", pill: "warn" },
  accent: { word: "text-accent", frame: "border-accent/40 bg-accent/[0.05]", pill: "accent" },
  muted: { word: "text-muted-2", frame: "border-border bg-surface-2/50", pill: "muted" },
};

/* ── Local primitives ──────────────────────────────────────────────── */

const Lock = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
    <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

/** Immutable. Anything inside this frame cannot be edited without a new run. */
const Receipt = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-1.5 rounded border border-border bg-surface-2/60 px-2 py-1 font-mono text-[11px] text-muted-2">
    <Lock />{children}
  </span>
);

/** On record but not sealed — a fact about the run, in the same hand as the open-run numbers. */
const Stamp = ({ children }: { children: React.ReactNode }) => (
  <span className="font-mono text-[11px] text-muted-2 bg-surface-2 rounded px-2 py-1">{children}</span>
);

const Mono = ({ children }: { children: React.ReactNode }) => (
  <span className="font-mono text-[11px] text-muted-2 bg-surface-2 rounded px-1.5 py-0.5">{children}</span>
);

const Label = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("text-[10.5px] font-semibold tracking-[0.07em] text-muted-2", className)}>{children}</div>
);

/** Three outcomes, three shapes — colour alone would not survive a printout. */
const Mark = ({ result }: { result: GateResult }) => {
  if (result === "pass") return (
    <span className="w-[18px] h-[18px] rounded-full bg-ok grid place-items-center shrink-0 mt-0.5">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" className="text-background"><path d="M20 6 9 17l-5-5" /></svg>
    </span>
  );
  if (result === "fail") return (
    <span className="w-[18px] h-[18px] rounded-full bg-danger grid place-items-center shrink-0 mt-0.5">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" className="text-background"><path d="M6 6l12 12M18 6 6 18" /></svg>
    </span>
  );
  return (
    <span className="w-[18px] h-[18px] rounded-full border border-dashed border-border-strong grid place-items-center shrink-0 mt-0.5">
      <span className="w-[7px] h-px bg-border-strong" />
    </span>
  );
};

const RESULT_PILL: Record<GateResult, { tone: "ok" | "danger" | "muted"; label: string }> = {
  pass: { tone: "ok", label: "pass" },
  fail: { tone: "danger", label: "fail" },
  unevaluated: { tone: "muted", label: "not evaluated" },
};

/* ── Pre-registration ──────────────────────────────────────────────── */

const TIMELINE = (closed: boolean) => [
  { at: "26 Aug 2026 09:14 HST", what: "Plan frozen — brief revision 3, build " + BUILD, delta: "—", frozen: true },
  { at: "27 Aug 2026 06:00 HST", what: "First guest saw the change", delta: `+ ${TO_TRAFFIC} after the freeze`, frozen: false },
  { at: "27 Aug 2026 14:22 HST", what: "First arm-level number existed", delta: `+ ${TO_NUMBERS} after the freeze`, frozen: false },
  closed
    ? { at: "8 Sep 2026 17:00 HST", what: `Run 4 closed — ${SESSIONS.toLocaleString()} sessions`, delta: `+ ${TO_CLOSE} after the freeze`, frozen: true }
    : { at: "Still open", what: `Run 4 is on day ${OPEN_DAYS} of 14 — ${OPEN_SESSIONS.toLocaleString()} sessions so far`, delta: "not frozen, and still moving", frozen: false },
];

function PreRegistration({ cfg }: { cfg: Config }) {
  return (
    <Section
      title="Pre-registration"
      action={<Pill tone="ok">Frozen {TO_NUMBERS} before the first number</Pill>}
    >
      <div className="px-5 py-3">
        <Meta k="Page" v={PAGE} mono />
        <Meta k="Brief" v={<Receipt>revision 3 · frozen 26 Aug 2026 09:14 HST</Receipt>} />
        <Meta k="Build" v={<Receipt>{BUILD} · this exact code is what ran</Receipt>} />
        <Meta k="Deciding" v={<span className="flex flex-wrap items-center gap-2">{cfg.metricLabel} <Mono>{cfg.metricKey}</Mono></span>} />
        <Meta k="Confirmed by" v="Malia K. · Approver — the plan, not the result" />
      </div>

      <div className="border-t border-border">
        {TIMELINE(cfg.closed).map((t) => (
          <div key={t.at} className="flex items-start gap-4 px-5 py-3 border-b border-border last:border-0">
            <span className="text-[12.5px] font-mono text-muted-2 w-[168px] shrink-0 tabular-nums">{t.at}</span>
            <span className="text-[13.5px] flex-1 min-w-0">{t.what}</span>
            {t.frozen ? <Receipt>{t.delta}</Receipt> : <span className="text-[12.5px] text-muted-2 tabular-nums">{t.delta}</span>}
          </div>
        ))}
      </div>

      <div className="px-5 py-4 border-t border-border">
        <p className="text-[13.5px] text-muted leading-relaxed max-w-3xl">
          The plan was frozen <span className="text-foreground font-medium tabular-nums">{TO_NUMBERS}</span> before the first
          arm-level number existed{cfg.closed && <> and <span className="text-foreground font-medium tabular-nums">{TO_CLOSE}</span> before the run closed</>}.
          That gap is the only thing separating a pre-registered plan from a story told after the fact, so it is computed from
          the timestamps above rather than asserted with a badge.
        </p>
      </div>
    </Section>
  );
}

/* ── Power projection — only reachable from UNDERPOWERED ───────────── */

function PowerProjection({ target, onPick }: { target: TargetId; onPick: (t: TargetId) => void }) {
  return (
    <Section
      title="What it would take"
      action={<span className="text-[12.5px] text-muted-2 tabular-nums">projected at {PER_DAY.toLocaleString()} sessions a day · {SESSIONS.toLocaleString()} already run</span>}
    >
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <Th first>Target effect</Th>
              <Th>Sessions needed</Th>
              <Th>Still short</Th>
              <Th>Days to get there</Th>
              <Th>What that means</Th>
            </tr>
          </thead>
          <tbody className="[&>tr:last-child>td]:border-0">
            {TARGETS.map((t) => {
              const short = shortBy(t.need);
              const days = daysFor(t.need);
              const reached = short === 0;
              const feasible = !reached && days <= KEEP_RUNNING_CEILING;
              const on = t.id === target;
              return (
                <tr key={t.id} onClick={() => onPick(t.id)} className={cn("border-b border-border cursor-pointer", on ? "bg-accent/[0.06]" : "hover:bg-surface-2/50")}>
                  <td className="px-4 pl-6 py-3.5 align-top">
                    <div className="text-[14px] font-medium tabular-nums">{t.effect}</div>
                    <div className="text-[12.5px] text-muted-2 mt-0.5 max-w-[240px] leading-snug">{t.label}</div>
                  </td>
                  <td className="px-4 py-3.5 align-top text-[13.5px] tabular-nums">{t.need.toLocaleString()}</td>
                  <td className="px-4 py-3.5 align-top text-[13.5px] tabular-nums">{reached ? "—" : short.toLocaleString()}</td>
                  <td className={cn("px-4 py-3.5 align-top text-[13.5px] tabular-nums font-medium", reached ? "text-muted-2" : feasible ? "text-ok" : "text-danger")}>
                    {reached ? "—" : `${days} more days`}
                  </td>
                  <td className="px-4 py-3.5 align-top">
                    {reached
                      ? <Pill tone="muted">already reached</Pill>
                      : feasible
                        ? <Pill tone="ok">keep running</Pill>
                        : <Pill tone="danger">accept the null or redesign</Pill>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-4 border-t border-border">
        <p className="text-[13.5px] text-muted leading-relaxed max-w-3xl">
          Anything over <span className="text-foreground font-medium tabular-nums">{KEEP_RUNNING_CEILING} days</span> stops being
          a run and becomes a standing change to the page. Past that line the honest options are to accept the null or to
          redesign the change so it moves the number further — not to wait.
        </p>
      </div>
    </Section>
  );
}

/* ── Disclosures ───────────────────────────────────────────────────── */

function Disclosures({ items }: { items: Disclosure[] }) {
  return (
    <Section title="Disclosures" action={<span className="text-[12.5px] text-muted-2 tabular-nums">{items.length} on this result</span>}>
      {items.length === 0 ? (
        <Empty
          title="Nothing to disclose"
          body="The brief, the deciding number and the declared direction on this result are the ones frozen on 26 Aug. None of them moved after a guest saw the page."
        />
      ) : (
        items.map((d) => (
          <div key={d.kind} className="flex items-start gap-4 px-5 py-3.5 border-b border-border last:border-0">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-[14px] font-medium">{d.kind}</span>
                <Pill tone={d.tone}>disclosed</Pill>
              </div>
              <p className="text-[13.5px] text-muted mt-1.5 leading-relaxed max-w-3xl">{d.body}</p>
            </div>
            <span className="text-[12px] font-mono text-muted-2 shrink-0 tabular-nums">{d.when}</span>
          </div>
        ))
      )}
    </Section>
  );
}

/* ── The panel ─────────────────────────────────────────────────────── */

/** What a confirm dialog shows. No `confirm` means the only way out is Close; a `confirm` with no `run` is a named door that is shut, with the reason above it. */
type Plan = { title: string; body: string; field?: React.ReactNode; confirm?: { label: string; variant: Variant; run?: () => void } };

export function VerdictPanel({ state, title = EXPERIMENT }: { state: Verdict; title?: string }) {
  const [target, setTarget] = useState<TargetId>("refrozen");
  const [ask, setAsk] = useState<Ask | null>(null);
  const [note, setNote] = useState("");
  const [pick, setPick] = useState<TargetId>("refrozen");
  const [busy, setBusy] = useState<{ for: Verdict; what: string; pct: number } | null>(null);
  /** Keyed by verdict: the picker swaps states under one panel, and a decision on one must not appear on another. */
  const [done, setDone] = useState<Partial<Record<Verdict, Done>>>({});
  const [copied, setCopied] = useState<"Copied" | "Could not copy" | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const later = (ms: number, fn: () => void) => { window.setTimeout(fn, ms); };

  const cfg = CONFIG[state];
  const tone = TONE[cfg.tone];
  const did = done[state];
  const exp = experimentNamed(title);
  /** The second-person rule: whoever wrote or built this cannot record its result. */
  // fake.ts owns the rule: owners are written short, ME long.
  const mine = exp ? authoredByMe(exp.owner) : false;
  const stop = cfg.actions.find((a) => a.do.kind === "stop");

  const nextStep = () => {
    if (did?.next) return did.next;
    if (state !== "underpowered") return cfg.next;
    const t = TARGETS.find((x) => x.id === target) ?? TARGETS[1];
    const short = shortBy(t.need);
    const days = daysFor(t.need);
    if (short === 0) {
      return `Nothing more to run at ${t.effect} — ${SESSIONS.toLocaleString()} sessions already cleared the ${t.need.toLocaleString()} that target needed, so the honest move is to record that the brief stopped asking this question on 3 Sep.`;
    }
    if (days <= KEEP_RUNNING_CEILING) {
      return `Keep run 4 open for ${days} more days — at ${PER_DAY.toLocaleString()} sessions a day, ${short.toLocaleString()} more sessions reaches 80% power for the ${t.effect} the brief was re-frozen to.`;
    }
    return `Do not wait for this one — confirming the ${t.effect} run 4 actually saw would take ${days} more days, well past ${KEEP_RUNNING_CEILING}, so accept the null or redesign the change to move the number further.`;
  };

  /* Going places. A stage lives inside an experiment: on the Decision panel one is open, but from the
   * picker none is — so the experiment this verdict belongs to opens first, and the stage follows once
   * its rail is listening. */
  const goStage = (stage: Stage) => {
    if (exp) go({ expId: exp.id });
    later(exp ? 80 : 0, () => go({ stage }));
  };
  /* On the Decision panel the readout is the next thing on the page, so this scrolls to it. In the
   * picker nothing follows the panel, so the experiment opens on Decision, where its readout is. */
  const openReadout = () => {
    const next = root.current?.nextElementSibling;
    if (next) next.scrollIntoView({ behavior: "smooth", block: "start" });
    else goStage("Decision");
  };
  const copyAsk = () => {
    void navigator.clipboard.writeText(INSTRUMENTATION_ASK)
      .then(() => { setCopied("Copied"); logActivity("Copied the instrumentation ask for run 4."); })
      .catch(() => setCopied("Could not copy"))
      .finally(() => later(1500, () => setCopied(null)));
  };

  /* Where the product would call something, the mock walks a bar to full and then says what is now true. */
  const simulate = (what: string, then: () => void) => {
    const at = state;
    setBusy({ for: at, what, pct: 8 });
    ([[350, 42], [750, 78], [1100, 100]] as const).forEach(([ms, pct]) => later(ms, () => setBusy({ for: at, what, pct })));
    later(1450, () => { setBusy(null); then(); });
  };
  const finish = (d: Done) => setDone((prev) => ({ ...prev, [state]: d }));
  /** One sentence, one full stop — a note that arrives with its own is not given a second. */
  const withNote = (line: string) => { const n = note.trim().replace(/[.\s]+$/, ""); return `${line}${n ? ` — ${n}` : ""}.`; };

  const act = (a: Action) => {
    const d = a.do;
    if (d.kind === "readout") openReadout();
    else if (d.kind === "go") goStage(d.stage);
    else if (d.kind === "copy") copyAsk();
    else { setNote(""); setPick(target); setAsk(d); }
  };

  const noteField = (label: string, hint: string) => (
    <div className="grid gap-2">
      <FieldLabel htmlFor="verdict-note">{label}</FieldLabel>
      <Textarea id="verdict-note" value={note} onChange={(ev) => setNote(ev.target.value)} placeholder={hint} />
    </div>
  );

  const plan = (d: Ask): Plan => {
    switch (d.kind) {
      case "decide": {
        const t = DECISIONS[d.which];
        if (mine) {
          return { title: t.title, body: "You wrote this experiment, and whoever wrote or built an experiment cannot record its result. Prism holds that rule so nobody has to remember it. Ask another approver to record the decision." };
        }
        return {
          title: t.title, body: t.body,
          field: noteField("A note for the readout (optional)", "Why this is the right call, in a sentence."),
          confirm: { label: t.confirm, variant: t.variant, run: () => simulate(t.busy, () => {
            finish({ kind: "decided", line: `Recorded by you · ${TODAY} · sealed`, sub: t.sub, head: `run 4 decided ${TODAY}`, next: t.next });
            logActivity(withNote(`Recorded the decision on ${title} — ${t.logged}`));
          }) },
        };
      }
      case "roll_off":
        return {
          title: `Roll build ${BUILD} off the page now`,
          body: `Every guest sees the rate calendar without the promise, right away. Run 4 stays on file with the verdict Guardrail breach — the +2.4% is kept, and vetoed by gate 5. Taking a change off the page is a safety action: anyone can do it, and it needs no second person.`,
          confirm: { label: `Roll ${BUILD} off now`, variant: "danger", run: () => simulate(`Taking ${BUILD} off the page…`, () => {
            finish({
              kind: "rolled", line: `Rolled off by you · ${TODAY}`, head: `run 4 closed · ${BUILD} off the page`,
              sub: `Build ${BUILD} is off the page for every guest. Run 4 keeps its verdict and its numbers.`,
              next: `Build ${BUILD} is off the page. Run 4 stays on file with its verdict and the +2.4% it is not allowed to claim.`,
            });
            logActivity(`Rolled build ${BUILD} off the page after a guardrail breach on ${title}.`);
          }) },
        };
      case "leave":
        return {
          title: "Leave run 4 running",
          body: `Nothing changes on the page. Run 4 keeps collecting at about ${OPEN_PER_DAY.toLocaleString()} sessions a day and reaches its floor of ${FLOOR.toLocaleString()} in about ${OPEN_DAYS_LEFT} days, inside the fourteen-day window. What goes on record is that you read the mid-flight +2.8% today and did not act on it — the honest thing to have on file when the run closes.`,
          confirm: { label: "Leave it running", variant: "default", run: () => {
            finish({ kind: "left", line: `Left running by you · ${TODAY} · the floor arrives in about ${OPEN_DAYS_LEFT} days` });
            logActivity(`Looked at run 4 on day ${OPEN_DAYS} and left it running to its floor.`);
          } },
        };
      case "stop":
        return {
          title: "Stop run 4",
          body: `Build ${BUILD} comes off the page for every guest. The ${OPEN_SESSIONS.toLocaleString()} sessions so far stay on file, but no verdict is written — a run stopped at ${OPEN_PCT}% of its floor cannot be read, and Prism will not pretend otherwise. Anyone can stop a run; it never needs a second person.`,
          field: noteField("Why you are stopping it (optional)", "Goes on the run's record, next to your name."),
          confirm: { label: "Stop this run", variant: "danger", run: () => simulate(`Taking ${BUILD} off the page…`, () => {
            finish({
              kind: "stopped", line: `Stopped by you · ${TODAY}`, head: `run 4 stopped ${TODAY}`,
              sub: withNote(`Build ${BUILD} is off the page. Run 4 is on file, unread`),
              next: `Nothing — run 4 is stopped and its ${OPEN_SESSIONS.toLocaleString()} sessions stay on file, unread. Trying the promise again is a new run.`,
            });
            logActivity(withNote(`Stopped run 4 on day ${OPEN_DAYS} of 14`));
          }) },
        };
      case "extend": {
        const p = extension(pick);
        return {
          title: "Extend run 4",
          body: p.body,
          field: (
            <div className="grid gap-2.5">
              <div id="extend-target" className="text-[13px] font-semibold text-muted">Which effect are you still trying to confirm?</div>
              <RadioGroup value={pick} aria-labelledby="extend-target"
                onValueChange={(v) => { const t = TARGETS.find((x) => x.id === v); if (t) setPick(t.id); }}>
                {TARGETS.map((t) => {
                  const short = shortBy(t.need);
                  return (
                    <FieldLabel key={t.id} htmlFor={`extend-${t.id}`} className="items-start font-normal text-foreground cursor-pointer">
                      <RadioGroupItem value={t.id} id={`extend-${t.id}`} className="mt-0.5" />
                      <span className="min-w-0 leading-snug">
                        <span className="font-medium tabular-nums">{t.effect}</span>
                        <span className="text-muted-2"> — {t.label}</span>
                        <span className="block text-[12.5px] text-muted-2 tabular-nums mt-0.5">
                          {short === 0 ? "already reached" : `${short.toLocaleString()} more sessions · ${daysFor(t.need)} more days`}
                        </span>
                      </span>
                    </FieldLabel>
                  );
                })}
              </RadioGroup>
            </div>
          ),
          confirm: {
            label: p.ok ? `Extend to day ${p.day}` : "Extend run 4", variant: "default",
            run: p.ok ? () => { setTarget(pick); simulate("Reopening run 4…", () => {
              finish({
                kind: "extended", line: `Extended to day ${p.day} by you · ${TODAY}`, head: `run 4 reopened · to day ${p.day}`,
                sub: `Run 4 is open again on build ${BUILD} — ${p.short.toLocaleString()} more sessions to reach 80% power at ${p.effect}. The verdict is derived again when the floor is reached.`,
                next: `Leave run 4 alone until day ${p.day} — ${p.short.toLocaleString()} more sessions reach 80% power at ${p.effect}, and the verdict is derived again when they arrive.`,
              });
              logActivity(`Extended run 4 to day ${p.day} to reach 80% power at ${p.effect}.`);
            }); } : undefined,
          },
        };
      }
      case "reset":
        return {
          title: "Discard run 4 and re-run",
          body: `Run 4 stays on file as Invalid — its ${SESSIONS.toLocaleString()} sessions are never read as evidence. Prism asks Optimizely, through the connection you set up, for a fresh 50 / 50 allocation on build ${BUILD}, and the next run does not open until the split Prism sees is 50 / 50 for real.`,
          confirm: { label: "Discard and re-run", variant: "danger", run: () => simulate("Asking Optimizely for a fresh allocation…", () => {
            finish({
              kind: "reset", line: "Split reset requested · the run restarts when it is 50/50", head: "run 4 discarded · split reset requested",
              sub: `Requested by you · ${TODAY}. Run 4 is on file as Invalid; nothing computed on it will be read.`,
              next: `Wait for the split — the next run opens on build ${BUILD} once the allocation Prism sees is 50 / 50, and not before.`,
            });
            logActivity(`Discarded run 4 on ${title} as invalid and asked for a split reset before it re-runs.`);
          }) },
        };
      case "fix_plan":
        return {
          title: "Fix the measurement plan",
          body: `Opens the brief for a new revision, so you can nominate a deciding number both versions can move — ${BOOK_NOW} fires in both today — or keep the trip-planner event and have the old page instrumented to fire it; the ask for that is on the button beside this one. Revision 3 stays frozen with run 4. A new plan means a new run.`,
          confirm: { label: "Open the brief", variant: "default", run: () => {
            logActivity(`Opened the brief to fix the measurement plan after run 4 on ${title} was not adjudicable.`);
            goStage("Brief");
          } },
        };
    }
  };

  const q = ask ? plan(ask) : null;
  const confirm = q?.confirm;

  return (
    <div ref={root} className="space-y-4">
      <Section title="Verdict" action={<Pill tone={tone.pill}>{did?.head ?? (cfg.closed ? "run 4 closed 8 Sep 2026" : `run 4 open · day ${OPEN_DAYS} of 14`)}</Pill>}>
        <div className="px-5 py-5 border-b border-border">
          <Label>{title.toUpperCase()}</Label>
          <div className={cn("text-[30px] font-semibold tracking-[-0.02em] leading-none mt-2.5", tone.word)}>{cfg.word}</div>
          <p className="text-[14.5px] text-muted mt-2.5 leading-relaxed max-w-2xl">{cfg.means}</p>

          <div className="mt-4">
            {cfg.closed
              ? <Receipt>{cfg.result} · frozen with the verdict</Receipt>
              : (
                <div className="flex flex-wrap items-center gap-2.5">
                  <Stamp>{cfg.result}</Stamp>
                  <span className="text-[12.5px] text-warn">
                    {did?.kind === "stopped"
                      ? "stopped — these numbers will not move again, and they were never read as a result"
                      : "not frozen — this run is still open and these numbers still move"}
                  </span>
                </div>
              )}
          </div>
        </div>

        <div className={cn("px-5 py-4 border-b border-border border-l-[3px]", tone.frame)}>
          <Label>DO THIS NEXT</Label>
          <p className="text-[15px] mt-1.5 leading-relaxed max-w-3xl">{nextStep()}</p>
          {state === "underpowered" && !did && (
            <p className="text-[12.5px] text-muted-2 mt-2">
              Derived from the target selected in <span className="text-foreground">What it would take</span>, below — the same run
              recommends opposite things depending on which effect you are still trying to confirm.
            </p>
          )}
        </div>

        <div className="px-5 py-4">
          {busy?.for === state ? (
            <div className="max-w-md">
              <div className="text-[13px] text-muted mb-2">{busy.what}</div>
              <Progress value={busy.pct} />
            </div>
          ) : did ? (
            <div className="flex flex-wrap items-start gap-2.5">
              <div className="min-w-0 flex-1">
                {did.kind === "decided" ? <Receipt>{did.line}</Receipt> : <Stamp>{did.line}</Stamp>}
                {did.sub && <p className="text-[13px] text-muted mt-2 leading-relaxed max-w-2xl">{did.sub}</p>}
              </div>
              {/* Leaving a run alone does not take the brake away. */}
              {did.kind === "left" && stop && <Button size="sm" variant={stop.variant} onClick={() => act(stop)}>{stop.label}</Button>}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2.5">
              {cfg.actions.map((a) => (
                <Button key={a.label} size="sm" variant={a.variant} onClick={() => act(a)}>
                  {a.do.kind === "copy" && copied ? copied : a.label}
                </Button>
              ))}
              <span className="text-[12.5px] text-muted-2 ml-auto">
                Recording a decision cannot be done by whoever wrote or built this. Stopping a run can, by anyone.
              </span>
            </div>
          )}
        </div>
      </Section>

      <Section
        title="The numbers this verdict is computed from"
        action={<span className="text-[12.5px] text-muted-2">{cfg.metricLabel} · <Mono>{cfg.metricKey}</Mono></span>}
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <Th first>Arm</Th>
                <Th>Sessions</Th>
                <Th>Share of traffic</Th>
                <Th>{cfg.metricLabel}</Th>
                <Th>Rate</Th>
                <Th>vs control</Th>
              </tr>
            </thead>
            <tbody className="[&>tr:last-child>td]:border-0">
              {cfg.arms.map((a) => (
                <tr key={a.arm} className="border-b border-border">
                  <td className="px-4 pl-6 py-3.5 align-top">
                    <div className="text-[14px] font-medium">{a.arm}</div>
                    <div className="text-[12.5px] text-muted-2 mt-0.5">{a.sub}</div>
                  </td>
                  <td className="px-4 py-3.5 align-top text-[13.5px] tabular-nums">{a.sessions}</td>
                  <td className="px-4 py-3.5 align-top text-[13.5px] tabular-nums">{a.share}</td>
                  <td className="px-4 py-3.5 align-top text-[13.5px] tabular-nums">{a.hits}</td>
                  <td className="px-4 py-3.5 align-top text-[13.5px] tabular-nums">{a.rate}</td>
                  <td className={cn("px-4 py-3.5 align-top text-[13.5px] tabular-nums font-medium",
                    a.tone === "ok" ? "text-ok" : a.tone === "danger" ? "text-danger" : "text-muted-2")}>{a.vs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-4 border-t border-border">
          <p className="text-[13.5px] text-muted leading-relaxed max-w-3xl">{cfg.armsNote}</p>
        </div>
      </Section>

      <GateTrace trace={cfg.trace} resolvedBy={cfg.resolvedBy} />

      {state === "underpowered" && <PowerProjection target={target} onPick={setTarget} />}

      <PreRegistration cfg={cfg} />
      <Disclosures items={cfg.disclosures} />

      {/* One dialog for every consequential click. It names exactly what will happen, then either does it or says why it cannot. */}
      <Dialog open={q !== null} onOpenChange={(o) => { if (!o) setAsk(null); }}>
        {q && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{q.title}</DialogTitle>
              <DialogDescription>{q.body}</DialogDescription>
            </DialogHeader>
            {q.field}
            <DialogFooter>
              <Button variant="outline" onClick={() => setAsk(null)}>{confirm ? "Cancel" : "Close"}</Button>
              {confirm && (
                <Button variant={confirm.variant} disabled={!confirm.run} onClick={() => { const run = confirm.run; setAsk(null); if (run) run(); }}>
                  {confirm.label}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

/** The trace and the sentence naming the gate that produced the word are one
 *  object. Split them and somebody eventually renders a trace with no
 *  resolution under it — nine rows and no answer. */
function GateTrace({ trace, resolvedBy }: { trace: Outcome[]; resolvedBy: string }) {
  const passed = trace.filter((o) => o.result === "pass").length;
  const failed = trace.filter((o) => o.result === "fail").length;
  const blocked = trace.filter((o) => o.result === "unevaluated").length;

  return (
    <Section title="The gate trace — nine gates, in order"
      action={
        <span className="text-[12.5px] tabular-nums">
          <span className="text-ok font-medium">{passed} passed</span>
          <span className="text-muted-2"> · </span>
          <span className={cn(failed ? "text-danger font-medium" : "text-muted-2")}>{failed} failed</span>
          <span className="text-muted-2"> · {blocked} could not be evaluated</span>
        </span>
      }>
      {GATES.map((g, i) => {
        const o = trace[i];
        const newBand = i === 0 || GATES[i - 1].band !== g.band;
        const r = RESULT_PILL[o.result];
        return (
          <div key={g.n}>
            {newBand && (
              <div className="px-5 py-2.5 bg-surface-2/60 border-b border-border">
                <Label>{BAND_LABEL[g.band]}</Label>
                <p className="text-[12.5px] text-muted-2 mt-1 leading-relaxed max-w-3xl">{BAND_NOTE[g.band]}</p>
              </div>
            )}
            <div className={cn(
              "flex items-start gap-3 px-5 py-3.5 border-b border-border",
              o.result === "fail" && "bg-danger/[0.04]",
              o.result === "unevaluated" && "bg-surface-2/30",
            )}>
              <span className="text-[12px] tabular-nums text-muted-2 w-3 shrink-0 pt-1">{g.n}</span>
              <Mark result={o.result} />
              <div className="flex-1 min-w-0">
                <div className={cn("text-[14px] font-medium", o.result === "unevaluated" && "text-muted")}>{g.name}</div>
                <div className="text-[12.5px] text-muted-2 mt-0.5">{g.sub}</div>

                {o.result === "unevaluated" ? (
                  <div className="mt-2 border-l-2 border-dashed border-border-strong pl-3">
                    <Label>COULD NOT BE EVALUATED</Label>
                    <p className="text-[13.5px] text-muted mt-1 leading-relaxed max-w-3xl">{o.blockedBy}</p>
                  </div>
                ) : (
                  <p className={cn("text-[13.5px] mt-1.5 leading-relaxed max-w-3xl", o.result === "fail" ? "text-danger" : "text-muted")}>{o.saw}</p>
                )}

                {typeof o.pct === "number" && (
                  <div className="flex items-center gap-2.5 mt-2">
                    <div className="h-1.5 w-40 rounded-full bg-surface-2 overflow-hidden">
                      <div className="h-full bg-accent" style={{ width: `${o.pct}%` }} />
                    </div>
                    <span className="text-[12.5px] text-muted-2 tabular-nums">{o.pct}% of the floor it needs</span>
                  </div>
                )}
              </div>
              <Pill tone={r.tone}>{r.label}</Pill>
            </div>
          </div>
        );
      })}

      <div className="px-5 py-4 bg-surface-2/40">
        <Label>RESOLVED BY</Label>
        <p className="text-[14px] mt-1.5 leading-relaxed max-w-3xl">{resolvedBy}</p>
      </div>
    </Section>
  );
}

/* ── The picker — mock only. Beta 1 derives the state; nothing here is a
 *    control, and the toolbar says so rather than implying seven buttons a
 *    user would ever get to press. ────────────────────────────────────── */

export function VerdictPicker() {
  const [state, setState] = useState<Verdict>("confirmed");
  /* The readout is a document on the experiment's Decision stage, not a view of this room —
   * so the button opens that experiment, which lands on Decision, where the readout is. */
  const openReadout = () => { const e = experimentNamed(EXPERIMENT); go(e ? { expId: e.id } : { nav: "Readouts" }); };
  return (
    <div className="flex flex-col h-full bg-background">
      <PageHeader
        title="Run 4 — the verdict"
        count={EXPERIMENT}
        actions={<Button size="sm" variant="outline" onClick={openReadout}>Open the readout</Button>}
      />
      <Toolbar>
        <Label className="mr-1">DERIVED STATE</Label>
        {ORDER.map((v) => (
          <Chip key={v} on={state === v} onClick={() => setState(v)}>{CONFIG[v].word}</Chip>
        ))}
        <span className="text-[12.5px] text-muted-2 ml-auto">
          Mock switch. Beta 1 derives one of these seven from the trace below — it is never chosen.
        </span>
      </Toolbar>
      <div className="flex-1 overflow-y-auto p-6">
        <VerdictPanel state={state} />
      </div>
    </div>
  );
}
