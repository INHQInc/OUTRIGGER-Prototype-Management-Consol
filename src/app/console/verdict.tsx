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
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";
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

const SPLIT_OK = "9,206 / 9,206 — 50.0 / 50.0 against a declared 50 / 50, χ² p 0.98";
const FLOOR_OK = `${SESSIONS.toLocaleString()} sessions against a floor of ${FLOOR.toLocaleString()}`;
const METRIC_BOTH = "24138040550_book_now_button_clicks fires in both versions";
const PREREG_OK = `Revision 3 frozen 26 Aug 09:14 HST — ${TO_TRAFFIC} before the first guest saw it`;
const GUARDRAILS_OK = "Both holding — Reached the offers page +0.4%, Hero engagement +1.1%";
const DIRECTION_OK = "up declared 26 Aug 09:14, before any number existed";
const POWER_OK = `80% power at ≥ 2.0% needed ${FLOOR.toLocaleString()} sessions; ${SESSIONS.toLocaleString()} ran`;
const DRIFT_OK = `Build ${BUILD} is the build the brief describes — no drift`;

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
  actions: { label: string; variant?: "default" | "outline" | "danger" }[];
};

const BOOK_NOW = "24138040550_book_now_button_clicks";

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
    actions: [{ label: "Record: ship it" }, { label: "Open the readout", variant: "outline" }],
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
    actions: [{ label: `Roll build ${BUILD} off the page`, variant: "danger" }, { label: "Open the readout", variant: "outline" }],
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
    actions: [{ label: `Roll build ${BUILD} off the page`, variant: "danger" }, { label: "Open the guardrail detail", variant: "outline" }],
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
    actions: [{ label: "Leave it running", variant: "outline" }, { label: "Stop this run", variant: "danger" }],
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
    actions: [{ label: "Extend run 4" }, { label: "Record: accept the null", variant: "outline" }],
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
    actions: [{ label: "Discard run 4 and re-run", variant: "danger" }, { label: "Open the split detail", variant: "outline" }],
  },

  not_adjudicable: {
    word: "Not adjudicable",
    tone: "muted",
    means: "There was never a comparison here to adjudicate.",
    next: "Nominate a deciding number both versions can move, or instrument the old one — the trip-planner event only exists in the new build, so the control had no surface that could fire it and there is no contrast to judge.",
    closed: true,
    result: `run 4 · closed 8 Sep 2026 17:00 HST · ${SESSIONS.toLocaleString()} sessions · one arm only · no contrast`,
    metricLabel: "Trip planner opened",
    metricKey: "24138040550_opmc__trip_planner_cta_target",
    arms: [
      { arm: "Control", sub: "the rate calendar as it is today", sessions: "9,206", share: "50.0%", hits: "—", rate: "—", vs: "—" },
      { arm: "Variation", sub: "best-price promise above the calendar", sessions: "9,206", share: "50.0%", hits: "1,102", rate: "11.97%", vs: "—" },
    ],
    armsNote: "The control column is dashes rather than zeroes, and the difference matters: zero would mean guests were offered the trip planner and did not open it. There was nothing on the old page to open. A dash is the honest cell.",
    trace: [
      pass(SPLIT_OK), pass(FLOOR_OK),
      fail("The deciding number is 24138040550_opmc__trip_planner_cta_target, which only exists in the new version. The old page had no surface that could fire it, so there is a variation number and a dash, not a comparison."),
      pass("Revision 3 frozen 26 Aug 09:14 HST, before traffic — the plan was pre-registered. It was pre-registered around a number only one version could ever move."),
      pass(GUARDRAILS_OK),
      unev("gate 3 failed. There is one arm's number and a dash; an interval needs two."),
      pass(DIRECTION_OK),
      unev("gate 3 failed. Power is computed against a difference worth detecting, and no difference is defined here."),
      pass(DRIFT_OK),
    ],
    resolvedBy: "Gate 3. This is neither a null nor a failure of the change — it is a measurement plan that could only ever have produced one number, and eighteen thousand sessions were spent proving it.",
    disclosures: [],
    actions: [{ label: "Fix the measurement plan" }, { label: "Copy the instrumentation ask", variant: "outline" }],
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

export function VerdictPanel({ state }: { state: Verdict }) {
  const [target, setTarget] = useState<TargetId>("refrozen");
  const cfg = CONFIG[state];
  const tone = TONE[cfg.tone];

  const nextStep = () => {
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

  return (
    <div className="space-y-4">
      <Section title="Verdict" action={<Pill tone={tone.pill}>{cfg.closed ? "run 4 closed 8 Sep 2026" : `run 4 open · day ${OPEN_DAYS} of 14`}</Pill>}>
        <div className="px-5 py-5 border-b border-border">
          <Label>{EXPERIMENT.toUpperCase()}</Label>
          <div className={cn("text-[30px] font-semibold tracking-[-0.02em] leading-none mt-2.5", tone.word)}>{cfg.word}</div>
          <p className="text-[14.5px] text-muted mt-2.5 leading-relaxed max-w-2xl">{cfg.means}</p>

          <div className="mt-4">
            {cfg.closed
              ? <Receipt>{cfg.result} · frozen with the verdict</Receipt>
              : (
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="font-mono text-[11px] text-muted-2 bg-surface-2 rounded px-2 py-1">{cfg.result}</span>
                  <span className="text-[12.5px] text-warn">not frozen — this run is still open and these numbers still move</span>
                </div>
              )}
          </div>
        </div>

        <div className={cn("px-5 py-4 border-b border-border border-l-[3px]", tone.frame)}>
          <Label>DO THIS NEXT</Label>
          <p className="text-[15px] mt-1.5 leading-relaxed max-w-3xl">{nextStep()}</p>
          {state === "underpowered" && (
            <p className="text-[12.5px] text-muted-2 mt-2">
              Derived from the target selected in <span className="text-foreground">What it would take</span>, below — the same run
              recommends opposite things depending on which effect you are still trying to confirm.
            </p>
          )}
        </div>

        <div className="px-5 py-4 flex flex-wrap items-center gap-2.5">
          {cfg.actions.map((a) => <Button key={a.label} size="sm" variant={a.variant}>{a.label}</Button>)}
          <span className="text-[12.5px] text-muted-2 ml-auto">
            Recording a decision cannot be done by whoever wrote or built this. Stopping a run can, by anyone.
          </span>
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
  return (
    <div className="flex flex-col h-full bg-background">
      <PageHeader
        title="Run 4 — the verdict"
        count={EXPERIMENT}
        actions={<Button size="sm" variant="outline">Open the readout</Button>}
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
