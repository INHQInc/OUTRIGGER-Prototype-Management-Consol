"use client";

/**
 * QA — generated from the brief AND the compiled variation.js, then run.
 *
 * Two halves, and the order matters:
 *
 *  · COVERAGE reads the brief for everything it implies a guest can do, reads
 *    the build for what it actually handles, and the HEADLINE IS THE
 *    DIFFERENCE. A covered scenario is a quiet line; a gap is loud. A QA
 *    surface whose loudest thing is a wall of green ticks has buried its own
 *    output — the ticks are the part nobody needs to read.
 *  · TEST CASES are step-scripted and each one is bound to a scenario, so a
 *    pass is always a pass AT something. A case with no scenario is a story
 *    about a browser, not evidence about this build.
 *
 * The privilege rule is the load-bearing one: AN AGENT RUN MAY NEVER OVERWRITE
 * A HUMAN VERDICT. So a human verdict renders as a locked receipt and an agent
 * verdict renders as plain text — the frozen thing looks frozen, and the agent
 * re-run below reports how many receipts it left alone rather than silently
 * skipping them.
 *
 * Every device x scenario cell that has no case renders as "never tried"
 * rather than blank: an untested combination is a finding, not whitespace.
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
  closed: "run 4 · closed 8 Sep 2026 · 18,412 sessions",
  lift: "+2.4% (95% CI +0.3 to +4.5, p 0.031)",
  generated: "10 Sep 2026 09:41 · brief revision 3 + variation.js (2.4 KB, minified)",
};

const DEVICES = ["Desktop 1440", "iPhone 15", "iPad", "Android"] as const;
type Device = (typeof DEVICES)[number];

type Scenario = {
  id: string;
  title: string;
  implies: string;
  build: string;
  evidence: string;
  covered: boolean;
};

/** Ten things the brief implies a guest can do at the overlay. Six of them the
 *  compiled file has no code path for. */
const SCENARIOS: Scenario[] = [
  {
    id: "SC-01",
    title: "Esc closes the overlay",
    implies: "The brief promises a guest can always get back to the rates they were looking at.",
    build: "Nothing listens for a key. Only the close button and the backdrop call close() — Esc does nothing at all, on any page.",
    evidence: "variation.js — 3 × addEventListener(\"click\"), 0 × \"keydown\"",
    covered: false,
  },
  {
    id: "SC-02",
    title: "Clicking the backdrop closes the overlay",
    implies: "Tapping outside a panel dismisses it — the pattern the rest of outrigger.com already uses.",
    build: "Handled. The backdrop closes and the scroll position of the rate calendar behind it is preserved.",
    evidence: "variation.js — backdrop.addEventListener(\"click\", close)",
    covered: true,
  },
  {
    id: "SC-03",
    title: "Focus is trapped, and returns to the trigger on close",
    implies: "A modal that takes over the page has to take over the keyboard with it.",
    build: "No trap and no return. Tab walks straight out of the panel and onto the Book Now button behind it, which is still clickable underneath the backdrop.",
    evidence: "variation.js — no tabindex, no .focus(), no inert",
    covered: false,
  },
  {
    id: "SC-04",
    title: "Fits a 375px viewport",
    implies: "Two thirds of the traffic on this resort page is a phone, so the brief was written against a phone.",
    build: "The panel is a fixed 420px with no max-width. At 375px it is clipped by 45px on the right and the words BEST PRICE GUARANTEED wrap underneath the calendar, away from the rate they describe.",
    evidence: "variation.js — .opmc-rc-panel { width: 420px } (no max-width, no vw unit)",
    covered: false,
  },
  {
    id: "SC-05",
    title: "The calendar can be moved through with a keyboard",
    implies: "Choosing a date is the whole point of the overlay, so choosing a date cannot be mouse-only.",
    build: "Date cells are plain divs with click handlers. They are not tabbable and arrow keys do nothing — a keyboard-only guest can open the overlay and then cannot use it.",
    evidence: "variation.js — cells built as <div class=\"opmc-rc-day\">, no role, no tabindex",
    covered: false,
  },
  {
    id: "SC-06",
    title: "A screen reader announces the overlay and its rates",
    implies: "The promise is a claim about price. A claim a guest cannot hear is not a promise that was made to them.",
    build: "No role=\"dialog\", no aria-modal, no accessible name. VoiceOver stays on the page behind and the rate grid reads as one unbroken run of numbers.",
    evidence: "variation.js — 0 aria-* attributes in the whole file",
    covered: false,
  },
  {
    id: "SC-07",
    title: "The browser back button closes the overlay",
    implies: "On a phone, back IS the close button. The brief says the guest keeps their rates.",
    build: "No history entry is pushed, so back leaves the resort page entirely and lands on the Oahu listing. The guest loses the dates they had picked.",
    evidence: "variation.js — no history.pushState, no popstate listener",
    covered: false,
  },
  {
    id: "SC-08",
    title: "Slow network — rates arrive late or not at all",
    implies: "The overlay must never be a permanent spinner over the booking path.",
    build: "Handled. Skeleton rows for up to 4s, then it falls back to the static best-price line and leaves the calendar usable.",
    evidence: "variation.js — setTimeout(renderFallback, 4000), cleared on load",
    covered: true,
  },
  {
    id: "SC-09",
    title: "The page behind does not scroll while the overlay is open",
    implies: "Implied by the overlay being an overlay.",
    build: "Handled, including on the backdrop path — body overflow is restored by the same close() both triggers call.",
    evidence: "variation.js — body.style.overflow set on open, restored in close()",
    covered: true,
  },
  {
    id: "SC-10",
    title: "The decision event fires once per guest",
    implies: "Run 4 was decided on this event. Firing it twice would have manufactured the +2.4%.",
    build: "Handled. Guarded by a dataset flag, and the identically-named event that is not attached to this experiment is never dispatched.",
    evidence: "24138040550_book_now_button_clicks · guarded · never 24138040550_offer_detail_book_now_button_clicks",
    covered: true,
  },
];

type Outcome = "pass" | "fail" | "not run";
type Recorder = "human" | "agent" | "none";

type Verdict = { outcome: Outcome; by: Recorder; who: string; at: string; note: string };

type TestCase = {
  id: string;
  scenario: string;
  device: Device;
  title: string;
  steps: string[];
  expected: string;
  verdict: Verdict;
  /** What a fresh agent pass would record. Only ever applied where no human has spoken. */
  agentFinding: Outcome;
};

const CASES: TestCase[] = [
  {
    id: "TC-01", scenario: "SC-01", device: "Desktop 1440",
    title: "Esc on the open rate calendar",
    steps: [
      "Open the Outrigger Reef Waikiki Beach Resort page with build 8c1d7e2 forced.",
      "Click the BEST RATE PROMISE strip under the hero to open the rate calendar.",
      "Press Esc once.",
    ],
    expected: "The overlay closes and focus returns to the promise strip.",
    verdict: { outcome: "fail", by: "human", who: "Malia K.", at: "8 Sep 11:20", note: "Overlay stayed open. Pressed Esc four more times — nothing. Had to mouse to the X." },
    agentFinding: "fail",
  },
  {
    id: "TC-02", scenario: "SC-01", device: "iPhone 15",
    title: "Hardware keyboard Esc, Safari iOS",
    steps: [
      "Pair a Magic Keyboard to the phone and open the resort page.",
      "Tap the promise strip.",
      "Press Esc.",
    ],
    expected: "The overlay closes.",
    verdict: { outcome: "not run", by: "none", who: "—", at: "—", note: "No paired keyboard on the device bench. This is the only Esc path a phone guest has." },
    agentFinding: "fail",
  },
  {
    id: "TC-03", scenario: "SC-02", device: "Desktop 1440",
    title: "Backdrop click dismisses",
    steps: [
      "Open the rate calendar.",
      "Scroll the calendar to November.",
      "Click the dimmed area to the left of the panel.",
    ],
    expected: "The overlay closes and the page behind is where it was.",
    verdict: { outcome: "pass", by: "human", who: "Marcus R.", at: "7 Sep 16:04", note: "Closes cleanly. Page scroll position preserved." },
    agentFinding: "pass",
  },
  {
    id: "TC-04", scenario: "SC-02", device: "Android",
    title: "Backdrop tap dismisses, Chrome Android",
    steps: ["Open the rate calendar.", "Tap the dimmed area above the panel."],
    expected: "The overlay closes.",
    verdict: { outcome: "pass", by: "agent", who: "Prism agent", at: "8 Sep 03:12", note: "Closed in 210ms." },
    agentFinding: "pass",
  },
  {
    id: "TC-05", scenario: "SC-03", device: "Desktop 1440",
    title: "Tab order stays inside the overlay",
    steps: [
      "Open the rate calendar.",
      "Press Tab repeatedly and record which element holds focus at each step.",
    ],
    expected: "Focus cycles through the panel and never reaches the page behind.",
    verdict: { outcome: "fail", by: "agent", who: "Prism agent", at: "8 Sep 03:14", note: "Focus left the panel on the 7th Tab and landed on the Book Now button behind the backdrop, which then activated on Enter." },
    agentFinding: "fail",
  },
  {
    id: "TC-06", scenario: "SC-04", device: "iPhone 15",
    title: "Panel at 375px",
    steps: [
      "Open the resort page on iPhone 15, portrait.",
      "Tap the promise strip.",
      "Read the promise line and try to reach the right-hand column of rates.",
    ],
    expected: "The panel fits the viewport and the promise line sits beside the rate it describes.",
    verdict: { outcome: "fail", by: "human", who: "Kaila T.", at: "8 Sep 09:47", note: "Saturday and Sunday rates are off-screen and cannot be scrolled to. The promise wraps below the calendar." },
    agentFinding: "fail",
  },
  {
    id: "TC-07", scenario: "SC-04", device: "iPad",
    title: "Panel at 768px",
    steps: ["Open the resort page on iPad, portrait.", "Tap the promise strip."],
    expected: "The panel fits and the promise line holds its position.",
    verdict: { outcome: "pass", by: "human", who: "Kaila T.", at: "8 Sep 09:58", note: "Fine at 768. The break is somewhere between 375 and 768 and nobody has bisected it." },
    agentFinding: "pass",
  },
  {
    id: "TC-08", scenario: "SC-05", device: "Desktop 1440",
    title: "Pick 14-18 Nov with the keyboard only",
    steps: [
      "Open the rate calendar without touching the mouse again.",
      "Tab to the first date cell.",
      "Arrow right to 14 Nov, press Enter, arrow to 18 Nov, press Enter.",
    ],
    expected: "The stay is selected and the nightly rate updates.",
    verdict: { outcome: "not run", by: "none", who: "—", at: "—", note: "Blocked at step 2 — no date cell can take focus, so the script cannot start." },
    agentFinding: "fail",
  },
  {
    id: "TC-09", scenario: "SC-06", device: "Desktop 1440",
    title: "VoiceOver announces the overlay",
    steps: [
      "Turn VoiceOver on, Safari.",
      "Activate the promise strip.",
      "Listen to what is announced, then navigate the rate grid by row.",
    ],
    expected: "The overlay is announced with a name, and rates are read as date + price pairs.",
    verdict: { outcome: "fail", by: "agent", who: "Prism agent", at: "8 Sep 03:19", note: "Nothing announced on open. The cursor stayed on the promise strip behind the backdrop; the grid read as 31 bare numbers." },
    agentFinding: "fail",
  },
  {
    id: "TC-10", scenario: "SC-07", device: "Android",
    title: "System back with the overlay open",
    steps: ["Open the rate calendar.", "Pick 14 Nov.", "Press the system back gesture."],
    expected: "The overlay closes and the picked dates survive.",
    verdict: { outcome: "fail", by: "human", who: "Marcus R.", at: "8 Sep 12:31", note: "Left the resort page entirely and landed on the Oahu listing. Dates gone." },
    agentFinding: "fail",
  },
  {
    id: "TC-11", scenario: "SC-07", device: "iPhone 15",
    title: "Back swipe with the overlay open",
    steps: ["Open the rate calendar.", "Swipe from the left edge."],
    expected: "The overlay closes.",
    verdict: { outcome: "fail", by: "agent", who: "Prism agent", at: "8 Sep 03:22", note: "Navigated away from the resort page. Same defect as TC-10, different gesture." },
    agentFinding: "fail",
  },
  {
    id: "TC-12", scenario: "SC-08", device: "Desktop 1440",
    title: "Rates never arrive",
    steps: [
      "Throttle to Slow 3G and block the rate response.",
      "Open the rate calendar.",
      "Wait 10s.",
    ],
    expected: "The skeleton gives way to the static best-price line and the calendar stays usable.",
    verdict: { outcome: "pass", by: "agent", who: "Prism agent", at: "8 Sep 03:26", note: "Fell back at 4.02s. No spinner left behind." },
    agentFinding: "pass",
  },
  {
    id: "TC-13", scenario: "SC-09", device: "iPhone 15",
    title: "Page behind does not scroll",
    steps: ["Open the rate calendar.", "Drag up and down on the backdrop.", "Close via the X and check the page position."],
    expected: "The page behind is locked while open and unchanged after close.",
    verdict: { outcome: "pass", by: "human", who: "Kaila T.", at: "8 Sep 10:06", note: "Locked and restored, both close paths." },
    agentFinding: "pass",
  },
  {
    id: "TC-14", scenario: "SC-10", device: "Desktop 1440",
    title: "Book Now fires once, and only the attached event",
    steps: [
      "Open the rate calendar and click Book Now.",
      "Reopen the overlay and click Book Now again in the same session.",
      "Read the event stream for this session.",
    ],
    expected: "24138040550_book_now_button_clicks appears once and nothing else is dispatched.",
    verdict: { outcome: "pass", by: "human", who: "Malia K.", at: "8 Sep 13:15", note: "One event. The unattached twin key never appeared, which is what run 4 was decided on." },
    agentFinding: "pass",
  },
];

/* ── Small parts ───────────────────────────────────────────────────── */

const Lock = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
    <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

/** A fact nobody may quietly rewrite: build SHAs, the freeze, a human verdict. */
const Frozen = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-1.5 rounded border border-border bg-surface-2/60 px-2 py-1 font-mono text-[11px] text-muted-2">
    <Lock />{children}
  </span>
);

const Mono = ({ children }: { children: React.ReactNode }) => (
  <span className="font-mono text-[11px] text-muted-2 bg-surface-2 rounded px-1.5 py-0.5">{children}</span>
);

const Label = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-1.5">{children}</div>
);

function verdictLabel(v: Verdict): string {
  if (v.outcome === "not run") return "Not run";
  if (v.outcome === "fail") return v.by === "human" ? "Failed — human" : "Failed — agent";
  return v.by === "human" ? "Passed — human" : "Passed — agent";
}

function verdictTone(v: Verdict): string {
  if (v.outcome === "fail") return "border-danger/40 bg-danger/10 text-danger";
  if (v.outcome === "not run") return "border-border border-dashed bg-surface text-muted-2";
  if (v.by === "human") return "border-ok/40 bg-ok/10 text-ok";
  return "border-border bg-surface-2 text-muted";
}

/* ── The surface ───────────────────────────────────────────────────── */

export function QaPanel() {
  const [cases, setCases] = useState<TestCase[]>(CASES);
  const [device, setDevice] = useState<Device | "All">("All");
  const [outcome, setOutcome] = useState<"all" | "fail" | "not run">("all");
  const [openCase, setOpenCase] = useState<string | null>("TC-01");
  const [agentRun, setAgentRun] = useState<{ wrote: number; preserved: number } | null>(null);

  const gaps = SCENARIOS.filter((s) => !s.covered);
  const covered = SCENARIOS.filter((s) => s.covered);
  const gapPct = Math.round((gaps.length / SCENARIOS.length) * 100);

  const combos = SCENARIOS.length * DEVICES.length;
  const cellFor = (sc: string, d: Device) => cases.find((c) => c.scenario === sc && c.device === d);
  const untried = combos - cases.length;

  const failing = cases.filter((c) => c.verdict.outcome === "fail").length;
  const notRun = cases.filter((c) => c.verdict.outcome === "not run").length;
  const humanVerdicts = cases.filter((c) => c.verdict.by === "human").length;

  const shown = cases.filter((c) =>
    (device === "All" || c.device === device) && (outcome === "all" || c.verdict.outcome === outcome));

  /** The privilege rule, enforced here rather than described in a tooltip:
   *  a human verdict is copied through untouched, and the count of the ones
   *  left alone is reported instead of being invisible. */
  const runAgent = () => {
    const next = cases.map<TestCase>((c) => c.verdict.by === "human" ? c : {
      ...c,
      verdict: {
        outcome: c.agentFinding, by: "agent", who: "Prism agent", at: "10 Sep 09:41",
        note: c.agentFinding === "fail"
          ? `Re-run against build ${RUN.build} — same defect, reproduced.`
          : `Re-run against build ${RUN.build} — behaves as scripted.`,
      },
    });
    setCases(next);
    setAgentRun({ wrote: cases.length - humanVerdicts, preserved: humanVerdicts });
  };

  const resetRun = () => { setCases(CASES); setAgentRun(null); };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="QA"
        count={`${SCENARIOS.length} scenarios · ${cases.length} cases · ${gaps.length} gaps`}
        actions={<>
          <Button variant="outline" size="sm">Export for the readout</Button>
          <Button size="sm">Add a case</Button>
        </>}
      />

      <Toolbar>
        <Chip on={device === "All"} onClick={() => setDevice("All")}>
          All devices <span className="tabular-nums opacity-60">{cases.length}</span>
        </Chip>
        {DEVICES.map((d) => (
          <Chip key={d} on={device === d} onClick={() => setDevice(d)}>
            {d} <span className="tabular-nums opacity-60">{cases.filter((c) => c.device === d).length}</span>
          </Chip>
        ))}
        <div className="w-px h-5 bg-border mx-1" />
        {([["all", "Any outcome", cases.length], ["fail", "Failing", failing], ["not run", "Never run", notRun]] as const).map(([k, label, n]) => (
          <Chip key={k} on={outcome === k} onClick={() => setOutcome(k)}>
            {label} <span className="tabular-nums opacity-60">{n}</span>
          </Chip>
        ))}
        <span className="ml-auto text-[12.5px] text-muted-2">
          Generated from the brief and the compiled file — not written by hand
        </span>
      </Toolbar>

      <div className="flex-1 overflow-auto p-6 space-y-4">

        {/* What this QA pass is about — the frozen half of it looks frozen. */}
        <Section title="What this was generated from" action={<Frozen>{RUN.build}</Frozen>}>
          <div className="px-5 py-2 grid grid-cols-2 gap-x-10">
            <div>
              <Meta k="Experiment" v={RUN.experiment} />
              <Meta k="Page" v={RUN.page} mono />
              <Meta k="Build" v={<Frozen>{RUN.build} · this exact code was tested</Frozen>} />
            </div>
            <div>
              <Meta k="Brief" v={<Frozen>{RUN.brief}</Frozen>} />
              <Meta k="Run" v={RUN.closed} />
              <Meta k="Result" v={<span className="tabular-nums">{RUN.lift}</span>} />
            </div>
          </div>
          <div className="px-5 py-3 border-t border-border text-[12.5px] text-muted-2">
            Scenario set regenerated {RUN.generated}. The build and the brief are frozen, so this list is
            reproducible; the verdicts below are not part of the freeze.
          </div>
        </Section>

        {/* ── COVERAGE. The headline is the gap count, not the tick count. ── */}
        <Section
          title="Coverage — what the brief implies, and what the build does"
          action={<Pill tone="danger">{gaps.length} not handled</Pill>}>

          <div className="px-5 py-4 border-b border-border">
            <Label>THE HEADLINE</Label>
            <p className="text-[14.5px] leading-relaxed">
              <span className="font-semibold text-danger tabular-nums">{gaps.length} of {SCENARIOS.length}</span> scenarios the
              brief implies have no code path in build <span className="font-mono text-[12.5px]">{RUN.build}</span>. Run 4 closed
              at <span className="tabular-nums">{RUN.lift}</span> without any of them being handled — the guests who hit one of
              these are inside that number.
            </p>
            <div className="flex items-center gap-3 mt-3.5">
              <div className="h-1.5 w-40 rounded-full bg-surface-2 overflow-hidden flex">
                <div className="h-full bg-danger" style={{ width: `${gapPct}%` }} />
                <div className="h-full bg-ok" style={{ width: `${100 - gapPct}%` }} />
              </div>
              <span className="text-[12.5px] text-muted tabular-nums">
                {gapPct}% gap · {covered.length} handled
              </span>
            </div>
          </div>

          {gaps.map((s) => (
            <div key={s.id} className="px-5 py-3.5 border-b border-border border-l-2 border-l-danger bg-danger/[0.03]">
              <div className="flex items-start gap-3">
                <span className="font-mono text-[11px] text-muted-2 w-[46px] shrink-0 pt-1">{s.id}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[14.5px] font-semibold">{s.title}</div>
                  <p className="text-[13.5px] text-muted leading-relaxed mt-1">{s.implies}</p>
                  <p className="text-[13.5px] text-danger leading-relaxed mt-1.5">{s.build}</p>
                  <div className="mt-2"><Mono>{s.evidence}</Mono></div>
                </div>
                <Pill tone="danger">gap</Pill>
              </div>
            </div>
          ))}

          {/* Quiet by design. Nobody needs to read a tick. */}
          {covered.map((s) => (
            <div key={s.id} className="flex items-start gap-3 px-5 py-3 border-b border-border last:border-0">
              <span className="font-mono text-[11px] text-muted-2 w-[46px] shrink-0 pt-0.5">{s.id}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px]">{s.title}</div>
                <div className="text-[12.5px] text-muted-2 mt-0.5">{s.build}</div>
              </div>
              <Pill tone="ok">handled</Pill>
            </div>
          ))}
        </Section>

        {/* ── The grid. Blank is a finding, so blank is written out. ── */}
        <Section
          title="Device × scenario"
          action={<span className="text-[12.5px] text-muted-2 tabular-nums">
            {cases.length} of {combos} combinations covered · {untried} never tried
          </span>}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-surface-2/80">
                <tr>
                  <Th first>Scenario</Th>
                  {DEVICES.map((d) => <Th key={d}>{d}</Th>)}
                </tr>
              </thead>
              <tbody>
                {SCENARIOS.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className={cn("px-4 pl-6 py-2.5 max-w-[300px]", !s.covered && "border-l-2 border-l-danger")}>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-muted-2">{s.id}</span>
                        <span className="text-[13.5px] truncate">{s.title}</span>
                        {!s.covered && <span className="shrink-0 text-[10.5px] font-bold tracking-[0.07em] text-danger bg-danger/10 rounded px-1.5 py-0.5">GAP</span>}
                      </div>
                    </td>
                    {DEVICES.map((d) => {
                      const c = cellFor(s.id, d);
                      if (!c) return (
                        <td key={d} className="px-4 py-2.5">
                          <span className="text-[12.5px] text-muted-2">never tried</span>
                        </td>
                      );
                      return (
                        <td key={d} className="px-4 py-2.5">
                          <button onClick={() => setOpenCase(c.id)}
                            className={cn("w-full rounded-md border px-2 py-1.5 text-left transition-colors hover:border-border-strong", verdictTone(c.verdict))}>
                            <div className="text-[11.5px] font-semibold whitespace-nowrap">{verdictLabel(c.verdict)}</div>
                            <div className="font-mono text-[10.5px] opacity-70">{c.id}</div>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border-strong">
                  <td className="px-4 pl-6 py-2.5 text-[11.5px] font-semibold tracking-[0.07em] text-muted-2">FAILING ON THIS DEVICE</td>
                  {DEVICES.map((d) => {
                    const onDevice = cases.filter((c) => c.device === d);
                    const bad = onDevice.filter((c) => c.verdict.outcome === "fail").length;
                    return (
                      <td key={d} className="px-4 py-2.5 text-[13px] tabular-nums">
                        <span className={cn(bad > 0 ? "text-danger font-semibold" : "text-muted-2")}>{bad}</span>
                        <span className="text-muted-2"> of {onDevice.length}</span>
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        </Section>

        {/* ── Test cases, and the rule about who may overwrite whom. ── */}
        <Section
          title="Test cases"
          action={<div className="flex items-center gap-3">
            <span className="text-[12.5px] text-muted-2 tabular-nums">
              {shown.length} shown · {failing} failing · {notRun} never run
            </span>
            {agentRun
              ? <Button size="sm" variant="outline" onClick={resetRun}>Undo the agent run</Button>
              : <Button size="sm" variant="outline" onClick={runAgent}>Re-run the agent</Button>}
          </div>}>

          <div className="px-5 py-3.5 border-b border-border flex items-start gap-3 bg-surface-2/40">
            <Frozen>privilege rule</Frozen>
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] leading-relaxed">
                An agent run may never overwrite a human verdict. A verdict a person recorded is a locked receipt;
                an agent verdict is plain text and the next run replaces it.
              </p>
              {agentRun
                ? <p className="text-[13px] text-muted mt-1.5 tabular-nums">
                    Last run wrote <span className="text-foreground font-medium">{agentRun.wrote}</span> verdicts and left
                    {" "}<span className="text-foreground font-medium">{agentRun.preserved}</span> human receipts exactly as they were.
                  </p>
                : <p className="text-[13px] text-muted-2 mt-1.5 tabular-nums">
                    {humanVerdicts} of {cases.length} verdicts are human receipts. An agent re-run can touch the
                    other {cases.length - humanVerdicts}.
                  </p>}
            </div>
          </div>

          {shown.length === 0 ? (
            <div className="flex min-h-[200px]">
              <Empty
                title="No case for that combination"
                body="Nobody has scripted a case that matches this filter. An untested combination is a gap in the evidence, not a pass."
                action={<Button size="sm" onClick={() => { setDevice("All"); setOutcome("all"); }}>Show every case</Button>}
              />
            </div>
          ) : shown.map((c) => {
            const sc = SCENARIOS.find((s) => s.id === c.scenario);
            const open = openCase === c.id;
            const locked = c.verdict.by === "human";
            return (
              <div key={c.id} className={cn("border-b border-border last:border-0", sc && !sc.covered && "border-l-2 border-l-danger")}>
                <button onClick={() => setOpenCase(open ? null : c.id)}
                  className="w-full text-left flex items-center gap-3 px-5 py-3.5 hover:bg-surface-2/60">
                  <span className="font-mono text-[11px] text-muted-2 w-[46px] shrink-0">{c.id}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium truncate">{c.title}</div>
                    <div className="text-[12.5px] text-muted-2 truncate mt-0.5">
                      {c.scenario} · {sc?.title}
                    </div>
                  </div>
                  <Pill tone="muted">{c.device}</Pill>
                  {locked
                    ? <Frozen>{verdictLabel(c.verdict)} · {c.verdict.who} · {c.verdict.at}</Frozen>
                    : <span className={cn("text-[13px] whitespace-nowrap",
                        c.verdict.outcome === "fail" ? "text-danger" : c.verdict.outcome === "not run" ? "text-muted-2" : "text-muted")}>
                        {verdictLabel(c.verdict)} · {c.verdict.who}
                      </span>}
                  <span className={cn("text-[12px] text-muted-2 w-3 shrink-0 text-right", open && "rotate-90 inline-block")}>›</span>
                </button>

                {open && (
                  <div className="px-5 pb-4 pl-[70px]">
                    <div className="rounded-lg border border-border bg-surface-2/40 p-4">
                      <Label>STEPS</Label>
                      <ol className="space-y-1.5 mb-4">
                        {c.steps.map((step, i) => (
                          <li key={step} className="flex gap-2.5 text-[13.5px] leading-relaxed">
                            <span className="text-muted-2 tabular-nums shrink-0">{i + 1}.</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                      <Label>EXPECTED</Label>
                      <p className="text-[13.5px] mb-4">{c.expected}</p>
                      <Label>WHAT HAPPENED</Label>
                      <p className={cn("text-[13.5px] leading-relaxed", c.verdict.outcome === "fail" && "text-danger")}>
                        {c.verdict.note}
                      </p>
                      <div className="flex items-center gap-3 mt-4 pt-3.5 border-t border-border">
                        {locked ? (
                          <>
                            <Frozen>recorded by {c.verdict.who} · {c.verdict.at} · agent runs skip this</Frozen>
                            <span className="text-[12.5px] text-muted-2">Only a person can change a person&rsquo;s verdict.</span>
                          </>
                        ) : (
                          <>
                            <span className="text-[12.5px] text-muted-2">
                              {c.verdict.by === "agent"
                                ? `Agent verdict from ${c.verdict.at}. The next run overwrites it.`
                                : "No verdict yet. The next agent run will write one."}
                            </span>
                            <Button size="sm" variant="outline" className="ml-auto">Record a human verdict</Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </Section>
      </div>
    </div>
  );
}
