"use client";

/** The work surfaces: Overview, Experiments (list + one), Ideas, Readouts. */

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/ui/cn";
import { EXPERIMENTS, ME, SITE_ROWS, STATUS, TROUBLE, needsMe, type Experiment } from "@/lib/console/fake";
import { Badge, Chip, Meta, PageHeader, Pill, Section, StageRail, Th, Toolbar } from "./ui";
import { StagePanel } from "./stages";
import { SetupChecklist } from "./setup";
import { Readout } from "./readout";
import { logActivity } from "./config";
import { STAGES, type Stage } from "@/lib/console/fake";

/** The mock's clock. Anything done in this session is dated today. */
const TODAY = "10 Sep 2026";

/** Land on one experiment's Decision stage: the room first, the stage once the room has mounted. */
const goDecision = (expId: string) => {
  window.dispatchEvent(new CustomEvent("console:go", { detail: { expId } }));
  setTimeout(() => window.dispatchEvent(new CustomEvent("console:go", { detail: { stage: "Decision" } })), 0);
};

/* ── Overview ──────────────────────────────────────────────────────── */

export function OverviewView({ open, rows = EXPERIMENTS, fresh }: { open: (id: string) => void; rows?: Experiment[]; fresh?: boolean }) {
  const mine = rows.filter(needsMe);
  const running = rows.filter((e) => e.status === "running");
  return (
    <>
      <PageHeader title="Overview" />
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* Derives its own completion and disappears — so it only appears for an
            account whose setup is genuinely unfinished, never for one that is done. */}
        {fresh && <SetupChecklist environments={[]} />}
        <Section title={`Waiting on you — ${mine.length}`}>
          {mine.length === 0 ? (
            <p className="px-5 py-6 text-[14px] text-muted text-center">Nothing needs you right now.</p>
          ) : mine.map((e) => (
            <button key={e.id} onClick={() => open(e.id)}
              className="w-full text-left flex items-center gap-4 px-5 py-3.5 border-b border-border last:border-0 hover:bg-surface-2/60">
              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", e.status === "decide" ? "bg-danger" : e.status === "review" ? "bg-warn" : "bg-accent")} />
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium truncate">{e.name}</div>
                <div className="text-[13px] text-muted-2 truncate mt-0.5">{e.action?.title} · {e.site}</div>
              </div>
              <Badge s={e.status} />
              <span className="text-[13px] text-accent font-medium shrink-0">Open →</span>
            </button>
          ))}
        </Section>

        <Section title={`Running now — ${running.length}`} action={<span className="text-[12.5px] text-muted-2">nothing needed from you</span>}>
          {running.map((e) => (
            <button key={e.id} onClick={() => open(e.id)} className="w-full text-left flex items-center gap-4 px-5 py-3 border-b border-border last:border-0 hover:bg-surface-2/60">
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] truncate">{e.name}</div>
                <div className="text-[12.5px] text-muted-2 truncate">{e.site}{e.path}</div>
              </div>
              <span className="text-[13px] text-muted-2">{e.result?.detail}</span>
              <span className={cn("text-[13.5px] tabular-nums font-medium w-14 text-right", e.result?.tone === "ok" ? "text-ok" : "text-muted")}>{e.result?.value}</span>
            </button>
          ))}
        </Section>
      </div>
    </>
  );
}

/* ── Experiments ───────────────────────────────────────────────────── */

/** `all` is the scoped list the sidebar chose; the chips and the search narrow it further. */
export function ExperimentsView({ open, onNew, all = EXPERIMENTS }: { open: (id: string) => void; onNew: () => void; all?: Experiment[] }) {
  const [filter, setFilter] = useState<"all" | "mine" | "running" | "decided">("all");
  const [q, setQ] = useState("");
  const rows = useMemo(() => all.filter((e) => {
    if (q.trim() && !e.name.toLowerCase().includes(q.trim().toLowerCase())) return false;
    if (filter === "mine") return needsMe(e);
    if (filter === "running") return e.status === "running";
    if (filter === "decided") return e.status === "shipped" || e.status === "decide";
    return true;
  }), [all, filter, q]);
  const counts = {
    all: all.length, mine: all.filter(needsMe).length,
    running: all.filter((e) => e.status === "running").length,
    decided: all.filter((e) => e.status === "shipped" || e.status === "decide").length,
  };
  /** The list as filtered, as a spreadsheet. */
  const exportCsv = () => {
    const csv = ["experiment,status,stage,primary metric,result,owner,updated,page,environment",
      ...rows.map((e) => [e.name, STATUS[e.status].label, e.stage, e.metric, e.result?.value ?? "", e.owner, e.updated, `${e.site}${e.path}`, e.env]
        .map((v) => `"${v.replace(/"/g, '""')}"`).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: "prism-experiments.csv" });
    link.click(); URL.revokeObjectURL(url);
    logActivity(`Exported ${rows.length} experiment${rows.length === 1 ? "" : "s"} as a spreadsheet.`);
  };
  return (
    <>
      <PageHeader title="Experiments" count={`${rows.length} of ${all.length}`}
        actions={<><Button variant="outline" size="sm" onClick={exportCsv}>Export</Button><Button size="sm" onClick={onNew}>New experiment</Button></>} />
      <Toolbar>
        {([["all", "All"], ["mine", "Needs me"], ["running", "Running"], ["decided", "Decided"]] as const).map(([k, label]) => (
          <Chip key={k} on={filter === k} onClick={() => setFilter(k)}>{label} <span className="tabular-nums opacity-60">{counts[k]}</span></Chip>
        ))}
        <div className="w-px h-5 bg-border mx-1" />
        <input value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="Search experiments…" className="h-8 px-3 rounded-lg border border-border bg-surface text-[13px] w-56 placeholder:text-muted-2 focus:border-accent focus:outline-none" />
      </Toolbar>
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-surface-2/80 backdrop-blur">
            <tr><Th first>Experiment</Th><Th>Status</Th><Th>Stage</Th><Th>Primary metric</Th><Th>Owner</Th><Th>Updated</Th></tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} onClick={() => open(e.id)} className="cursor-pointer hover:bg-surface-2/60 border-b border-border">
                <td className="px-4 pl-6 py-3 max-w-[380px]">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-medium truncate">{e.name}</span>
                    {needsMe(e) && <span className="shrink-0 text-[10.5px] font-bold tracking-wide text-accent bg-accent/10 rounded px-1.5 py-0.5">NEEDS YOU</span>}
                    {e.trouble && <Pill tone={TROUBLE[e.trouble].tone}>{TROUBLE[e.trouble].label}</Pill>}
                  </div>
                  <div className="text-[12.5px] text-muted-2 truncate mt-0.5">{e.site}{e.path} · {e.env}</div>
                </td>
                <td className="px-4 py-3"><Badge s={e.status} /></td>
                <td className="px-4 py-3"><StageRail stage={e.stage} /></td>
                <td className="px-4 py-3">
                  <div className="text-[13.5px]">{e.metric}</div>
                  {e.result && <div className={cn("text-[12.5px] tabular-nums mt-0.5", e.result.tone === "ok" ? "text-ok" : e.result.tone === "danger" ? "text-danger" : "text-muted-2")}>{e.result.value}</div>}
                </td>
                <td className="px-4 py-3 text-[13.5px] text-muted whitespace-nowrap">{e.owner}</td>
                <td className="px-4 py-3 text-[13px] text-muted-2 whitespace-nowrap">{e.updated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Where Preview opens: the page on the experiment's own environment, with the variation injected. */
const previewUrl = (e: Experiment) => {
  const envs = SITE_ROWS.find((s) => s.domain === e.site)?.envs ?? [];
  const env = envs.find((x) => x.label === e.env) ?? envs.find((x) => !x.isProduction);
  return `${env?.url ?? `https://${e.site}`}${e.path}?opmc=${e.id}`;
};

/** The signed-in person, however a fixture writes an owner: "Bryan Hopkins" or "Bryan H.". */
const isMine = (owner: string) => owner === ME.name || owner === ME.name.replace(/^(\S+)\s+(\S).*$/, "$1 $2.");

const OPTIMIZELY = "https://app.optimizely.com/v2/projects/24138040550/experiments";
const REVIEWERS = ["Ana Kealoha", "Dana R.", "Kai N.", "Malia K.", "Marcus R."];

/** How the action card ends once you have acted: the line it shows, the line
 *  Activity keeps, and — where the product would have to send or stop
 *  something — what it says while that happens. Recording a decision also
 *  seals the readout. */
interface Outcome { line: string; log: string; pending?: string; seals?: boolean }
type Ask =
  | ({ kind: "confirm"; title: string; body: string; ok: string; danger?: boolean } & Outcome)
  | { kind: "note"; title: string; done: (note: string) => Outcome }
  | { kind: "choose"; title: string; body: string; options: ({ t: string; d?: string } & Outcome)[] };

const noteOutcome = (label: string, name: string, note: string): Outcome => {
  const to = /^reply to (.+)/i.exec(label)?.[1];
  if (to) return { line: `Replied to ${to} · ${note}`, log: `Replied to ${to} on ${name}: “${note}”` };
  if (/keep/i.test(label)) return { line: `Kept running · ${note}`, log: `Kept ${name} running and said why: “${note}”` };
  return { line: `Sent back · ${note}`, log: `Sent ${name} back with a note: “${note}”` };
};

/** What a card button does, by what its label promises. Navigation happens at
 *  once; anything that stops, records, sends or archives asks first. */
const actOn = (e: Experiment, label: string): Ask | null => {
  const go = (stage: Stage) => { window.dispatchEvent(new CustomEvent("console:go", { detail: { stage } })); return null; };
  const who = /waiting on (.+)/i.exec(e.action?.title ?? "")?.[1] ?? "the reviewer";
  if (/stop/i.test(label)) return {
    kind: "confirm", title: "Stop the run?", ok: "Stop the run", danger: true,
    body: "Stopping ends the run today; the verdict is what the data supports now. Anyone can stop a run.",
    pending: "Stopping the run…", line: `Stopped by you · ${TODAY}`, log: `Stopped the run on ${e.name}.`,
  };
  if (/won|win/i.test(label)) {
    const won = !/didn|not|lost/i.test(label);
    return {
      kind: "confirm", title: won ? "Record the decision — it won" : "Record the decision — it didn't win", ok: won ? "Record it — it won" : "Record it — it didn't win",
      body: `This freezes the result and the statistics together and writes the readout. ${won ? "The build is handed to the development team." : "Nothing ships."} It carries your name and today's date, and it can't be changed after.`,
      line: `Decision recorded by you · ${TODAY} — ${won ? "it won, handed to the development team" : "it didn't win"}`,
      log: `Recorded the decision on ${e.name}: ${won ? "it won" : "it didn't win"}.`, seals: true,
    };
  }
  if (/note|send back|reject|reply|keep/i.test(label)) return { kind: "note", title: label, done: (note) => noteOutcome(label, e.name, note) };
  if (/send a reminder/i.test(label)) return {
    kind: "confirm", title: `Remind ${who}?`, ok: "Send the reminder",
    body: `Prism sends a short message from you — ${e.build ? `build ${e.build}` : "the build"} is waiting on a site sign-off — with a link to the page. Nothing else changes.`,
    pending: `Sending the reminder to ${who}…`, line: `Reminder sent to ${who} · ${TODAY}`, log: `Reminded ${who} that ${e.name} is waiting on a sign-off.`,
  };
  if (/snooze|later|remind|archive/i.test(label)) return {
    kind: "choose", title: label, body: "Nothing runs either way. Pick what happens to it.",
    options: /archive/i.test(label)
      ? [{ t: "Archive it", d: "It stays in the record, readable. Nobody is asked about it again.", line: `Archived by you · ${TODAY}`, log: `Archived ${e.name}.` },
         { t: "Ask me again in a week", d: "17 Sep 2026", line: "Asking again on 17 Sep 2026", log: `Put ${e.name} off until 17 Sep 2026.` }]
      : [{ t: "Tomorrow", d: "11 Sep 2026", line: "Snoozed until 11 Sep 2026", log: `Snoozed ${e.name} until 11 Sep 2026.` },
         { t: "In a week", d: "17 Sep 2026", line: "Snoozed until 17 Sep 2026", log: `Snoozed ${e.name} until 17 Sep 2026.` }],
  };
  if (/reassign/i.test(label)) return {
    kind: "choose", title: "Reassign the review", body: `${who} is told. Whoever you pick gets the same ask: sign off that the build matches the brief and is safe on the site.`,
    options: REVIEWERS.filter((r) => r !== who && r !== e.owner).map((r) => ({ t: r, line: `Reassigned to ${r} · ${TODAY}`, log: `Reassigned the review of ${e.name} to ${r}.` })),
  };
  if (/optimizely/i.test(label)) { window.open(OPTIMIZELY, "_blank", "noopener"); return null; }
  if (/record|decid/i.test(label)) return go("Decision");
  if (/approve|review|look/i.test(label)) return go("Review");
  if (/brief|resume|pick/i.test(label)) return go("Brief");
  if (/build|rebuild/i.test(label)) return go("Build");
  return go(e.stage);
};

export function ExperimentDetail(props: { e: Experiment; back: () => void }) {
  // Keyed by experiment, so what you did on one never shows on the next one you open.
  return <OneExperiment key={props.e.id} {...props} />;
}

function OneExperiment({ e, back }: { e: Experiment; back: () => void }) {
  const [tab, setTab] = useState<Stage>(e.stage);
  // A panel deep in one stage can send you to another: window.dispatchEvent(new CustomEvent("console:go", { detail: { stage: "Brief" } })).
  useEffect(() => {
    const on = (ev: Event) => { const d = (ev as CustomEvent<{ stage?: Stage }>).detail; if (d?.stage) setTab(d.stage); };
    window.addEventListener("console:go", on);
    return () => window.removeEventListener("console:go", on);
  }, []);

  /* Share a readout. A readout exists once the run has closed; recording the decision seals it. */
  const [sharing, setSharing] = useState(false);
  const [to, setTo] = useState("");
  const [shareNote, setShareNote] = useState("");
  const [shared, setShared] = useState<string[] | null>(null);
  const closed = e.status === "decide" || e.status === "shipped";
  const recipients = to.split(/[,\s]+/).filter(Boolean);
  const share = () => {
    setShared(recipients); setSharing(false); setTo(""); setShareNote("");
    logActivity(`Shared the ${e.name} readout with ${recipients.join(", ")}.${shareNote.trim() ? ` “${shareNote.trim()}”` : ""}`);
  };

  /* The action card. One question at a time; the card keeps what you did. */
  const [ask, setAsk] = useState<Ask | null>(null);
  const [note, setNote] = useState("");
  const [choice, setChoice] = useState("");
  const [acted, setActed] = useState<{ line: string; busy?: boolean; sealed?: boolean } | null>(null);
  /** The decision seals the readout — recorded before this session, or in it. */
  const sealed = e.status === "shipped" || Boolean(acted?.sealed);
  const buttons = e.action ? [e.action.primary, ...(e.action.secondary ? [e.action.secondary] : [])] : [];
  // Whoever wrote or built an experiment can't record its result. Stopping a run needs nobody's permission.
  const blocked = (label: string) => isMine(e.owner) && /won|win|record|decid/i.test(label);
  const press = (label: string) => { const a = actOn(e, label); if (a) { setNote(""); setChoice(""); setAsk(a); } };
  const settle = (o: Outcome) => {
    setAsk(null);
    if (!o.pending) { setActed({ line: o.line, sealed: o.seals }); logActivity(o.log); return; }
    setActed({ line: o.pending, busy: true });
    setTimeout(() => { setActed({ line: o.line, sealed: o.seals }); logActivity(o.log); }, 900);
  };

  return (
    <>
      <header className="shrink-0 border-b border-border bg-surface px-6 pt-3 pb-4">
        <button onClick={back} className="text-[12.5px] text-muted-2 hover:text-foreground mb-1.5">Experiments</button>
        <div className="flex items-start gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="text-[19px] font-semibold tracking-[-0.01em] truncate">{e.name}</h1>
              <Badge s={e.status} />
            </div>
            <div className="text-[13px] text-muted-2 mt-1">{e.site}{e.path} · {e.env} · owned by {e.owner}</div>
          </div>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" title="Opens the page with this variation injected" onClick={() => window.open(previewUrl(e), "_blank", "noopener")}>Preview</Button>
            <Button variant="outline" size="sm" onClick={() => setSharing(true)}>Share a readout</Button>
          </div>
        </div>
        {/* Navigable: read the brief while a run is live. Only the CURRENT
            stage carries an action; the rest are the record. */}
        <div className="mt-3.5 flex items-center gap-1.5">
          {STAGES.map((s, i) => {
            const at = STAGES.indexOf(e.stage);
            const on = s === tab;
            return (
              <div key={s} className="flex items-center gap-1.5">
                <button onClick={() => setTab(s)}
                  className={cn("flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition-colors",
                    on ? "bg-surface-2" : "hover:bg-surface-2/60")}>
                  <span className={cn("w-1.5 h-1.5 rounded-full", i < at ? "bg-ok" : i === at ? "bg-accent" : "bg-border-strong")} />
                  <span className={cn("text-[12.5px]", on ? "font-semibold text-foreground" : i <= at ? "text-muted" : "text-muted-2")}>{s}</span>
                  {i === at && <span className="text-[10px] font-bold text-accent">NOW</span>}
                </button>
                {i < STAGES.length - 1 && <span className="w-4 h-px bg-border" />}
              </div>
            );
          })}
        </div>
      </header>
      {shared && <div className="shrink-0 border-b border-border bg-surface px-6 py-2 text-[12.5px] text-muted">Shared with {shared.join(", ")} · just now</div>}

      <Dialog open={sharing} onOpenChange={setSharing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share a readout</DialogTitle>
            <DialogDescription>
              {closed
                ? "Whoever you name gets an email from you with a link. They don't need a Prism account."
                : "Nothing to share yet. A readout is written the moment a decision is recorded — never before."}
            </DialogDescription>
          </DialogHeader>
          {closed && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="share-to" className="mb-1.5">Who</Label>
                <Input id="share-to" value={to} onChange={(ev) => setTo(ev.target.value)} placeholder="dana@outrigger.com, kai@outrigger.com" autoFocus />
              </div>
              <div>
                <Label htmlFor="share-note" className="mb-1.5">A note, if you want one</Label>
                <Textarea id="share-note" rows={2} value={shareNote} onChange={(ev) => setShareNote(ev.target.value)} placeholder="Optional" />
              </div>
              <p className="rounded-lg border border-border bg-surface-2/40 px-3.5 py-2.5 text-[13px] text-muted leading-relaxed">
                <span className="font-semibold text-foreground">What they get</span> — a read-only link, no login: the readout exactly as recorded,
                {sealed ? " with the decision sealed." : " with the result sealed and a plain line saying the decision is not recorded yet."}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSharing(false)}>Not now</Button>
            {closed && <Button disabled={recipients.length === 0 || !recipients.every((r) => /.+@.+\..+/.test(r))} onClick={share}>Send</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ask !== null} onOpenChange={(o) => !o && setAsk(null)}>
        <DialogContent>
          {ask?.kind === "confirm" && (
            <>
              <DialogHeader>
                <DialogTitle>{ask.title}</DialogTitle>
                <DialogDescription>{ask.body}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setAsk(null)}>Not now</Button>
                <Button variant={ask.danger ? "danger" : "default"} onClick={() => settle(ask)}>{ask.ok}</Button>
              </DialogFooter>
            </>
          )}
          {ask?.kind === "note" && (
            <>
              <DialogHeader>
                <DialogTitle>{ask.title}</DialogTitle>
                <DialogDescription>Kept in the record with your name and the time, and sent to whoever it concerns.</DialogDescription>
              </DialogHeader>
              <div>
                <Label htmlFor="act-note" className="mb-1.5">Your note</Label>
                <Textarea id="act-note" rows={3} value={note} onChange={(ev) => setNote(ev.target.value)} autoFocus />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setAsk(null)}>Not now</Button>
                <Button disabled={!note.trim()} onClick={() => settle(ask.done(note.trim()))}>Send</Button>
              </DialogFooter>
            </>
          )}
          {ask?.kind === "choose" && (
            <>
              <DialogHeader>
                <DialogTitle>{ask.title}</DialogTitle>
                <DialogDescription>{ask.body}</DialogDescription>
              </DialogHeader>
              <div>
                <Label className="mb-2" id="act-pick">Pick one</Label>
                <RadioGroup aria-labelledby="act-pick" value={choice} onValueChange={setChoice}>
                  {ask.options.map((o, i) => (
                    <Label key={o.t} htmlFor={`act-opt-${i}`} className={cn("gap-3 items-start rounded-xl border px-4 py-3 cursor-pointer font-normal text-foreground", choice === o.t ? "border-accent bg-accent/5" : "border-border")}>
                      <RadioGroupItem id={`act-opt-${i}`} value={o.t} className="mt-0.5" />
                      <span className="flex flex-col gap-0.5">
                        <span className="text-[14px] font-medium">{o.t}</span>
                        {o.d && <span className="text-[12.5px] text-muted-2">{o.d}</span>}
                      </span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setAsk(null)}>Not now</Button>
                <Button disabled={!choice} onClick={() => { const o = ask.options.find((x) => x.t === choice); if (o) settle(o); }}>Done</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <div className="flex-1 overflow-auto">
        <div className="flex gap-6 p-6 items-start">
          <div className="flex-1 min-w-0 space-y-4">
            <StagePanel e={e} stage={tab} action={e.action ? (
              <section className="rounded-xl border-[1.5px] border-accent bg-surface p-5 shadow-[0_4px_16px_rgba(29,78,216,0.07)]">
                <div className="flex items-center gap-2 mb-1.5">
                  <h2 className="text-[16px] font-semibold">{e.action.title}</h2>
                  <span className="text-[11px] font-semibold text-muted-2 border border-border rounded px-1.5 py-0.5">{e.action.role.toUpperCase()}</span>
                </div>
                <p className="text-[14px] text-muted leading-relaxed mb-4">{e.action.body}</p>
                <div className="rounded-lg border border-border bg-surface-2/50 p-4 mb-4">
                  <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-2">WHAT WE SAID WE&rsquo;D TEST — BEFORE ANY NUMBERS EXISTED</div>
                  <p className="text-[14px] leading-relaxed">{e.hypothesis}</p>
                  {e.frozen && <div className="font-mono text-[11px] text-muted-2 mt-2.5">{e.frozen}</div>}
                </div>
                {e.result && (
                  <div className="flex items-baseline gap-6 mb-4">
                    <div>
                      <div className={cn("text-[22px] font-semibold tabular-nums tracking-[-0.02em]", e.result.tone === "ok" ? "text-ok" : e.result.tone === "danger" ? "text-danger" : "")}>{e.result.value}</div>
                      <div className="text-[12.5px] text-muted-2">{e.metric}</div>
                    </div>
                    <div className="text-[12.5px] text-muted-2 leading-relaxed">{e.result.detail}</div>
                  </div>
                )}
                {acted ? (
                  <div className="flex items-center gap-2.5 text-[13.5px]">
                    <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", acted.busy ? "bg-warn animate-pulse" : "bg-ok")} />
                    <span className={acted.busy ? "text-muted" : "font-medium"}>{acted.line}</span>
                  </div>
                ) : (
                  <div className="flex gap-2.5">
                    {buttons.map((label, i) => (
                      <Button key={label} variant={i ? "outline" : "default"} disabled={blocked(label)}
                        title={blocked(label) ? "You wrote this one — someone else records the result." : undefined}
                        onClick={() => press(label)}>{label}</Button>
                    ))}
                  </div>
                )}
              </section>
            ) : null} />

            <Section title="History">
              <ol>
                {e.history.map((h, i) => (
                  <li key={i} className="flex gap-4 px-5 py-3 border-b border-border last:border-0">
                    <div className="w-[92px] shrink-0 text-[12.5px] text-muted-2">{h.at}</div>
                    <div className="min-w-0">
                      <div className="text-[13.5px]"><span className="font-medium">{h.who}</span> <span className="text-muted-2">· {h.role}</span></div>
                      <div className="text-[13.5px] text-muted leading-snug mt-0.5">{h.what}</div>
                      {h.sealed && (
                        <div className="inline-flex items-center gap-1.5 mt-1.5 rounded border border-border bg-surface-2/60 px-2 py-1 font-mono text-[11px] text-muted-2">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                          {h.sealed}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </Section>
          </div>

          <aside className="w-[292px] shrink-0 rounded-xl border border-border bg-surface p-5">
            <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-1">DETAILS</div>
            <Meta k="Site" v={e.site} />
            <Meta k="Page" v={<span className="break-all text-muted">{e.path}</span>} />
            <Meta k="Environment" v={e.env} />
            <Meta k="Owner" v={e.owner} />
            <Meta k="Primary metric" v={e.metric} />
            <Meta k="Build" v={e.build ?? "—"} mono />
            <div className="mt-4 pt-3 border-t border-border">
              <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-2">MUST NOT GET WORSE</div>
              {e.guardrails.length
                ? <ul className="space-y-1">{e.guardrails.map((g) => <li key={g} className="text-[13px] text-muted">{g}</li>)}</ul>
                : <p className="text-[13px] text-warn">None set — the brief can&rsquo;t be completed without at least one.</p>}
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

/* ── Ideas ─────────────────────────────────────────────────────────── */

const IDEAS = [
  { t: "Move the offer badge below the fold", src: "From the Travel quiz banner result · 3 days ago", why: "That result showed the hero is crowded. The badge is the next thing competing with the booking call to action.", tag: "From a result", tone: "accent" as const },
  { t: "Try a single call to action on property pages", src: "Prism noticed · 5 days ago", why: "Four of your last six wins came from removing a competing call to action.", tag: "Pattern", tone: "warn" as const },
  { t: "Shorten the room name on mobile", src: "Kai Nakamura · last week", why: "Names wrap to three lines on a phone and push the price out of view.", tag: "Written down", tone: "muted" as const },
  { t: "Show the cancellation policy earlier", src: "Dana Kealoha · two weeks ago", why: "Support says it's the most common question before booking.", tag: "Written down", tone: "muted" as const },
];

export function IdeasView({ promote, write }: { promote: () => void; write: () => void }) {
  const [asking, setAsking] = useState<string | null>(null);
  return (
    <>
      <PageHeader title="Ideas" count={`${IDEAS.length} ideas`} actions={<Button size="sm" onClick={write}>Write down an idea</Button>} />
      {asking && (
        <div className="fixed inset-0 z-[60] bg-foreground/40 grid place-items-center p-6" onClick={() => setAsking(null)}>
          <div className="w-[540px] rounded-xl border border-border bg-surface p-6" onClick={(ev) => ev.stopPropagation()}>
            <h2 className="text-[17px] font-semibold mb-1.5">Turn this into a test</h2>
            <p className="text-[14px] text-muted leading-relaxed mb-4">
              A new experiment starts at Brief, threaded to the result that suggested it, so this reads as a line of enquiry rather than a pile of tests.
            </p>
            <div className="rounded-lg border border-border bg-surface-2/40 p-4 space-y-2 text-[13.5px]">
              <div className="flex gap-2"><span className="text-ok">carries</span><span className="text-muted">the decision metric and guardrails — copied at the moment they were computed, before anyone looked at a result</span></div>
              <div className="flex gap-2"><span className="text-ok">carries</span><span className="text-muted">the pages, and a link back to the result that suggested it</span></div>
              <div className="flex gap-2"><span className="text-danger">does not</span><span className="text-muted">carry any proof about the old build — this one has no build yet, and every gate applies as if it were typed by hand</span></div>
            </div>
            <div className="flex items-center gap-3 mt-4">
              <Button onClick={() => { setAsking(null); promote(); }}>Create it at Brief</Button>
              <Button variant="ghost" onClick={() => setAsking(null)}>Not now</Button>
              <span className="text-[12.5px] text-muted-2 ml-auto">Refused if the source result was never stamped</span>
            </div>
          </div>
        </div>
      )}
      <Toolbar><span className="text-[13px] text-muted">Things worth testing that nobody has written up yet. Anything here becomes an experiment in one click.</span></Toolbar>
      <div className="flex-1 overflow-auto p-6">
        <Section>
          {IDEAS.map((i) => (
            <div key={i.t} className="flex items-start gap-4 px-5 py-4 border-b border-border last:border-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[14.5px] font-medium">{i.t}</span>
                  <Pill tone={i.tone}>{i.tag}</Pill>
                </div>
                <p className="text-[13.5px] text-muted leading-snug">{i.why}</p>
                <div className="text-[12.5px] text-muted-2 mt-1.5">{i.src}</div>
              </div>
              <Button size="sm" variant="outline" className="shrink-0" onClick={() => (i.tone === "muted" ? write() : setAsking(i.t))}>Turn into a test</Button>
            </div>
          ))}
        </Section>
      </div>
    </>
  );
}

/* ── Readouts ──────────────────────────────────────────────────────── */

const SUBS = [
  { name: "Weekly digest", who: "Leadership · 6 people", when: "Mondays 9:00am" },
  { name: "Every decision", who: "Marketing · 4 people", when: "when one is recorded" },
  { name: "Guardrail breach", who: "Bryan, Dana", when: "immediately" },
];
const SENT = [
  { t: "Weekly digest — 6 people", when: "Mon 9:00am", opened: "5 of 6 opened" },
  { t: "Rate-calendar best-price promise — decision", when: "Fri 2:14pm", opened: "4 of 4 opened" },
  { t: "Weekly digest — 6 people", when: "1 Sep", opened: "6 of 6 opened" },
];

export function ReadoutsView({ rows = EXPERIMENTS }: { rows?: Experiment[] }) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const waiting = rows.filter((e) => e.status === "decide");
  const decided = rows.filter((e) => e.status === "shipped");
  /** The decision behind what goes out: the newest one at the Decision stage. */
  const latest = rows.find((e) => e.stage === "Decision");
  if (open) {
    return (
      <>
        <div className="shrink-0 border-b border-border bg-surface px-6 py-2">
          <button onClick={() => setOpen(false)} className="text-[12.5px] text-muted-2 hover:text-foreground">← Readouts</button>
        </div>
        <div className="flex-1 overflow-auto"><Readout /></div>
      </>
    );
  }
  return (
    <>
      <PageHeader title="Readouts" actions={<Button size="sm" onClick={() => setCreating(true)}>New readout</Button>} />

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New readout</DialogTitle>
            <DialogDescription>
              A readout is written the moment a decision is recorded — never before. Nobody types one: it is the decision record, laid out for the people who need to hear it. So the way to get one is to record a decision.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {waiting.length > 0 && (
              <div>
                <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-1">WAITING FOR A DECISION</div>
                {waiting.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 py-2 border-t border-border first:border-0">
                    <span className="flex-1 min-w-0 text-[13.5px] truncate">{e.name}</span>
                    <button onClick={() => { setCreating(false); goDecision(e.id); }} className="text-[13px] text-accent font-medium shrink-0">Record the decision →</button>
                  </div>
                ))}
              </div>
            )}
            {decided.length > 0 && (
              <div>
                <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-1">DECIDED — READOUT WRITTEN</div>
                {decided.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 py-2 border-t border-border first:border-0">
                    <span className="flex-1 min-w-0 text-[13.5px] truncate">{e.name}</span>
                    <span className="text-[12.5px] text-muted-2 shrink-0">{e.result?.detail}</span>
                    <button onClick={() => { setCreating(false); setOpen(true); }} className="text-[13px] text-accent font-medium shrink-0">Open →</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreating(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit — {editing}</DialogTitle>
            <DialogDescription>A readout is generated from the decision record. Change the record and the readout follows.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Not now</Button>
            {latest && <Button onClick={() => { setEditing(null); goDecision(latest.id); }}>Open the decision</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toolbar><span className="text-[13px] text-muted">Who hears what happened, and when. Recipients don&rsquo;t need a Prism account.</span></Toolbar>
      <div className="flex-1 overflow-auto p-6 space-y-4">
        <Section title="Going out">
          {SUBS.map((s) => (
            <div key={s.name} className="flex items-center gap-4 px-5 py-3.5 border-b border-border last:border-0">
              <div className="flex-1"><div className="text-[14px] font-medium">{s.name}</div><div className="text-[12.5px] text-muted-2 mt-0.5">{s.who}</div></div>
              <span className="text-[13px] text-muted">{s.when}</span>
              <button onClick={() => setEditing(s.name)} className="text-[13px] text-accent font-medium w-12 text-right">Edit</button>
            </div>
          ))}
        </Section>
        <Section title="Recently sent">
          {SENT.map((s, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3 border-b border-border last:border-0">
              <button onClick={() => setOpen(true)} className="flex-1 text-left text-[13.5px] text-muted hover:text-foreground">{s.t}</button>
              <Pill tone="ok">Delivered</Pill>
              <span className="text-[12.5px] text-muted-2 w-28 text-right">{s.opened}</span>
              <span className="text-[13px] text-muted-2 w-24 text-right">{s.when}</span>
            </div>
          ))}
        </Section>
      </div>
    </>
  );
}

export { ME };
