"use client";

/** The work surfaces: Overview, Experiments (list + one), Ideas, Readouts. */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";
import { EXPERIMENTS, ME, SITES, needsMe, type Experiment } from "@/lib/console/fake";
import { Badge, Chip, Meta, PageHeader, Pill, Section, StageRail, Th, Toolbar } from "./ui";

/* ── Overview ──────────────────────────────────────────────────────── */

export function OverviewView({ open }: { open: (id: string) => void }) {
  const mine = EXPERIMENTS.filter(needsMe);
  const running = EXPERIMENTS.filter((e) => e.status === "running");
  return (
    <>
      <PageHeader title="Overview" />
      <div className="flex-1 overflow-auto p-6 space-y-4">
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

export function ExperimentsView({ open }: { open: (id: string) => void }) {
  const [filter, setFilter] = useState<"all" | "mine" | "running" | "decided">("all");
  const [site, setSite] = useState("All sites");
  const rows = useMemo(() => EXPERIMENTS.filter((e) => {
    if (site !== "All sites" && e.site !== site) return false;
    if (filter === "mine") return needsMe(e);
    if (filter === "running") return e.status === "running";
    if (filter === "decided") return e.status === "shipped" || e.status === "decide";
    return true;
  }), [filter, site]);
  const counts = {
    all: EXPERIMENTS.length, mine: EXPERIMENTS.filter(needsMe).length,
    running: EXPERIMENTS.filter((e) => e.status === "running").length,
    decided: EXPERIMENTS.filter((e) => e.status === "shipped" || e.status === "decide").length,
  };
  return (
    <>
      <PageHeader title="Experiments" count={`${rows.length} of ${EXPERIMENTS.length}`}
        actions={<><Button variant="outline" size="sm">Export</Button><Button size="sm">New experiment</Button></>} />
      <Toolbar>
        {([["all", "All"], ["mine", "Needs me"], ["running", "Running"], ["decided", "Decided"]] as const).map(([k, label]) => (
          <Chip key={k} on={filter === k} onClick={() => setFilter(k)}>{label} <span className="tabular-nums opacity-60">{counts[k]}</span></Chip>
        ))}
        <div className="w-px h-5 bg-border mx-1" />
        <select value={site} onChange={(e) => setSite(e.target.value)}
          className="h-8 px-2.5 rounded-lg border border-border bg-surface text-[13px] text-muted focus:border-accent focus:outline-none">
          {["All sites", ...SITES].map((s) => <option key={s}>{s}</option>)}
        </select>
        <input placeholder="Search experiments…" className="h-8 px-3 rounded-lg border border-border bg-surface text-[13px] w-56 placeholder:text-muted-2 focus:border-accent focus:outline-none" />
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

export function ExperimentDetail({ e, back }: { e: Experiment; back: () => void }) {
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
            <Button variant="outline" size="sm">Preview</Button>
            <Button variant="outline" size="sm">Share a readout</Button>
          </div>
        </div>
        <div className="mt-3.5"><StageRail stage={e.stage} /></div>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="flex gap-6 p-6 items-start">
          <div className="flex-1 min-w-0 space-y-4">
            {e.action && (
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
                <div className="flex gap-2.5">
                  <Button>{e.action.primary}</Button>
                  {e.action.secondary && <Button variant="outline">{e.action.secondary}</Button>}
                </div>
              </section>
            )}

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

export function IdeasView() {
  return (
    <>
      <PageHeader title="Ideas" count={`${IDEAS.length} ideas`} actions={<Button size="sm">Write down an idea</Button>} />
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
              <Button size="sm" variant="outline" className="shrink-0">Turn into a test</Button>
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

export function ReadoutsView() {
  return (
    <>
      <PageHeader title="Readouts" actions={<Button size="sm">New readout</Button>} />
      <Toolbar><span className="text-[13px] text-muted">Who hears what happened, and when. Recipients don&rsquo;t need a Prism account.</span></Toolbar>
      <div className="flex-1 overflow-auto p-6 space-y-4">
        <Section title="Going out">
          {SUBS.map((s) => (
            <div key={s.name} className="flex items-center gap-4 px-5 py-3.5 border-b border-border last:border-0">
              <div className="flex-1"><div className="text-[14px] font-medium">{s.name}</div><div className="text-[12.5px] text-muted-2 mt-0.5">{s.who}</div></div>
              <span className="text-[13px] text-muted">{s.when}</span>
              <button className="text-[13px] text-accent font-medium w-12 text-right">Edit</button>
            </div>
          ))}
        </Section>
        <Section title="Recently sent">
          {SENT.map((s, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3 border-b border-border last:border-0">
              <div className="flex-1 text-[13.5px] text-muted">{s.t}</div>
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
