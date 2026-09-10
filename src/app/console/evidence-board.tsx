"use client";

/**
 * THE EVIDENCE BOARD — the two arms, photographed and annotated.
 *
 * One rule holds this surface up: a box is bound to a METRIC KEY, never to a
 * number. A board that stores a figure is a board that goes stale in silence —
 * a stored +91.8% once printed beside a live +90.8%, and afterwards nobody
 * could say which of the two the decision had been made on. So every figure
 * here is read from the key printed beside it at render, the caption says so
 * out loud, and the stamped decision figure is CHECKED against the live read
 * rather than reprinted from memory.
 *
 * Chroma is earned. A box wears green or red only once its interval excludes
 * zero. A real-looking but uncertain movement stays neutral, because a coloured
 * box is read as a finding by everyone who never opens the ledger below it.
 *
 * Arms come from the experiment DEFINITION, not from the run — which is why the
 * control here was photographed while the experiment was still a draft. A draft
 * arm can be shot. It cannot be read: its boxes show a dash until a run reports.
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
  window: "run 4 · closed 8 Sep 2026 · 18,412 sessions",
  readAt: "10 Sep 2026 11:42",
  annotator: "Malia K. · Author",
};

/** What the decision was stamped with when the run closed. Never reprinted as
 *  a box — only compared against what the board reads now. */
const STAMP = { delta: 2.4, lo: 0.3, hi: 4.5, p: 0.031 };

type ArmId = "control" | "variation";

type Arm = {
  id: ArmId;
  name: string;
  detail: string;
  armKey: string;
  shot: string;
  size: string;
  note: string;
};

const ARMS: Arm[] = [
  {
    id: "control",
    name: "Control",
    detail: "the rate calendar as it ships today",
    armKey: "arm/control",
    shot: "22 Aug 2026 14:06",
    size: "1440 × 900 · PNG 214 KB",
    note: "taken four days before the brief was frozen — the definition already named this arm",
  },
  {
    id: "variation",
    name: "Variation",
    detail: "best-price promise sits above the calendar",
    armKey: "arm/best-price-promise",
    shot: "27 Aug 2026 09:41",
    size: "1440 × 900 · PNG 221 KB",
    note: "taken from build 8c1d7e2, the same code the run served",
  },
];

type Tone = "ok" | "danger" | "muted" | "warn";
type Role = "decision" | "supporting" | "guardrail" | "exploratory";
type Rect = { x: number; y: number; w: number; h: number };
type Reading = { delta: number; lo: number; hi: number; p: number };

type Annotation = {
  n: number;
  points: string;
  why: string;
  metricKey: string;
  metricLabel: string;
  role: Role;
  /** null = this run does not report the key, so there is nothing to read. */
  reading: Reading | null;
  blind?: string;
  control: Rect | null;
  variation: Rect | null;
  /** Which way the callout chip hangs off the box, so two never collide. */
  side: "l" | "r";
};

const ANNOTATIONS: Annotation[] = [
  {
    n: 1,
    points: "Book Now, on the rate card",
    why: "The button the promise is meant to push guests onto.",
    metricKey: "24138040550_book_now_button_clicks",
    metricLabel: "Offer Detail Book Now Button Clicks",
    role: "decision",
    reading: { delta: 2.4, lo: 0.3, hi: 4.5, p: 0.031 },
    control: { x: 3.5, y: 74.5, w: 33, h: 13 },
    variation: { x: 3.5, y: 77.5, w: 36, h: 13 },
    side: "r",
  },
  {
    n: 2,
    points: "Hero call to action",
    why: "Upstream of the change. Two events share this display name, so the box names the key instead.",
    metricKey: "24138040550_hero_cta_click",
    metricLabel: "Hero CTA Click",
    role: "supporting",
    reading: { delta: 0.6, lo: -1.9, hi: 3.1, p: 0.64 },
    control: { x: 4.5, y: 24, w: 29, h: 11.5 },
    variation: { x: 4.5, y: 24, w: 29, h: 11.5 },
    side: "r",
  },
  {
    n: 3,
    points: "All offers, in the property nav",
    why: "The guardrail. If the promise pulled guests off the offers page, the win would not be a win.",
    metricKey: "24138040550_all_offers_page",
    metricLabel: "All Offers Page",
    role: "guardrail",
    reading: { delta: -0.4, lo: -2.6, hi: 1.8, p: 0.72 },
    control: { x: 65.5, y: 5.5, w: 27, h: 10 },
    variation: { x: 65.5, y: 5.5, w: 27, h: 10 },
    side: "l",
  },
  {
    n: 4,
    points: "Animated Book Now, sticky footer",
    why: "Present in both arms. The promise appears to have taken clicks off it and given them to the rate card.",
    metricKey: "24138040550_animated_cta_book_now_clicks",
    metricLabel: "Animated Book Now CTA Clicks",
    role: "supporting",
    reading: { delta: -3.1, lo: -5.4, hi: -0.8, p: 0.009 },
    control: { x: 63.5, y: 81.5, w: 31, h: 14 },
    variation: { x: 63.5, y: 81.5, w: 31, h: 14 },
    side: "l",
  },
  {
    n: 5,
    points: "Brand header",
    why: "A box nobody expects to move. Drawn on purpose: a board with no flat boxes is a board that only shows what it wants to.",
    metricKey: "24138040550_home",
    metricLabel: "All Outrigger",
    role: "exploratory",
    reading: { delta: 0.1, lo: -1.4, hi: 1.6, p: 0.88 },
    control: { x: 3.5, y: 5.5, w: 25, h: 10 },
    variation: { x: 3.5, y: 5.5, w: 25, h: 10 },
    side: "r",
  },
  {
    n: 6,
    points: "The best-price promise itself",
    why: "Bound to the duplicate. Two project events carry the display name — this one is not attached to the experiment.",
    metricKey: "24138040550_offer_detail_book_now_button_clicks",
    metricLabel: "Offer Detail Book Now Button Clicks",
    role: "supporting",
    reading: null,
    blind: "this run does not report the key",
    control: null,
    variation: { x: 2, y: 44.5, w: 92, h: 13 },
    side: "r",
  },
];

const ROLE_LABEL: Record<Role, string> = {
  decision: "Decides it",
  supporting: "Supporting",
  guardrail: "Guardrail",
  exploratory: "Exploratory",
};

/* ── Computation. Everything worked out below is rendered somewhere. ── */

const rectFor = (a: Annotation, arm: ArmId): Rect | null => (arm === "control" ? a.control : a.variation);

const pct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(1)}%`;

type Chroma = { tone: Tone; earned: boolean; verdict: string };

function chroma(a: Annotation): Chroma {
  if (!a.reading) return { tone: "warn", earned: false, verdict: "no colour — nothing to read" };
  const excludesZero = a.reading.lo > 0 || a.reading.hi < 0;
  if (!excludesZero) return { tone: "muted", earned: false, verdict: "no colour — interval spans zero" };
  return a.reading.delta > 0
    ? { tone: "ok", earned: true, verdict: "green — interval excludes zero" }
    : { tone: "danger", earned: true, verdict: "red — interval excludes zero" };
}

const FILTERS = [
  ["all", "All boxes"],
  ["moved", "Moved the number"],
  ["flat", "Too close to call"],
  ["blind", "Cannot be read"],
  ["breach", "Guardrail breach"],
] as const;

type FilterKey = (typeof FILTERS)[number][0];

function matches(a: Annotation, f: FilterKey): boolean {
  const c = chroma(a);
  if (f === "all") return true;
  if (f === "moved") return c.earned;
  if (f === "flat") return !c.earned && a.reading !== null;
  if (f === "blind") return a.reading === null;
  return a.role === "guardrail" && c.earned && (a.reading?.delta ?? 0) < 0;
}

/* ── Frozen-fact grammar: bordered mono, lock glyph. ────────────────── */

const Lock = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

const Frozen = ({ children }: { children: React.ReactNode }) => (
  <div className="inline-flex items-center gap-1.5 rounded border border-border bg-surface-2/60 px-2 py-1 font-mono text-[11px] text-muted-2">
    <Lock />
    {children}
  </div>
);

const Receipt = ({ rows }: { rows: [string, string][] }) => (
  <div className="rounded-lg border border-border bg-surface-2/60 p-3.5">
    <div className="flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-2.5">
      <Lock />
      FROZEN — THE BOARD CANNOT EDIT THESE
    </div>
    <dl className="space-y-1.5 font-mono text-[11.5px]">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-3">
          <dt className="w-[86px] shrink-0 text-muted-2">{k}</dt>
          <dd className="min-w-0 text-foreground tabular-nums break-all">{v}</dd>
        </div>
      ))}
    </dl>
  </div>
);

const Mono = ({ children }: { children: React.ReactNode }) => (
  <span className="font-mono text-[11px] text-muted-2 bg-surface-2 rounded px-1.5 py-0.5">{children}</span>
);

/* ── The shots ─────────────────────────────────────────────────────── */

const BOX_TONE: Record<Tone, string> = {
  ok: "border-ok bg-ok/10",
  danger: "border-danger bg-danger/10",
  muted: "border-border-strong bg-surface-2/40",
  warn: "border-warn border-dashed bg-warn/10",
};

const TAB_TONE: Record<Tone, string> = {
  ok: "bg-ok text-accent-fg",
  danger: "bg-danger text-accent-fg",
  muted: "bg-border-strong text-foreground",
  warn: "bg-warn text-accent-fg",
};

const Block = ({ r, className }: { r: Rect; className?: string }) => (
  <div
    className={cn("absolute rounded-[3px] bg-surface-2", className)}
    style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }}
  />
);

/** Seven date cells, spaced by arithmetic rather than by seven hand-written rects. */
const CAL_CELLS = Array.from({ length: 7 }, (_, i) => ({ x: 6 + i * 12.3, w: 10.5 }));

function Wire({ arm }: { arm: ArmId }) {
  const calY = arm === "control" ? 50 : 60;
  return (
    <div className="absolute inset-0" aria-hidden>
      <Block r={{ x: 0, y: 0, w: 100, h: 4.5 }} />
      <Block r={{ x: 6, y: 7.5, w: 20, h: 6 }} className="bg-border-strong/60" />
      <Block r={{ x: 42, y: 7.5, w: 10, h: 6 }} />
      <Block r={{ x: 68, y: 7.5, w: 22, h: 6 }} />
      <Block r={{ x: 0, y: 17, w: 100, h: 20 }} className="bg-surface-2/70" />
      <Block r={{ x: 7, y: 26, w: 24, h: 7 }} className="bg-border-strong/60" />
      <Block r={{ x: 6, y: 40, w: 42, h: 3.5 }} />
      {arm === "variation" && <Block r={{ x: 4, y: 47, w: 88, h: 8 }} className="bg-accent/15" />}
      {CAL_CELLS.map((c) => (
        <Block key={c.x} r={{ x: c.x, y: calY, w: c.w, h: 11 }} />
      ))}
      <Block r={{ x: 6, y: arm === "control" ? 65 : 74, w: 50, h: 3 }} />
      <Block
        r={arm === "control" ? { x: 6, y: 77, w: 28, h: 8 } : { x: 6, y: 80, w: 32, h: 8 }}
        className="bg-border-strong/60"
      />
      <Block r={{ x: 66, y: 84, w: 26, h: 9 }} className="bg-border-strong/60" />
    </div>
  );
}

function Callout({ a, r, selected, showKeys }: { a: Annotation; r: Rect; selected: boolean; showKeys: boolean }) {
  const c = chroma(a);
  // A box near the top edge hangs its chip below, or the chip clips out of the shot.
  const below = r.y < 14;
  return (
    <span
      className={cn(
        "absolute z-10 inline-flex rounded-full bg-surface ring-1 whitespace-nowrap",
        selected ? "ring-accent" : "ring-border",
        a.side === "r" ? "left-0" : "right-0",
        below ? "top-full mt-1" : "bottom-full mb-1",
      )}
    >
      <Pill tone={c.tone}>
        <span className="tabular-nums opacity-70">{a.n}</span>
        <span className="font-medium">{showKeys ? a.metricKey : a.metricLabel}</span>
        <span className="tabular-nums">{a.reading ? pct(a.reading.delta) : "—"}</span>
      </Pill>
    </span>
  );
}

function Shot({
  arm,
  sel,
  setSel,
  showKeys,
  filter,
}: {
  arm: Arm;
  sel: number | null;
  setSel: (n: number | null) => void;
  showKeys: boolean;
  filter: FilterKey;
}) {
  const boxes = ANNOTATIONS.filter((a) => rectFor(a, arm.id) !== null);
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[13.5px] font-semibold">{arm.name}</span>
        <span className="text-[13px] text-muted-2 truncate">— {arm.detail}</span>
        <span className="ml-auto shrink-0">
          <Pill tone={arm.id === "variation" ? "accent" : "muted"}>
            <span className="tabular-nums">{boxes.length}</span> boxes
          </Pill>
        </span>
      </div>

      <div className="rounded-lg border border-border bg-background overflow-hidden">
        <div className="h-7 flex items-center gap-1.5 px-2.5 border-b border-border bg-surface-2">
          <span className="w-2 h-2 rounded-full bg-border-strong" />
          <span className="w-2 h-2 rounded-full bg-border-strong" />
          <span className="w-2 h-2 rounded-full bg-border-strong" />
          <span className="ml-1.5 font-mono text-[10.5px] text-muted-2 truncate">{RUN.page}</span>
        </div>

        <div className="relative h-[340px]">
          <Wire arm={arm.id} />
          {boxes.map((a) => {
            const r = rectFor(a, arm.id);
            if (!r) return null;
            const c = chroma(a);
            const on = sel === a.n;
            const dim = !matches(a, filter);
            return (
              <button
                key={a.n}
                type="button"
                onClick={() => setSel(on ? null : a.n)}
                title={`Box ${a.n} — bound to ${a.metricKey}`}
                className={cn(
                  "absolute rounded-[4px] border-2 transition-opacity",
                  BOX_TONE[c.tone],
                  on && "ring-2 ring-accent ring-offset-1 ring-offset-background",
                  dim && "opacity-20",
                )}
                style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }}
              >
                <span
                  className={cn(
                    "absolute left-0 bottom-0 m-[3px] w-[15px] h-[15px] rounded-[3px] grid place-items-center text-[10px] font-bold tabular-nums",
                    TAB_TONE[c.tone],
                  )}
                >
                  {a.n}
                </span>
                <Callout a={a} r={r} selected={on} showKeys={showKeys} />
              </button>
            );
          })}
        </div>
      </div>

      {/* The arm is frozen. The photograph of it is not — that distinction is the point. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Frozen>{arm.armKey}</Frozen>
        <span className="text-[12.5px] text-muted-2 tabular-nums">{arm.size}</span>
        <span className="text-[12.5px] text-muted-2">shot {arm.shot}</span>
        <button className="ml-auto text-[12.5px] text-accent">Re-shoot</button>
      </div>
      <p className="mt-1 text-[12.5px] text-muted-2 leading-relaxed">{arm.note}</p>
    </div>
  );
}

/* ── The surface ───────────────────────────────────────────────────── */

export function EvidenceBoard() {
  const [sel, setSel] = useState<number | null>(1);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [showKeys, setShowKeys] = useState(false);

  const counts: Record<FilterKey, number> = {
    all: ANNOTATIONS.length,
    moved: ANNOTATIONS.filter((a) => matches(a, "moved")).length,
    flat: ANNOTATIONS.filter((a) => matches(a, "flat")).length,
    blind: ANNOTATIONS.filter((a) => matches(a, "blind")).length,
    breach: ANNOTATIONS.filter((a) => matches(a, "breach")).length,
  };

  const shown = ANNOTATIONS.filter((a) => matches(a, filter));
  const drawn = ANNOTATIONS.reduce((n, a) => n + (a.control ? 1 : 0) + (a.variation ? 1 : 0), 0);
  const onBoth = ANNOTATIONS.filter((a) => a.control && a.variation).length;

  // The stored-figure guard: read the decision metric live, then compare it to
  // the figure the decision was stamped with. Both are printed, side by side.
  const decision = ANNOTATIONS.find((a) => a.role === "decision") ?? null;
  const live = decision?.reading ?? null;
  const liveEarned = decision !== null && chroma(decision).earned;
  const agrees =
    live !== null && live.delta === STAMP.delta && live.lo === STAMP.lo && live.hi === STAMP.hi && live.p === STAMP.p;

  return (
    <>
      <PageHeader
        title="Evidence board"
        count={`${RUN.experiment} · ${RUN.window}`}
        actions={
          <>
            <Button variant="outline" size="sm">Re-read every binding</Button>
            <Button size="sm">Export board</Button>
          </>
        }
      />

      <Toolbar>
        {FILTERS.map(([k, label]) => (
          <Chip key={k} on={filter === k} onClick={() => setFilter(k)}>
            {label} <span className="tabular-nums opacity-60">{counts[k]}</span>
          </Chip>
        ))}
        <div className="w-px h-5 bg-border mx-1" />
        <Chip on={showKeys} onClick={() => setShowKeys(!showKeys)}>
          {showKeys ? "Callouts show the key" : "Callouts show the label"}
        </Chip>
        <span className="ml-auto text-[12.5px] text-muted-2">
          Read from Optimizely at <span className="tabular-nums">{RUN.readAt}</span>
        </span>
      </Toolbar>

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* What is frozen, and what is not. */}
        <Section
          title="What this board is evidence of"
          action={
            agrees ? (
              <Pill tone="ok">Board agrees with the stamp</Pill>
            ) : (
              <Pill tone="danger">Board disagrees with the stamp — trust the board</Pill>
            )
          }
        >
          <div className="p-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <Receipt
                rows={[
                  ["page", RUN.page],
                  ["build", RUN.build],
                  ["brief", RUN.brief],
                  ["run", RUN.window],
                  ["arms", `${ARMS[0].armKey} · ${ARMS[1].armKey}`],
                  ["stamped", `${pct(STAMP.delta)} · 95% CI ${pct(STAMP.lo)} → ${pct(STAMP.hi)} · p ${STAMP.p.toFixed(3)}`],
                ]}
              />
              <div className="mt-3 rounded-lg border border-border p-3.5">
                <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-2">
                  THE STAMP, CHECKED AGAINST WHAT THE BOARD JUST READ
                </div>
                <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                  <div>
                    <div className="text-[18px] font-semibold tabular-nums tracking-[-0.02em]">{pct(STAMP.delta)}</div>
                    <div className="text-[12px] text-muted-2 mt-0.5">stamped when run 4 closed</div>
                  </div>
                  <div>
                    <div
                      className={cn(
                        "text-[18px] font-semibold tabular-nums tracking-[-0.02em]",
                        liveEarned && "text-ok",
                      )}
                    >
                      {live ? pct(live.delta) : "—"}
                    </div>
                    <div className="text-[12px] text-muted-2 mt-0.5">read from the key just now</div>
                  </div>
                  <p className="text-[12.5px] text-muted leading-relaxed flex-1 min-w-[180px]">
                    {agrees
                      ? "They match to the decimal, so nothing on this board is a memory of a number."
                      : "They differ. The stamp is a record of a moment; the board is what the key says today."}
                  </p>
                </div>
              </div>
            </div>

            {/* Mutable things: plain text, no lock, no mono. */}
            <div>
              <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-1">STILL CHANGEABLE</div>
              <Meta k="Annotated by" v={RUN.annotator} />
              <Meta k="Boxes" v={`${ANNOTATIONS.length} bindings · ${drawn} drawn · ${onBoth} on both arms`} />
              <Meta k="Colour earned" v={`${counts.moved} of ${ANNOTATIONS.length} boxes`} />
              <Meta k="Unreadable" v={`${counts.blind} box · bound to an event this run does not report`} />
              <Meta k="Last read" v={RUN.readAt} />
              <p className="text-[12.5px] text-muted-2 leading-relaxed mt-3">
                Annotations, captions and the shots themselves can be redone at any time. The arms, the build and the
                stamped statistics above cannot — which is why they are the only things on this page wearing a lock.
              </p>
            </div>
          </div>
        </Section>

        {/* The two shots. */}
        <Section
          title="Control and variation, side by side"
          action={<span className="text-[12.5px] text-muted-2">Click a box to follow it into the ledger</span>}
        >
          <div className="px-5 pt-4">
            <div className="rounded-lg border border-border bg-surface-2/40 p-4">
              <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-1.5">WHERE THE ARMS COME FROM</div>
              <p className="text-[13.5px] text-muted leading-relaxed">
                Both arms are named by the experiment <span className="text-foreground">definition</span>, not by the run.
                An arm exists the moment the definition describes it, so the control below was shot on{" "}
                <span className="text-foreground tabular-nums">22 Aug 2026</span> — four days before brief revision 3 was
                frozen, while the experiment was still a draft. Shooting a draft is fine. Reading one is not: on a draft
                every box shows a dash until a run reports the key it is bound to.
              </p>
            </div>
          </div>

          <div className="p-5 grid gap-6 xl:grid-cols-2">
            {ARMS.map((arm) => (
              <Shot key={arm.id} arm={arm} sel={sel} setSel={setSel} showKeys={showKeys} filter={filter} />
            ))}
          </div>

          {/* The caption. It has to say what the boxes are, or the board is just pictures. */}
          <p className="px-5 pb-5 text-[13px] text-muted leading-relaxed border-t border-border pt-4">
            <span className="text-foreground font-medium">Fig. 1</span> — {RUN.page}, build{" "}
            <span className="font-mono text-[12px]">{RUN.build}</span>, both arms at 1440 × 900.{" "}
            <span className="text-foreground">
              Every box is bound to a metric key, and every figure printed on this board was read from that key at{" "}
              <span className="tabular-nums">{RUN.readAt}</span> — not one of them is stored on the annotation.
            </span>{" "}
            <span className="tabular-nums">{onBoth}</span> of the {ANNOTATIONS.length} bindings are drawn on both shots;
            each is one binding rendered twice, so the two copies can never disagree. Colour is earned and not chosen:{" "}
            <span className="tabular-nums">{counts.moved}</span> boxes carry an interval that excludes zero and are
            coloured, <span className="tabular-nums">{counts.flat}</span> moved but not enough to say so and stay neutral,
            and <span className="tabular-nums">{counts.blind}</span> cannot be read at all. One region deliberately has no
            box: nothing on this site fires when a guest scrubs dates in the calendar, so there is no key to bind and the
            board will not draw a box without one.
          </p>
        </Section>

        {/* The ledger. */}
        <Section
          title="What each box is bound to"
          action={
            <span className="text-[12.5px] text-muted-2">
              Showing <span className="tabular-nums">{shown.length}</span> of{" "}
              <span className="tabular-nums">{ANNOTATIONS.length}</span>
            </span>
          }
        >
          {shown.length === 0 ? (
            <Empty
              title="No box falls into this group"
              body={
                filter === "breach"
                  ? "No guardrail is breached. The two boxes wearing colour are a decision metric and a supporting one — neither of them can veto a ship, and the guardrail box beside them spans zero."
                  : "Nothing on either shot matches this filter right now."
              }
              action={
                <Button size="sm" variant="outline" onClick={() => setFilter("all")}>
                  Show all {ANNOTATIONS.length} boxes
                </Button>
              }
            />
          ) : (
            <table className="w-full border-collapse">
              <thead className="bg-surface-2/60">
                <tr>
                  <Th first>Box</Th>
                  <Th>Points at</Th>
                  <Th>Bound to</Th>
                  <Th>Role</Th>
                  <Th>Read just now</Th>
                  <Th>Colour</Th>
                </tr>
              </thead>
              <tbody>
                {shown.map((a) => {
                  const c = chroma(a);
                  const on = sel === a.n;
                  return (
                    <tr
                      key={a.n}
                      onClick={() => setSel(on ? null : a.n)}
                      className={cn("cursor-pointer border-b border-border hover:bg-surface-2/60", on && "bg-accent/[0.04]")}
                    >
                      <td className="px-4 pl-6 py-3 align-top">
                        <span
                          className={cn(
                            "inline-grid place-items-center w-[18px] h-[18px] rounded-[4px] text-[11px] font-bold tabular-nums",
                            TAB_TONE[c.tone],
                          )}
                        >
                          {a.n}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top max-w-[280px]">
                        <div className="text-[14px] font-medium">{a.points}</div>
                        <div className="text-[12.5px] text-muted-2 leading-relaxed mt-0.5">{a.why}</div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {a.control && <Pill tone="muted">on control</Pill>}
                          {a.variation && <Pill tone="muted">on variation</Pill>}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="text-[13.5px]">{a.metricLabel}</div>
                        <div className="mt-1">
                          <Mono>{a.metricKey}</Mono>
                        </div>
                        {a.blind && <div className="text-[12.5px] text-warn mt-1.5">{a.blind}</div>}
                      </td>
                      <td className="px-4 py-3 align-top text-[13px] text-muted whitespace-nowrap">{ROLE_LABEL[a.role]}</td>
                      <td className="px-4 py-3 align-top whitespace-nowrap">
                        <div
                          className={cn(
                            "text-[14.5px] font-semibold tabular-nums",
                            c.earned ? (c.tone === "ok" ? "text-ok" : "text-danger") : a.reading ? "text-foreground" : "text-warn",
                          )}
                        >
                          {a.reading ? pct(a.reading.delta) : "—"}
                        </div>
                        {a.reading ? (
                          <div className="text-[12px] text-muted-2 tabular-nums mt-0.5">
                            95% CI {pct(a.reading.lo)} → {pct(a.reading.hi)} · p {a.reading.p.toFixed(3)}
                          </div>
                        ) : (
                          <div className="text-[12px] text-muted-2 mt-0.5">and it will read a dash until it is rebound</div>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <Pill tone={c.tone}>{c.verdict}</Pill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Section>

        {/* The rule, stated where the people who break it will read it. */}
        <Section title="Why a box never holds a number">
          <div className="px-5 py-3.5 border-b border-border">
            <div className="text-[14px] font-medium">A stored figure printed +91.8% beside a live +90.8%</div>
            <p className="text-[13.5px] text-muted leading-relaxed mt-1">
              Both had been true. The board had been annotated mid-run and the caption kept the figure it was annotated
              with; the ledger under it kept reading the key. Nobody could say afterwards which of the two the decision
              had been taken on, so the result was re-run. A board that can hold a number will eventually hold a wrong one.
            </p>
          </div>
          <div className="px-5 py-3.5 border-b border-border">
            <div className="text-[14px] font-medium">So an annotation stores a key, a rectangle and a sentence</div>
            <p className="text-[13.5px] text-muted leading-relaxed mt-1">
              Nothing else. Rebinding box{" "}
              <span className="tabular-nums">
                {ANNOTATIONS.filter((a) => a.reading === null).map((a) => a.n).join(", ")}
              </span>{" "}
              to <Mono>24138040550_book_now_button_clicks</Mono> would make it readable, because that is the one of the two
              same-named events this experiment actually reports.
            </p>
          </div>
          <div className="px-5 py-3.5">
            <div className="text-[14px] font-medium">And colour is a claim, so it has to be earned</div>
            <p className="text-[13.5px] text-muted leading-relaxed mt-1">
              A neutral box is not a missing result — it is a movement the interval will not stand behind.{" "}
              <span className="tabular-nums">{counts.flat}</span> of the{" "}
              <span className="tabular-nums">{ANNOTATIONS.length}</span> boxes on this board are in exactly that state,
              and they stay grey no matter how convincing the screenshot looks.
            </p>
          </div>
        </Section>
      </div>
    </>
  );
}
