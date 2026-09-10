"use client";

/**
 * UNDERSTANDING A SITE — and the two-step wizard that creates the customer
 * it belongs to.
 *
 * THE CUSTOMER IS A CONTAINER. A name, its sites, its people, its connections.
 * Nothing is read, asked or characterized at that level, because a crawl is of
 * a site and a hotel group's properties do not share a voice. Everything below
 * happens per site, from Sites → the site → "What Prism understands".
 *
 * The shape is READ → ASK → CORRECT → COMPILE, and each step is honest about
 * what kind of knowledge it is producing:
 *
 *  · READ produces FACTS. Fonts, colours, pages, buttons. Shown as a receipt,
 *    with the awkward findings kept in (every colour variable on outrigger.com
 *    belongs to the booking-widget vendor). Re-derivable, never approved.
 *  · ASK produces ANSWERS, only where the crawl could not settle something.
 *    Same rule as the brief: a question is asked only if the answer changes
 *    what the agent would build, three rounds at most, and the answers pass is
 *    TERMINAL — after it, what is still unsure is RECORDED, never guessed.
 *    The meter is allowed to fall: an answer can reveal Prism knew less than
 *    it thought, and the option says so before you click it.
 *  · CORRECT is where a human makes the inference true. Every section can be
 *    edited by hand, or handed back to Prism with a note — and the note is
 *    kept, because the corrections are the most valuable content in the system.
 *  · COMPILE turns the approved sections into the files the builder receives,
 *    pinned as a context revision. Re-reading later makes r2; it never rewrites r1.
 *
 * When a site is saved, the next thing offered is the next site — a customer
 * with three sites is not onboarded until all three are understood.
 */

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/ui/cn";
import {
  BUILD_THRESHOLD, DRAFT_SECTIONS, OBSERVED, OUTPUT_FILES, QUESTIONS, ROUNDS, SECTION_LABEL, SITE_CONTEXT, bandFor,
  type Answer, type Answers, type Earned, type Question, type Section, type SectionKey, type SiteContext,
} from "@/lib/console/context";
import type { Site } from "@/lib/console/fake";
import { Q, Wizard } from "./onboarding";
import { Pill, Section as Card } from "./ui";

/* ── The profile as state ──────────────────────────────────────────── */

type Status = "draft" | "approved" | "edited" | "revised";

interface Live extends Section {
  status: Status;
  /** Notes handed to Prism, kept as provenance. */
  notes: string[];
  /** A re-read found the measured layer changed under this section. Cleared by a person saying it still holds. */
  flag?: string;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

const answered = (a: Answer | undefined) => Boolean(a && (a.option || (a.text && a.text.trim()) || a.skipped));

/** The interview applied to the drafts. Pure: the same answers always give the same profile. */
function applyAnswers(base: Section[], answers: Answers): Live[] {
  return base.map((s) => {
    let body = s.body;
    let confidence = s.confidence;
    const opened: string[] = [];
    let settled = true;
    for (const q of QUESTIONS) {
      const a = answers[q.id];
      if (q.section === s.key && (!a || a.skipped)) { settled = false; continue; }
      if (!a) continue;
      if (q.options && a.option) {
        const o = q.options.find((o) => o.id === a.option);
        if (!o) continue;
        confidence += o.delta[s.key] ?? 0;
        if (o.adds?.[s.key]) body += " " + o.adds[s.key];
        if (o.opens?.[s.key]) opened.push(o.opens[s.key] as string);
      } else if (q.free && a.text?.trim() && q.section === s.key) {
        confidence += q.free.delta;
        body += " " + q.free.adds(a.text.trim());
      }
    }
    const unsure = [...opened, ...(!settled && s.unsure ? [s.unsure] : [])].join(" ") || undefined;
    return { ...s, body, confidence: clamp(confidence), unsure, status: "draft", notes: [] };
  });
}

const overall = (ss: Live[]) => clamp(ss.reduce((n, s) => n + s.confidence, 0) / ss.length);

const interviewFinished = (answers: Answers) => QUESTIONS.every((q) => answered(answers[q.id]));

/** The round to resume at: the first with something unanswered. */
const resumeRound = (answers: Answers): 1 | 2 | 3 =>
  (([1, 2, 3] as const).find((r) => QUESTIONS.some((q) => q.round === r && !answered(answers[q.id]))) ?? 3);

/** What this session did that the static fixture cannot know: sites read, asked, corrected and saved. */
const SESSION_CONTEXT = new Map<string, SiteContext & { sections: Live[] }>();
const contextFor = (id: string): (SiteContext & { sections?: Live[] }) | null => SESSION_CONTEXT.get(id) ?? SITE_CONTEXT[id] ?? null;
/** Half-finished wizards. "Save & close — nothing is lost" has to be true for the length of a session. */
const DRAFTS = new Map<string, Record<string, unknown>>();
const TODAY = "10 Sep 2026";

/** Prism reads a site the moment it exists — when the customer is created, or when a site is added.
 *  The questions and the corrections wait for a person. */
export function markRead(siteId: string) {
  if (contextFor(siteId)) return;
  SESSION_CONTEXT.set(siteId, {
    answers: {}, approved: false, earned: [],
    revisions: [{ r: 1, when: TODAY, who: "Prism", what: `Read automatically — ${OBSERVED.read} pages. Nobody has been asked anything yet.`, pinnedBy: 0 }],
    sections: applyAnswers(DRAFT_SECTIONS, {}),
  });
}

const askedNothing = (answers: Answers) => Object.keys(answers).length === 0;

/** A site's understanding, as the Sites list and the site page state it. */
export function understandingOf(siteId: string): { label: string; tone: "ok" | "warn" | "muted"; ctx: (SiteContext & { sections?: Live[] }) | null } {
  const ctx = contextFor(siteId);
  if (!ctx) return { label: "Not read yet", tone: "muted", ctx: null };
  if (askedNothing(ctx.answers)) return { label: "Read — questions waiting", tone: "warn", ctx };
  if (!interviewFinished(ctx.answers)) return { label: "Interview unfinished", tone: "warn", ctx };
  if (!ctx.approved) return { label: "Draft — nobody has checked it", tone: "warn", ctx };
  return { label: `Approved · r${ctx.revisions[ctx.revisions.length - 1].r}`, tone: "ok", ctx };
}

export const UnderstandingPill = ({ id }: { id: string }) => {
  const u = understandingOf(id);
  return <Pill tone={u.tone}>{u.label}</Pill>;
};

/* ── Small pieces ─────────────────────────────────────────────────── */

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2">{children}</div>
);

const Stat = ({ n, l, tone }: { n: React.ReactNode; l: string; tone?: "warn" | "ok" }) => (
  <div>
    <div className={cn("text-[20px] font-semibold tabular-nums tracking-[-0.02em]", tone === "warn" && "text-warn", tone === "ok" && "text-ok")}>{n}</div>
    <div className="text-[12.5px] text-muted-2 mt-0.5">{l}</div>
  </div>
);

function Meter({ value, label }: { value: number; label?: string }) {
  const band = bandFor(value);
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-[26px] font-semibold tabular-nums tracking-[-0.02em] leading-none">{value}</span>
        <Badge variant={band.tone}>{band.label}</Badge>
        {label && <span className="text-[12.5px] text-muted-2 ml-auto">{label}</span>}
      </div>
      <Progress value={value} tone={band.tone} />
    </div>
  );
}

function SectionBars({ sections, prev }: { sections: Live[]; prev?: Live[] }) {
  return (
    <div className="space-y-2.5">
      {sections.map((s) => {
        const was = prev?.find((p) => p.key === s.key)?.confidence;
        const d = was === undefined ? 0 : s.confidence - was;
        return (
          <div key={s.key}>
            <div className="flex items-center gap-2 text-[12.5px] mb-1">
              <span className="text-muted">{SECTION_LABEL[s.key]}</span>
              <span className="ml-auto tabular-nums font-medium">{s.confidence}</span>
              {d !== 0 && <span className={cn("tabular-nums text-[11.5px] font-semibold", d > 0 ? "text-ok" : "text-danger")}>{d > 0 ? "+" : ""}{d}</span>}
            </div>
            <Progress value={s.confidence} tone={bandFor(s.confidence).tone} className="h-1.5" />
          </div>
        );
      })}
    </div>
  );
}

const Swatch = ({ hex, name, uses }: { hex: string; name?: string; uses: number }) => (
  <div className="flex items-center gap-2.5 min-w-0">
    <span className="w-7 h-7 rounded-md border border-border shrink-0" style={{ background: hex }} />
    <div className="min-w-0">
      <div className="font-mono text-[12px] leading-tight">{hex}</div>
      <div className="text-[11.5px] text-muted-2 truncate">{name ?? "—"} · {uses}×</div>
    </div>
  </div>
);

/* ── READ: the receipt ─────────────────────────────────────────────── */

function Measured() {
  const by = (o: "brand" | "framework" | "widget") => OBSERVED.colours.filter((c) => c.origin === o);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card title={`Type · ${OBSERVED.fonts.length} families, ${OBSERVED.fonts.reduce((n, f) => n + f.faces.length, 0)} faces`} className="lg:col-span-2">
        {OBSERVED.fonts.map((f) => (
          <div key={f.family} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 border-b border-border last:border-0">
            <div className="w-40 text-[14px] font-medium">{f.family}</div>
            <div className="flex-1 text-[12.5px] text-muted-2">{f.faces.join(" · ")}</div>
            <div className="text-[12.5px] text-muted tabular-nums">{f.declarations} declarations</div>
            <Badge variant="muted">{f.loaded}</Badge>
          </div>
        ))}
        <div className="px-5 py-3 text-[12.5px] text-muted-2 bg-surface-2/40">Montserrat Light is used most. Which family is for headlines is not something a stylesheet says — it&rsquo;s a question.</div>
      </Card>

      <Card title={`Colour · ${OBSERVED.colours.length} distinct, by who owns them`} className="lg:col-span-2">
        <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-6">
          {(["brand", "framework", "widget"] as const).map((o) => (
            <div key={o}>
              <Eyebrow>{o === "brand" ? "THE SITE'S OWN" : o === "framework" ? "BOOTSTRAP'S DEFAULTS" : "THE BOOKING WIDGET'S"}</Eyebrow>
              <div className="mt-2.5 space-y-2.5">{by(o).map((c) => <Swatch key={c.hex} {...c} />)}</div>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-border text-[12.5px] leading-relaxed bg-surface-2/40 text-muted">
          The site names its own palette: <span className="text-foreground">{OBSERVED.variables.palette.n} <span className="font-mono">{OBSERVED.variables.palette.prefix}</span> variables</span> in main.css, beside {OBSERVED.variables.framework.n} of Bootstrap&rsquo;s and {OBSERVED.variables.components.n} per-component ones; the booking widget brings {OBSERVED.variables.widget.n} of its own. The counts above are how often each colour is used on the pages read — not how important it is.
        </div>
      </Card>

      <Card title="Buttons on the home page">
        {OBSERVED.ctas.map((c) => (
          <div key={c.label} className="flex items-center gap-3 px-5 py-2.5 border-b border-border last:border-0">
            <span className="text-[13.5px]">{c.label}</span>
            <span className="ml-auto text-[12.5px] text-muted-2 tabular-nums">{c.count}×</span>
          </div>
        ))}
        <div className="px-5 py-2.5 text-[12.5px] text-muted-2 bg-surface-2/40">Primary buttons are {OBSERVED.widgetTokens.buttonCase}, {OBSERVED.widgetTokens.radius} radius, {OBSERVED.widgetTokens.buttonBorder} border — from the widget&rsquo;s stylesheet.</div>
      </Card>

      <Card title={`Pages · ${OBSERVED.read} read of ${OBSERVED.mapped} found`}>
        {OBSERVED.chosen.map((c) => (
          <div key={c.kind} className="flex items-center gap-3 px-5 py-2.5 border-b border-border last:border-0">
            <span className="text-[13.5px]">{c.kind}</span>
            <span className="ml-auto text-[12.5px] text-muted-2 tabular-nums">{c.n}</span>
          </div>
        ))}
        <div className="px-5 py-2.5 text-[12.5px] text-muted-2 bg-surface-2/40 leading-relaxed">{OBSERVED.skipped}</div>
      </Card>

      <Card title={`Repeated components · ${OBSERVED.components.length}`}>
        <div className="px-5 py-4 flex flex-wrap gap-1.5">
          {OBSERVED.components.map((c) => <Badge key={c} variant={c.includes("vendor") ? "muted" : "outline"}>{c}</Badge>)}
        </div>
      </Card>

      <Card title="Stylesheets read">
        {OBSERVED.stylesheets.map((s) => (
          <div key={s.url} className="flex items-center gap-3 px-5 py-2.5 border-b border-border last:border-0">
            <span className="font-mono text-[12px] truncate">{s.url}</span>
            <span className="ml-auto text-[12px] text-muted-2 whitespace-nowrap">{s.note}</span>
          </div>
        ))}
        <div className="px-5 py-2.5 text-[12.5px] text-muted-2 bg-surface-2/40">Media on the home page alone: {OBSERVED.media.images} images, {OBSERVED.media.videos} videos. This is a photography-led site.</div>
      </Card>
    </div>
  );
}

const PHASES = [
  { id: "map", label: "Mapping the site", detail: `${OBSERVED.mapped} addresses found` },
  { id: "choose", label: "Choosing what to read", detail: `${OBSERVED.read} pages — one of every kind, within a budget of ${OBSERVED.budget}` },
  { id: "read", label: "Reading", detail: "through Firecrawl — the site refuses plain crawlers (HTTP 403)" },
  { id: "derive", label: "Deriving", detail: "fonts, colours, components, selectors; then drafting what they mean" },
];

function Reading({ done }: { done: () => void }) {
  const [phase, setPhase] = useState(0);
  const [pages, setPages] = useState(0);
  useEffect(() => {
    const t: ReturnType<typeof setTimeout>[] = [];
    t.push(setTimeout(() => setPhase(1), 700));
    t.push(setTimeout(() => setPhase(2), 1500));
    for (let i = 1; i <= OBSERVED.read; i++) t.push(setTimeout(() => setPages(i), 1500 + i * 45));
    t.push(setTimeout(() => setPhase(3), 1500 + OBSERVED.read * 45 + 200));
    t.push(setTimeout(done, 1500 + OBSERVED.read * 45 + 1100));
    return () => t.forEach(clearTimeout);
  }, [done]);
  return (
    <Card>
      {PHASES.map((p, i) => (
        <div key={p.id} className="flex items-start gap-3.5 px-5 py-3.5 border-b border-border last:border-0">
          <span className={cn("mt-1 w-4 h-4 rounded-full grid place-items-center shrink-0",
            i < phase ? "bg-ok text-ok-fg" : i === phase ? "border-2 border-accent border-t-transparent animate-spin" : "border border-border-strong")}>
            {i < phase && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
          </span>
          <div className="flex-1 min-w-0">
            <div className={cn("text-[14px]", i <= phase ? "font-medium" : "text-muted-2")}>{p.label}</div>
            {i <= phase && <div className="text-[12.5px] text-muted-2 mt-0.5">{p.detail}</div>}
            {p.id === "read" && phase === 2 && (
              <div className="mt-2.5 flex items-center gap-3">
                <Progress value={(pages / OBSERVED.read) * 100} className="flex-1" />
                <span className="text-[12px] tabular-nums text-muted w-14 text-right">{pages} / {OBSERVED.read}</span>
              </div>
            )}
            {i > phase && <Skeleton className="h-3 w-48 mt-1.5" />}
          </div>
        </div>
      ))}
    </Card>
  );
}

function Drafts({ sections }: { sections: Live[] }) {
  return (
    <div className="space-y-3">
      {sections.map((s) => (
        <Card key={s.key}>
          <div className="px-5 py-4">
            <div className="flex items-center gap-2 mb-2">
              <Eyebrow>{SECTION_LABEL[s.key].toUpperCase()}</Eyebrow>
              <Badge variant={bandFor(s.confidence).tone}>{s.confidence}</Badge>
            </div>
            <p className="text-[14px] leading-relaxed">{s.body}</p>
            {s.unsure && <p className="text-[12.5px] text-warn mt-2 leading-relaxed"><span className="font-semibold">Least sure:</span> {s.unsure}</p>}
            <p className="text-[12px] text-muted-2 mt-2">From {s.from.join(" · ")}</p>
          </div>
        </Card>
      ))}
    </div>
  );
}

function Learned({ earned }: { earned: Earned[] }) {
  if (!earned.length) {
    return (
      <Card>
        <div className="px-5 py-8 text-center">
          <div className="text-[15px] font-semibold mb-1.5">Nothing yet — and nothing could be.</div>
          <p className="text-[13.5px] text-muted leading-relaxed max-w-md mx-auto">
            This layer can&rsquo;t be read off a website. It is written by decisions recorded on this site, one line per
            verdict, and it is the part of the context no competitor with a crawler can copy. The first entry arrives with the first readout.
          </p>
        </div>
      </Card>
    );
  }
  return (
    <Card title={`${earned.length} things measured on this site's own visitors`}>
      {earned.map((e) => (
        <div key={e.claim} className="px-5 py-3.5 border-b border-border last:border-0">
          <div className="text-[14px] leading-relaxed">{e.claim} <span className="text-muted-2">— {e.range}</span></div>
          <div className="text-[12px] text-muted-2 mt-1">From {e.decisions.map((d, i) => <span key={d}><span className="text-accent">{d}</span>{i < e.decisions.length - 1 ? ", " : ""}</span>)}</div>
        </div>
      ))}
      <div className="px-5 py-2.5 text-[12.5px] text-muted-2 bg-surface-2/40">Measured, not inferred. This is the loudest thing in the builder&rsquo;s context and the first thing a readout cites.</div>
    </Card>
  );
}

function ReadReport({ sections, earned = [] }: { sections: Live[]; earned?: Earned[] }) {
  return (
    <>
      <Card>
        <div className="px-5 py-4 flex flex-wrap items-center gap-x-8 gap-y-3">
          <Stat n={OBSERVED.mapped} l="addresses found" />
          <Stat n={OBSERVED.read} l="pages read" />
          <Stat n={`${OBSERVED.seconds}s`} l="to read and derive" />
          <Stat n={overall(sections)} l="understanding, before asking" tone="warn" />
          <div className="ml-auto text-right text-[12.5px] text-muted-2">
            <div>read {OBSERVED.readAt}</div>
            <div>through Firecrawl · {OBSERVED.readFrom}</div>
          </div>
        </div>
      </Card>
      <Tabs defaultValue="measured" className="mt-4">
        <TabsList>
          <TabsTrigger value="measured">What we measured</TabsTrigger>
          <TabsTrigger value="think">What we think</TabsTrigger>
          <TabsTrigger value="learned">What we&rsquo;ve learned</TabsTrigger>
        </TabsList>
        <TabsContent value="measured" className="mt-2"><Measured /></TabsContent>
        <TabsContent value="think" className="mt-2">
          <p className="text-[13px] text-muted mb-3 leading-relaxed">Written by Prism from what it measured. Everything on the other tab is a fact; everything here is a guess with a number on it, and the next step is where you make it true.</p>
          <Drafts sections={sections} />
        </TabsContent>
        <TabsContent value="learned" className="mt-2"><Learned earned={earned} /></TabsContent>
      </Tabs>
    </>
  );
}

/* ── ASK: the interview ────────────────────────────────────────────── */

function QuestionCard({ q, a, set }: { q: Question; a: Answer | undefined; set: (a: Answer) => void }) {
  const done = answered(a);
  return (
    <Card className={cn(done && "border-border-strong")}>
      <div className="px-5 py-4">
        <div className="flex items-center gap-2 mb-2">
          <Eyebrow>{SECTION_LABEL[q.section].toUpperCase()}</Eyebrow>
          {a?.skipped && <Badge variant="warn">Recorded as unknown</Badge>}
        </div>
        <h3 id={`${q.id}-ask`} className="text-[16px] font-semibold leading-snug mb-1.5">{q.ask}</h3>
        <p className="text-[13px] text-muted leading-relaxed mb-4"><span className="font-medium text-muted">Why you&rsquo;re being asked:</span> {q.because}</p>

        {q.options && (
          <RadioGroup aria-labelledby={`${q.id}-ask`} value={a?.option ?? ""} onValueChange={(v) => set({ option: v })}>
            {q.options.map((o) => (
              <Label key={o.id} htmlFor={`${q.id}-${o.id}`}
                className={cn("items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer font-normal text-foreground",
                  a?.option === o.id ? "border-accent bg-accent/5" : "border-border hover:border-border-strong")}>
                <RadioGroupItem id={`${q.id}-${o.id}`} value={o.id} className="mt-0.5" />
                <span className="flex-1">
                  <span className="block text-[14px] font-medium">{o.label}</span>
                  <span className={cn("block text-[12.5px] mt-0.5", o.tone === "warn" ? "text-warn" : "text-muted-2")}>{o.hint}</span>
                </span>
              </Label>
            ))}
          </RadioGroup>
        )}

        {q.free && (
          <div>
            <Textarea value={a?.text ?? ""} onChange={(e) => set({ text: e.target.value })} placeholder={q.free.placeholder} rows={2} id={`${q.id}-free`} aria-labelledby={`${q.id}-ask`} />
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {q.free.suggestions.map((s) => (
                <button key={s} type="button" onClick={() => set({ text: s })}
                  className="rounded-full border border-border px-2.5 py-1 text-[12.5px] text-muted hover:text-foreground hover:border-border-strong">{s}</button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3.5 flex items-center gap-3">
          {!a?.skipped
            ? <button type="button" onClick={() => set({ skipped: true })} className="text-[12.5px] text-muted-2 hover:text-foreground">I don&rsquo;t know — record it as unknown</button>
            : <button type="button" onClick={() => set({})} className="text-[12.5px] text-muted-2 hover:text-foreground">Answer it after all</button>}
        </div>
      </div>
    </Card>
  );
}

function Interview({ answers, setAnswers, sections, base, onFinish, startRound = 1 }: {
  answers: Answers; setAnswers: (a: Answers) => void; sections: Live[]; base: Live[]; onFinish: () => void; startRound?: 1 | 2 | 3;
}) {
  const [round, setRound] = useState<1 | 2 | 3>(startRound);
  const [prev, setPrev] = useState<Live[]>(base);
  const [ended, setEnded] = useState(false);
  const [stoppedEarly, setStoppedEarly] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  // A new round starts at the top of the page, not wherever the last answer left you.
  useEffect(() => { top.current?.closest(".overflow-auto")?.scrollTo({ top: 0 }); }, [round, ended]);
  const inRound = QUESTIONS.filter((q) => q.round === round);
  const roundDone = inRound.every((q) => answered(answers[q.id]));
  const score = overall(sections);
  const enough = score >= 90;
  const last = round === ROUNDS;
  const unknowns = QUESTIONS.filter((q) => !answers[q.id] || answers[q.id].skipped);

  const next = () => {
    setPrev(sections);
    if (last || enough) { setEnded(true); return; }
    setRound((r) => (r + 1) as 1 | 2 | 3);
  };
  const stopHere = () => {
    const rest: Answers = { ...answers };
    for (const q of QUESTIONS) if (!answered(rest[q.id])) rest[q.id] = { skipped: true };
    setAnswers(rest);
    setPrev(sections);
    setStoppedEarly(!(last && roundDone));
    setEnded(true);
  };

  return (
    <div ref={top} className="flex flex-col lg:flex-row gap-6 items-start">
      <div className="flex-1 min-w-0 space-y-3 w-full">
        {!ended ? (
          <>
            <div className="flex items-center gap-3 mb-1">
              <Eyebrow>ROUND {round} OF {ROUNDS}</Eyebrow>
              <span className="text-[12.5px] text-muted-2">{inRound.length} question{inRound.length === 1 ? "" : "s"} — each one changes what the agent would build.</span>
            </div>
            {inRound.map((q) => (
              <QuestionCard key={q.id} q={q} a={answers[q.id]} set={(a) => setAnswers({ ...answers, [q.id]: a })} />
            ))}
            <div className="pt-2">
              <div className="flex items-center gap-3">
                <Button disabled={!roundDone} onClick={next}>{last || enough ? "That's everything" : "Next round"}</Button>
                <Button variant="ghost" onClick={stopHere}>That&rsquo;s enough for now</Button>
              </div>
              <p className="text-[12.5px] text-muted-2 mt-2.5">Anything unanswered is recorded as unknown — never guessed.</p>
            </div>
          </>
        ) : (
          <Card>
            <div className="px-5 py-5">
              <div className="text-[16px] font-semibold mb-1.5">
                {stoppedEarly ? "Stopped early — that's fine." : "That's everything asking can settle."}
              </div>
              <p className="text-[13.5px] text-muted leading-relaxed">
                Prism understands this site at <span className="text-foreground font-semibold tabular-nums">{score}</span>.
                {score >= BUILD_THRESHOLD
                  ? " The rest isn't asked for — it's earned, one recorded decision at a time."
                  : ` Building is possible above ${BUILD_THRESHOLD}; below it the agent will lean on the reviewer more.`}
              </p>
              {unknowns.length > 0 && (
                <div className="mt-4 rounded-xl border border-warn/40 bg-warn/[0.06] px-4 py-3">
                  <div className="text-[13px] font-semibold text-warn mb-1">{unknowns.length} thing{unknowns.length === 1 ? "" : "s"} recorded as unknown</div>
                  <ul className="text-[13px] text-muted leading-relaxed list-disc pl-4">
                    {unknowns.map((q) => <li key={q.id}>{q.short} — the agent will ask before assuming.</li>)}
                  </ul>
                </div>
              )}
              <div className="mt-4"><Button onClick={onFinish}>Review what Prism wrote</Button></div>
            </div>
          </Card>
        )}
      </div>

      <aside className="w-full lg:w-[264px] shrink-0 lg:sticky lg:top-9 space-y-4">
        <Card>
          <div className="px-4 py-4">
            <Eyebrow>UNDERSTANDING</Eyebrow>
            <div className="mt-2"><Meter value={score} /></div>
            <Separator className="my-4" />
            <SectionBars sections={sections} prev={prev} />
          </div>
        </Card>
        <p className="text-[12px] text-muted-2 leading-relaxed px-1">
          Asked only when the answer changes what would be built. Three rounds at most. The meter can fall — an answer can show Prism knew less than it thought — and the option says so before you click it.
        </p>
      </aside>
    </div>
  );
}

/* ── CORRECT: the profile editor ───────────────────────────────────── */

const STATUS: Record<Status, { label: string; tone: "muted" | "ok" | "accent" | "warn" }> = {
  draft: { label: "Draft — nobody has checked this", tone: "warn" },
  approved: { label: "Approved", tone: "ok" },
  edited: { label: "You wrote this", tone: "ok" },
  revised: { label: "Revised from your note", tone: "accent" },
};

/** Prism's revision from a note. In the mock the note becomes a rule sentence; in the product it is a model call with the note and the section. */
const revise = (body: string, note: string) => {
  const s = note.trim().replace(/[.!]+$/, "");
  return `${body} ${s.charAt(0).toUpperCase()}${s.slice(1)}.`;
};

function DesignFacts() {
  return (
    <div className="mt-4 rounded-xl border border-border bg-surface-2/30 px-4 py-3.5">
      <Eyebrow>MEASURED, NOT WRITTEN</Eyebrow>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2.5">
        {OBSERVED.colours.filter((c) => c.origin === "brand").slice(0, 8).map((c) => <Swatch key={c.hex} {...c} />)}
      </div>
      <Separator className="my-3.5" />
      <div className="grid grid-cols-3 gap-4">
        {OBSERVED.fonts.map((f) => (
          <div key={f.family}>
            <div className="text-[13px] font-medium">{f.family}</div>
            <div className="text-[11.5px] text-muted-2">{f.faces.length} faces · {f.declarations}×</div>
          </div>
        ))}
      </div>
      <Separator className="my-3.5" />
      <div className="text-[12px] text-muted-2 leading-relaxed">
        Most common button: {OBSERVED.ctas[0].label} ({OBSERVED.ctas[0].count}× on the home page) · widget buttons {OBSERVED.widgetTokens.buttonCase}, {OBSERVED.widgetTokens.radius} corners · {OBSERVED.variables.palette.n} named palette variables ({OBSERVED.variables.palette.prefix}) · Bootstrap 5 underneath.
        These live in <span className="font-mono">design-tokens.md</span>, re-derived on every read — they are not part of the prose above and cannot be edited here.
      </div>
    </div>
  );
}

function ProfileEditor({ sections, setSections, who = "you" }: { sections: Live[]; setSections: (s: Live[]) => void; who?: string }) {
  const [editing, setEditing] = useState<SectionKey | null>(null);
  const [draft, setDraft] = useState("");
  const [asking, setAsking] = useState<SectionKey | null>(null);
  const [note, setNote] = useState("");
  const [proposal, setProposal] = useState<{ key: SectionKey; was: string; now: string; note: string } | null>(null);

  const update = (key: SectionKey, patch: Partial<Live>) => setSections(sections.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  return (
    <div className="space-y-3">
      {sections.map((s) => {
        const st = STATUS[s.status];
        const isEditing = editing === s.key;
        const isAsking = asking === s.key;
        const prop = proposal?.key === s.key ? proposal : null;
        return (
          <Card key={s.key}>
            <div className="px-5 py-4">
              <div className="flex items-center gap-2 mb-2">
                <Eyebrow>{SECTION_LABEL[s.key].toUpperCase()}</Eyebrow>
                <Badge variant={st.tone}>{st.label}</Badge>
                <span className="ml-auto text-[12px] text-muted-2 tabular-nums">understood at {s.confidence}</span>
              </div>

              {isEditing ? (
                <>
                  {s.unsure && <p className="text-[12.5px] text-warn mb-2 leading-relaxed"><span className="font-semibold">Still unknown:</span> {s.unsure} Rewriting the text doesn&rsquo;t settle it — the agent will still ask.</p>}
                  <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={5} autoFocus aria-label={`Edit ${SECTION_LABEL[s.key]}`} />
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" onClick={() => { update(s.key, { body: draft.trim(), status: "edited", confidence: s.unsure ? s.confidence : 96 }); setEditing(null); }}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                </>
              ) : prop ? (
                <>
                  <div className="rounded-lg border border-border bg-surface-2/40 px-3.5 py-2.5 mb-2.5">
                    <Eyebrow>WAS</Eyebrow>
                    <p className="text-[13px] text-muted-2 leading-relaxed mt-1 line-clamp-2">{prop.was}</p>
                  </div>
                  <div className="rounded-lg border border-accent/40 bg-accent/5 px-3.5 py-2.5">
                    <Eyebrow>PRISM PROPOSES</Eyebrow>
                    <p className="text-[14px] leading-relaxed mt-1">{prop.now}</p>
                  </div>
                  <p className="text-[12.5px] text-muted-2 mt-2">Your note is kept with the section either way: &ldquo;{prop.note}&rdquo;</p>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" onClick={() => { update(s.key, { body: prop.now, status: "revised", confidence: clamp(s.confidence + 8), notes: [...s.notes, prop.note] }); setProposal(null); }}>Keep it</Button>
                    <Button size="sm" variant="ghost" onClick={() => { update(s.key, { notes: [...s.notes, prop.note] }); setProposal(null); }}>Undo — keep the old text</Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[14.5px] leading-relaxed">{s.body}</p>
                  {s.flag && <p className="text-[12.5px] text-warn mt-2 leading-relaxed"><span className="font-semibold">Flagged:</span> {s.flag}</p>}
                  {s.unsure && <p className="text-[12.5px] text-warn mt-2 leading-relaxed"><span className="font-semibold">Least sure:</span> {s.unsure}</p>}
                  {s.key === "design" && <DesignFacts />}
                  {s.notes.length > 0 && (
                    <div className="mt-3 text-[12px] text-muted-2">
                      {s.notes.map((n, i) => <div key={i}>Note from {who}: &ldquo;{n}&rdquo;</div>)}
                    </div>
                  )}
                  <p className="text-[12px] text-muted-2 mt-2.5">From {s.from.join(" · ")}</p>

                  {isAsking ? (
                    <div className="mt-3.5 rounded-xl border border-border px-4 py-3.5">
                      <Label htmlFor={`note-${s.key}`} className="mb-2">Tell Prism what&rsquo;s wrong, in your words</Label>
                      <Textarea id={`note-${s.key}`} value={note} onChange={(e) => setNote(e.target.value)} rows={2} autoFocus
                        placeholder={s.key === "voice" ? "We never say luxury" : "e.g. the Fiji properties are run by a partner and don't share our design"} />
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" disabled={note.trim().length < 4}
                          onClick={() => { setProposal({ key: s.key, was: s.body, now: revise(s.body, note), note: note.trim() }); setAsking(null); setNote(""); }}>
                          Ask Prism to revise it
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setAsking(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-3.5">
                      {s.status !== "approved" && s.status !== "edited" && <Button size="sm" onClick={() => update(s.key, { status: "approved", flag: undefined })}>That&rsquo;s right</Button>}
                      <Button size="sm" variant="outline" onClick={() => { setEditing(s.key); setDraft(s.body); }}>Edit it myself</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setAsking(s.key); setNote(""); }}>Tell Prism what&rsquo;s wrong</Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/* ── COMPILE: what the builder receives ───────────────────────────── */

const LAYER: Record<"observed" | "characterized" | "earned", { label: string; tone: "muted" | "accent" | "ok" }> = {
  observed: { label: "measured", tone: "muted" },
  characterized: { label: "approved prose · a skill", tone: "accent" },
  earned: { label: "earned", tone: "ok" },
};

function Outputs({ domain, revision }: { domain: string; revision: number }) {
  return (
    <Card title={`What the builder receives · sites/${domain}/`}>
      {OUTPUT_FILES.map((f) => (
        <div key={f.name} className="px-5 py-3 border-b border-border last:border-0">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[12.5px]">{f.name}</span>
            <Badge variant={LAYER[f.layer].tone} className="ml-auto">{LAYER[f.layer].label}</Badge>
          </div>
          <div className="text-[12.5px] text-muted mt-1 leading-relaxed">{f.detail}</div>
        </div>
      ))}
      <div className="px-5 py-3 bg-surface-2/40 text-[12.5px] text-muted-2 leading-relaxed">
        Pinned as <span className="font-mono text-foreground">context r{revision}</span>. Every build records the revision it was cut against. Re-reading the site later makes r{revision + 1}; it never rewrites r{revision}, and a build cut against r{revision} keeps it.
      </div>
    </Card>
  );
}

/* ── The customer wizard (back office): a container, then its Owner ── */

const STEPS_C = ["Who", "Owner"];

export function CustomerWizard({ onClose, onDone }: { onClose: () => void; onDone: (name: string, sites: string[]) => void }) {
  const d = (DRAFTS.get("customer") ?? {}) as Partial<{ step: number; name: string; siteInputs: string[]; owner: string }>;
  const [step, setStep] = useState(d.step ?? 0);
  const [name, setName] = useState(d.name ?? "");
  const [siteInputs, setSiteInputs] = useState<string[]>(d.siteInputs ?? [""]);
  const [owner, setOwner] = useState(d.owner ?? "");
  useEffect(() => { DRAFTS.set("customer", { step, name, siteInputs, owner }); }, [step, name, siteInputs, owner]);
  const sites = siteInputs.map((s) => s.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "")).filter((s) => s.length > 3);
  const ok = [name.trim().length > 2 && sites.length > 0, /.+@.+\..+/.test(owner)][step];

  return (
    <Wizard title="Add a customer" steps={STEPS_C} step={step} setStep={setStep} onClose={onClose}
      canContinue={ok} finishLabel={`Create ${name.trim() || "the customer"}`} saved={name.trim().length > 2}
      onFinish={() => { DRAFTS.delete("customer"); sites.forEach(markRead); onDone(name.trim(), sites); }}>
      {step === 0 && (
        <Q n={1} of={2} title="Who are you setting up?" help="The company whose websites will be tested. It's a container: sites, people, connections and results hang off it and are never shared between customers. Everything Prism learns, it learns per site.">
          <div className="space-y-5">
            <div>
              <Label htmlFor="cname" className="mb-1.5">Customer</Label>
              <Input id="cname" value={name} onChange={(e) => setName(e.target.value)} placeholder="OUTRIGGER Hotels & Resorts" autoFocus />
            </div>
            <div>
              <Label htmlFor="site-0" className="mb-1.5">Their sites</Label>
              <div className="space-y-2">
                {siteInputs.map((v, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input id={`site-${i}`} value={v} onChange={(e) => setSiteInputs((ss) => ss.map((x, j) => (i === j ? e.target.value : x)))}
                      placeholder={["outrigger.com", "outriggerkona.com", "waikikibeachcomber.com"][i] ?? "another-site.com"} spellCheck={false}
                      onKeyDown={(e) => { if (e.key === "Enter" && v.trim()) { e.preventDefault(); setSiteInputs((ss) => [...ss, ""]); } }} />
                    {siteInputs.length > 1 && (
                      <Button variant="ghost" size="icon" aria-label={`Remove ${v || "this site"}`} onClick={() => setSiteInputs((ss) => ss.filter((_, j) => j !== i))}>×</Button>
                    )}
                  </div>
                ))}
              </div>
              <Button variant="link" size="sm" className="px-0 mt-1" onClick={() => setSiteInputs((ss) => [...ss, ""])}>+ Add another site</Button>
              <p className="text-[12.5px] text-muted-2 mt-1">
                Prism reads every one of these the moment the customer is created — up to {OBSERVED.budget} pages each, through Firecrawl. Each gets its own environments, source and understanding.
              </p>
            </div>
          </div>
        </Q>
      )}

      {step === 1 && (
        <Q n={2} of={2} title="Who runs it on their side?" help="The first Owner. They connect their own A/B tool, their own AI key and their sites' scripts — Prism never holds a customer's credentials on their behalf, and neither do we.">
          <div className="space-y-5">
            <div>
              <Label htmlFor="owner" className="mb-1.5">Owner&rsquo;s email</Label>
              <Input id="owner" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="dana@outrigger.com" type="email" autoFocus />
              <p className="text-[12.5px] text-muted-2 mt-2">They get an invitation and a setup checklist that only disappears when everything on it is actually connected.</p>
            </div>
            <Card title={`What happens on create · ${sites.length} site${sites.length === 1 ? "" : "s"}`}>
              {sites.map((s) => (
                <div key={s} className="flex items-center gap-3 px-5 py-3 border-b border-border last:border-0">
                  <span className="font-mono text-[13px]">{s}</span>
                  <Pill tone="accent">Read on create</Pill>
                  <span className="ml-auto text-[12.5px] text-muted-2">pages · design system · components · first drafts</span>
                </div>
              ))}
              <div className="px-5 py-3 bg-surface-2/40 text-[12.5px] text-muted-2 leading-relaxed">
                Prism reads each site itself. What it can&rsquo;t read — who the guests are, who they lose bookings to, which button is primary — it asks,
                from <span className="text-foreground">Sites</span>, one site at a time, of the person who knows that site. You can answer for them inside a support session.
              </div>
            </Card>
          </div>
        </Q>
      )}
    </Wizard>
  );
}

/* ── Understand a site: Read · Ask · Correct — then the next site ──── */

const STEPS_U = ["Read", "Ask", "Correct"];

export function UnderstandSite({ site, others, onClose, onDone, onAnother }: {
  site: Site; others: Site[]; onClose: () => void; onDone: () => void;
  /** Open another site's understanding (by id), or add a new site (no id). */
  onAnother: (siteId?: string) => void;
}) {
  const ctx = contextFor(site.id);
  const resuming = Boolean(ctx);
  const key = `understand:${site.id}`;
  const d = (DRAFTS.get(key) ?? {}) as Partial<{ step: number; reading: "idle" | "reading" | "done"; answers: Answers; interviewDone: boolean; sections: Live[] | null }>;
  const [step, setStep] = useState(d.step ?? (resuming ? 1 : 0));
  const [reading, setReading] = useState<"idle" | "reading" | "done">(d.reading === "reading" ? "idle" : (d.reading ?? (resuming ? "done" : "idle")));
  const [answers, setAnswers] = useState<Answers>(d.answers ?? ctx?.answers ?? {});
  const [interviewDone, setInterviewDone] = useState(d.interviewDone ?? false);
  const [sections, setSections] = useState<Live[] | null>(d.sections ?? null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (!saved) DRAFTS.set(key, { step, reading, answers, interviewDone, sections }); }, [key, saved, step, reading, answers, interviewDone, sections]);
  const nextRevision = (ctx?.revisions[ctx.revisions.length - 1]?.r ?? 0) + 1;

  const base = applyAnswers(DRAFT_SECTIONS, {});
  const asked = applyAnswers(DRAFT_SECTIONS, answers);
  // Correction starts from the interviewed profile; edits after that are the human's and are kept.
  const live = sections ?? asked;
  // "revised" is Prism's redraft — a person still has to say it is right.
  const approved = live.filter((s) => s.status === "approved" || s.status === "edited").length;

  const ok = [reading === "done", interviewDone && interviewFinished(answers), approved === live.length][step];

  if (saved) {
    const unread = others.filter((o) => understandingOf(o.id).tone === "muted");
    const unfinished = others.filter((o) => understandingOf(o.id).tone === "warn");
    const remaining = unread.length + unfinished.length;
    return (
      <>
        <header className="h-14 shrink-0 border-b border-border bg-surface flex items-center px-6 gap-3">
          <h1 className="text-[15px] font-semibold">Understand {site.domain}</h1>
          <Pill tone="ok">Saved as revision {nextRevision}</Pill>
        </header>
        <div className="flex-1 overflow-auto flex justify-center px-6 py-9">
          <div className="w-[620px] max-w-full">
            <div className="text-[11.5px] font-semibold tracking-[0.07em] text-muted-2 mb-2">DONE</div>
            <h2 className="text-[24px] font-semibold tracking-[-0.02em] mb-2">{site.domain} is understood at {overall(live)}.</h2>
            <p className="text-[14.5px] text-muted leading-relaxed mb-6">
              Saved as context revision {nextRevision}. Every build on this site from now on pins it. Re-reading later makes r{nextRevision + 1}; it never rewrites r{nextRevision}.
            </p>
            <Card title={remaining ? `Scan another site · ${remaining} still to do` : "Every site is understood"}>
              {unread.map((o) => (
                <div key={o.id} className="flex items-center gap-3 px-5 py-3 border-b border-border last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium">{o.domain}</div>
                    <div className="text-[12.5px] text-muted-2">{o.label}</div>
                  </div>
                  <Pill tone="muted">Not read yet</Pill>
                  <Button size="sm" onClick={() => onAnother(o.id)}>Read {o.domain}</Button>
                </div>
              ))}
              {unfinished.map((o) => (
                <div key={o.id} className="flex items-center gap-3 px-5 py-3 border-b border-border last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium">{o.domain}</div>
                    <div className="text-[12.5px] text-muted-2">{o.label}</div>
                  </div>
                  <Pill tone="warn">Interview unfinished</Pill>
                  <Button size="sm" variant="outline" onClick={() => onAnother(o.id)}>Continue</Button>
                </div>
              ))}
              <div className="px-5 py-3.5 flex items-center gap-2 bg-surface-2/40">
                <Button size="sm" variant="outline" onClick={() => onAnother()}>Add a new site</Button>
                <Button size="sm" variant="ghost" onClick={onDone}>Back to {site.domain}</Button>
                {remaining === 0 && <span className="ml-auto text-[12.5px] text-muted-2">Nothing else is waiting on you.</span>}
              </div>
            </Card>
          </div>
        </div>
      </>
    );
  }

  return (
    <Wizard title={`Understand ${site.domain}`} steps={STEPS_U} step={step} setStep={setStep} onClose={onClose}
      canContinue={ok} finishLabel={`Save as revision ${nextRevision}`} saved={reading === "done"}
      onFinish={() => {
        const answeredN = QUESTIONS.filter((q) => answered(answers[q.id]) && !answers[q.id].skipped).length;
        SESSION_CONTEXT.set(site.id, {
          answers, approved: true, voiceNote: ctx?.voiceNote, earned: ctx?.earned ?? [],
          revisions: [...(ctx?.revisions ?? []), {
            r: nextRevision, when: TODAY, who: "You · Prism",
            what: ctx ? "Interview finished and every section checked." : `Read at onboarding. ${OBSERVED.read} pages, ${answeredN} questions answered.`,
            pinnedBy: 0,
          }],
          sections: live.map((x) => ({ ...x, status: x.status === "revised" ? "approved" : x.status })),
        });
        DRAFTS.delete(key);
        setSaved(true);
      }}>
      {step === 0 && (
        <Q n={1} of={3} wide title={`Read ${site.domain}`}
          help={reading === "done"
            ? "Two kinds of thing came out of this and they must not be confused: facts the pages contain, and Prism's guesses about what they mean."
            : "Prism maps the whole site, reads one of every kind of page within a budget, and derives the design system and the page inventory. It writes nothing anywhere."}>
          {reading === "idle" && (
            <div className="flex items-center gap-3">
              <Button onClick={() => setReading("reading")}>Read {site.domain}</Button>
              <span className="text-[12.5px] text-muted-2">Budget: {OBSERVED.budget} pages. A hospitality site is hundreds; most teach nothing new.</span>
            </div>
          )}
          {reading === "reading" && <Reading done={() => setReading("done")} />}
          {reading === "done" && <ReadReport sections={base} earned={ctx?.earned} />}
        </Q>
      )}

      {step === 1 && (
        <Q n={2} of={3} wide title="What the pages couldn't say" help="Every question below is one the crawl could not settle and whose answer changes what the agent would build. There are no others.">
          <Interview answers={answers} setAnswers={(a) => { setAnswers(a); setSections(null); }} sections={asked} base={base}
            startRound={resumeRound(answers)} onFinish={() => { setInterviewDone(true); setStep(2); }} />
        </Q>
      )}

      {step === 2 && (
        <Q n={3} of={3} wide title="Make it true" help="Everything here was written by Prism and is a draft until a person says otherwise. Approve what's right, rewrite what isn't — or hand it back with a note and let Prism redraft it. Your notes are kept: they're the most valuable thing in the file.">
          <div className="flex items-center gap-3 mb-4">
            <Badge variant={approved === live.length ? "ok" : "warn"}>{approved} of {live.length} approved</Badge>
            <span className="text-[12.5px] text-muted-2">All five have to be checked before this becomes revision {nextRevision}. Understanding: {overall(live)}.</span>
          </div>
          <ProfileEditor sections={live} setSections={setSections} />
          <div className="mt-4"><Outputs domain={site.domain} revision={nextRevision} /></div>
        </Q>
      )}
    </Wizard>
  );
}

/* ── What Prism understands about this site (Sites → site) ─────────── */

export function SiteProfile({ s, onRead }: { s: Site; onRead: () => void }) {
  const u = understandingOf(s.id);
  const ctx = u.ctx;
  const initial = (): Live[] => {
    if (!ctx) return [];
    if (ctx.sections) return ctx.sections;
    return applyAnswers(DRAFT_SECTIONS, ctx.answers).map((sec) => ({
      ...sec,
      status: ctx.approved ? ("approved" as Status) : ("draft" as Status),
      confidence: ctx.approved ? clamp(sec.confidence + 4) : sec.confidence,
      ...(sec.key === "voice" && ctx.voiceNote ? { body: `${sec.body} ${ctx.voiceNote.charAt(0).toUpperCase()}${ctx.voiceNote.slice(1)}.`, notes: [ctx.voiceNote] } : {}),
    }));
  };
  const [sections, setSections] = useState<Live[]>(initial);
  /** What the current revision contains. "Changed" is a diff against this, not a status label. */
  const [pinned, setPinned] = useState<Live[]>(initial);
  const [revisions, setRevisions] = useState(() => ctx?.revisions ?? []);
  const [reread, setReread] = useState(false);
  const [rereading, setRereading] = useState(false);

  if (!ctx) {
    return (
      <Card title={`What Prism understands about ${s.domain}`}>
        <div className="px-5 py-8 text-center">
          <p className="text-[14px] text-muted leading-relaxed max-w-md mx-auto mb-4">
            Prism hasn&rsquo;t read this site yet. Reading it teaches every prototype its components, its type scale and the way it writes —
            then Prism asks what the pages can&rsquo;t say, and you correct what it wrote.
          </p>
          <Button onClick={onRead}>Read {s.domain}</Button>
        </div>
      </Card>
    );
  }

  const rev = revisions[revisions.length - 1];
  const finished = interviewFinished(ctx.answers);
  // Anything that differs from what the current revision holds — a rewrite, a note, or a flag answered.
  const changed = sections.filter((x) => { const p = pinned.find((y) => y.key === x.key); return !p || x.body !== p.body || x.notes.length !== p.notes.length || x.status !== p.status || Boolean(x.flag) !== Boolean(p.flag); }).length;
  const persist = (revs: typeof revisions, secs: Live[]) => {
    if (ctx) SESSION_CONTEXT.set(s.id, { ...ctx, approved: true, revisions: revs, sections: secs });
  };
  const pin = () => {
    const next = sections.map((x) => ({ ...x, status: (x.status === "revised" || x.status === "draft") ? ("approved" as Status) : x.status, flag: undefined }));
    const revs = [...revisions, { r: rev.r + 1, when: TODAY, who: "You", what: `${changed} section${changed === 1 ? "" : "s"} checked or corrected by hand.`, pinnedBy: 0 }];
    setSections(next); setPinned(next); setRevisions(revs); persist(revs, next);
  };
  const rereadDone = () => {
    setRereading(false); setReread(false);
    const revs = [...revisions, { r: rev.r + 1, when: TODAY, who: "You · Prism", what: "Re-read. The measured layer was re-derived; Design language is flagged for a look. Nothing was rewritten.", pinnedBy: 0 }];
    const flagged = sections.map((x) => (x.key === "design"
      ? { ...x, status: "draft" as Status, flag: `Re-read on ${TODAY}: the measured layer changed under this section. Nothing here was rewritten — say whether it still holds.` }
      : x));
    // r{n+1} holds the flagged state, so answering the flag is itself a change worth pinning.
    setRevisions(revs); setSections(flagged); setPinned(flagged); persist(revs, flagged);
  };

  return (
    <>
      <div className="flex items-center gap-3 pt-2">
        <h2 className="text-[15px] font-semibold">What Prism understands about {s.domain}</h2>
        <Pill tone={u.tone}>{u.label}</Pill>
        <div className="ml-auto flex items-center gap-2">
          {changed > 0 && <Button size="sm" onClick={pin}>Save {changed} change{changed === 1 ? "" : "s"} as revision {rev.r + 1}</Button>}
          {!finished && <Button size="sm" onClick={onRead}>{askedNothing(ctx.answers) ? "Answer its questions" : "Continue the interview"}</Button>}
          <Button size="sm" variant="outline" onClick={() => setReread(true)}>Re-read the site</Button>
        </div>
      </div>

      {!finished && (
        <div className="rounded-xl border border-warn/40 bg-warn/[0.06] px-4 py-3 text-[13px] leading-relaxed">
          {askedNothing(ctx.answers)
            ? <><span className="font-semibold text-warn">Prism read this site; nobody has been asked anything yet.</span>{" "}
                <span className="text-muted">{QUESTIONS.length} questions are waiting — the ones the pages can&rsquo;t answer. Until they&rsquo;re answered or recorded as unknown, nothing below is approved and the agent will lean on the reviewer.</span></>
            : <><span className="font-semibold text-warn">The interview stopped after round {resumeRound(ctx.answers) - 1}.</span>{" "}
                <span className="text-muted">{QUESTIONS.filter((q) => !answered(ctx.answers[q.id])).length} questions are still open. Until they&rsquo;re answered or recorded as unknown, nothing below is approved and the agent will lean on the reviewer.</span></>}
        </div>
      )}

      <Learned earned={ctx.earned} />
      <ProfileEditor sections={sections} setSections={setSections} who={SESSION_CONTEXT.has(s.id) ? "you" : "Dana Reyes"} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card title={`Context revision ${rev.r}`}>
          <div className="px-5 py-3.5 space-y-2.5">
            <div className="text-[13px]"><span className="text-muted-2">Read</span> {s.profile?.readAt ?? rev.when} · {s.profile?.pages ?? OBSERVED.read} pages</div>
            <div className="text-[13px]"><span className="text-muted-2">Understanding</span> <span className="tabular-nums font-medium">{overall(sections)}</span></div>
            <div className="text-[13px]"><span className="text-muted-2">Pinned by</span> {rev.pinnedBy} build{rev.pinnedBy === 1 ? "" : "s"}</div>
          </div>
        </Card>
        <Card title="Revisions">
          {[...revisions].reverse().map((r) => (
            <div key={r.r} className="px-5 py-3 border-b border-border last:border-0">
              <div className="flex items-center gap-2 text-[12.5px]">
                <span className="font-mono font-semibold">r{r.r}</span>
                <span className="text-muted-2">{r.when} · {r.who}</span>
              </div>
              <div className="text-[13px] text-muted mt-1 leading-relaxed">{r.what}</div>
              <div className="text-[11.5px] text-muted-2 mt-1">pinned by {r.pinnedBy} build{r.pinnedBy === 1 ? "" : "s"}</div>
            </div>
          ))}
        </Card>
        <Outputs domain={s.domain} revision={rev.r} />
      </div>

      <Dialog open={reread} onOpenChange={(o) => { setReread(o); if (!o) setRereading(false); }}>
        <DialogContent showCloseButton={!rereading}>
          <DialogHeader>
            <DialogTitle>Re-read {s.domain}?</DialogTitle>
            <DialogDescription>
              Reads up to {OBSERVED.budget} pages again and re-derives the measured layer. It makes revision {rev.r + 1}. Nothing you approved is rewritten —
              where the pages now disagree with a section, that section is flagged for you, not changed behind you. The {rev.pinnedBy} build{rev.pinnedBy === 1 ? "" : "s"} cut against r{rev.r} keep{rev.pinnedBy === 1 ? "s" : ""} r{rev.r}.
            </DialogDescription>
          </DialogHeader>
          {rereading && <Reading done={rereadDone} />}
          {!rereading && (
            <DialogFooter>
              <Button variant="ghost" onClick={() => setReread(false)}>Not now</Button>
              <Button onClick={() => setRereading(true)}>Read it again</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
