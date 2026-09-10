"use client";

/**
 * BRIEF AUTHORING — where a brief is actually written.
 *
 * The invariants this screen exists to hold, and why each one is here:
 *
 *  · ONE PARAGRAPH IN, NINE NAMED PARTS OUT. The author writes prose; Prism
 *    returns structure. The structure is the deliverable — a brief that is
 *    still a paragraph cannot be built against or judged against.
 *  · THE READINESS METER IS A SELF-ASSESSMENT, NOT PROGRESS. It is allowed to
 *    fall. An answer that reveals unbudgeted work must move it DOWN, and the
 *    option says so before you click it. A meter that only rises is a lie
 *    that gets found out at build time.
 *  · AT MOST TWO QUESTIONS, FIRST PASS ONLY. Stated on the screen, not just
 *    honoured in code, because the fear it removes ("how long is this going to
 *    interrogate me for") is what stops people writing briefs at all.
 *  · REFINE IS THE ONLY PLACE DISAGREEMENT IS RECORDED. Everywhere else an
 *    edit silently overwrites the model. Here the human's words are kept,
 *    they cost readiness while they stand, and they travel with the brief.
 *  · FROZEN vs MUTABLE. Revision 3 and everything run 4 was judged against
 *    render as locked mono receipts. Anything editable renders as plain text.
 *    Editing here makes revision 4; it never rewrites what run 4 answered to.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";
import { Pill, Section, Meta, Th, PageHeader, Toolbar, Chip, Empty } from "./ui";

/* ── Fixtures ──────────────────────────────────────────────────────── */

type Tone = "ok" | "warn" | "danger" | "muted" | "accent";

type PartKey =
  | "change" | "problem" | "where" | "done" | "constraints"
  | "h-change" | "h-audience" | "h-outcome" | "h-rationale";

interface Part {
  key: PartKey;
  group: "brief" | "hypothesis";
  label: string;
  body: string;
  /** Prism naming its own weakest work instead of hiding it. */
  soft?: string;
}

const EXPERIMENT = {
  name: "Rate-calendar best-price promise",
  site: "outrigger.com",
  path: "/hawaii/oahu/outrigger-reef-waikiki-beach-resort",
  property: "Outrigger Reef Waikiki Beach Resort",
  author: "Malia K.",
};

const EXAMPLE_WORDS =
  "Guests open the rate calendar on the Reef Waikiki page, see a nightly rate, and then leave to check it against Expedia. Nothing on the page tells them they are already looking at our lowest rate for those dates. I want the calendar itself to say so, right where they are looking at the price.";

const DRAFT: Part[] = [
  {
    key: "change", group: "brief", label: "What changes",
    body: "A best-price line inside the rate calendar on the Reef Waikiki property page — “This is our lowest rate for these dates. Book direct.” — anchored to the selected night, not to the page header.",
  },
  {
    key: "problem", group: "brief", label: "The problem",
    body: "Guests open the calendar, read a nightly rate, and leave to compare it somewhere else. The page never claims the rate they are looking at is the lowest one Outrigger sells. Around 31,000 visits a month reach this page, and the calendar is the last thing most of them touch before they go.",
  },
  {
    key: "where", group: "brief", label: "Where",
    body: "outrigger.com/hawaii/oahu/outrigger-reef-waikiki-beach-resort — the rate calendar module, every breakpoint. Reef Waikiki only for this run, though the same module ships on eleven other property pages.",
  },
  {
    key: "done", group: "brief", label: "Done looks like",
    body: "More guests move from the calendar to Book Now instead of leaving to compare. Reached-booking clicks up at least 2%, and traffic to All Offers does not fall while it happens.",
  },
  {
    key: "constraints", group: "brief", label: "Constraints",
    body: "No change to displayed rates and no new call to the rate feed. The promise is copy only — legal cleared “our lowest rate for these dates” and nothing stronger. It must not push Book Now below the fold at 375px.",
  },
  {
    key: "h-change", group: "hypothesis", label: "The change",
    body: "Putting the best-price promise inside the rate calendar, beside the price it is talking about.",
  },
  {
    key: "h-audience", group: "hypothesis", label: "The audience",
    body: "Everyone who reaches the Reef Waikiki property page — no segment, no targeting.",
    soft: "Prism was least sure here. Your description said “guests”, which could mean everyone or only the ones who open the calendar. It chose everyone, because a segment nobody can define in the tag is worse than a wide one.",
  },
  {
    key: "h-outcome", group: "hypothesis", label: "The outcome",
    body: "More of them click through to Book Now rather than leaving the page to compare rates elsewhere.",
  },
  {
    key: "h-rationale", group: "hypothesis", label: "Why we think so",
    body: "Run 4 of the header-badge version moved the same click +2.4%, but that badge sat about 900px above the decision. The calendar is where the price doubt actually happens, so the same promise should carry further there.",
    soft: "Prism was least sure here. It is reasoning from run 4, which tested a different placement — that is an argument, not evidence for this one.",
  },
];

const Mono = ({ children }: { children: React.ReactNode }) => (
  <span className="font-mono text-[11px] text-muted-2 bg-surface-2 rounded px-1.5 py-0.5">{children}</span>
);

const Lock = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
    <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

/** Immutable fact. Bordered, mono, locked — never the same shape as something you can edit. */
const Frozen = ({ children }: { children: React.ReactNode }) => (
  <div className="inline-flex items-center gap-1.5 rounded border border-border bg-surface-2/60 px-2 py-1 font-mono text-[11px] text-muted-2">
    <Lock />{children}
  </div>
);

/* ── The interview ─────────────────────────────────────────────────── */

type Answer = "a" | "b";

interface QOption {
  id: Answer;
  label: string;
  event?: string;
  hint: string;
  tone: "ok" | "warn";
  delta: number;
  /** What this answer reveals: the part it undermines, and the thing it adds to the gate. */
  opens?: { part: PartKey; note: string; gate: string; gateTitle: string };
}

interface Question { id: string; short: string; ask: string; why: string; options: QOption[] }

const QUESTIONS: Question[] = [
  {
    id: "q1", short: "how the promise is proved",
    ask: "Does the calendar have to prove the promise with a comparison price, or is the promise on its own enough?",
    why: "Being more confident would not settle this. It is a decision about what you are willing to publish.",
    options: [
      {
        id: "a", label: "The promise on its own. Copy only.", tone: "ok", delta: 18,
        hint: "Nothing new to build — this is the version legal already cleared.",
      },
      {
        id: "b", label: "Show what other sites charge, next to ours.", tone: "warn", delta: -9,
        hint: "Readiness drops: this is a bigger brief than the one you described.",
        opens: {
          part: "constraints",
          note: "You asked for a live comparison price, and the constraints still say copy only with no new call to the rate feed. One of the two has to give.",
          gateTitle: "Nowhere to get a comparison price from",
          gate: "The property page never receives competitor rates on the client. Someone has to say where they come from, and legal has to clear a claim stronger than “our lowest rate”.",
        },
      },
    ],
  },
  {
    id: "q2", short: "which Book Now event counts",
    ask: "Two of your events are both called “Offer Detail Book Now Button Clicks”. Which one means a guest reached booking?",
    why: "Only you know which of the two your team wired to the calendar. Prism will not guess between duplicate names.",
    options: [
      {
        id: "a", label: "The one this experiment already reports.", event: "24138040550_book_now_button_clicks",
        tone: "ok", delta: 14, hint: "Attached to this experiment — it will return numbers from day one.",
      },
      {
        id: "b", label: "The other one.", event: "24138040550_offer_detail_book_now_button_clicks",
        tone: "warn", delta: -6, hint: "Readiness drops: this one is not attached, so the primary would read as a dash.",
        opens: {
          part: "done",
          note: "“Done looks like” now describes a number that would read as a dash for the whole run.",
          gateTitle: "The primary metric points at an event this experiment does not report",
          gate: "24138040550_offer_detail_book_now_button_clicks has to be attached to the experiment before a run, or the decision metric is blank for fourteen days.",
        },
      },
    ],
  },
];

/* ── How we'll know ────────────────────────────────────────────────── */

const METRICS: { role: string; label: string; means: string; event: string; win: string; tone: Tone; reported: string }[] = [
  {
    role: "Primary", label: "Reached the booking step", means: "A guest clicked Book Now on this page",
    event: "24138040550_book_now_button_clicks", win: "↑ at least 2%", tone: "ok", reported: "Reports here",
  },
  {
    role: "Guardrail", label: "Traffic to All Offers", means: "The offers page still gets reached",
    event: "24138040550_all_offers_page", win: "must not fall", tone: "ok", reported: "Reports here",
  },
  {
    role: "Guardrail", label: "Hero engagement", means: "The hero above the calendar still works",
    event: "24138040550_hero_cta_click", win: "must not fall", tone: "warn", reported: "Duplicate name in project",
  },
  {
    role: "Missing", label: "A completed booking", means: "Nothing on this site records one",
    event: "no event exists", win: "—", tone: "danger", reported: "48 events, none of them a booking",
  },
];

/* ── Readiness ─────────────────────────────────────────────────────── */

const BANDS: { min: number; label: string; tone: Tone; bar: string }[] = [
  { min: 90, label: "Ready to build", tone: "ok", bar: "bg-ok" },
  { min: 70, label: "Nearly there", tone: "accent", bar: "bg-accent" },
  { min: 40, label: "Taking shape", tone: "warn", bar: "bg-warn" },
  { min: 0, label: "Getting oriented", tone: "muted", bar: "bg-border-strong" },
];

const DRAFT_POINTS = 64;
const DISAGREEMENT_COST = 7;

const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;

/* ── Surface ───────────────────────────────────────────────────────── */

export function BriefAuthor({ onDone }: { onDone?: () => void }) {
  const [drawer, setDrawer] = useState(false);
  const [words, setWords] = useState("");
  const [drafted, setDrafted] = useState(false);
  const [source, setSource] = useState("");
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [openRefine, setOpenRefine] = useState<PartKey | null>(null);
  const [refineText, setRefineText] = useState("");
  const [disagreements, setDisagreements] = useState<{ key: PartKey; label: string; why: string }[]>([]);
  const [filter, setFilter] = useState<"all" | "work" | "disagreed">("all");

  const chosen = (q: Question) => q.options.find((o) => o.id === answers[q.id]);
  const unanswered = QUESTIONS.filter((q) => !chosen(q));
  const answerPoints = QUESTIONS.reduce((sum, q) => sum + (chosen(q)?.delta ?? 0), 0);
  const disagreementPoints = -DISAGREEMENT_COST * disagreements.length;

  const readiness = drafted
    ? Math.max(0, Math.min(100, DRAFT_POINTS + answerPoints + disagreementPoints))
    : 0;
  const band = BANDS.find((b) => readiness >= b.min) ?? BANDS[BANDS.length - 1];

  /** Answers that revealed work: they flag the part they undermine and they add a gate item. */
  const revealed = QUESTIONS.map((q) => chosen(q)?.opens).filter((o): o is NonNullable<QOption["opens"]> => Boolean(o));
  const flagFor = (k: PartKey) => revealed.find((r) => r.part === k)?.note;
  const disagreementFor = (k: PartKey) => disagreements.find((d) => d.key === k);
  const needsWork = DRAFT.filter((p) => Boolean(flagFor(p.key)) || Boolean(disagreementFor(p.key)));

  /* The completeness gate — derived, never hand-maintained. */
  const gate: { title: string; detail: string; state: "met" | "open"; blocks: boolean }[] = [
    {
      title: "A description in your own words",
      detail: drafted ? "Given, and the nine parts were drafted from it." : "Nothing to draft from yet.",
      state: drafted ? "met" : "open", blocks: true,
    },
    ...QUESTIONS.map((q) => {
      const pick = chosen(q);
      if (!pick) return { title: `Unanswered — ${q.short}`, detail: q.ask, state: "open" as const, blocks: true };
      if (pick.opens) return { title: pick.opens.gateTitle, detail: pick.opens.gate, state: "open" as const, blocks: true };
      return { title: `Settled — ${q.short}`, detail: pick.label, state: "met" as const, blocks: true };
    }),
    ...(disagreements.length
      ? [{
          title: `${disagreements.length} part${disagreements.length > 1 ? "s" : ""} you have marked wrong`,
          detail: "Prism has not rewritten them yet. Re-draft to make it answer your words, or withdraw the disagreement.",
          state: "open" as const, blocks: true,
        }]
      : []),
    {
      title: "Nobody measures a completed booking",
      detail: "This project has 48 events and not one of them is a booking, a revenue event or a conversion. The brief can still be built — but afterwards you can only claim clicks, not bookings.",
      state: "open", blocks: false,
    },
  ];
  const blocking = gate.filter((g) => g.state === "open" && g.blocks).length;
  const canBuild = drafted && blocking === 0 && readiness >= 90;

  const ledger = [
    { label: "Drafted from your description", value: drafted ? DRAFT_POINTS : 0 },
    ...QUESTIONS.map((q, i) => ({ label: `Question ${i + 1} — ${q.short}`, value: chosen(q)?.delta ?? 0 })),
    { label: `${disagreements.length} recorded disagreement${disagreements.length === 1 ? "" : "s"}`, value: disagreementPoints },
  ].filter((l) => l.value !== 0);

  const runDraft = () => {
    setSource(words.trim());
    setDrafted(true);
    setDrawer(false);
  };

  const record = (p: Part) => {
    setDisagreements((d) => [...d.filter((x) => x.key !== p.key), { key: p.key, label: p.label, why: refineText.trim() }]);
    setRefineText("");
    setOpenRefine(null);
  };

  const visible = DRAFT.filter((p) =>
    filter === "all" ? true
      : filter === "disagreed" ? Boolean(disagreementFor(p.key))
        : needsWork.some((n) => n.key === p.key));

  const partRows = (group: Part["group"]) => {
    const rows = visible.filter((p) => p.group === group);
    if (!rows.length) {
      return (
        <div className="px-5 py-3.5 text-[13px] text-muted-2">
          Nothing here matches the filter. {DRAFT.filter((p) => p.group === group).length} part
          {DRAFT.filter((p) => p.group === group).length === 1 ? " is" : "s are"} hidden, not removed.
        </div>
      );
    }
    return rows.map((p) => {
      const flag = flagFor(p.key);
      const dis = disagreementFor(p.key);
      return (
        <div key={p.key} className={cn("px-5 py-3.5 border-b border-border last:border-0", dis && "bg-danger/[0.04]")}>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2">{p.label.toUpperCase()}</span>
                {dis && <Pill tone="danger">You said this is wrong</Pill>}
                {flag && !dis && <Pill tone="warn">Your answer changed this</Pill>}
                {p.soft && !dis && <Pill tone="muted">Least sure</Pill>}
              </div>
              <p className="text-[14.5px] leading-relaxed">{p.body}</p>
              {p.soft && <p className="text-[12.5px] text-muted-2 mt-1.5 leading-relaxed">{p.soft}</p>}
              {flag && <p className="text-[12.5px] text-warn mt-1.5 leading-relaxed">{flag}</p>}
            </div>
            {openRefine !== p.key && !dis && (
              <button onClick={() => { setOpenRefine(p.key); setRefineText(""); }}
                className="text-[12.5px] text-muted-2 hover:text-foreground shrink-0 whitespace-nowrap">
                This is wrong because&hellip;
              </button>
            )}
          </div>

          {openRefine === p.key && (
            <div className="mt-3 rounded-lg border border-danger/40 bg-danger/5 p-3">
              <div className="text-[10.5px] font-semibold tracking-[0.07em] text-danger mb-1.5">THIS IS WRONG BECAUSE&hellip;</div>
              <textarea value={refineText} onChange={(e) => setRefineText(e.target.value)} rows={2}
                placeholder="What did Prism get wrong about this part, in your words?"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13.5px] leading-relaxed resize-none placeholder:text-muted-2 focus:border-accent focus:outline-none" />
              <div className="flex items-center gap-2 mt-2">
                <Button size="sm" disabled={refineText.trim().length < 6} onClick={() => record(p)}>Record it</Button>
                <Button size="sm" variant="ghost" onClick={() => { setOpenRefine(null); setRefineText(""); }}>Cancel</Button>
                <span className="text-[12px] text-muted-2 ml-auto tabular-nums">
                  Kept in your words &middot; readiness {signed(-DISAGREEMENT_COST)} while it stands
                </span>
              </div>
            </div>
          )}

          {dis && (
            <div className="mt-2.5 rounded-lg border border-border bg-surface px-3 py-2.5">
              <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-1">ON RECORD, IN YOUR WORDS</div>
              <p className="text-[13.5px] leading-relaxed">{dis.why}</p>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-[12.5px] text-muted-2">Prism has not rewritten this part yet — re-draft to make it answer you.</span>
                <button onClick={() => setDisagreements((d) => d.filter((x) => x.key !== p.key))}
                  className="text-[12.5px] text-accent ml-auto shrink-0">Withdraw</button>
              </div>
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <>
      <PageHeader
        title={`Brief — ${EXPERIMENT.name}`}
        count={drafted ? "revision 4 · draft" : "revision 4 · nothing written yet"}
        actions={
          <>
            <span className="text-[12.5px] text-muted-2 mr-1">Revision 3 is frozen. Nothing here touches it.</span>
            <Button size="sm" variant={drafted ? "outline" : "default"} onClick={() => setDrawer(true)}>
              {drafted ? "Re-draft with AI" : "Draft with AI"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => onDone?.()}>Save &amp; close</Button>
          </>
        }
      />

      <Toolbar>
        {drafted ? (
          <>
            <Chip on={filter === "all"} onClick={() => setFilter("all")}>All parts {DRAFT.length}</Chip>
            <Chip on={filter === "work"} onClick={() => setFilter("work")}>Needs work {needsWork.length}</Chip>
            <Chip on={filter === "disagreed"} onClick={() => setFilter("disagreed")}>Disagreed {disagreements.length}</Chip>
            <span className="text-[12.5px] text-muted-2 ml-2">
              Any part can be told it is wrong. That is the only thing here that records you overruling Prism.
            </span>
          </>
        ) : (
          <span className="text-[13px] text-muted">
            A brief is nine named parts, a primary metric and the guardrails that can veto it. Write one paragraph and Prism drafts all of them; you keep every one.
          </span>
        )}
      </Toolbar>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">

          {/* ── Main column ─────────────────────────────────────────── */}
          <div className="space-y-4">
            {!drafted ? (
              <Section>
                <Empty
                  title="Nothing written yet"
                  body="Say what you want to change and why, the way you would say it to a colleague. Prism turns that into the parts a build and a verdict need — and tells you which ones it was least sure about."
                  action={<Button onClick={() => setDrawer(true)}>Draft with AI</Button>}
                />
              </Section>
            ) : (
              <>
                <Section title="What you said, in your own words" action={<Pill tone="muted">Yours &middot; never rewritten</Pill>}>
                  <div className="px-5 py-4">
                    <p className="text-[14.5px] leading-relaxed">{source}</p>
                    <p className="text-[12.5px] text-muted-2 mt-2.5">
                      Everything below was drafted from this. It stays here unedited so you can see what Prism was working from.
                    </p>
                  </div>
                </Section>

                <Section
                  title={unanswered.length ? "Two questions — this pass only" : "The two questions — closed"}
                  action={unanswered.length
                    ? <Pill tone="warn">{unanswered.length} of {QUESTIONS.length} unanswered</Pill>
                    : <Pill tone="ok">Asked once, answered</Pill>}>
                  <div className="px-5 py-3 border-b border-border">
                    <p className="text-[13px] text-muted leading-relaxed">
                      Prism asks at most two questions, and only on this first pass. It will not come back for a third:
                      after this, changing the brief is yours to do directly, and the only thing that can ask again is a
                      re-draft you asked for.
                    </p>
                  </div>

                  {QUESTIONS.map((q, i) => {
                    const pick = chosen(q);
                    if (pick) {
                      return (
                        <div key={q.id} className="flex items-start gap-3 px-5 py-3.5 border-b border-border last:border-0">
                          <span className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 w-[62px] shrink-0 pt-1">ASKED {i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-[13.5px] text-muted">{q.ask}</div>
                            <div className="text-[14px] font-medium mt-1">{pick.label}</div>
                            {pick.event && <div className="mt-1.5"><Mono>{pick.event}</Mono></div>}
                            <div className={cn("text-[12.5px] mt-1.5", pick.tone === "ok" ? "text-ok" : "text-warn")}>{pick.hint}</div>
                          </div>
                          <span className={cn("text-[12.5px] font-semibold tabular-nums shrink-0 pt-1", pick.delta > 0 ? "text-ok" : "text-warn")}>
                            {signed(pick.delta)} readiness
                          </span>
                        </div>
                      );
                    }
                    return (
                      <div key={q.id} className="px-5 py-4 border-b border-border last:border-0 bg-warn/5">
                        <div className="text-[10.5px] font-semibold tracking-[0.06em] text-warn mb-2">QUESTION {i + 1} OF {QUESTIONS.length}</div>
                        <p className="text-[14.5px] mb-1">{q.ask}</p>
                        <p className="text-[12.5px] text-muted-2 mb-3">{q.why}</p>
                        {q.options.map((o) => (
                          <button key={o.id} onClick={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))}
                            className="w-full flex items-start gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 mb-1.5 text-left hover:border-border-strong">
                            <span className="w-4 h-4 rounded-full border-2 border-border-strong shrink-0 mt-0.5" />
                            <span className="flex-1 min-w-0">
                              <span className="block text-[13.5px]">{o.label}</span>
                              {o.event && <span className="block mt-1"><Mono>{o.event}</Mono></span>}
                              <span className={cn("block text-[12.5px] mt-1", o.tone === "ok" ? "text-ok" : "text-warn")}>{o.hint}</span>
                            </span>
                            <span className={cn("text-[12.5px] font-semibold tabular-nums shrink-0", o.delta > 0 ? "text-ok" : "text-warn")}>
                              {signed(o.delta)} readiness
                            </span>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </Section>

                <Section title="The brief — five parts"
                  action={<span className="text-[12.5px] text-muted-2">Plain text means you can change it</span>}>
                  {partRows("brief")}
                </Section>

                <Section title="The hypothesis — four parts"
                  action={<span className="text-[12.5px] text-muted-2">change &middot; audience &middot; outcome &middot; why</span>}>
                  {partRows("hypothesis")}
                </Section>

                <Section title="How we&rsquo;ll know"
                  action={<Pill tone="warn">No booking event exists in this project</Pill>}>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr><Th first>Role</Th><Th>Metric</Th><Th>What it means</Th><Th>Optimizely event</Th><Th>A win looks like</Th><Th>This experiment</Th></tr>
                      </thead>
                      <tbody>
                        {METRICS.map((m) => (
                          <tr key={m.event} className="border-b border-border last:border-0">
                            <td className="px-4 pl-6 py-3 text-[12.5px] text-muted-2 whitespace-nowrap">{m.role}</td>
                            <td className="px-4 py-3 text-[14px] font-medium">{m.label}</td>
                            <td className="px-4 py-3 text-[13px] text-muted">{m.means}</td>
                            <td className="px-4 py-3">{m.tone === "danger" ? <span className="text-[13px] text-danger">{m.event}</span> : <Mono>{m.event}</Mono>}</td>
                            <td className="px-4 py-3 text-[13px] tabular-nums whitespace-nowrap">{m.win}</td>
                            <td className="px-4 py-3"><Pill tone={m.tone}>{m.reported}</Pill></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-5 py-3.5 border-t border-border">
                    <p className="text-[13px] text-muted leading-relaxed">
                      Prism will not stand a lookalike event in for a booking. A click on Book Now is an intention, and the
                      readout will say so in those words rather than calling it a conversion.
                    </p>
                  </div>
                </Section>

                <Section title="Disagreements on record"
                  action={<Pill tone={disagreements.length ? "danger" : "muted"}>{disagreements.length} standing</Pill>}>
                  {disagreements.length === 0 ? (
                    <div className="px-5 py-3.5">
                      <p className="text-[13.5px] text-muted leading-relaxed">
                        Nothing on record. Editing a part anywhere else just overwrites Prism silently; telling a part it is
                        wrong keeps your reason, in your words, and carries it into every later draft of this brief.
                      </p>
                    </div>
                  ) : disagreements.map((d) => (
                    <div key={d.key} className="flex items-start gap-3 px-5 py-3.5 border-b border-border last:border-0">
                      <span className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 w-[96px] shrink-0 pt-0.5">{d.label.toUpperCase()}</span>
                      <p className="flex-1 text-[13.5px] leading-relaxed">{d.why}</p>
                      <span className="text-[12.5px] text-warn tabular-nums shrink-0">{signed(-DISAGREEMENT_COST)}</span>
                    </div>
                  ))}
                </Section>

                <Section>
                  <div className="px-5 py-4 flex items-center gap-3 flex-wrap">
                    <Button disabled={!canBuild} onClick={() => onDone?.()}>Send this to build</Button>
                    {canBuild ? (
                      <span className="text-[12.5px] text-muted-2">
                        Sending freezes this as revision 4. Revision 3 stays exactly as it is — it is what run 4 was judged against.
                      </span>
                    ) : (
                      <span className="text-[13px] text-warn tabular-nums">
                        {blocking} thing{blocking === 1 ? "" : "s"} still missing, and readiness is {readiness}. A brief goes to build at 90.
                      </span>
                    )}
                  </div>
                </Section>
              </>
            )}
          </div>

          {/* ── Rail ────────────────────────────────────────────────── */}
          <div className="space-y-4 xl:sticky xl:top-0">
            <Section title="Readiness" action={<Pill tone={band.tone}>{band.label}</Pill>}>
              <div className="px-5 py-4 border-b border-border">
                <div className="flex items-baseline gap-2">
                  <span className="text-[28px] font-semibold tabular-nums tracking-[-0.02em]">{readiness}</span>
                  <span className="text-[13px] text-muted-2">/ 100</span>
                </div>

                <div className="relative h-2 rounded-full bg-surface-2 mt-3">
                  <div className={cn("h-full rounded-full transition-all", band.bar)} style={{ width: `${readiness}%` }} />
                  <span className="absolute inset-y-0 w-px bg-border-strong" style={{ left: "70%" }} />
                  <span className="absolute inset-y-0 w-px bg-border-strong" style={{ left: "90%" }} />
                </div>

                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5">
                  {[...BANDS].reverse().map((b) => (
                    <span key={b.label} className={cn("text-[10.5px] tracking-[0.05em] uppercase tabular-nums",
                      b.label === band.label ? "text-foreground font-semibold" : "text-muted-2")}>
                      {b.min}+ {b.label}
                    </span>
                  ))}
                </div>

                <p className="text-[12.5px] text-muted-2 mt-3 leading-relaxed">
                  This is Prism grading its own work, not a progress bar. It goes <span className="text-foreground">down</span> when
                  an answer reveals work nobody had counted — each option tells you what it will cost before you pick it, and a
                  part you say is wrong costs {DISAGREEMENT_COST} until Prism has answered you.
                </p>
              </div>

              <div className="px-5 py-3.5">
                <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-2">WHAT MADE THIS NUMBER</div>
                {ledger.length === 0 ? (
                  <p className="text-[13px] text-muted-2">Nothing counted yet — nothing has been drafted.</p>
                ) : ledger.map((l) => (
                  <div key={l.label} className="flex items-baseline gap-3 py-1.5 border-b border-border last:border-0">
                    <span className="text-[13px] text-muted flex-1 min-w-0">{l.label}</span>
                    <span className={cn("text-[13px] font-semibold tabular-nums shrink-0", l.value > 0 ? "text-ok" : "text-warn")}>{signed(l.value)}</span>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Before anything can be built"
              action={<Pill tone={blocking ? "danger" : "ok"}>{blocking ? `${blocking} blocking` : "Nothing blocking"}</Pill>}>
              {gate.map((g) => (
                <div key={g.title} className="flex items-start gap-2.5 px-5 py-3 border-b border-border last:border-0">
                  <span className={cn("w-1.5 h-1.5 rounded-full shrink-0 mt-[7px]",
                    g.state === "met" ? "bg-ok" : g.blocks ? "bg-danger" : "bg-warn")} />
                  <div className="flex-1 min-w-0">
                    <div className={cn("text-[13.5px] font-medium", g.state === "met" && "text-muted")}>{g.title}</div>
                    <p className="text-[12.5px] text-muted-2 mt-0.5 leading-relaxed">{g.detail}</p>
                    {g.state === "open" && !g.blocks && (
                      <span className="inline-block mt-1.5"><Pill tone="muted">Blocks the claim, not the build</Pill></span>
                    )}
                  </div>
                </div>
              ))}
            </Section>

            <Section title="What this revision answers to">
              <div className="px-5 py-2">
                <Meta k="Where" v={`${EXPERIMENT.site}${EXPERIMENT.path}`} />
                <Meta k="Property" v={EXPERIMENT.property} />
                <Meta k="Audience" v="Everyone on the property page" />
                <Meta k="Author" v={EXPERIMENT.author} />
                <Meta k="Revision" v="4 — draft, editable by anyone who can author" />
              </div>
              <div className="px-5 py-3.5 border-t border-border">
                <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-2">FROZEN — NOT EDITABLE ANYWHERE</div>
                <div className="flex flex-wrap gap-1.5">
                  <Frozen>brief rev 3 · frozen 26 Aug 2026 09:14</Frozen>
                  <Frozen>build 8c1d7e2</Frozen>
                  <Frozen>run 4 · closed 8 Sep · 18,412 sessions</Frozen>
                  <Frozen>+2.4% · 95% CI +0.3 to +4.5 · p 0.031</Frozen>
                </div>
                <p className="text-[12.5px] text-muted-2 mt-3 leading-relaxed">
                  Run 4 was judged against revision 3, so revision 3 can never change. What you write here becomes revision 4,
                  and the difference between them is disclosed on the readout rather than quietly replacing it.
                </p>
              </div>
            </Section>
          </div>
        </div>
      </div>

      {/* ── Draft with AI ───────────────────────────────────────────── */}
      {drawer && (
        <>
          <button aria-label="Close the drafting drawer" onClick={() => setDrawer(false)}
            className="fixed inset-0 z-40 bg-background/70" />
          <aside className="fixed inset-y-0 right-0 z-50 w-[520px] max-w-full border-l border-border bg-surface flex flex-col">
            <header className="h-14 shrink-0 border-b border-border flex items-center px-5 gap-3">
              <h2 className="text-[15px] font-semibold">{drafted ? "Re-draft with AI" : "Draft with AI"}</h2>
              <Pill tone="accent">Prism</Pill>
              <button onClick={() => setDrawer(false)} className="ml-auto text-[13px] text-muted-2 hover:text-foreground">Close</button>
            </header>

            <div className="flex-1 overflow-auto p-5 space-y-5">
              <div>
                <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-2">IN YOUR OWN WORDS</div>
                <textarea value={words} onChange={(e) => setWords(e.target.value)} rows={7}
                  placeholder="What do you want to change, and what makes you think it is worth changing? Write it the way you would say it out loud."
                  className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-[14.5px] leading-relaxed resize-none placeholder:text-muted-2 focus:border-accent focus:outline-none" />
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-[12.5px] text-muted-2 tabular-nums">{words.trim().length} characters</span>
                  {words.trim().length < 25 && (
                    <span className="text-[12.5px] text-warn tabular-nums">{25 - words.trim().length} more before Prism will try</span>
                  )}
                  <span className="ml-auto">
                    <Chip on={words === EXAMPLE_WORDS} onClick={() => setWords(EXAMPLE_WORDS)}>Use what you told the team on 2 Sep</Chip>
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-surface-2/40 p-4">
                <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-2">WHAT COMES BACK</div>
                <p className="text-[13.5px] text-muted leading-relaxed mb-3">
                  Nine named parts, not a tidier paragraph. Every one of them is yours to change afterwards.
                </p>
                {[
                  ["Five parts of the brief", "What changes · The problem · Where · Done looks like · Constraints"],
                  ["A hypothesis in four parts", "The change · The audience · The outcome · Why we think so"],
                  ["One primary metric, with a direction", "Bound only to events this experiment actually reports"],
                  ["The guardrails that can veto it", "What must not get worse while the primary goes up"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-start gap-2.5 py-1.5 border-b border-border last:border-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mt-[7px]" />
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-medium">{k}</div>
                      <div className="text-[12.5px] text-muted-2 mt-0.5">{v}</div>
                    </div>
                  </div>
                ))}
                <p className="text-[12.5px] text-muted-2 mt-3 leading-relaxed">
                  It marks the parts it was least sure about instead of hiding them, and it asks you at most two questions —
                  once, on the first pass.
                </p>
              </div>

              {drafted && (
                <div className="rounded-xl border border-border p-4">
                  <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-1.5">WHAT A RE-DRAFT KEEPS</div>
                  <p className="text-[13.5px] text-muted leading-relaxed">
                    Your {disagreements.length} recorded disagreement{disagreements.length === 1 ? "" : "s"} and both answers go
                    with it, and Prism has to answer them. Edits you typed straight into a part do not survive — record a
                    disagreement instead if you want it to stick.
                  </p>
                </div>
              )}
            </div>

            <footer className="shrink-0 border-t border-border p-5 flex items-center gap-3">
              <Button onClick={runDraft} disabled={words.trim().length < 25}>{drafted ? "Re-draft the brief" : "Draft the brief"}</Button>
              <span className="text-[12.5px] text-muted-2 leading-relaxed">
                Nothing is published, built or run by drafting. It writes a draft you can throw away.
              </span>
            </footer>
          </aside>
        </>
      )}
    </>
  );
}
