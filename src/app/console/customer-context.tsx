"use client";

/**
 * UNDERSTANDING A CUSTOMER — the back-office wizard that creates one, and the
 * room inside their console where what Prism understands is kept and corrected.
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
  BUILD_THRESHOLD, DRAFT_SECTIONS, OBSERVED, OUTPUT_FILES, OUTRIGGER_EARNED, OUTRIGGER_REVISIONS, QUESTIONS, ROUNDS,
  SECTION_LABEL, bandFor, type Question, type Section, type SectionKey,
} from "@/lib/console/context";
import { Q, Wizard } from "./onboarding";
import { PageHeader, Section as Card } from "./ui";

/* ── The profile as state ──────────────────────────────────────────── */

type Answer = { option?: string; text?: string; skipped?: boolean };
type Answers = Record<string, Answer>;
type Status = "draft" | "approved" | "edited" | "revised";

interface Live extends Section {
  status: Status;
  /** Notes handed to Prism, kept as provenance. */
  notes: string[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** The interview applied to the drafts. Pure: the same answers always give the same profile. */
function applyAnswers(base: Section[], answers: Answers): Live[] {
  return base.map((s) => {
    let body = s.body;
    let confidence = s.confidence;
    const opened: string[] = [];
    let settled = true;
    for (const q of QUESTIONS.filter((q) => q.section === s.key)) {
      const a = answers[q.id];
      if (!a || a.skipped) { settled = false; continue; }
      if (q.options && a.option) {
        const o = q.options.find((o) => o.id === a.option);
        if (!o) continue;
        confidence += o.delta[s.key] ?? 0;
        if (o.adds?.[s.key]) body += " " + o.adds[s.key];
        if (o.opens?.[s.key]) opened.push(o.opens[s.key] as string);
      } else if (q.free && a.text) {
        confidence += q.free.delta;
        body += " " + q.free.adds(a.text);
      }
    }
    // Cross-section effects (an answer in one section can move another).
    for (const q of QUESTIONS.filter((q) => q.section !== s.key && q.options)) {
      const a = answers[q.id];
      const o = a?.option ? q.options?.find((o) => o.id === a.option) : undefined;
      if (!o) continue;
      confidence += o.delta[s.key] ?? 0;
      if (o.adds?.[s.key]) body += " " + o.adds[s.key];
      if (o.opens?.[s.key]) opened.push(o.opens[s.key] as string);
    }
    const unsure = [...opened, ...(!settled && s.unsure ? [s.unsure] : [])].join(" ") || undefined;
    return { ...s, body, confidence: clamp(confidence), unsure, status: "draft", notes: [] };
  });
}

const overall = (ss: Live[]) => clamp(ss.reduce((n, s) => n + s.confidence, 0) / ss.length);

/** The answers a mature customer gave — what the OUTRIGGER profile is built from. */
const OUTRIGGER_ANSWERS: Answers = {
  scope: { option: "one" }, cta: { option: "check" }, guest: { text: "Direct bookers who would otherwise book the same room through Expedia" },
  type: { option: "ionic" }, competitors: { text: "Expedia and Booking.com for our own rooms; Marriott and Hilton in Waikīkī" },
  urgency: { option: "rule" }, bootstrap: { option: "never" },
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
          <div key={f.family} className="flex items-center gap-4 px-5 py-3 border-b border-border last:border-0">
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
              <Eyebrow>{o === "brand" ? "THE BRAND'S OWN" : o === "framework" ? "BOOTSTRAP'S DEFAULTS" : "THE BOOKING WIDGET'S"}</Eyebrow>
              <div className="mt-2.5 space-y-2.5">{by(o).map((c) => <Swatch key={c.hex} {...c} />)}</div>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-border text-[12.5px] leading-relaxed bg-warn/[0.06]">
          <span className="font-semibold text-warn">The only colour variables on the site belong to the vendor.</span>{" "}
          <span className="text-muted">{OBSERVED.variables.total} custom properties were found and all {OBSERVED.variables.total} are <span className="font-mono">--shs-widgets-*</span>. The brand&rsquo;s own stylesheet declares none, so its palette was sampled from what the pages use — the counts above are how often, not how important.</span>
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
  { id: "read", label: "Reading", detail: "through Firecrawl — outrigger.com refuses plain crawlers (HTTP 403)" },
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
            i < phase ? "bg-ok" : i === phase ? "border-2 border-accent border-t-transparent animate-spin" : "border border-border-strong")}>
            {i < phase && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
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

function Learned({ earned }: { earned: typeof OUTRIGGER_EARNED }) {
  if (!earned.length) {
    return (
      <Card>
        <div className="px-5 py-8 text-center">
          <div className="text-[15px] font-semibold mb-1.5">Nothing yet — and nothing could be.</div>
          <p className="text-[13.5px] text-muted leading-relaxed max-w-md mx-auto">
            This layer can&rsquo;t be read off a website. It is written by decisions this customer records, one line per
            verdict, and it is the part of the context no competitor with a crawler can copy. The first entry arrives with the first readout.
          </p>
        </div>
      </Card>
    );
  }
  return (
    <Card title={`${earned.length} things measured on this customer's own visitors`}>
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

function ReadReport({ sections, earned = [] }: { sections: Live[]; earned?: typeof OUTRIGGER_EARNED }) {
  return (
    <>
      <Card>
        <div className="px-5 py-4 flex items-center gap-8">
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
  const answered = Boolean(a && (a.option || a.text || a.skipped));
  return (
    <Card className={cn(answered && "border-border-strong")}>
      <div className="px-5 py-4">
        <div className="flex items-center gap-2 mb-2">
          <Eyebrow>{SECTION_LABEL[q.section].toUpperCase()}</Eyebrow>
          {a?.skipped && <Badge variant="warn">Recorded as unknown</Badge>}
        </div>
        <h3 className="text-[16px] font-semibold leading-snug mb-1.5">{q.ask}</h3>
        <p className="text-[13px] text-muted leading-relaxed mb-4"><span className="font-medium text-muted">Why you&rsquo;re being asked:</span> {q.because}</p>

        {q.options && (
          <RadioGroup value={a?.option ?? ""} onValueChange={(v) => set({ option: v })}>
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
            <Textarea value={a?.text ?? ""} onChange={(e) => set({ text: e.target.value })} placeholder={q.free.placeholder} rows={2} />
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

function Interview({ answers, setAnswers, sections, base, onFinish }: {
  answers: Answers; setAnswers: (a: Answers) => void; sections: Live[]; base: Live[]; onFinish: () => void;
}) {
  const [round, setRound] = useState<1 | 2 | 3>(1);
  const [prev, setPrev] = useState<Live[]>(base);
  const [ended, setEnded] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  // A new round starts at the top of the page, not wherever the last answer left you.
  useEffect(() => { top.current?.closest(".overflow-auto")?.scrollTo({ top: 0 }); }, [round, ended]);
  const inRound = QUESTIONS.filter((q) => q.round === round);
  const roundDone = inRound.every((q) => { const a = answers[q.id]; return a && (a.option || (a.text && a.text.trim()) || a.skipped); });
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
    for (const q of QUESTIONS) if (!rest[q.id] || (!rest[q.id].option && !rest[q.id].text)) rest[q.id] = { skipped: true };
    setAnswers(rest);
    setPrev(sections);
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
                {score >= BUILD_THRESHOLD ? "That's everything asking can settle." : "Stopped early — that's fine."}
              </div>
              <p className="text-[13.5px] text-muted leading-relaxed">
                Prism understands this customer at <span className="text-foreground font-semibold tabular-nums">{score}</span>.
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
              <div className="mt-4"><Button onClick={onFinish}>Review the profile</Button></div>
            </div>
          </Card>
        )}
      </div>

      <aside className="w-full lg:w-[264px] shrink-0 lg:sticky lg:top-0 space-y-4">
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
        Primary button: {OBSERVED.ctas[0].label}, {OBSERVED.widgetTokens.buttonCase}, {OBSERVED.widgetTokens.radius} corners · {OBSERVED.variables.total} colour variables, all the booking widget&rsquo;s · Bootstrap 5 underneath.
        These live in <span className="font-mono">design-tokens.md</span>, re-derived on every read — they are not part of the prose above and cannot be edited here.
      </div>
    </div>
  );
}

export function ProfileEditor({ sections, setSections, who = "you" }: { sections: Live[]; setSections: (s: Live[]) => void; who?: string }) {
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
                  <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={5} autoFocus />
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" onClick={() => { update(s.key, { body: draft.trim(), status: "edited", confidence: 96, unsure: undefined }); setEditing(null); }}>Save</Button>
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
                      {s.status !== "approved" && s.status !== "edited" && <Button size="sm" onClick={() => update(s.key, { status: "approved" })}>That&rsquo;s right</Button>}
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

function Outputs({ slug, revision }: { slug: string; revision: number }) {
  return (
    <Card title={`What the builder receives · customers/${slug}/`}>
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

/* ── The wizard (back office) ──────────────────────────────────────── */

const STEPS = ["Who", "Read", "Ask", "Correct", "Owner"];

export function CustomerWizard({ onClose, onDone }: { onClose: () => void; onDone: (name: string) => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [others, setOthers] = useState("");
  const [reading, setReading] = useState<"idle" | "reading" | "done">("idle");
  const [answers, setAnswers] = useState<Answers>({});
  const [interviewDone, setInterviewDone] = useState(false);
  const [sections, setSections] = useState<Live[] | null>(null);
  const [owner, setOwner] = useState("");

  const base = applyAnswers(DRAFT_SECTIONS, {});
  const asked = applyAnswers(DRAFT_SECTIONS, answers);
  // Correction starts from the interviewed profile; edits after that are the human's and are kept.
  const live = sections ?? asked;
  // "revised" is Prism's redraft — a person still has to say it is right.
  const approved = live.filter((s) => s.status === "approved" || s.status === "edited").length;
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "customer";

  const ok = [
    name.trim().length > 2 && domain.trim().length > 3,
    reading === "done",
    interviewDone,
    approved === live.length,
    /.+@.+\..+/.test(owner),
  ][step];

  return (
    <Wizard title="Add a customer" steps={STEPS} step={step} setStep={setStep} onClose={onClose}
      canContinue={ok} finishLabel={`Create ${name.trim() || "the customer"}`} saved={name.trim().length > 2}
      onFinish={() => onDone(name.trim())}>
      {step === 0 && (
        <Q n={1} of={5} title="Who are you setting up?" help="The company whose websites will be tested. Everything else hangs off this — sites, people, connections and results are never shared between customers.">
          <div className="space-y-5">
            <div>
              <Label htmlFor="cname" className="mb-1.5">Customer</Label>
              <Input id="cname" value={name} onChange={(e) => setName(e.target.value)} placeholder="OUTRIGGER Hotels & Resorts" autoFocus />
            </div>
            <div>
              <Label htmlFor="cdomain" className="mb-1.5">Their main website</Label>
              <Input id="cdomain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="outrigger.com" spellCheck={false} />
              <p className="text-[12.5px] text-muted-2 mt-2">Prism reads this next. Nothing is changed and nothing is published — it only reads.</p>
            </div>
            <div>
              <Label htmlFor="cothers" className="mb-1.5">Other sites they run <span className="font-normal text-muted-2">— optional</span></Label>
              <Input id="cothers" value={others} onChange={(e) => setOthers(e.target.value)} placeholder="outriggerkona.com, waikikibeachcomber.com" spellCheck={false} />
              <p className="text-[12.5px] text-muted-2 mt-2">Each site gets its own read and its own environments later. This just tells Prism they exist.</p>
            </div>
          </div>
        </Q>
      )}

      {step === 1 && (
        <Q n={2} of={5} wide title={reading === "done" ? `Read ${domain}` : `Read ${domain || "the site"}`}
          help={reading === "done"
            ? "Two kinds of thing came out of this and they must not be confused: facts the pages contain, and Prism's guesses about what they mean."
            : "Prism maps the whole site, reads one of every kind of page within a budget, and derives the design system and the page inventory. It writes nothing anywhere."}>
          {reading === "idle" && (
            <div className="flex items-center gap-3">
              <Button onClick={() => setReading("reading")}>Read {domain}</Button>
              <span className="text-[12.5px] text-muted-2">Budget: {OBSERVED.budget} pages. A hospitality site is hundreds; most teach nothing new.</span>
            </div>
          )}
          {reading === "reading" && <Reading done={() => setReading("done")} />}
          {reading === "done" && <ReadReport sections={base} />}
        </Q>
      )}

      {step === 2 && (
        <Q n={3} of={5} wide title="What the pages couldn't say" help="Every question below is one the crawl could not settle and whose answer changes what the agent would build. There are no others.">
          <Interview answers={answers} setAnswers={(a) => { setAnswers(a); setSections(null); }} sections={asked} base={base}
            onFinish={() => { setInterviewDone(true); setStep(3); }} />
        </Q>
      )}

      {step === 3 && (
        <Q n={4} of={5} wide title="Make it true" help="Everything here was written by Prism and is a draft until a person says otherwise. Approve what's right, rewrite what isn't — or hand it back with a note and let Prism redraft it. Your notes are kept: they're the most valuable thing in the file.">
          <div className="flex items-center gap-3 mb-4">
            <Badge variant={approved === live.length ? "ok" : "warn"}>{approved} of {live.length} approved</Badge>
            <span className="text-[12.5px] text-muted-2">All five have to be checked before the customer is created. Understanding: {overall(live)}.</span>
          </div>
          <ProfileEditor sections={live} setSections={setSections} />
        </Q>
      )}

      {step === 4 && (
        <Q n={5} of={5} wide title="Who runs it on their side?" help="The first Owner. They connect their own A/B tool, their own AI key and their sites' scripts — Prism never holds a customer's credentials on their behalf, and neither do we.">
          <div className="max-w-[620px] mb-5">
            <Label htmlFor="owner" className="mb-1.5">Owner&rsquo;s email</Label>
            <Input id="owner" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="dana@outrigger.com" type="email" autoFocus />
            <p className="text-[12.5px] text-muted-2 mt-2">They get an invitation and a setup checklist that only disappears when everything on it is actually connected.</p>
          </div>
          <Outputs slug={slug} revision={1} />
        </Q>
      )}
    </Wizard>
  );
}

/* ── The room (customer console · CONFIGURE) ───────────────────────── */

export function ProfileRoom({ customer = "OUTRIGGER Hotels & Resorts" }: { customer?: string }) {
  const [sections, setSections] = useState<Live[]>(() =>
    applyAnswers(DRAFT_SECTIONS, OUTRIGGER_ANSWERS).map((s) => ({
      ...s, status: "approved" as Status, confidence: clamp(s.confidence + 4),
      ...(s.key === "voice" ? { body: s.body + " We never say luxury.", status: "revised" as Status, notes: ["we never say luxury"] } : {}),
    })));
  const [reread, setReread] = useState(false);
  const [rereading, setRereading] = useState(false);
  const rev = OUTRIGGER_REVISIONS[OUTRIGGER_REVISIONS.length - 1];
  const changed = sections.filter((s) => s.status === "edited").length;

  return (
    <>
      <PageHeader title="Business profile" count={`what Prism understands about ${customer}`}
        actions={<>
          {changed > 0 && <Badge variant="accent">{changed} change{changed === 1 ? "" : "s"} → will become r{rev.r + 1}</Badge>}
          <Button size="sm" variant="outline" onClick={() => setReread(true)}>Re-read the site</Button>
        </>} />
      <div className="flex-1 overflow-auto p-6">
        <div className="flex flex-col xl:flex-row gap-6 items-start max-w-[1180px]">
          <div className="flex-1 min-w-0 space-y-4 w-full">
            <Learned earned={OUTRIGGER_EARNED} />
            <ProfileEditor sections={sections} setSections={setSections} who="Dana Reyes" />
          </div>
          <aside className="w-full xl:w-[300px] shrink-0 space-y-4">
            <Card title={`Context revision ${rev.r}`}>
              <div className="px-5 py-3.5 space-y-2.5">
                <div className="text-[13px]"><span className="text-muted-2">Read</span> {OBSERVED.readAt.split(" ").slice(0, 3).join(" ")} · {OBSERVED.read} pages</div>
                <div className="text-[13px]"><span className="text-muted-2">Understanding</span> <span className="tabular-nums font-medium">{overall(sections)}</span></div>
                <div className="text-[13px]"><span className="text-muted-2">Pinned by</span> {rev.pinnedBy} builds</div>
              </div>
            </Card>
            <Card title="Revisions">
              {[...OUTRIGGER_REVISIONS].reverse().map((r) => (
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
            <Outputs slug="outrigger" revision={rev.r} />
          </aside>
        </div>
      </div>

      <Dialog open={reread} onOpenChange={setReread}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-read {OBSERVED.domain}?</DialogTitle>
            <DialogDescription>
              Reads up to {OBSERVED.budget} pages again and re-derives the measured layer. It makes revision {rev.r + 1}. Nothing you approved is rewritten —
              where the pages now disagree with a section, that section is flagged for you, not changed behind you. The {rev.pinnedBy} builds cut against r{rev.r} keep r{rev.r}.
            </DialogDescription>
          </DialogHeader>
          {rereading && <Reading done={() => { setRereading(false); setReread(false); }} />}
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
