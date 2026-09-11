"use client";

/** The five stage panels inside one experiment. The rail is navigable, so you
 *  can read the brief while a run is live — but only the CURRENT stage carries
 *  an action, and stages ahead say plainly what has to happen first. */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/ui/cn";
import { SITE_ROWS, STAGES, authoredByMe, buildBlockers, isBriefComplete, type Experiment, type Stage } from "@/lib/console/fake";
import { resolveSite } from "./config";
import { Meta, Pill, Section } from "./ui";
import { logActivity } from "./config";
import { MeasurementPlan, MetricIndex } from "./measurement";
import { BriefAuthor } from "./brief-author";
import { CertificationPanel, DriftPanel, VersionsPanel } from "./build-panel";
import { AgentHandshake, InjectionProof } from "./setup";
import { QaPanel } from "./qa";
import { VerdictPanel, type Verdict } from "./verdict";
import { Readout } from "./readout";
import { EvidenceBoard } from "./evidence-board";
import { HandoffPanel } from "./handoff";

const TODAY = "10 Sep 2026";

/** The fixture writes owners short — "Bryan H." — and ME in full. Both are you,
 *  and the second-person rule has to see that. */
/** See fake.ts — one definition of the second-person rule. */
const isMine = (e: Experiment) => authoredByMe(e.owner);

/* ── Session memory ────────────────────────────────────────────────── */

/** What you did to a review or a run this session, so leaving the page doesn't undo it. */
type Split = "50 / 50" | "90 / 10";
type SignOff = { kind: "approved" } | { kind: "running"; split: Split } | { kind: "sent_back"; note: string };
const SIGNOFFS = new Map<string, SignOff>();
const STOPPED = new Set<string>();

const Lock = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
    <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

const Frozen = ({ children }: { children: React.ReactNode }) => (
  <div className="inline-flex items-center gap-1.5 rounded border border-border bg-surface-2/60 px-2 py-1 font-mono text-[11px] text-muted-2">
    <Lock />{children}
  </div>
);

/** A stage the experiment has not reached: say what unlocks it, never grey it out silently. */
const NotYet = ({ what, needs }: { what: string; needs: string }) => (
  <Section>
    <div className="px-5 py-10 text-center">
      <h3 className="text-[15px] font-semibold mb-1.5">{what}</h3>
      <p className="text-[14px] text-muted max-w-md mx-auto leading-relaxed">{needs}</p>
    </div>
  </Section>
);

/* ── Brief ─────────────────────────────────────────────────────────── */

/** What Compare shows for a brief revision, read against the current one. Keyed
 *  by experiment, because a diff belongs to one experiment and no other — the
 *  cuts below are reef-rate-promise's Build ledger: cuts 1 and 2 were built
 *  against Brief 2, cuts 3 and 4 against Brief 3, and nothing was ever built
 *  against Brief 1. An experiment with no ledger here offers no Compare. */
interface Comparison { title: string; changed: string; cuts: string; files: { path: string; add: number; del: number; note: string }[] }

const REVISIONS = ["Brief 3 — current", "Brief 2", "Brief 1"] as const;

type Ledger = Record<(typeof REVISIONS)[number], Comparison>;

const COMPARISONS: Record<string, Ledger> = {
  "reef-rate-promise": {
    "Brief 3 — current": {
      title: "Cut 3 vs cut 4",
      changed: "Cut 4 inlines the badge artwork so the promise paints without waiting on a fetch. The copy and the rate-calendar hook are untouched.",
      cuts: "Both cuts were built against Brief 3 — the revision this run is judged against.",
      files: [
        { path: "src/promise/badge.ts", add: 41, del: 9, note: "The SVG lives in the file, not behind a request" },
        { path: "src/promise/index.ts", add: 3, del: 12, note: "Drops the fetch and its retry" },
        { path: "src/promise/promise.css", add: 4, del: 0, note: "Sizes the inlined badge at 375" },
      ],
    },
    "Brief 2": {
      title: "Cut 1 vs cut 3",
      changed: "Cut 3 fixes the mobile sheet clipping at 375px that Dana R. caught in review. Nothing else in the change moved.",
      cuts: "Cut 1 was built against Brief 2 and cut 3 against Brief 3. Two briefs, so run 3 and run 4 are not one series of numbers.",
      files: [
        { path: "src/promise/sheet.ts", add: 18, del: 7, note: "The sheet measures the viewport before it opens" },
        { path: "src/promise/promise.css", add: 9, del: 3, note: "A 375px breakpoint for the sheet" },
        { path: "src/promise/index.ts", add: 2, del: 2, note: "Waits for the calendar before mounting" },
      ],
    },
    "Brief 1": {
      title: "Brief 1 vs Brief 2",
      changed: "Brief 2 changed the success metric from booking starts to completed bookings. Nothing else moved.",
      cuts: "No cut was built against Brief 1 — it was revised on 15 August, before the first cut that afternoon.",
      files: [],
    },
  },
};

export function BriefPanel({ e }: { e: Experiment }) {
  const [comparing, setComparing] = useState<Comparison | null>(null);
  const frozen = Boolean(e.frozen);
  if (!frozen) {
    return (
      <div className="space-y-4">
        <BriefAuthor />
        <MeasurementPlan confirmed={false} />
        {e.build && <DriftPanel />}
      </div>
    );
  }
  // ONE definition, not a second one living here. Beta 1's isBriefComplete is
  // imported by every gate; a private copy is how the bug it prevents returns.
  const incomplete = !isBriefComplete(e);
  // Only an experiment with its own ledger can be compared — no experiment is
  // shown another one's diff.
  const ledger: Ledger | undefined = COMPARISONS[e.id];
  return (
    <div className="space-y-4">
      <Section title="The brief" action={frozen ? <Frozen>{e.frozen}</Frozen> : <Pill tone="warn">Editable — nothing has run yet</Pill>}>
        <div className="p-5 space-y-5">
          {[
            ["Which page", `${e.site}${e.path} · ${e.env}`],
            ["What changes", e.hypothesis],
            ["Who for", "Everyone"],
            ["What we expect", e.status === "drafting" ? "Not answered yet." : "More visitors take the action that matters, because the change removes something competing with it."],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-1.5">{String(k).toUpperCase()}</div>
              <p className="text-[14.5px] leading-relaxed">{v}</p>
            </div>
          ))}

          <div className={cn("rounded-lg border p-4", incomplete ? "border-warn/40 bg-warn/5" : "border-border bg-surface-2/40")}>
            <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-1.5">HOW WE&rsquo;LL KNOW</div>
            {e.metric === "—" ? (
              <p className="text-[14px] text-warn">No decision metric and no direction. Nothing can be built until both are stated.</p>
            ) : (
              <p className="text-[14.5px]"><span className="font-semibold">{e.metric}</span> should go <span className="font-semibold">up</span>.</p>
            )}
            <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mt-4 mb-1.5">WHAT MUST NOT GET WORSE</div>
            {e.guardrails.length
              ? <p className="text-[14px] text-muted">{e.guardrails.join(" · ")}</p>
              : <p className="text-[14px] text-warn">None set. At least one is required.</p>}
          </div>
        </div>
      </Section>

      <MeasurementPlan confirmed={Boolean(e.frozen)} />
      <DriftPanel />

      <Section title="Revisions">
        {REVISIONS.slice(0, frozen ? 3 : 1).map((r, i) => (
          <div key={r} className="flex items-center gap-4 px-5 py-3 border-b border-border last:border-0">
            <div className="flex-1 text-[13.5px]">{r}</div>
            {i === 0 && frozen && <Frozen>judged against this</Frozen>}
            {i > 0 && <span className="text-[12.5px] text-muted-2 line-through">superseded</span>}
            {ledger && <button className="text-[13px] text-accent w-16 text-right" onClick={() => setComparing(ledger[r])}>Compare</button>}
          </div>
        ))}
      </Section>

      <Dialog open={Boolean(comparing)} onOpenChange={(o) => !o && setComparing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{comparing?.title}</DialogTitle>
            <DialogDescription>{comparing?.changed}</DialogDescription>
          </DialogHeader>
          {comparing && comparing.files.length > 0 && (
            <div className="rounded-lg border border-border divide-y divide-border">
              {comparing.files.map((f) => (
                <div key={f.path} className="px-3.5 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[12px] min-w-0 flex-1 truncate">{f.path}</span>
                    <span className="font-mono text-[12px] tabular-nums shrink-0"><span className="text-ok">+{f.add}</span> <span className="text-danger">−{f.del}</span></span>
                  </div>
                  <div className="text-[12.5px] text-muted-2 mt-0.5">{f.note}</div>
                </div>
              ))}
            </div>
          )}
          <p className="text-[13px] text-muted leading-relaxed">{comparing?.cuts}</p>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    </div>
  );
}


/* ── Build ─────────────────────────────────────────────────────────── */

const BUILD_STEPS = [
  ["Read the page as it is today", "done"],
  ["Wrote the change", "done"],
  ["Built a self-contained file", "done"],
  ["Checked it loads and does not error", "done"],
] as const;

export function BuildPanel({ e }: { e: Experiment }) {
  // The site's code is not optional. Without a source there is nothing to build
  // against; without a repository there is nowhere for the build to land (D14).
  const blockers = buildBlockers(resolveSite(e.site));
  if (blockers.length > 0) {
    return (
      <Section title="Nothing can be built for this site">
        <div className="px-5 py-5">
          <p className="text-[14px] text-muted leading-relaxed mb-3">
            {e.site} has {blockers.join(", and ")}.
          </p>
          <p className="text-[13.5px] text-muted leading-relaxed mb-4">
            Prism builds from a site&rsquo;s own stylesheets and components and writes what it builds to a repository of yours. Without both, anything
            produced would be written from the outside of a page — guessing at the system behind it from what a browser happened to compute — and it
            would sit beside your site rather than inside it. The brief, the measurement plan and everything already recorded are untouched.
          </p>
          <Button size="sm" onClick={() => window.dispatchEvent(new CustomEvent("console:go", { detail: { nav: "Setup" } }))}>
            Set up {e.site}
          </Button>
        </div>
      </Section>
    );
  }
  if (e.stage === "Brief") return <NotYet what="Nothing has been built yet" needs="The brief needs a decision metric and a direction first. Once it is complete, the agent starts building." />;
  return (
    <div className="space-y-4">
      <AgentHandshake />
      <CertificationPanel />
      <VersionsPanel />
    </div>
  );
}

/* ── Review ────────────────────────────────────────────────────────── */

const SPLITS: { value: Split; means: string }[] = [
  { value: "50 / 50", means: "Half of visitors see the change. The fastest honest read." },
  { value: "90 / 10", means: "One visitor in ten sees the change. Slower, and safer on a page that pays." },
];

export function ReviewPanel({ e }: { e: Experiment }) {
  const [signOff, setSignOffState] = useState<SignOff | undefined>(() => SIGNOFFS.get(e.id));
  const [sendingBack, setSendingBack] = useState(false);
  const [note, setNote] = useState("");
  const [starting, setStarting] = useState(false);
  const [split, setSplit] = useState<Split>("50 / 50");
  if (e.stage === "Brief" || e.stage === "Build") return <NotYet what="Not ready for review" needs="Someone reviews this once there is a build to look at on the real page." />;

  const mine = isMine(e);
  // Review is behind this experiment: the run already opened, so the sign-off
  // is the record and cannot be given again.
  const past = STAGES.indexOf(e.stage) > STAGES.indexOf("Review");
  // The build sits on the experiment's own environment, not on the apex domain
  // — resolve it the way the header's Preview does, and say which host opens.
  const envs = SITE_ROWS.find((s) => s.domain === e.site)?.envs ?? [];
  const target = envs.find((x) => x.label === e.env) ?? envs.find((x) => !x.isProduction);
  const base = target?.url ?? `https://${e.site}`;
  const host = base.replace(/^https?:\/\//, "");
  const record = (s: SignOff) => { SIGNOFFS.set(e.id, s); setSignOffState(s); };
  const approve = () => { record({ kind: "approved" }); logActivity(`Approved the build of “${e.name}” on the real page — it does what the brief asked.`); };
  const sendBack = () => { const n = note.trim(); record({ kind: "sent_back", note: n }); setSendingBack(false); logActivity(`Sent “${e.name}” back with a note — “${n}”.`); };
  const start = () => { record({ kind: "running", split }); setStarting(false); logActivity(`Started the run of “${e.name}” at ${split} on ${e.env}.`); };
  const open = () => window.open(`${base}${e.path}?opmc=${e.id}`, "_blank", "noopener");

  return (
    <div className="space-y-4">
      <InjectionProof />
      <QaPanel />
      <Section title="Does this do what the brief asked?" action={<span className="text-[12.5px] text-muted-2">Reviewer · owns the site</span>}>
        <div className="p-5">
          <div className="rounded-lg border border-border bg-surface-2/40 h-[190px] grid place-items-center mb-4">
            <div className="text-center">
              <div className="text-[13px] text-muted-2 mb-2">The change, on the real page</div>
              <Button size="sm" variant="outline" onClick={open}>Open {host}{e.path}</Button>
            </div>
          </div>
          <div className="rounded-lg border border-border p-4 mb-4">
            <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-2">WHAT THE BRIEF ASKED FOR</div>
            <p className="text-[14px] leading-relaxed">{e.hypothesis}</p>
          </div>

          {!signOff && !past && (
            <>
              <p className="text-[13.5px] text-muted mb-4">
                You&rsquo;re signing off that it matches the brief and is safe on your site — not that it will win. Nothing reaches a real visitor until someone approves the run.
              </p>
              <div className="flex items-center gap-2.5 flex-wrap">
                <Button disabled={mine} aria-describedby={mine ? "why-not-you" : undefined} onClick={approve}>Looks right</Button>
                <Button variant="outline" onClick={() => setSendingBack(true)}>Send back with a note</Button>
                {mine && <span id="why-not-you" className="text-[12.5px] text-warn">You wrote this — someone else has to approve it</span>}
              </div>
            </>
          )}

          {!signOff && past && (
            <div className="rounded-lg border border-border bg-surface-2/40 p-4">
              <p className="text-[13.5px] text-muted">Signed off before the run opened. This stage is the record now — the sign-off cannot be given again.</p>
              {e.frozen && <div className="mt-2.5"><Frozen>{e.frozen}</Frozen></div>}
            </div>
          )}

          {signOff?.kind === "sent_back" && (
            <div className="rounded-lg border border-warn/40 bg-warn/5 p-4">
              <div className="flex items-center gap-3">
                <Pill tone="warn">Sent back</Pill>
                <span className="text-[13.5px]">Sent back · {signOff.note}</span>
              </div>
              <p className="text-[12.5px] text-muted-2 mt-2">{mine ? "The note stays on this experiment and in Activity." : `${e.owner} sees the note on this experiment and in Activity.`} Nothing reaches a visitor until a new build is approved.</p>
            </div>
          )}

          {(signOff?.kind === "approved" || signOff?.kind === "running") && (
            <div className="rounded-lg border border-ok/40 bg-ok/5 p-4">
              <div className="flex items-center gap-3">
                <Pill tone="ok">Approved</Pill>
                <span className="text-[13.5px]">Approved by you · {TODAY}</span>
              </div>
              {signOff.kind === "running" ? (
                <p className="text-[13.5px] mt-3">Running since {TODAY} · {signOff.split} on {e.env}.</p>
              ) : (
                <div className="flex items-center gap-3 mt-3 flex-wrap">
                  <Button size="sm" onClick={() => setStarting(true)}>Start the run</Button>
                  <span className="text-[12.5px] text-muted-2">Starting names the build, the brief and the environment — and freezes all three.</span>
                </div>
              )}
            </div>
          )}
        </div>
      </Section>

      <Dialog open={sendingBack} onOpenChange={setSendingBack}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send this back</DialogTitle>
            <DialogDescription>Say what is wrong and where you saw it. {mine ? "The note stays on this experiment and in Activity" : `${e.owner} gets the note with your name on it`}, and nothing moves until a new build is approved.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="send-back-note">Your note</Label>
            <Textarea id="send-back-note" value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="What doesn't match the brief, and at what width." required />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSendingBack(false)}>Cancel</Button>
            <Button disabled={note.trim().length === 0} onClick={sendBack}>Send it back</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={starting} onOpenChange={setStarting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start the run?</DialogTitle>
            <DialogDescription>Opens “{e.name}” on {e.env}{e.env === "Production" ? " — this reaches real visitors" : ""}. The brief and the build freeze the moment it opens.</DialogDescription>
          </DialogHeader>
          <div>
            <div id="split-label" className="text-[13px] font-semibold text-muted mb-2.5">Split</div>
            <RadioGroup value={split} onValueChange={(v) => setSplit(v === "90 / 10" ? "90 / 10" : "50 / 50")} aria-labelledby="split-label">
              {SPLITS.map((s) => (
                <div key={s.value} className="flex items-start gap-2.5">
                  <RadioGroupItem value={s.value} id={`split-${s.value.slice(0, 2)}`} className="mt-0.5" />
                  <div>
                    <Label htmlFor={`split-${s.value.slice(0, 2)}`} className="text-foreground tabular-nums">{s.value}</Label>
                    <div className="text-[12.5px] text-muted-2 mt-0.5">{s.means}</div>
                  </div>
                </div>
              ))}
            </RadioGroup>
          </div>
          <div>
            <Meta k="Environment" v={<span>{e.env}{e.env === "Production" ? <span className="text-warn"> — this reaches real visitors</span> : null}</span>} />
            <Meta k="Build" v={e.build ?? "—"} mono />
            <Meta k="Brief" v="The current revision, frozen when the run opens" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setStarting(false)}>Not yet</Button>
            <Button onClick={start}>Start the run</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Run ───────────────────────────────────────────────────────────── */

/** What the stats engine knows about a run while it is open. Two power
 *  projections, not one: days to confirm the OBSERVED effect, and days to reach
 *  the team's own pre-registered smallest-worth-shipping lift — the second only
 *  exists when a human actually stated it in the plan. SRM is a status CEILING:
 *  without real allocation weights it can only warn, because a healthy 90/10
 *  ramp would otherwise "fail" a 50/50 test. */
interface RunFacts {
  day: number; days: number; sessions: [number, number]; declared: string;
  srm: { state: "healthy" | "warn" | "compromised"; p: number; note: string };
  observed: { lift: string; ci: string; daysToConfirm: number | null };
  mde: { stated: boolean; target?: string; daysToTarget?: number };
  guardrails: { name: string; state: "pass" | "breach" | "at_risk_point" | "at_risk_ci" | "unknown"; lift: string; ci: string; tolerance: string }[];
}

const RUN_FACTS: Record<string, RunFacts> = {
  "explorer-nav": {
    day: 6, days: 14, sessions: [9106, 9062], declared: "50 / 50",
    srm: { state: "healthy", p: 0.74, note: "The split you declared is the split that arrived. Numbers below can be trusted." },
    observed: { lift: "+1.1%", ci: "−0.9 to +3.1", daysToConfirm: 31 },
    mde: { stated: true, target: "≥ 2%", daysToTarget: 9 },
    guardrails: [
      { name: "Bounce rate", state: "pass", lift: "−0.3%", ci: "−1.1 to +0.5", tolerance: "no worse than +2%" },
      { name: "Page errors", state: "at_risk_ci", lift: "+0.4%", ci: "−1.8 to +2.6", tolerance: "no worse than +2%" },
    ],
  },
  "offer-tiles": {
    day: 11, days: 14, sessions: [14210, 14088], declared: "50 / 50",
    srm: { state: "healthy", p: 0.52, note: "The split you declared is the split that arrived." },
    observed: { lift: "0.0%", ci: "−1.4 to +1.4", daysToConfirm: null },
    mde: { stated: false },
    guardrails: [
      { name: "Bookings", state: "pass", lift: "+0.2%", ci: "−0.9 to +1.3", tolerance: "no worse than −2%" },
      { name: "Page errors", state: "pass", lift: "0.0%", ci: "−0.2 to +0.2", tolerance: "no worse than +2%" },
    ],
  },
  "kaanapali-urgency": {
    day: 9, days: 14, sessions: [11840, 11792], declared: "50 / 50",
    srm: { state: "healthy", p: 0.66, note: "The split you declared is the split that arrived." },
    observed: { lift: "+3.8%", ci: "+1.6 to +6.0", daysToConfirm: 0 },
    mde: { stated: true, target: "≥ 2%", daysToTarget: 0 },
    guardrails: [
      { name: "Cancellation rate", state: "breach", lift: "+4.9%", ci: "+2.7 to +7.1", tolerance: "no worse than +2%" },
      { name: "Revenue per visit", state: "at_risk_point", lift: "−2.4%", ci: "−5.0 to +0.2", tolerance: "no worse than −2%" },
      { name: "Page errors", state: "pass", lift: "0.0%", ci: "−0.1 to +0.1", tolerance: "no worse than +2%" },
    ],
  },
  "waikiki-gallery": {
    day: 4, days: 14, sessions: [5204, 2131], declared: "50 / 50",
    srm: { state: "compromised", p: 0.0001, note: "You declared 50/50 and 71/29 arrived." },
    observed: { lift: "+6.1%", ci: "+3.2 to +9.0", daysToConfirm: 0 },
    mde: { stated: false },
    guardrails: [
      { name: "Bookings", state: "unknown", lift: "—", ci: "—", tolerance: "no worse than −2%" },
      { name: "Page errors", state: "pass", lift: "0.0%", ci: "−0.2 to +0.2", tolerance: "no worse than +2%" },
    ],
  },
  "reef-rate-promise": {
    day: 13, days: 13, sessions: [9206, 9206], declared: "50 / 50",
    srm: { state: "healthy", p: 0.98, note: "The split you declared is the split that arrived." },
    observed: { lift: "+2.4%", ci: "+0.3 to +4.5", daysToConfirm: 0 },
    mde: { stated: true, target: "≥ 2%", daysToTarget: 0 },
    guardrails: [
      { name: "Revenue per visit", state: "pass", lift: "+1.8%", ci: "−0.4 to +4.0", tolerance: "no worse than −2%" },
      { name: "Cancellation rate", state: "at_risk_point", lift: "+2.3%", ci: "−1.1 to +5.7", tolerance: "no worse than +2%" },
      { name: "Page errors", state: "pass", lift: "0.0%", ci: "−0.1 to +0.1", tolerance: "no worse than +2%" },
    ],
  },
};

const GR: Record<RunFacts["guardrails"][number]["state"], { tone: "ok" | "warn" | "danger" | "muted"; word: string; means: string }> = {
  pass:          { tone: "ok",     word: "Holding",  means: "the interval proves it is no worse than the tolerance" },
  breach:        { tone: "danger", word: "Breached", means: "the interval is confidently past the tolerance — this vetoes a win" },
  at_risk_point: { tone: "warn",   word: "At risk",  means: "the point estimate is already past the tolerance; the interval has not settled" },
  at_risk_ci:    { tone: "warn",   word: "Unproven", means: "the interval is still too wide to prove it is no worse — not the same as a breach" },
  unknown:       { tone: "muted",  word: "Unknown",  means: "nothing this run reports measures it" },
};

export function RunPanel({ e }: { e: Experiment }) {
  const f = RUN_FACTS[e.id];
  const [stopped, setStoppedState] = useState(() => STOPPED.has(e.id));
  const [stopping, setStopping] = useState(false);
  const live = e.status === "running" && !stopped;
  if (!f) return <NotYet what="Not running" needs="A run starts once someone with permission approves it. Approving names the build, the brief and the environment — and freezes all three." />;
  const total = f.sessions[0] + f.sessions[1];
  const stop = () => { STOPPED.add(e.id); setStoppedState(true); setStopping(false); logActivity(`Stopped “${e.name}” on day ${f.day} of ${f.days}.`); };
  return (
    <div className="space-y-4">
      <Section title={live ? "Running now" : "The run"} action={
        live ? <Pill tone="ok">Live on {e.env} · day {f.day} of {f.days}</Pill>
        : stopped ? <Pill tone="muted">Stopped on day {f.day} of {f.days}</Pill>
        : <Pill tone="muted">Closed after {f.days} days</Pill>}>
        <div className="p-5">
          <div className="flex gap-10 pb-4 border-b border-border">
            {[
              [f.observed.lift, e.metric, e.result?.tone === "ok" ? "text-ok" : ""],
              [f.observed.ci, "95% interval", ""],
              [total.toLocaleString(), "sessions", ""],
              [f.declared, "split declared", ""],
            ].map(([n, l, cls]) => (
              <div key={l}><div className={cn("text-[20px] font-semibold tabular-nums tracking-[-0.02em]", cls)}>{n}</div>
                <div className="text-[12.5px] text-muted-2 mt-0.5">{l}</div></div>
            ))}
          </div>

          {/* SRM — validity before significance */}
          <div className="flex items-start gap-3 py-4 border-b border-border">
            <Pill tone={f.srm.state === "healthy" ? "ok" : f.srm.state === "warn" ? "warn" : "danger"}>
              {f.srm.state === "healthy" ? "Split is sane" : f.srm.state === "warn" ? "Split unverified" : "Split is broken"}
            </Pill>
            <div className="text-[13.5px] text-muted leading-relaxed">
              {f.sessions[0].toLocaleString()} vs {f.sessions[1].toLocaleString()} sessions · p {f.srm.p}. {f.srm.note}
              {f.srm.state === "compromised" && <span className="text-danger"> A broken split makes the whole readout invalid — nothing below can be read.</span>}
            </div>
          </div>

          {/* Power — two projections, the second only if a human stated it */}
          <div className="py-4 border-b border-border">
            <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-2.5">HOW MUCH LONGER</div>
            <div className="flex gap-10">
              <div>
                <div className="text-[18px] font-semibold tabular-nums">{f.observed.daysToConfirm === null ? "> 90" : f.observed.daysToConfirm === 0 ? "Done" : f.observed.daysToConfirm}</div>
                <div className="text-[12.5px] text-muted-2 mt-0.5">days to confirm the effect seen so far ({f.observed.lift})</div>
              </div>
              {f.mde.stated ? (
                <div>
                  <div className="text-[18px] font-semibold tabular-nums">{f.mde.daysToTarget === 0 ? "Done" : f.mde.daysToTarget}</div>
                  <div className="text-[12.5px] text-muted-2 mt-0.5">days to detect the lift you said was worth shipping ({f.mde.target})</div>
                </div>
              ) : (
                <div className="max-w-[300px]">
                  <div className="text-[13px] text-warn">You never said what lift is worth shipping.</div>
                  <div className="text-[12.5px] text-muted-2 mt-0.5">So Prism can only project against whatever it happens to see — the weaker question.</div>
                </div>
              )}
            </div>
            {f.observed.daysToConfirm === null && (
              <p className="text-[13px] text-muted mt-3">Over 90 days to confirm the effect seen so far. Accept the null, or redesign for a bigger effect — keeping it running is not a plan.</p>
            )}
          </div>

          {/* Guardrails — four states, direction-normalised, computed BEFORE the primary */}
          <div className="py-4 border-b border-border">
            <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-1">MUST NOT GET WORSE</div>
            <p className="text-[12.5px] text-muted-2 mb-2.5">Judged against a tolerance with the interval, not against zero — and judged before the main number, so a breach can veto a win.</p>
            {f.guardrails.map((g) => {
              const t = GR[g.state];
              return (
                <div key={g.name} className="flex items-center gap-3 py-2 border-t border-border first:border-0">
                  <span className="text-[13.5px] w-40">{g.name}</span>
                  <Pill tone={t.tone}>{t.word}</Pill>
                  <span className="text-[12.5px] text-muted flex-1">{t.means}</span>
                  <span className="text-[12.5px] text-muted-2 tabular-nums">{g.lift} · {g.ci} · {g.tolerance}</span>
                </div>
              );
            })}
          </div>

          <div className="pt-4 flex items-center gap-3">
            {e.frozen && <Frozen>{e.frozen}</Frozen>}
            {stopped && <span className="ml-auto text-[13px]">Stopped by you · {TODAY}</span>}
            {live && <Button variant="danger" size="sm" className="ml-auto" onClick={() => setStopping(true)}>Stop this run</Button>}
          </div>
          {live && <p className="text-[12.5px] text-muted-2 mt-2.5">Stopping never needs a second person. Safety actions are never gated.</p>}
        </div>
      </Section>

      <Dialog open={stopping} onOpenChange={setStopping}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stop this run?</DialogTitle>
            <DialogDescription>Stopping ends the run on day {f.day} of {f.days}. The verdict will be whatever the data supports today.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setStopping(false)}>Keep it running</Button>
            <Button variant="danger" onClick={stop}>Stop the run</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Decision ──────────────────────────────────────────────────────── */

/** status → the verdict engine's state. Seven are possible; this mock's data
 *  reaches four. A closed run with nothing recorded is still adjudicable. */
const verdictFor = (e: Experiment): Verdict | null => {
  if (e.trouble === "invalid_split") return "invalid";
  if (e.trouble === "guardrail_breach") return "guardrail_breach";
  if (e.status === "shipped") return "confirmed";
  if (e.status === "decide") return e.result?.tone === "ok" ? "confirmed" : "refuted";
  if (e.status === "running") return "keep_running";
  return null;
};

export function DecisionPanel({ e, action }: { e: Experiment; action: React.ReactNode }) {
  const v = verdictFor(e);
  if (!v) return <NotYet what="No decision yet" needs="A decision is recorded once the run closes. It freezes the result and the statistics together, and it cannot be the person who wrote or built it." />;
  return (
    <div className="space-y-4">
      {(e.status === "decide" || e.trouble) && action}
      <VerdictPanel state={v} title={e.name} />
      {/* A readout is WRITTEN when a decision is recorded — it is a document,
          not a view. The fixture has one written readout; every other row
          says so rather than borrowing it. */}
      {e.id === "reef-rate-promise" || e.status === "shipped"
        ? <Readout compact />
        : <Section title="The readout">
            <p className="px-5 py-6 text-[14px] text-muted text-center">
              {v === "invalid" ? "Nothing to write up — this run produced no evidence." : "Written the moment a decision is recorded, then sent to whoever subscribes."}
            </p>
          </Section>}
      <EvidenceBoard />
      <MetricIndex />
      {e.status === "shipped" && <HandoffPanel />}
    </div>
  );
}

export function StagePanel({ e, stage, action }: { e: Experiment; stage: Stage; action: React.ReactNode }) {
  if (stage === "Brief") return <BriefPanel e={e} />;
  if (stage === "Build") return <BuildPanel e={e} />;
  if (stage === "Review") return <ReviewPanel e={e} />;
  if (stage === "Run") return <RunPanel e={e} />;
  return <DecisionPanel e={e} action={action} />;
}

export { STAGES };
