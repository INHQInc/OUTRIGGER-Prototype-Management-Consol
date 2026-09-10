"use client";

/**
 * METRIC BUILDER — the deliberate non-AI counterpart to the planner.
 *
 * The planner takes a sentence and proposes events. This takes events and
 * shows you the sentence. Nothing here is inferred: you pick, and the panel
 * prints the arithmetic. The preview runs `readDefinition()` — the SAME
 * function the readout runs on the saved metric — so before-save equals
 * after-save. A preview computed a second way is a preview that can lie.
 *
 * The load-bearing piece is THE LEAK CHECK. Excluding an event from one
 * version's definition is right often enough that forbidding it would be
 * wrong: when the new version introduces a surface, the old version genuinely
 * has nothing to count. It is wrong when the event fires in BOTH versions and
 * is left out of one side — that removes real clicks from one arm only, and
 * the gap reads wider than it is. The definition alone cannot tell you which
 * case you are in; the DATA can. So the check never forbids. It names the
 * event, prints the number it fired in the arm you left it out of, and shows
 * both readings next to each other.
 *
 * Two rules carried over from the plan, because a metric built here lands in
 * the same index: an event this experiment does not report cannot be bound
 * (it reads as a dash forever), and a definition whose old version can never
 * convert cannot be the number that decides it.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";
import { Pill, Section, Meta, Th, PageHeader, Toolbar, Chip, Empty } from "./ui";

/* ── Fixtures ───────────────────────────────────────────────────────────
   Run 4 of "Rate-calendar best-price promise", closed 8 Sep 2026. Real event
   keys from Optimizely project 24138040550, duplicate display names and all.
   Counts are summed ACTIONS in the run, per arm. */

type Arm = "control" | "variation";
type Role = "decision" | "supporting" | "guardrail" | "exploratory";

const SESSIONS: Record<Arm, number> = { control: 9187, variation: 9225 };

interface BuilderEvent {
  key: string;
  name: string;
  type: "click" | "pageview";
  /** Does THIS experiment report it? An unreported event reads as a dash forever. */
  reported: boolean;
  where: string;
  /** Summed actions in run 4. null when the experiment does not report it. */
  actions: Record<Arm, number> | null;
  /** Why a derived pairing might get this one wrong. Shown by the leak check. */
  note?: string;
}

const BOOK_NOW = "24138040550_book_now_button_clicks";
const ANIMATED = "24138040550_animated_cta_book_now_clicks";
const PROMISE = "24138040550_opmc__rate_calendar_promise_click";
const HERO = "24138040550_hero_cta_click";
const OFFERS = "24138040550_all_offers_page";
const HOME = "24138040550_home";

const EVENTS: BuilderEvent[] = [
  {
    key: BOOK_NOW, name: "Offer Detail Book Now Button Clicks", type: "click", reported: true,
    where: "Book Now on the offer detail card, under the rate calendar",
    actions: { control: 269, variation: 275 },
  },
  {
    key: "24138040550_offer_detail_book_now_button_clicks", name: "Offer Detail Book Now Button Clicks", type: "click",
    reported: false, where: "Never attached to a running experiment", actions: null,
  },
  {
    key: ANIMATED, name: "Animated Book Now CTA Clicks", type: "click", reported: true,
    where: "The sticky Book Now bar — on both versions of the page",
    actions: { control: 90, variation: 94 },
    note: "Build 8c1d7e2 re-mounts this button inside the new rate-calendar block, which is why a pairing derived from the code reads it as new. The event key never changed, and the page as it is today still fires it.",
  },
  {
    key: PROMISE, name: "Best-price promise — rate calendar", type: "click", reported: true,
    where: "The promise strip inside the rate calendar. Introduced by build 8c1d7e2",
    actions: { control: 0, variation: 118 },
    note: "There is no element on the page as it is today that fires this. The build introduced it.",
  },
  {
    key: HERO, name: "Hero CTA Click", type: "click", reported: true,
    where: "Check availability, in the property hero",
    actions: { control: 744, variation: 750 },
  },
  {
    key: "24138040550_hero_cta_click_1", name: "Hero CTA Click", type: "click", reported: false,
    where: "Never attached to a running experiment", actions: null,
  },
  {
    key: OFFERS, name: "All Offers Page", type: "pageview", reported: true,
    where: "Any view of /offers", actions: { control: 1856, variation: 2066 },
  },
  {
    key: HOME, name: "All Outrigger", type: "pageview", reported: true,
    where: "Any view of any outrigger.com page", actions: { control: 11204, variation: 11268 },
  },
];

/** Names the project uses more than once. Computed, so the fixture can grow. */
const DUPLICATE_NAMES = new Set(
  EVENTS.filter((e) => EVENTS.some((o) => o.key !== e.key && o.name === e.name)).map((e) => e.name),
);

const REPORTED = EVENTS.filter((e) => e.reported);
const PROJECT_EVENT_COUNT = 48;

/** What run 4 was actually read with. Frozen; nothing here may edit it. */
const FROZEN_DEFINITION = [BOOK_NOW, ANIMATED];
const FROZEN_STATS = "95% CI +0.3 to +4.5 · p 0.031";

/** Build 8c1d7e2's own targets — the prefill for per-version mode. A guess
 *  read out of the code, which is exactly why the leak check reads the data. */
const BUILD_TOUCHES = [BOOK_NOW, ANIMATED, PROMISE];
const BUILD_PRIOR = [BOOK_NOW];

const ROLE_LABEL: Record<Role, string> = {
  decision: "Decides it", supporting: "Supporting", guardrail: "Guardrail", exploratory: "Exploratory",
};

const ARM_WORD: Record<Arm, string> = { control: "old version", variation: "new version" };

/* ── The reading ────────────────────────────────────────────────────────
   One function. The readout calls it on the saved definition; the preview
   calls it on the definition in front of you. That is the whole guarantee. */

interface Definition { control: string[]; variation: string[] }
interface Part { key: string; n: number }
interface ArmRead { parts: Part[]; actions: number; sessions: number; rate: number }
interface Reading { control: ArmRead; variation: ArmRead; lift: number | null }

const byKey = new Map(EVENTS.map((e) => [e.key, e] as const));
const actionsOf = (key: string, arm: Arm) => byKey.get(key)?.actions?.[arm] ?? 0;

function readArm(keys: string[], arm: Arm): ArmRead {
  // Ordered by the catalogue, never by click order, so the sum reads the same twice.
  const parts: Part[] = EVENTS.filter((e) => keys.includes(e.key)).map((e) => ({ key: e.key, n: actionsOf(e.key, arm) }));
  const actions = parts.reduce((t, p) => t + p.n, 0);
  const sessions = SESSIONS[arm];
  return { parts, actions, sessions, rate: actions / sessions };
}

function readDefinition(d: Definition): Reading {
  const control = readArm(d.control, "control");
  const variation = readArm(d.variation, "variation");
  return { control, variation, lift: control.actions > 0 ? (variation.rate / control.rate - 1) * 100 : null };
}

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
const num = (n: number) => n.toLocaleString("en-US");
const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((k) => b.includes(k));
const without = (list: string[], key: string) => list.filter((k) => k !== key);
const plus = (list: string[], key: string) => (list.includes(key) ? list : [...list, key]);

/* ── Small parts ────────────────────────────────────────────────────── */

const Mono = ({ children }: { children: React.ReactNode }) => (
  <span className="font-mono text-[11px] text-muted-2 bg-surface-2 rounded px-1.5 py-0.5">{children}</span>
);

const Micro = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2">{children}</div>
);

const Lock = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
    <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

/** Frozen facts are a receipt. Everything you can still change is plain text. */
const Receipt = ({ lines }: { lines: string[] }) => (
  <div className="rounded-lg border border-border bg-surface-2/60 px-3.5 py-3 font-mono text-[11px] leading-[1.7] text-muted-2 tabular-nums">
    <div className="flex items-center gap-1.5 text-muted mb-1"><Lock />COMPUTED AGAINST — FROZEN</div>
    {lines.map((l) => <div key={l}>{l}</div>)}
  </div>
);

const Tick = ({ on, disabled, title, onClick }: { on: boolean; disabled?: boolean; title: string; onClick: () => void }) => (
  <button type="button" title={title} disabled={disabled} onClick={onClick}
    className={cn("w-[18px] h-[18px] rounded border grid place-items-center transition-colors",
      on ? "bg-accent border-accent text-accent-fg"
        : disabled ? "border-border bg-surface-2 cursor-not-allowed"
          : "border-border-strong bg-surface hover:border-accent")}>
    {on && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
  </button>
);

/** One arm's contribution for one event, in the picker. */
const RateCell = ({ e, arm, counted }: { e: BuilderEvent; arm: Arm; counted: boolean }) => {
  if (!e.actions) return <td className="px-4 py-3 text-right text-[13px] text-muted-2 tabular-nums align-top">—</td>;
  const n = e.actions[arm];
  return (
    <td className={cn("px-4 py-3 text-right align-top tabular-nums", counted ? "bg-accent/[0.05]" : "")}>
      <div className={cn("text-[13.5px]", counted ? "text-foreground font-medium" : "text-muted-2")}>{pct(n / SESSIONS[arm])}</div>
      <div className="text-[12px] text-muted-2 mt-0.5">{num(n)} actions</div>
    </td>
  );
};

/* ── The builder ────────────────────────────────────────────────────── */

export function MetricBuilder({ onClose }: { onClose?: () => void }) {
  const [label, setLabel] = useState("Reached the booking step");
  const [role, setRole] = useState<Role>("decision");
  const [direction, setDirection] = useState<"up" | "down">("up");
  const [directionDeclared, setDirectionDeclared] = useState(false);
  const [perArm, setPerArm] = useState(false);
  const [hideUnreported, setHideUnreported] = useState(false);
  const [pairedTo, setPairedTo] = useState<string>(BOOK_NOW);
  const [def, setDef] = useState<Definition>({ control: [...FROZEN_DEFINITION], variation: [...FROZEN_DEFINITION] });

  /* Reading — the one the readout will run. */
  const r = readDefinition(def);
  const matchesFrozen = sameSet(def.control, FROZEN_DEFINITION) && sameSet(def.variation, FROZEN_DEFINITION);

  /* Enforced, not requested: if the old version can never convert on this,
     it cannot be the number that decides the experiment. */
  const canDecide = r.control.actions > 0;
  const effectiveRole: Role = role === "decision" && !canDecide ? "supporting" : role;
  const demoted = role === "decision" && !canDecide;

  const setBoth = (fn: (list: string[]) => string[]) => setDef((d) => ({ control: fn(d.control), variation: fn(d.variation) }));
  const toggle = (key: string, arm?: Arm) => {
    if (!arm) {
      const on = def.control.includes(key) && def.variation.includes(key);
      setBoth((l) => (on ? without(l, key) : plus(l, key)));
      return;
    }
    setDef((d) => ({ ...d, [arm]: d[arm].includes(key) ? without(d[arm], key) : plus(d[arm], key) }));
  };

  const enterPerArm = () => {
    setPerArm(true);
    setDef({ control: [...BUILD_PRIOR], variation: [...BUILD_TOUCHES] });
    setPairedTo(BOOK_NOW);
  };
  const leavePerArm = () => {
    setPerArm(false);
    // Merge rather than drop: nothing you picked disappears without you seeing it.
    setDef((d) => {
      const union = EVENTS.filter((e) => d.control.includes(e.key) || d.variation.includes(e.key)).map((e) => e.key);
      return { control: union, variation: union };
    });
  };
  const repair = (key: string, arm: Arm) => setDef((d) => ({ ...d, [arm]: plus(d[arm], key) }));
  const pair = (next: string) => {
    setDef((d) => {
      let control = pairedTo ? without(d.control, pairedTo) : d.control;
      if (next) control = plus(control, next);
      return { ...d, control };
    });
    setPairedTo(next);
  };

  /* ── The leak check ──────────────────────────────────────────────────
     Every event one side counts and the other does not, with the number it
     fired in the side that leaves it out, and both readings. */
  const asymmetric = EVENTS.filter((e) => def.control.includes(e.key) !== def.variation.includes(e.key));
  const checks = asymmetric.map((e) => {
    const countedIn: Arm = def.variation.includes(e.key) ? "variation" : "control";
    const leftOutOf: Arm = countedIn === "variation" ? "control" : "variation";
    const firedThere = actionsOf(e.key, leftOutOf);
    const ifCounted = readDefinition({ ...def, [leftOutOf]: plus(def[leftOutOf], e.key) });
    return { e, countedIn, leftOutOf, firedThere, ifCounted, leaking: firedThere > 0 };
  });
  const leaks = checks.filter((c) => c.leaking);

  const rows = EVENTS.filter((e) => (hideUnreported ? e.reported : true));
  const homeEvent = byKey.get(HOME);
  const homeControl = homeEvent?.actions?.control ?? 0;

  const good = r.lift === null ? null : direction === "up" ? r.lift > 0 : r.lift < 0;
  const liftTone = r.lift === null || r.lift === 0 ? "text-muted-2" : good ? "text-ok" : "text-danger";

  const blocked =
    !label.trim() ? "Name it first — the readout says this name out loud."
      : r.variation.parts.length === 0 ? "Pick at least one event for the new version."
        : r.control.parts.length === 0 ? "The old version counts nothing, so there is no comparison to read."
          : !directionDeclared ? "Say which way a win goes. A direction nobody stated becomes an assumption inside the verdict."
            : null;

  return (
    <div className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-[2px] grid place-items-center p-6" role="dialog" aria-modal="true">
      <div className="w-full max-w-[1180px] max-h-[92vh] rounded-xl border border-border-strong bg-background overflow-hidden flex flex-col">

        <PageHeader
          title="Build a metric"
          count="Rate-calendar best-price promise · run 4"
          actions={<>
            <span className="text-[12.5px] text-muted-2">Picked, not described — nothing on this panel is inferred.</span>
            <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
          </>}
        />

        <Toolbar>
          <Chip on={!perArm} onClick={() => perArm && leavePerArm()}>Same events in both versions</Chip>
          <Chip on={perArm} onClick={() => !perArm && enterPerArm()}>Different events per version</Chip>
          <span className="w-px h-5 bg-border mx-1" />
          <Chip on={hideUnreported} onClick={() => setHideUnreported((v) => !v)}>Hide what this experiment can&rsquo;t report</Chip>
          <span className="ml-auto text-[12.5px] text-muted-2 tabular-nums">
            {REPORTED.length} of your project&rsquo;s {PROJECT_EVENT_COUNT} events are reported here · {rows.length} shown
          </span>
        </Toolbar>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* ── What it is ───────────────────────────────────────────── */}
          <Section title="What this metric is">
            <div className="px-5 py-4 flex flex-wrap items-end gap-6">
              <div className="flex-1 min-w-[280px]">
                <Micro>WHAT IT IS CALLED</Micro>
                <input value={label} onChange={(ev) => setLabel(ev.target.value)} placeholder="Say it the way you would say it out loud"
                  className="mt-1.5 w-full h-10 px-3 rounded-lg border border-border bg-surface text-[14.5px] placeholder:text-muted-2 focus:border-accent focus:outline-none" />
              </div>
              <div>
                <Micro>WHAT IT DOES</Micro>
                <select value={role} onChange={(ev) => setRole(ev.target.value as Role)}
                  className="mt-1.5 h-10 px-2.5 rounded-lg border border-border bg-surface text-[13.5px] text-muted focus:border-accent focus:outline-none">
                  {(Object.keys(ROLE_LABEL) as Role[]).map((v) => (
                    <option key={v} value={v} disabled={v === "decision" && !canDecide}>{ROLE_LABEL[v]}</option>
                  ))}
                </select>
              </div>
              <div>
                <Micro>A WIN MEANS IT GOES</Micro>
                <div className="mt-1.5 flex gap-1.5">
                  <Chip on={directionDeclared && direction === "up"} onClick={() => { setDirection("up"); setDirectionDeclared(true); }}>↑ Up</Chip>
                  <Chip on={directionDeclared && direction === "down"} onClick={() => { setDirection("down"); setDirectionDeclared(true); }}>↓ Down</Chip>
                </div>
              </div>
            </div>

            {!directionDeclared && (
              <div className="px-5 py-2.5 border-t border-border bg-warn/5 text-[12.5px] text-warn leading-relaxed">
                Nobody has said which way this should move. The preview below is computed as if <span className="font-semibold">up</span> is
                the win — an assumption, not your answer, and direction is the one control that can invert a verdict.
              </div>
            )}
            {demoted && (
              <div className="px-5 py-2.5 border-t border-border bg-warn/5 flex items-center gap-2.5">
                <Pill tone="warn">demoted to supporting</Pill>
                <span className="text-[12.5px] text-warn leading-relaxed">
                  Every surface this counts lives in the new version. The old version has no way to convert on it, so it can report but it cannot decide.
                </span>
              </div>
            )}
          </Section>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-4 items-start">

            {/* ── Picker ─────────────────────────────────────────────── */}
            <Section title="Pick the events">
              {perArm && (
                <div className="px-5 py-4 border-b border-border bg-surface-2/40">
                  <Micro>PAIR A NEW-VERSION SURFACE WITH THE OLD VERSION&rsquo;S EQUIVALENT</Micro>
                  <div className="mt-2.5 flex items-center gap-2.5 flex-wrap">
                    <Pill tone="accent">new version only</Pill>
                    <span className="text-[14px] font-medium">Best-price promise — rate calendar</span>
                    <span className="text-[13px] text-muted-2">stands in for</span>
                    <select value={pairedTo} onChange={(ev) => pair(ev.target.value)}
                      className="h-8 px-2.5 rounded-lg border border-border bg-surface text-[13px] text-muted max-w-[280px] focus:border-accent focus:outline-none">
                      <option value="">nothing — the old version has no equivalent</option>
                      {REPORTED.filter((e) => (e.actions?.control ?? 0) > 0).map((e) => (
                        <option key={e.key} value={e.key}>{e.name}</option>
                      ))}
                    </select>
                  </div>
                  <p className="text-[12.5px] text-muted-2 mt-2.5 leading-relaxed">
                    Both sides were prefilled from build <span className="font-mono text-[11.5px]">8c1d7e2</span> — the three click surfaces it
                    touches, and what it says was there before. That is a guess read out of the code. The leak check reads the data.
                  </p>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead className="bg-surface-2/70">
                    <tr>
                      <Th first>Event</Th>
                      <Th>Old version</Th>
                      <Th>New version</Th>
                      {perArm
                        ? <><Th>Count in old</Th><Th>Count in new</Th></>
                        : <Th>Count it</Th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((e) => {
                      const inC = def.control.includes(e.key);
                      const inV = def.variation.includes(e.key);
                      const oneArm = Boolean(e.actions && e.actions.control === 0 && e.actions.variation > 0);
                      return (
                        <tr key={e.key} className={cn("border-b border-border last:border-0", (inC || inV) && "bg-accent/[0.03]")}>
                          <td className="px-4 pl-6 py-3 align-top max-w-[420px]">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={cn("text-[14px] font-medium", !e.reported && "text-muted-2")}>{e.name}</span>
                              {oneArm && <Pill tone="accent">new version only</Pill>}
                              {DUPLICATE_NAMES.has(e.name) && <Pill tone="muted">name used twice</Pill>}
                              {e.type === "pageview" && <Pill tone="muted">pageview</Pill>}
                            </div>
                            <div className="mt-1.5"><Mono>{e.key}</Mono></div>
                            <div className="text-[12.5px] text-muted-2 mt-1 leading-relaxed">{e.where}</div>
                            {!e.reported && (
                              <div className="text-[12.5px] text-warn mt-1.5 leading-relaxed">
                                This experiment does not report it. Bound to a metric it reads as a dash forever, inside a report that otherwise looks fine.
                              </div>
                            )}
                          </td>
                          <RateCell e={e} arm="control" counted={inC} />
                          <RateCell e={e} arm="variation" counted={inV} />
                          {perArm ? (
                            <>
                              <td className="px-4 py-3 text-center align-top">
                                <Tick on={inC} disabled={!e.reported} onClick={() => toggle(e.key, "control")}
                                  title={e.reported ? `Count ${e.name} in the old version` : "This experiment does not report it"} />
                              </td>
                              <td className="px-4 py-3 text-center align-top">
                                <Tick on={inV} disabled={!e.reported} onClick={() => toggle(e.key, "variation")}
                                  title={e.reported ? `Count ${e.name} in the new version` : "This experiment does not report it"} />
                              </td>
                            </>
                          ) : (
                            <td className="px-4 py-3 text-center align-top">
                              <Tick on={inC && inV} disabled={!e.reported} onClick={() => toggle(e.key)}
                                title={e.reported ? `Count ${e.name} in both versions` : "This experiment does not report it"} />
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border-strong bg-surface-2/50">
                      <td className="px-4 pl-6 py-3 text-[12.5px] font-semibold tracking-[0.03em] text-muted-2">IN THE METRIC</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <div className="text-[13.5px] font-semibold">{pct(r.control.rate)}</div>
                        <div className="text-[12px] text-muted-2 mt-0.5">{num(r.control.actions)} actions</div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <div className="text-[13.5px] font-semibold">{pct(r.variation.rate)}</div>
                        <div className="text-[12px] text-muted-2 mt-0.5">{num(r.variation.actions)} actions</div>
                      </td>
                      <td className="px-4 py-3 text-center text-[12.5px] text-muted-2 tabular-nums" colSpan={perArm ? 2 : 1}>
                        {perArm ? `${def.control.length} / ${def.variation.length}` : def.variation.length}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="px-5 py-3 border-t border-border text-[12.5px] text-muted-2 leading-relaxed">
                The two greyed rows are near-duplicates of events you can pick — same display name, different key, never attached to this
                experiment. They are listed rather than hidden so you can see what you are not picking.
              </div>
            </Section>

            {/* ── Preview ────────────────────────────────────────────── */}
            <div className="space-y-4 lg:sticky lg:top-0">
              <Section title="What it will read"
                action={matchesFrozen
                  ? <Pill tone="ok">as run 4 was read</Pill>
                  : <Pill tone="warn">a new reading</Pill>}>

                {r.control.parts.length === 0 && r.variation.parts.length === 0 ? (
                  <Empty
                    title="Nothing picked yet"
                    body="Tick an event and the arithmetic appears here. It is the same arithmetic the readout runs on the saved metric, so what you see before you save is what it reads after."
                  />
                ) : (
                  <>
                    {(["control", "variation"] as Arm[]).map((arm) => {
                      const a = arm === "control" ? r.control : r.variation;
                      return (
                        <div key={arm} className="px-5 py-3.5 border-b border-border">
                          <Micro>{arm === "control" ? "OLD VERSION" : "NEW VERSION"}</Micro>
                          <div className="text-[14px] tabular-nums mt-1.5 leading-relaxed">
                            {a.parts.length === 0 ? "0" : a.parts.map((p) => num(p.n)).join(" + ")}
                            {a.parts.length > 1 && <> = {num(a.actions)}</>} actions ÷ {num(a.sessions)} sessions
                            {" = "}<span className="font-semibold">{pct(a.rate)}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">{a.parts.map((p) => <Mono key={p.key}>{p.key}</Mono>)}</div>
                          {a.parts.length === 0 && (
                            <div className="text-[12.5px] text-warn mt-2 leading-relaxed">
                              This version counts nothing, so there is no gap to read — only a number one side happens to have.
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <div className="px-5 py-4 border-b border-border">
                      <Micro>READS AS</Micro>
                      <div className="flex items-baseline gap-3 mt-1.5">
                        <span className={cn("text-[26px] font-semibold tabular-nums tracking-[-0.02em]", liftTone)}>
                          {r.lift === null ? "—" : signed(r.lift)}
                        </span>
                        <span className="text-[13px] text-muted leading-snug">
                          {r.lift === null
                            ? "nothing to compare against"
                            : <>{pct(r.variation.rate)} against {pct(r.control.rate)} — {good ? "a win" : "the wrong way"}, if a win is this going {direction}</>}
                        </span>
                      </div>
                      {!directionDeclared && r.lift !== null && (
                        <div className="text-[12.5px] text-warn mt-2 leading-relaxed">
                          Read with the assumed direction. Say it out loud above and the same {signed(r.lift)} becomes
                          {" "}{r.lift > 0 ? "a win under ↑ and a loss under ↓" : "a loss under ↑ and a win under ↓"}.
                        </div>
                      )}
                      <div className="text-[12.5px] text-muted-2 mt-2.5 leading-relaxed">
                        {matchesFrozen
                          ? <>{FROZEN_STATS}. This is the definition run 4 was read with, so the run&rsquo;s own statistics still apply.</>
                          : <>No confidence interval and no p-value. Those belong to the definition the run was read with; a different definition is a different reading and has to be recomputed before anyone calls it significant.</>}
                      </div>
                    </div>

                    <div className="px-5 py-4">
                      <Receipt lines={[
                        "run 4 · closed 8 Sep 2026 · 18,412 sessions",
                        `arms · control ${num(SESSIONS.control)} / variation ${num(SESSIONS.variation)}`,
                        "brief rev 3 · frozen 26 Aug 2026 09:14",
                        "build 8c1d7e2",
                      ]} />
                      <p className="text-[12.5px] text-muted-2 mt-2.5 leading-relaxed">
                        The counts above are settled. The definition is not — that is the only thing this panel changes.
                      </p>
                    </div>
                  </>
                )}
              </Section>
            </div>
          </div>

          {/* ── The leak check ───────────────────────────────────────── */}
          <Section title="The leak check"
            action={leaks.length
              ? <Pill tone="warn">{leaks.length} to look at</Pill>
              : checks.length ? <Pill tone="ok">{checks.length} checked, nothing leaking</Pill> : <Pill tone="muted">nothing to check</Pill>}>

            <div className="px-5 py-3 border-b border-border text-[13px] text-muted leading-relaxed">
              Leaving an event out of one version is allowed, and often right. Nothing here blocks a save — the definition cannot tell the
              two cases apart, so the check names the event, prints what it fired in the version you left it out of, and shows both readings.
            </div>

            {checks.length === 0 ? (
              <div className="px-5 py-3.5 text-[13.5px] text-muted">
                Both versions count the same {def.variation.length} event{def.variation.length === 1 ? "" : "s"}, so nothing can leak. The
                check runs again the moment the two lists differ.
              </div>
            ) : checks.map((c) => (
              <div key={c.e.key} className={cn("px-5 py-4 border-b border-border last:border-0", c.leaking && "bg-warn/5")}>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <Pill tone={c.leaking ? "warn" : "ok"}>{c.leaking ? "this one is wrong" : "this one is right"}</Pill>
                  <span className="text-[14px] font-medium">{c.e.name}</span>
                  <Mono>{c.e.key}</Mono>
                  <span className="ml-auto text-[12.5px] text-muted-2">counted in the {ARM_WORD[c.countedIn]} only</span>
                </div>

                <p className="text-[13.5px] text-muted mt-2.5 leading-relaxed">
                  It fired <span className={cn("font-semibold tabular-nums", c.leaking ? "text-warn" : "text-foreground")}>{num(c.firedThere)}</span>
                  {" "}times in the {ARM_WORD[c.leftOutOf]}, which your definition does not count.
                  {c.e.note && <span className="text-muted-2"> {c.e.note}</span>}
                </p>

                {c.leaking ? (
                  <>
                    <div className="mt-3 rounded-lg border border-border bg-surface">
                      {[
                        { k: "AS YOU HAVE DEFINED IT", read: r, lead: true },
                        { k: "IF BOTH VERSIONS COUNT IT", read: c.ifCounted, lead: false },
                      ].map((row) => (
                        <div key={row.k} className="flex items-center gap-4 px-4 py-2.5 border-b border-border last:border-0">
                          <span className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 w-[184px] shrink-0">{row.k}</span>
                          <span className="text-[13px] tabular-nums text-muted">old {pct(row.read.control.rate)}</span>
                          <span className="text-[13px] tabular-nums text-muted">new {pct(row.read.variation.rate)}</span>
                          <span className={cn("text-[14px] font-semibold tabular-nums ml-auto", row.lead ? "text-warn" : "text-foreground")}>
                            {row.read.lift === null ? "—" : signed(row.read.lift)}
                          </span>
                        </div>
                      ))}
                    </div>

                    <p className="text-[13.5px] mt-3 leading-relaxed">
                      {r.lift !== null && c.ifCounted.lift !== null && (
                        <>
                          <span className="font-semibold tabular-nums">{Math.abs(r.lift - c.ifCounted.lift).toFixed(1)} points</span> of that gap
                          is bookkeeping rather than guests, and the gap reads
                          {" "}<span className="font-semibold">{Math.abs(r.lift) > Math.abs(c.ifCounted.lift) ? "wider" : "narrower"}</span> than it is.
                          {" "}
                        </>
                      )}
                      Excluding it is only right if the {ARM_WORD[c.leftOutOf]} genuinely cannot fire it. It fired {num(c.firedThere)} times, so it can.
                    </p>

                    <div className="flex items-center gap-3 mt-3">
                      <Button size="sm" variant="outline" onClick={() => repair(c.e.key, c.leftOutOf)}>
                        Count it in the {ARM_WORD[c.leftOutOf]} too
                      </Button>
                      <span className="text-[12.5px] text-muted-2">Or leave it — the exclusion is disclosed on the readout either way.</span>
                    </div>
                  </>
                ) : (
                  <p className="text-[13.5px] text-muted mt-2 leading-relaxed">
                    Zero, so excluding it removes nothing: the {ARM_WORD[c.leftOutOf]} reads
                    {" "}<span className="text-foreground font-medium tabular-nums">{pct(c.leftOutOf === "control" ? r.control.rate : r.variation.rate)}</span> with it
                    left out and <span className="text-foreground font-medium tabular-nums">{pct(c.leftOutOf === "control" ? c.ifCounted.control.rate : c.ifCounted.variation.rate)}</span> with
                    it counted. The exclusion is a statement about the page, not a change to the arithmetic — which is exactly when it is safe.
                  </p>
                )}
              </div>
            ))}
          </Section>

          {/* ── What gets saved ──────────────────────────────────────── */}
          <Section title="What gets saved">
            <div className="px-5 py-2">
              <Meta k="Name" v={label.trim() || <span className="text-warn">not named yet</span>} />
              <Meta k="Role" v={<span className="flex items-center gap-2">{ROLE_LABEL[effectiveRole]}{demoted && <Pill tone="warn">demoted from decides it</Pill>}</span>} />
              <Meta k="A win is" v={directionDeclared
                ? `this going ${direction}`
                : <span className="text-warn">up — assumed, because nobody said</span>} />
              <Meta k="Old version" v={def.control.length
                ? <span className="flex flex-wrap gap-1">{r.control.parts.map((p) => <Mono key={p.key}>{p.key}</Mono>)}</span>
                : <span className="text-warn">nothing</span>} />
              <Meta k="New version" v={def.variation.length
                ? <span className="flex flex-wrap gap-1">{r.variation.parts.map((p) => <Mono key={p.key}>{p.key}</Mono>)}</span>
                : <span className="text-warn">nothing</span>} />
              <Meta k="Reads as" v={<span className="flex items-center gap-2">
                <span className={cn("font-semibold tabular-nums", liftTone)}>{r.lift === null ? "—" : signed(r.lift)}</span>
                <span className="text-muted-2 tabular-nums">{pct(r.variation.rate)} against {pct(r.control.rate)}</span>
                {leaks.length > 0 && <Pill tone="warn">{leaks.length} event{leaks.length === 1 ? "" : "s"} counted on one side only</Pill>}
              </span>} />
            </div>
            <div className="px-5 py-3 border-t border-border text-[12.5px] text-muted-2 leading-relaxed">
              Saved, this joins the metric index below the decision metric, in the position its role gives it — and the readout narrates it
              with the number printed above. Not a recomputation of it. The same one.
            </div>
          </Section>
        </div>

        {/* ── Footer: the semantics, stated rather than implied ──────── */}
        <footer className="shrink-0 border-t border-border bg-surface px-6 py-3.5 flex items-start gap-6">
          <p className="text-[12.5px] text-muted-2 leading-relaxed max-w-[580px]">
            Every number here is <span className="text-foreground">summed actions, not unique guests</span>. Two clicks from one guest count
            twice. That is why All Outrigger reads {pct(homeControl / SESSIONS.control)} in the old version — {num(homeControl)} views across
            {" "}{num(SESSIONS.control)} sessions. A rate over 100% is not a bug; it is what summing actions means. If you need one guest
            counted once, that is a different metric, and this build cannot make it.
          </p>
          <div className="ml-auto flex items-center gap-3 shrink-0">
            {blocked && <span className="text-[12.5px] text-warn max-w-[260px] text-right leading-relaxed">{blocked}</span>}
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={Boolean(blocked)}>Save this metric</Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
