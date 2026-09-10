"use client";

/**
 * THE SKILL LIBRARY — the instructions Claude is actually running.
 *
 * Two kinds of instruction live here and they must never look alike:
 *
 *  · A BRANCH skill is context for the BUILDING AGENT. Every enabled one is
 *    assembled into the agent's prompt, most specific last. Getting one wrong
 *    produces a worse variation — and a person reviews the variation before a
 *    guest ever sees it, so the blast radius ends at review.
 *  · A CONSOLE skill IS one of Prism's own prompts — the brief author, the
 *    measurement planner, the analyst that writes the readout. Exactly one wins
 *    per call site, nothing is merged, and THERE IS NO REVIEW STEP: the next
 *    brief anybody writes uses it. Editing one changes how the product behaves.
 *
 * So console skills carry an accent rail and say out loud what they change.
 * Branch skills are quiet. That asymmetry is the point of the screen.
 *
 * Three tiers resolve most-specific-first — this experiment, then Outrigger,
 * then Prism's built-ins — and beneath all three sits something that is not a
 * skill at all: every call site has a fallback prompt compiled into the code.
 * That floor is why a skill that will not parse DEGRADES a feature instead of
 * breaking it, and it renders as a locked receipt because nobody can edit it.
 *
 * EDITING A BUILT-IN FORKS IT. The built-in is immutable; the fork is yours,
 * lands in your tier, and shadows its parent from that moment on.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";
import { Pill, Section, Meta, Th, PageHeader, Toolbar, Chip, Empty } from "./ui";

/* ── Fixtures ──────────────────────────────────────────────────────── */

const RUN = {
  experiment: "Rate-calendar best-price promise",
  page: "outrigger.com/hawaii/oahu/outrigger-reef-waikiki-beach-resort",
  build: "8c1d7e2",
  brief: "revision 3 · frozen 26 Aug 2026 09:14",
  lift: "+2.4% (95% CI +0.3 to +4.5, p 0.031)",
  closed: "run 4 · closed 8 Sep 2026 · 18,412 sessions",
};

const NOW = "10 Sep 2026 09:58";

type Tier = "global" | "customer" | "experiment";
type Delivery = "branch" | "console";
type Origin = "built-in" | "forked" | "yours";
type Capability = "write-brief" | "plan-measurement" | "write-readout" | "write-qa" | "build";

type Skill = {
  id: string;
  tier: Tier;
  delivery: Delivery;
  origin: Origin;
  capability: Capability;
  version: string;
  summary: string;
  updated: string;
  bytes: number;
  enabled: boolean;
  /** Immutable provenance. Present on anything nobody may quietly rewrite. */
  receipt?: string;
  forkedFrom?: string;
  /** A skill that never parsed. It is skipped, not obeyed halfway. */
  broken?: string;
  brokenLine?: number;
  body: string[];
};

const SKILLS: Skill[] = [
  /* ── Prism's built-ins ─────────────────────────────────────────── */
  {
    id: "prism/brief-author",
    tier: "global", delivery: "console", origin: "built-in", capability: "write-brief",
    version: "2.4.1", bytes: 3180, enabled: true, updated: "shipped with Prism 6.2",
    receipt: "built-in · v2.4.1 · read-only",
    summary: "Turns what a person typed into a brief that names a page, a change, one decision metric and a direction.",
    body: [
      "---",
      "name: prism/brief-author",
      "tier: global",
      "delivery: console",
      "version: 2.4.1",
      "call-sites: [brief.write]",
      "---",
      "",
      "# Writing the brief",
      "",
      "You are turning what a person typed into a brief someone else can be held",
      "to. A brief is complete only when it names a page, a change, one decision",
      "metric and a direction. Anything missing is asked for — never inferred,",
      "never filled in with a plausible default.",
      "",
      "## Open in their words",
      "",
      "The first line of the brief is the sentence the person actually wrote,",
      "unedited. They will be judged against this document; if they cannot",
      "recognise their own idea in it, freezing it means nothing.",
      "",
      "## Exactly one decision metric",
      "",
      "If they named three, ask which one decides it and record the other two as",
      "supporting. Never average them into an index — an index has no direction",
      "anybody agreed to.",
      "",
      "## Never write the expected result as a number",
      "",
      "\"More guests reach the booking step\" is a hypothesis. \"+3%\" is a forecast,",
      "and a forecast on a frozen brief reads as a promise the run then breaks.",
    ],
  },
  {
    id: "prism/measurement-planner",
    tier: "global", delivery: "console", origin: "built-in", capability: "plan-measurement",
    version: "3.1.0", bytes: 4420, enabled: true, updated: "shipped with Prism 6.2",
    receipt: "built-in · v3.1.0 · read-only",
    summary: "Generic plan-writer: binds only what an experiment reports, and asks rather than guesses at a name collision.",
    body: [
      "---",
      "name: prism/measurement-planner",
      "tier: global",
      "delivery: console",
      "version: 3.1.0",
      "call-sites: [brief.measurement-plan]",
      "---",
      "",
      "# Planning measurement",
      "",
      "Bind only events THIS experiment reports. An event that exists in the",
      "project but is not attached to the experiment yields a metric that reads",
      "as a dash for the whole run, while the tool's own primary reports fine —",
      "which looks like a broken test rather than a wrong plan.",
      "",
      "Ask, rather than guess, when two events share a display name. Being more",
      "confident does not resolve a naming collision; only the customer does.",
      "",
      "Every plan names what nobody measures yet. A gap left out of the plan",
      "becomes a gap in the readout that nobody notices.",
    ],
  },
  {
    id: "prism/experiment-analyst",
    tier: "global", delivery: "console", origin: "built-in", capability: "write-readout",
    version: "2.2.0", bytes: 3960, enabled: true, updated: "shipped with Prism 6.2",
    receipt: "built-in · v2.2.0 · read-only",
    summary: "Writes the readout and the daily note. Generic vocabulary — it calls the last step of any funnel a conversion.",
    body: [
      "---",
      "name: prism/experiment-analyst",
      "tier: global",
      "delivery: console",
      "version: 2.2.0",
      "call-sites: [decision.readout, run.digest]",
      "---",
      "",
      "# Writing the readout",
      "",
      "Lead with the decision metric and its interval, in that order. Never a",
      "point estimate on its own. Name the pre-registered brief revision by",
      "number so a reader can tell the result was not chosen after the fact.",
      "",
      "Never call a result significant without the interval beside it. Never",
      "describe a guardrail as fine when it moved — say by how much.",
      "",
      "If the run stopped early, say so in the first sentence.",
      "",
      "## Vocabulary",
      "",
      "Where the customer has no more specific word for the last step of the",
      "funnel, call it a conversion.",
    ],
  },
  {
    id: "prism/qa-scenarios",
    tier: "global", delivery: "console", origin: "built-in", capability: "write-qa",
    version: "2.1.0", bytes: 2870, enabled: true, updated: "shipped with Prism 6.2",
    receipt: "built-in · v2.1.0 · read-only",
    summary: "Reads the brief for what it implies a guest can do, reads the build for what it handles, and reports the difference.",
    body: [
      "---",
      "name: prism/qa-scenarios",
      "tier: global",
      "delivery: console",
      "version: 2.1.0",
      "call-sites: [qa.scenarios]",
      "---",
      "",
      "# Generating scenarios",
      "",
      "Read the brief for everything it implies a guest can do. Read the compiled",
      "file for what it actually handles. THE HEADLINE IS THE DIFFERENCE.",
      "",
      "A covered scenario is a quiet line. A gap is loud, and cites the evidence",
      "in the build — the missing listener, the fixed width, the absent aria.",
      "",
      "A combination nobody tried is written out as \"never tried\". It is a",
      "finding, not whitespace.",
    ],
  },
  {
    id: "prism/variation-builder",
    tier: "global", delivery: "branch", origin: "built-in", capability: "build",
    version: "4.0.2", bytes: 6140, enabled: true, updated: "shipped with Prism 6.2",
    receipt: "built-in · v4.0.2 · read-only",
    summary: "How the building agent writes a self-contained variation.js: no framework, no network at load, no globals.",
    body: [
      "---",
      "name: prism/variation-builder",
      "tier: global",
      "delivery: branch",
      "version: 4.0.2",
      "---",
      "",
      "# Building a variation",
      "",
      "One file. No bundler, no framework, no dependency the page does not",
      "already serve. Everything is namespaced under .opmc- so removing the",
      "experiment removes every trace of it.",
      "",
      "Never block first paint. Never write to window. Never assume the element",
      "you are attaching to exists yet — the page may still be hydrating.",
      "",
      "Restore whatever you changed. If you set body overflow, the same close()",
      "path that both the button and the backdrop call restores it.",
    ],
  },
  {
    id: "prism/change-safety",
    tier: "global", delivery: "branch", origin: "built-in", capability: "build",
    version: "1.6.0", bytes: 2380, enabled: true, updated: "shipped with Prism 6.2",
    receipt: "built-in · v1.6.0 · read-only",
    summary: "The things a variation may never touch on a live site — the booking form, consent, anything that takes a payment.",
    body: [
      "---",
      "name: prism/change-safety",
      "tier: global",
      "delivery: branch",
      "version: 1.6.0",
      "---",
      "",
      "# What a variation may never touch",
      "",
      "Never modify, wrap, re-order or re-label a form that takes a name, a card",
      "or a date of stay. Never intercept its submit. Never move a consent",
      "control, and never pre-tick one.",
      "",
      "If the change the brief asks for cannot be made without touching one of",
      "these, stop and say so in the build notes rather than building it.",
    ],
  },

  /* ── Outrigger ─────────────────────────────────────────────────── */
  {
    id: "outrigger/measurement-planner",
    tier: "customer", delivery: "console", origin: "forked", capability: "plan-measurement",
    version: "1.3.0", bytes: 5290, enabled: true, updated: "edited 2 Sep 2026 by Malia K.",
    forkedFrom: "prism/measurement-planner@3.1.0",
    receipt: "forked from prism/measurement-planner@3.1.0 · 26 Aug 2026 10:02 · Malia K.",
    summary: "The fork that knows project 24138040550: seven duplicated display names, and no booking event anywhere.",
    body: [
      "---",
      "name: outrigger/measurement-planner",
      "tier: customer",
      "delivery: console",
      "replaces: prism/measurement-planner@3.1.0",
      "call-sites: [brief.measurement-plan]",
      "---",
      "",
      "# Planning measurement on outrigger.com",
      "",
      "You are writing the plan a person will FREEZE before any guest sees the",
      "change. Everything below is about one Optimizely project: 24138040550.",
      "",
      "## The event vocabulary is not clean. Say so.",
      "",
      "That project has 48 events and seven display names that belong to more",
      "than one event. Never resolve a collision by taking the one with more",
      "traffic — traffic is not intent.",
      "",
      "- 24138040550_book_now_button_clicks — \"Offer Detail Book Now Button",
      "  Clicks\", attached to the rate-calendar experiments. This is the one that",
      "  reports.",
      "- 24138040550_offer_detail_book_now_button_clicks — the same display name,",
      "  attached to nothing. Binding it produces a metric that reads as a dash",
      "  forever.",
      "- 24138040550_hero_cta_click and 24138040550_hero_cta_click_1 — both",
      "  \"Hero CTA Click\". Ask. Do not pick.",
      "",
      "## There is no booking event. Do not invent one.",
      "",
      "Nothing in 24138040550 records a completed booking, a room night or a",
      "dollar. 24138040550_book_now_button_clicks is an INTENTION. Write",
      "\"reached the booking step\". Never write \"bookings\", never write",
      "\"revenue\", and never stand a lookalike event in for either.",
      "",
      "When someone asks for revenue, put it in the gap list and hand them the",
      "instrumentation ask. A gap is a finding; a substitute is a lie with a",
      "chart on it.",
      "",
      "## Pageviews are guardrails, not goals",
      "",
      "24138040550_all_offers_page (\"All Offers Page\") and 24138040550_home",
      "(\"All Outrigger\") are pageviews. They can hold a guardrail. They cannot",
      "decide an experiment.",
    ],
  },
  {
    id: "outrigger/experiment-analyst",
    tier: "customer", delivery: "console", origin: "forked", capability: "write-readout",
    version: "1.1.0", bytes: 3040, enabled: true, updated: "edited 5 Sep 2026 by Malia K.",
    forkedFrom: "prism/experiment-analyst@2.2.0",
    receipt: "forked from prism/experiment-analyst@2.2.0 · 29 Aug 2026 16:41 · Malia K.",
    broken: "line 3 — \"coustomer\" is not a tier. The file has never parsed, so nothing in it has ever reached a readout.",
    brokenLine: 3,
    summary: "Would ban the word conversion on this account. Has never once run — the front matter has a typo in it.",
    body: [
      "---",
      "name: outrigger/experiment-analyst",
      "tier: coustomer",
      "delivery: console",
      "replaces: prism/experiment-analyst@2.2.0",
      "call-sites: [decision.readout, run.digest]",
      "---",
      "",
      "# Writing a readout for Outrigger",
      "",
      "Never write \"conversion\" and never write \"conversion rate\". This account",
      "has no booking event — the number you are reporting is a click on Book",
      "Now. Call it \"guests who reached the booking step\".",
      "",
      "Name the property the way a guest would: Outrigger Reef Waikiki Beach",
      "Resort, not the resort or the property.",
      "",
      "A lift on an intention is not revenue. If someone asks what it is worth,",
      "say that nothing on this site records a booking, and stop there.",
    ],
  },
  {
    id: "outrigger/context",
    tier: "customer", delivery: "branch", origin: "yours", capability: "build",
    version: "3.0.0", bytes: 4860, enabled: true, updated: "revision 3 · re-read 3 Sep 2026 by Malia K.",
    receipt: "context r3 · approved by Dana Reyes · pinned by 2 builds",
    summary: "Who OUTRIGGER is, who it serves, who it loses bookings to, how it talks and how it looks — read from 38 pages, corrected by people. Edited in Business profile, never here.",
    body: [
      "---",
      "name: outrigger/context",
      "tier: customer",
      "delivery: branch",
      "revision: 3",
      "read: 38 pages of outrigger.com · 3 Sep 2026",
      "beside: design-tokens.md · pages.json · evidence.md",
      "---",
      "",
      "# OUTRIGGER — what the builder should know",
      "",
      "## The business",
      "",
      "A beachfront resort operator — Hawaii first, then Fiji, Thailand and",
      "Mauritius — with a quieter second business in Hawaiian vacation condos.",
      "One brand, one voice. The site sells stays, not rooms.",
      "",
      "## Who they serve",
      "",
      "Leisure travellers planning weeks out. The guest they most want more of:",
      "direct bookers who would otherwise book the same room through Expedia.",
      "",
      "## Market",
      "",
      "Bookings are lost to Expedia and Booking.com for OUTRIGGER's own rooms,",
      "and to Marriott and Hilton in Waikīkī. Every page argues for booking direct.",
      "",
      "## Voice & tone",
      "",
      "Warm, unhurried, second-person. Places before prices. Guests, never users.",
      "Rule: never manufacture urgency. We never say luxury.",
      "",
      "## Design language",
      "",
      "Photography-led. Headlines in Duplicate Ionic, everything else Montserrat.",
      "Brand blue is #0078cd on deep water #004561; Bootstrap's #0d6efd is a leak",
      "and is never used. The primary action is \"Check availability\".",
      "Exact values live in design-tokens.md — read them, do not retype them.",
    ],
  },
  {
    id: "outrigger/brand-voice",
    tier: "customer", delivery: "branch", origin: "yours", capability: "build",
    version: "2.0.0", bytes: 3120, enabled: true, updated: "edited 21 Aug 2026 by Kaila T.",
    summary: "How copy has to read on outrigger.com. Guests, never users. No exclamation marks on a rate.",
    body: [
      "---",
      "name: outrigger/brand-voice",
      "tier: customer",
      "delivery: branch",
      "---",
      "",
      "# How copy reads on outrigger.com",
      "",
      "Guests, never users. Stay, never booking, when speaking to the guest.",
      "Rates are nightly and always say so.",
      "",
      "No exclamation marks anywhere near a price. \"Book Now!\" is not a thing",
      "this brand says; the button says Book Now and the sentence around it is",
      "calm.",
      "",
      "Hawaiian place names carry their diacriticals: Waikīkī, Kaʻanapali,",
      "Kōloa. If you cannot set them correctly, use the English wording the page",
      "already uses rather than stripping the marks.",
      "",
      "Never promise availability, an upgrade, or a price the rate calendar has",
      "not returned.",
    ],
  },
  {
    id: "outrigger/optimizely-events",
    tier: "customer", delivery: "branch", origin: "yours", capability: "build",
    version: "1.4.0", bytes: 2740, enabled: true, updated: "edited 27 Aug 2026 by Malia K.",
    summary: "Which event key the built code may dispatch, and the identically-named twin it must never touch.",
    body: [
      "---",
      "name: outrigger/optimizely-events",
      "tier: customer",
      "delivery: branch",
      "---",
      "",
      "# Dispatching events from a variation",
      "",
      "Dispatch 24138040550_book_now_button_clicks and nothing else for a Book",
      "Now interaction. Its twin, 24138040550_offer_detail_book_now_button_clicks,",
      "carries the same display name, is attached to no experiment, and must",
      "never be dispatched from built code.",
      "",
      "Guard every dispatch with a dataset flag so a re-opened overlay cannot",
      "fire it twice. A double-fired decision event manufactures a lift.",
      "",
      "Hero interactions use 24138040550_hero_cta_click. The _1 variant is not",
      "ours to send.",
      "",
      "Never dispatch a pageview by hand: 24138040550_all_offers_page and",
      "24138040550_home are fired by the page, not by us.",
    ],
  },
  {
    id: "outrigger/accessibility-floor",
    tier: "customer", delivery: "branch", origin: "yours", capability: "build",
    version: "1.0.0", bytes: 3410, enabled: true, updated: "added 9 Sep 2026 by Kaila T.",
    summary: "Written the day after QA. Anything that covers the page has to answer Esc, focus, back, and 375px.",
    body: [
      "---",
      "name: outrigger/accessibility-floor",
      "tier: customer",
      "delivery: branch",
      "---",
      "",
      "# The floor, after the rate-calendar QA pass",
      "",
      "Anything that covers the page is a dialog and is built as one:",
      "",
      "1. role=\"dialog\", aria-modal=\"true\", and an accessible name.",
      "2. Esc closes it. A keydown listener, not only a close button.",
      "3. Focus is trapped inside it and returns to the trigger on close.",
      "4. history.pushState on open, popstate closes — on a phone, back IS the",
      "   close button.",
      "5. Every interactive cell is reachable by keyboard. Date cells are",
      "   buttons, not divs with click handlers.",
      "6. It fits 375px. No fixed panel width without a max-width.",
      "",
      "Two thirds of the traffic on a resort page is a phone. A panel that is",
      "clipped at 375px is clipped for most of the run.",
    ],
  },

  /* ── This experiment ───────────────────────────────────────────── */
  {
    id: "reef-rate-calendar/panel-contract",
    tier: "experiment", delivery: "branch", origin: "yours", capability: "build",
    version: "1.2.0", bytes: 1980, enabled: true, updated: "edited 8 Sep 2026 by Kaila T.",
    summary: "The DOM this one change attaches to on the Reef page, and what it must not move.",
    body: [
      "---",
      "name: reef-rate-calendar/panel-contract",
      "tier: experiment",
      "experiment: rate-calendar-best-price-promise",
      "delivery: branch",
      "---",
      "",
      "# The Reef rate calendar",
      "",
      "The promise strip attaches after .rate-calendar__header on",
      "outrigger.com/hawaii/oahu/outrigger-reef-waikiki-beach-resort. It never",
      "moves the calendar itself, and it never re-orders the rate rows — that",
      "grid is read by the booking form underneath.",
      "",
      "The overlay is at most 92vw and at most 420px, in that order.",
      "",
      "When rates have not arrived in 4s, fall back to the static best-price",
      "line and leave the calendar usable. Never leave a spinner over the",
      "booking path.",
    ],
  },
  {
    id: "reef-rate-calendar/qa-scenarios",
    tier: "experiment", delivery: "console", origin: "yours", capability: "write-qa",
    version: "1.0.0", bytes: 2260, enabled: true, updated: "added 9 Sep 2026 by Kaila T.",
    summary: "Overrides the built-in scenario writer for this experiment: the change is a modal, so the modal six are always required.",
    body: [
      "---",
      "name: reef-rate-calendar/qa-scenarios",
      "tier: experiment",
      "experiment: rate-calendar-best-price-promise",
      "delivery: console",
      "call-sites: [qa.scenarios]",
      "---",
      "",
      "# Scenarios for an overlay on the Reef page",
      "",
      "This change covers the page, so the scenario set ALWAYS contains the six",
      "things an overlay breaks, whether or not the brief mentions them:",
      "Esc, backdrop, focus trap and return, browser back, 375px, and a screen",
      "reader announcing the panel and its rates.",
      "",
      "Add a seventh every time: the decision event fires once per guest, and",
      "only 24138040550_book_now_button_clicks is dispatched.",
    ],
  },
];

type CallSite = {
  module: string;
  surface: string;
  capability: Capability;
  writes: string;
  /** Compiled into the product. Not a skill, not editable, always there. */
  fallback: string;
};

const CALL_SITES: CallSite[] = [
  {
    module: "prompts/brief-author.ts",
    surface: "New experiment → the brief Prism drafts",
    capability: "write-brief",
    writes: "The brief, from what someone typed into the box",
    fallback: "Write a brief. Name the page, the change, one metric and a direction. Ask for anything missing.",
  },
  {
    module: "prompts/measurement-plan.ts",
    surface: "Brief → How we'll know",
    capability: "plan-measurement",
    writes: "The measurement plan that gets frozen before traffic",
    fallback: "Bind only events this experiment reports. If two share a name, ask. Never invent a booking event.",
  },
  {
    module: "prompts/readout.ts",
    surface: "Decision → the readout",
    capability: "write-readout",
    writes: "The plain-language result, with the interval and the brief revision",
    fallback: "Report the decision metric with its interval, the brief revision, and every guardrail.",
  },
  {
    module: "prompts/run-digest.ts",
    surface: "Run → the daily note",
    capability: "write-readout",
    writes: "What moved since yesterday, while the run is still open",
    fallback: "Say what moved since yesterday, with the interval. Never call a run early.",
  },
  {
    module: "prompts/qa-scenarios.ts",
    surface: "QA → coverage",
    capability: "write-qa",
    writes: "The scenario set, from the brief and the compiled file",
    fallback: "List what the brief implies a guest can do. Mark anything the build has no code path for.",
  },
];

/* ── Small parts ───────────────────────────────────────────────────── */

const Lock = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
    <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

/** Immutable: a built-in's contents, a fork's provenance, a compiled fallback. */
const Frozen = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-start gap-1.5 rounded border border-border bg-surface-2/60 px-2 py-1 font-mono text-[11px] text-muted-2 leading-[1.5]">
    <span className="pt-0.5 shrink-0"><Lock /></span>{children}
  </span>
);

const Mono = ({ children }: { children: React.ReactNode }) => (
  <span className="font-mono text-[11px] text-muted-2 bg-surface-2 rounded px-1.5 py-0.5">{children}</span>
);

const Label = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-1.5">{children}</div>
);

const TIER_NAME: Record<Tier, string> = {
  experiment: "This experiment",
  customer: "Outrigger",
  global: "Prism",
};

const TIER_LONG: Record<Tier, string> = {
  experiment: `This experiment only — ${RUN.experiment}`,
  customer: "Outrigger — every site on the account",
  global: "Prism — every customer",
};

const TIER_RANK: Record<Tier, number> = { experiment: 0, customer: 1, global: 2 };

const TierTag = ({ t }: { t: Tier }) => (
  <span className={cn("text-[11.5px] rounded px-1.5 py-0.5 border whitespace-nowrap",
    t === "experiment" ? "border-border-strong text-foreground font-semibold"
      : t === "customer" ? "border-border text-muted" : "border-border text-muted-2")}>
    {TIER_NAME[t]}
  </span>
);

const DeliveryPill = ({ d }: { d: Delivery }) =>
  d === "console"
    ? <Pill tone="accent">Prism&rsquo;s own prompt</Pill>
    : <Pill tone="muted">Building agent</Pill>;

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

/* ── The surface ───────────────────────────────────────────────────── */

export function SkillsPanel() {
  const [skills, setSkills] = useState<Skill[]>(SKILLS);
  const [bodies, setBodies] = useState<Record<string, string[]>>(
    () => Object.fromEntries(SKILLS.map((s) => [s.id, s.body])));
  const [selected, setSelected] = useState<string>("outrigger/measurement-planner");
  const [tier, setTier] = useState<Tier | "all">("all");
  const [delivery, setDelivery] = useState<Delivery | "all">("all");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);

  const consoleSkills = skills.filter((s) => s.delivery === "console");
  const forkedCount = skills.filter((s) => s.origin === "forked").length;
  const brokenSkills = skills.filter((s) => s.broken);

  const forkOf = (s: Skill) => skills.find((x) => x.forkedFrom === `${s.id}@${s.version}`);
  /** ONE definition of shadowing, used by both deliveries. A fork only shadows
   *  its parent while it can actually run — calling a skill shadowed when the
   *  fork never parsed is how you stop knowing which text wrote your readout. */
  const shadowedByFork = (s: Skill) => {
    const f = forkOf(s);
    return Boolean(f && f.enabled && !f.broken);
  };

  /* Branch delivery: everything enabled is ASSEMBLED, most specific last. */
  const branchStack = skills
    .filter((s) => s.delivery === "branch" && s.enabled && !s.broken && !shadowedByFork(s))
    .sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier]);
  const branchBytes = branchStack.reduce((n, s) => n + s.bytes, 0);

  /* Console delivery: exactly ONE wins per call site. Nothing is merged. */
  const resolve = (cap: Capability) => {
    const ranked = skills
      .filter((s) => s.delivery === "console" && s.capability === cap)
      .sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier]);
    const usable = ranked.filter((s) => s.enabled && !s.broken);
    return {
      winner: usable.length > 0 ? usable[0] : null,
      shadowed: usable.slice(1),
      skipped: ranked.filter((s) => !s.enabled || Boolean(s.broken)),
    };
  };

  const fallenBack = CALL_SITES.filter((c) => resolve(c.capability).winner === null).length;
  const degraded = CALL_SITES.filter((c) => resolve(c.capability).skipped.some((s) => Boolean(s.broken)));

  const shown = skills.filter((s) =>
    (tier === "all" || s.tier === tier) && (delivery === "all" || s.delivery === delivery));

  const sel = skills.find((s) => s.id === selected);
  const selBody = sel ? bodies[sel.id] ?? sel.body : [];
  const selFork = sel ? forkOf(sel) : undefined;

  const pick = (id: string) => { setSelected(id); setEditing(false); setSavedId(null); };

  const startEdit = (s: Skill) => {
    setDraft((bodies[s.id] ?? s.body).join("\n"));
    setEditing(true);
    setSavedId(null);
  };

  /** Editing a built-in never edits the built-in. It makes a fork in your tier
   *  and the fork shadows its parent from here on. */
  const fork = (s: Skill) => {
    const forkId = `outrigger/${s.id.replace(/^[^/]+\//, "")}`;
    const forked: Skill = {
      ...s,
      id: forkId,
      tier: "customer",
      origin: "forked",
      version: "1.0.0",
      updated: `forked ${NOW} by Kaila T.`,
      forkedFrom: `${s.id}@${s.version}`,
      receipt: `forked from ${s.id}@${s.version} · ${NOW} · Kaila T.`,
      body: bodies[s.id] ?? s.body,
    };
    setSkills((xs) => {
      const at = xs.findIndex((x) => x.id === s.id);
      return [...xs.slice(0, at + 1), forked, ...xs.slice(at + 1)];
    });
    setBodies((b) => ({ ...b, [forkId]: bodies[s.id] ?? s.body }));
    setSelected(forkId);
    setDraft((bodies[s.id] ?? s.body).join("\n"));
    setEditing(true);
    setSavedId(null);
  };

  const save = (s: Skill) => {
    setBodies((b) => ({ ...b, [s.id]: draft.split("\n") }));
    setSkills((xs) => xs.map((x) => x.id === s.id ? { ...x, updated: `edited ${NOW} by Kaila T.` } : x));
    setEditing(false);
    setSavedId(s.id);
  };

  const toggle = (id: string) =>
    setSkills((xs) => xs.map((x) => x.id === id ? { ...x, enabled: !x.enabled } : x));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Skills"
        count={`${skills.length} skills · ${consoleSkills.length} are Prism's own prompts · ${forkedCount} forked`}
        actions={<>
          <Button variant="outline" size="sm">Import from a repo</Button>
          <Button size="sm">New skill</Button>
        </>}
      />

      <Toolbar>
        <Chip on={tier === "all"} onClick={() => setTier("all")}>
          All tiers <span className="tabular-nums opacity-60">{skills.length}</span>
        </Chip>
        {(["experiment", "customer", "global"] as Tier[]).map((t) => (
          <Chip key={t} on={tier === t} onClick={() => setTier(t)}>
            {TIER_NAME[t]} <span className="tabular-nums opacity-60">{skills.filter((s) => s.tier === t).length}</span>
          </Chip>
        ))}
        <div className="w-px h-5 bg-border mx-1" />
        <Chip on={delivery === "all"} onClick={() => setDelivery("all")}>Both deliveries</Chip>
        <Chip on={delivery === "branch"} onClick={() => setDelivery("branch")}>
          To the building agent <span className="tabular-nums opacity-60">{skills.length - consoleSkills.length}</span>
        </Chip>
        <Chip on={delivery === "console"} onClick={() => setDelivery("console")}>
          Prism&rsquo;s own prompts <span className="tabular-nums opacity-60">{consoleSkills.length}</span>
        </Chip>
        <span className="ml-auto text-[12.5px] text-muted-2">
          Most specific wins: this experiment → Outrigger → Prism → the code
        </span>
      </Toolbar>

      <div className="flex-1 overflow-auto p-6 space-y-4">

        {/* ── The distinction the whole screen turns on ── */}
        <Section title="Two deliveries — the difference is not cosmetic">
          <div className="grid grid-cols-2">
            {/* Branch: quiet, additive, reviewed by a person before a guest sees it. */}
            <div className="px-5 py-4 border-r border-border">
              <Label>GOES TO THE BUILDING AGENT</Label>
              <p className="text-[14.5px] leading-relaxed">
                Instructions for the code Prism writes. Every enabled one is assembled into the agent&rsquo;s context,
                most specific last, so a rule about this experiment beats a rule about the account.
              </p>
              <p className="text-[13px] text-muted mt-2.5 leading-relaxed">
                Get one wrong and you get a worse variation — which a person still reviews on the real page before
                a guest sees it. <span className="text-foreground tabular-nums">{branchStack.length} skills · {kb(branchBytes)}</span> reach
                the agent on the next build.
              </p>
              <div className="mt-3 space-y-1.5">
                {branchStack.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-2 tabular-nums w-4 shrink-0">{i + 1}</span>
                    <Mono>{s.id}</Mono>
                    <TierTag t={s.tier} />
                    <span className="ml-auto text-[12px] text-muted-2 tabular-nums">{kb(s.bytes)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3.5">
                <Frozen>{RUN.build} · assembled from the 6 that were enabled on 26 Aug · pinned</Frozen>
              </div>
              <p className="text-[12.5px] text-muted-2 mt-2 leading-relaxed">
                Toggling a skill now changes the next build, never that one.
              </p>
            </div>

            {/* Console: loud, exclusive, ships to guests with nobody in between. */}
            <div className="px-5 py-4 border-l-2 border-l-accent bg-accent/[0.04]">
              <div className="text-[10.5px] font-semibold tracking-[0.07em] text-accent mb-1.5">IS PRISM&rsquo;S OWN PROMPT</div>
              <p className="text-[14.5px] leading-relaxed">
                These are the product&rsquo;s AI. Editing one changes how Prism writes for everyone on the account —
                the brief author, the measurement planner, the analyst that writes the readout.
              </p>
              <p className="text-[13px] text-muted mt-2.5 leading-relaxed">
                There is no review step. The next brief anybody writes uses it.
                Exactly one wins per call site — <span className="text-foreground">the rest are shadowed, never merged</span> —
                across <span className="text-foreground tabular-nums">{consoleSkills.length} skills and {CALL_SITES.length} call sites</span>.
              </p>
              <div className="mt-3 rounded-lg border border-border bg-surface p-3">
                <p className="text-[13px] leading-relaxed">
                  The readout that reported <span className="tabular-nums">{RUN.lift}</span> — {RUN.closed} — was written
                  by one of these, with nobody between it and the person who read it.
                </p>
              </div>
              {brokenSkills.length > 0 && (
                <p className="text-[12.5px] text-warn mt-3 leading-relaxed tabular-nums">
                  {brokenSkills.length} of them will not parse and is being skipped.
                </p>
              )}
            </div>
          </div>
        </Section>

        {/* ── The library ── */}
        <Section
          title="The library"
          action={<span className="text-[12.5px] text-muted-2 tabular-nums">
            {shown.length} shown · {skills.filter((s) => !s.enabled).length} turned off · {brokenSkills.length} will not parse
          </span>}>

          {shown.length === 0 ? (
            <div className="flex min-h-[180px]">
              <Empty
                title="No skill in that combination"
                body="Nothing is written at this tier for this delivery yet. That is not a gap on its own — an empty tier just means the tier below it decides."
                action={<Button size="sm" onClick={() => { setTier("all"); setDelivery("all"); }}>Show every skill</Button>}
              />
            </div>
          ) : shown.map((s) => {
            const child = forkOf(s);
            const shadowed = shadowedByFork(s);
            return (
              <div key={s.id}
                className={cn("flex items-start gap-3 px-5 py-3.5 border-b border-border last:border-0",
                  s.delivery === "console" && "border-l-2 border-l-accent",
                  s.id === selected && "bg-surface-2/60",
                  !s.enabled && "opacity-60")}>
                <button onClick={() => pick(s.id)} className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[12.5px] font-medium">{s.id}</span>
                    <TierTag t={s.tier} />
                    <DeliveryPill d={s.delivery} />
                    {s.broken && <Pill tone="danger">will not parse</Pill>}
                    {shadowed && <Pill tone="muted">shadowed by your fork</Pill>}
                    {child && !shadowed && <Pill tone="warn">running — your fork is skipped</Pill>}
                  </div>
                  <p className="text-[13.5px] text-muted leading-relaxed mt-1">{s.summary}</p>
                  <div className="mt-1.5 flex items-center gap-2.5 flex-wrap">
                    {s.origin === "yours"
                      ? <span className="text-[12.5px] text-muted-2">Yours · {s.updated}</span>
                      : <Frozen>{s.receipt}</Frozen>}
                    {s.origin === "forked" && <span className="text-[12.5px] text-muted-2">{s.updated}</span>}
                  </div>
                </button>

                <div className="text-right shrink-0 w-[104px]">
                  <div className="text-[12.5px] text-muted-2 tabular-nums">{kb(s.bytes)}</div>
                  <div className="text-[12.5px] text-muted-2 tabular-nums mt-0.5">
                    {s.delivery === "branch"
                      ? "every build"
                      : `${CALL_SITES.filter((c) => c.capability === s.capability).length} call sites`}
                  </div>
                </div>

                <button onClick={() => toggle(s.id)} disabled={Boolean(s.broken)}
                  title={s.broken ? "It never parsed, so it is skipped whether it is on or off" : "Skip this skill everywhere"}
                  className={cn("h-7 px-2.5 rounded-full text-[11.5px] font-semibold shrink-0",
                    s.broken ? "bg-danger/10 text-danger cursor-not-allowed"
                      : s.enabled ? "bg-surface-2 text-muted hover:text-foreground" : "bg-warn/10 text-warn")}>
                  {s.broken ? "Skipped" : s.enabled ? "On" : "Off"}
                </button>
              </div>
            );
          })}
        </Section>

        {/* ── The editor. Built-ins are read-only, and saying so is not enough:
             the only edit affordance on one is the fork. ── */}
        {sel && (
          <Section
            title={`SKILL.md — ${sel.id}`}
            action={<div className="flex items-center gap-2.5">
              <DeliveryPill d={sel.delivery} />
              {sel.origin === "built-in" ? <Pill tone="muted">Read-only</Pill> : <Pill tone="ok">Editable</Pill>}
            </div>}>

            <div className={cn("px-5 py-2 grid grid-cols-2 gap-x-10", sel.delivery === "console" && "border-l-2 border-l-accent")}>
              <div>
                <Meta k="Tier" v={TIER_LONG[sel.tier]} />
                <Meta k="Delivery" v={sel.delivery === "console"
                  ? <span className="text-accent">Prism&rsquo;s own prompt — editing it changes the product</span>
                  : "Assembled into the building agent's context"} />
                <Meta k="Origin" v={sel.origin === "yours"
                  ? <span>Written here · {sel.updated}</span>
                  : <Frozen>{sel.receipt}</Frozen>} />
              </div>
              <div>
                <Meta k="Answers" v={sel.delivery === "branch"
                  ? "Every build on this account"
                  : CALL_SITES.filter((c) => c.capability === sel.capability).map((c) => c.surface).join(" · ")} />
                {sel.tier === "experiment" && <Meta k="Scoped to" v={RUN.page} mono />}
                <Meta k="Version" v={`v${sel.version}`} mono />
                <Meta k="Size" v={<span className="tabular-nums">{selBody.length} lines · {kb(sel.bytes)}</span>} />
              </div>
            </div>

            {/* The rule, at the point of the action rather than in a doc. */}
            <div className={cn("px-5 py-3.5 border-y border-border flex items-start gap-3",
              sel.origin === "built-in" ? "bg-warn/5" : "bg-surface-2/40")}>
              {sel.origin === "built-in" ? (
                <>
                  <Frozen>built-in · immutable</Frozen>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] leading-relaxed">
                      <span className="font-semibold">Editing this forks it.</span> Prism&rsquo;s copy stays exactly as it is and
                      keeps updating with the product; your fork lands in the Outrigger tier and shadows it from that moment on.
                    </p>
                    {selFork && (
                      <p className="text-[13px] text-muted mt-1.5">
                        You already have a fork of this — <Mono>{selFork.id}</Mono>.{" "}
                        {selFork.enabled && !selFork.broken
                          ? "It is what actually runs; this text has not been used since it was made."
                          : "It is being skipped, so this built-in is what actually runs — and it does not know what your fork knows."}
                      </p>
                    )}
                  </div>
                  {selFork
                    ? <Button size="sm" variant="outline" onClick={() => pick(selFork.id)}>Open your fork</Button>
                    : <Button size="sm" onClick={() => fork(sel)}>Fork it to edit</Button>}
                </>
              ) : (
                <>
                  {sel.origin === "forked"
                    ? <Frozen>{sel.receipt}</Frozen>
                    : <span className="text-[12.5px] text-muted-2 pt-1">Written here, not forked from anything.</span>}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] leading-relaxed">
                      {sel.delivery === "console"
                        ? "Saving changes how Prism writes for everyone on this account. Nobody reviews it — the next brief uses it."
                        : "Saving changes what the building agent is told on the next build. A person still reviews the variation."}
                    </p>
                  </div>
                  {editing
                    ? <div className="flex gap-2 shrink-0">
                        <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Discard</Button>
                        <Button size="sm" onClick={() => save(sel)}>Save</Button>
                      </div>
                    : <Button size="sm" variant="outline" onClick={() => startEdit(sel)}>Edit</Button>}
                </>
              )}
            </div>

            {savedId === sel.id && (
              <div className="px-5 py-3 border-b border-border bg-ok/5 flex items-center gap-2.5">
                <Pill tone="ok">Saved {NOW}</Pill>
                <span className="text-[13px] text-muted">
                  {sel.delivery === "console"
                    ? `Live now. Every call site that resolves to ${sel.id} used the old text until this moment.`
                    : "In the next build. Builds already made keep the text they were assembled from."}
                </span>
              </div>
            )}

            {sel.broken && (
              <div className="px-5 py-3.5 border-b border-border bg-danger/[0.05] flex items-start gap-3">
                <Pill tone="danger">Will not parse</Pill>
                <p className="text-[13.5px] text-danger leading-relaxed flex-1">{sel.broken}</p>
              </div>
            )}

            {editing ? (
              <div className="p-5">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                  className="w-full h-[420px] rounded-lg border border-border bg-surface-2/40 p-4 font-mono text-[12px] leading-[1.65] text-foreground focus:border-accent focus:outline-none resize-none"
                />
                <p className="text-[12.5px] text-muted-2 mt-2 tabular-nums">
                  {draft.split("\n").length} lines · {kb(new TextEncoder().encode(draft).length)} · front matter is validated on save
                </p>
              </div>
            ) : (
              <div className="p-5">
                <div className="rounded-lg border border-border bg-surface-2/40 overflow-x-auto">
                  <div className="py-3 font-mono text-[12px] leading-[1.65]">
                    {selBody.map((line, i) => {
                      const fmEnd = selBody.indexOf("---", 1);
                      const inFm = i <= fmEnd;
                      const bad = sel.brokenLine === i + 1;
                      return (
                        <div key={`${i}-${line}`}
                          className={cn("flex gap-4 px-4", bad && "bg-danger/10", inFm && !bad && "bg-surface-2/60")}>
                          <span className="text-[11px] text-muted-2 tabular-nums w-7 text-right shrink-0 select-none">{i + 1}</span>
                          <span className={cn("whitespace-pre-wrap", bad ? "text-danger font-semibold" : inFm ? "text-muted-2" : "text-foreground")}>
                            {line || " "}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </Section>
        )}

        {/* ── The floor nobody can edit ── */}
        <Section
          title="Every call site has a fallback in the code"
          action={<span className="text-[12.5px] text-muted-2 tabular-nums">
            {CALL_SITES.length} call sites · {fallenBack} on the compiled fallback
          </span>}>

          <div className="px-5 py-4 border-b border-border">
            <p className="text-[14.5px] leading-relaxed">
              Under the three tiers sits something that is not a skill: a prompt compiled into Prism. It cannot be
              edited, turned off, or forked, which is why a skill that will not parse{" "}
              <span className="font-semibold">degrades a feature instead of breaking it</span>.
            </p>
            {degraded.length > 0 && (
              <p className="text-[13.5px] text-warn leading-relaxed mt-2.5">
                <Mono>outrigger/experiment-analyst</Mono> is being skipped, so the{" "}
                <span className="tabular-nums">{degraded.length}</span> call sites that would have used it are running{" "}
                <Mono>prism/experiment-analyst@2.2.0</Mono> instead. That built-in does not know this account has no
                booking event — the readout for {RUN.closed.split(" · ")[0]} called {RUN.lift.split(" ")[0]} a conversion
                lift twice, and nothing failed loudly enough for anyone to notice.
              </p>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-surface-2/80">
                <tr>
                  <Th first>Call site</Th>
                  <Th>What it writes</Th>
                  <Th>What runs right now</Th>
                  <Th>If nothing resolves</Th>
                </tr>
              </thead>
              <tbody>
                {CALL_SITES.map((c) => {
                  const r = resolve(c.capability);
                  return (
                    <tr key={c.module} className="border-b border-border last:border-0 align-top">
                      <td className="px-4 pl-6 py-3 border-l-2 border-l-accent">
                        <div className="text-[13.5px]">{c.surface}</div>
                        <div className="mt-1"><Mono>{c.module}</Mono></div>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-muted max-w-[240px]">{c.writes}</td>
                      <td className="px-4 py-3">
                        {r.winner ? (
                          <>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-[12px]">{r.winner.id}</span>
                              <TierTag t={r.winner.tier} />
                            </div>
                            {r.shadowed.map((s) => (
                              <div key={s.id} className="text-[12.5px] text-muted-2 mt-1">shadows {s.id}</div>
                            ))}
                            {r.skipped.map((s) => (
                              <div key={s.id} className={cn("text-[12.5px] mt-1", s.broken ? "text-warn" : "text-muted-2")}>
                                skipped {s.id} — {s.broken ? "will not parse" : "turned off"}
                              </div>
                            ))}
                          </>
                        ) : (
                          <>
                            <Pill tone="warn">On the compiled fallback</Pill>
                            <div className="text-[12.5px] text-muted-2 mt-1.5">
                              No skill at any tier is answering this. The feature still works, more plainly.
                            </div>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-[300px]">
                        <Frozen>{c.fallback}</Frozen>
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t border-border-strong">
                  <td className="px-4 pl-6 py-3">
                    <div className="text-[13.5px]">Build → the building agent</div>
                    <div className="mt-1"><Mono>agents/variation-builder.ts</Mono></div>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-muted">The variation.js that runs on the page</td>
                  <td className="px-4 py-3">
                    <div className="text-[13px] tabular-nums">{branchStack.length} skills assembled · {kb(branchBytes)}</div>
                    <div className="text-[12.5px] text-muted-2 mt-1">Additive, not exclusive — nothing here is shadowed.</div>
                  </td>
                  <td className="px-4 py-3">
                    <Frozen>prism/variation-builder@4.0.2 is compiled in and cannot be removed.</Frozen>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="px-5 py-3.5 border-t border-border text-[12.5px] text-muted-2 leading-relaxed">
            Skills are read at the start of a call, not cached between runs, so a fork takes effect on the next
            brief, readout or build — and the brief that has already been frozen ({RUN.brief}) keeps the words it
            was written with.
          </div>
        </Section>
      </div>
    </div>
  );
}
