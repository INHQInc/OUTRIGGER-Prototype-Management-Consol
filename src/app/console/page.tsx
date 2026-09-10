"use client";

/**
 * CONSOLE — an enterprise UX mock on fake data. Dev-only route.
 *
 * Conventional on purpose: persistent left navigation, a real table, a detail
 * page with a metadata rail. Enterprise users scan and look things up; a
 * discoverable shell is a feature, not a failure of nerve.
 *
 * The one non-obvious rule, carried over from an exercise that got everything
 * else wrong: THE THING YOU MUST READ BELONGS INSIDE THE THING YOU MUST DO.
 * The frozen hypothesis sits in the same card as the buttons that adjudicate
 * it — never behind a tab, never in a drawer.
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";
import { EXPERIMENTS, ME, SITES, STAGES, STATUS, needsMe, type Experiment, type Stage } from "@/lib/console/fake";

/* ────────────────────────────── shell ────────────────────────────── */

const NAV = [
  { group: null, items: [["Overview", "M3 12h4l3 8 4-16 3 8h4"], ["Experiments", "M3 5h18M3 12h18M3 19h12"], ["Ideas", "M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"], ["Readouts", "M4 4h16v12H4zM8 9h8M8 12h5"]] as const },
  { group: "CONFIGURE", items: [["Sites", "M2 12h20M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20"], ["Connections", "M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8"], ["People & roles", "M16 20v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8"], ["Guardrails", "M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6z"], ["Activity", "M3 12h4l3 8 4-16 3 8h4"]] as const },
];

function Nav({ active, go }: { active: string; go: (s: string) => void }) {
  return (
    <nav className="w-[244px] shrink-0 border-r border-border bg-surface flex flex-col">
      <div className="h-14 flex items-center gap-2.5 px-4 border-b border-border">
        <div className="w-[22px] h-[22px] rounded-md bg-accent" />
        <span className="text-[14px] font-semibold tracking-[-0.01em]">Prism</span>
      </div>

      <button className="mx-3 mt-3 mb-1 flex items-center gap-2.5 rounded-lg border border-border px-2.5 py-2 hover:border-border-strong text-left">
        <div className="w-[18px] h-[18px] rounded bg-border-strong shrink-0" />
        <span className="text-[13px] font-medium flex-1 truncate">OUTRIGGER Hotels</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-muted-2"><path d="m6 9 6 6 6-6" /></svg>
      </button>

      <div className="flex-1 overflow-y-auto px-3 pt-2">
        {NAV.map((sec, si) => (
          <div key={si} className={sec.group ? "mt-5" : ""}>
            {sec.group && <div className="px-2.5 pb-1.5 text-[10.5px] font-semibold tracking-[0.08em] text-muted-2">{sec.group}</div>}
            {sec.items.map(([label, d]) => {
              const on = label === active;
              return (
                <button key={label} onClick={() => go(label)}
                  className={cn("w-full flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] mb-0.5 text-left transition-colors",
                    on ? "bg-accent/10 text-accent" : "text-muted hover:bg-surface-2 hover:text-foreground")}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
                  <span className={cn("text-[13.5px]", on ? "font-semibold" : "font-normal")}>{label}</span>
                  {label === "Experiments" && (
                    <span className="ml-auto text-[11px] font-semibold text-muted-2 tabular-nums">{EXPERIMENTS.length}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="border-t border-border px-4 py-3 flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-full bg-border-strong grid place-items-center text-[11px] font-semibold text-muted">{ME.initials}</div>
        <div className="min-w-0">
          <div className="text-[12.5px] font-medium truncate">{ME.name}</div>
          <div className="text-[11.5px] text-muted-2">{ME.role}</div>
        </div>
      </div>
    </nav>
  );
}

const Badge = ({ s }: { s: Experiment["status"] }) => {
  const t = STATUS[s];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[11.5px] font-semibold", t.bg, t.fg)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", t.dot)} />{t.label}
    </span>
  );
};

/** Stage as a progress rail — the same five words everywhere, never a tab bar. */
function StageRail({ stage }: { stage: Stage }) {
  const at = STAGES.indexOf(stage);
  return (
    <div className="flex items-center gap-1.5">
      {STAGES.map((s, i) => (
        <div key={s} className="flex items-center gap-1.5">
          <div className="flex items-center gap-1.5">
            <span className={cn("w-1.5 h-1.5 rounded-full", i < at ? "bg-ok" : i === at ? "bg-accent" : "bg-border-strong")} />
            <span className={cn("text-[12.5px]", i === at ? "font-semibold text-foreground" : i < at ? "text-muted" : "text-muted-2")}>{s}</span>
          </div>
          {i < STAGES.length - 1 && <span className="w-4 h-px bg-border" />}
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────── list ────────────────────────────── */

function ListView({ open }: { open: (id: string) => void }) {
  const [filter, setFilter] = useState<"all" | "mine" | "running" | "decided">("all");
  const [site, setSite] = useState("All sites");
  const rows = useMemo(() => EXPERIMENTS.filter((e) => {
    if (site !== "All sites" && e.site !== site) return false;
    if (filter === "mine") return needsMe(e);
    if (filter === "running") return e.status === "running";
    if (filter === "decided") return e.status === "shipped" || e.status === "decide";
    return true;
  }), [filter, site]);

  const counts = { all: EXPERIMENTS.length, mine: EXPERIMENTS.filter(needsMe).length, running: EXPERIMENTS.filter((e) => e.status === "running").length, decided: EXPERIMENTS.filter((e) => e.status === "shipped" || e.status === "decide").length };

  return (
    <>
      <header className="h-14 shrink-0 border-b border-border bg-surface flex items-center px-6 gap-3">
        <h1 className="text-[15px] font-semibold">Experiments</h1>
        <span className="text-[13px] text-muted-2">{rows.length} of {EXPERIMENTS.length}</span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm">Export</Button>
          <Button size="sm">New experiment</Button>
        </div>
      </header>

      <div className="px-6 py-3 border-b border-border flex items-center gap-2 flex-wrap bg-surface">
        {([["all", "All"], ["mine", "Needs me"], ["running", "Running"], ["decided", "Decided"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={cn("h-8 px-3 rounded-lg text-[13px] font-medium border transition-colors",
              filter === k ? "bg-foreground text-background border-foreground" : "bg-surface border-border text-muted hover:text-foreground hover:border-border-strong")}>
            {label} <span className="tabular-nums opacity-60">{counts[k]}</span>
          </button>
        ))}
        <div className="w-px h-5 bg-border mx-1" />
        <select value={site} onChange={(e) => setSite(e.target.value)}
          className="h-8 px-2.5 rounded-lg border border-border bg-surface text-[13px] text-muted focus:border-accent focus:outline-none">
          {["All sites", ...SITES].map((s) => <option key={s}>{s}</option>)}
        </select>
        <input placeholder="Search experiments…" className="h-8 px-3 rounded-lg border border-border bg-surface text-[13px] w-56 placeholder:text-muted-2 focus:border-accent focus:outline-none" />
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-surface-2/80 backdrop-blur">
            <tr className="text-left">
              {["Experiment", "Status", "Stage", "Primary metric", "Owner", "Updated"].map((h, i) => (
                <th key={h} className={cn("text-[11.5px] font-semibold tracking-[0.03em] text-muted-2 px-4 py-2.5 border-b border-border whitespace-nowrap", i === 0 && "pl-6")}>{h.toUpperCase()}</th>
              ))}
            </tr>
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

/* ────────────────────────────── detail ────────────────────────────── */

const Meta = ({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) => (
  <div className="flex items-baseline gap-3 py-2 border-b border-border last:border-0">
    <span className="text-[12.5px] text-muted-2 w-[104px] shrink-0">{k}</span>
    <span className={cn("text-[13px] min-w-0", mono && "font-mono text-[12px]")}>{v}</span>
  </div>
);

function DetailView({ e, back }: { e: Experiment; back: () => void }) {
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
            <Button variant="outline" size="sm">History</Button>
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

                {/* the rule: what you must read is inside what you must do */}
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

            <section className="rounded-xl border border-border bg-surface">
              <div className="px-5 py-3 border-b border-border text-[13.5px] font-semibold">History</div>
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
            </section>
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
              {e.guardrails.length ? (
                <ul className="space-y-1">{e.guardrails.map((g) => <li key={g} className="text-[13px] text-muted">{g}</li>)}</ul>
              ) : (
                <p className="text-[13px] text-warn">None set — the brief can&rsquo;t be completed without at least one.</p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

/* ────────────────────────────── page ────────────────────────────── */

export default function Console() {
  const [nav, setNav] = useState("Experiments");
  const [openId, setOpenId] = useState<string | null>(null);
  const current = EXPERIMENTS.find((e) => e.id === openId) ?? null;

  return (
    <div className="fixed inset-0 z-50 bg-background flex" data-console>
      <Nav active={nav} go={(s) => { setNav(s); setOpenId(null); }} />
      <main className="flex-1 min-w-0 flex flex-col">
        {nav === "Experiments" && !current && <ListView open={setOpenId} />}
        {nav === "Experiments" && current && <DetailView e={current} back={() => setOpenId(null)} />}
        {nav !== "Experiments" && (
          <div className="flex-1 grid place-items-center">
            <div className="text-center max-w-sm">
              <h1 className="text-[17px] font-semibold mb-1.5">{nav}</h1>
              <p className="text-[14px] text-muted">Not built in this mock. Experiments is the slice worth judging first.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
