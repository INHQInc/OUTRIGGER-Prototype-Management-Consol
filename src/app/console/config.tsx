"use client";

/** The CONFIGURE surfaces. Eight of the nine use cases the operator listed are
 *  setup, so these are not an afterthought behind a Settings gear — they are
 *  first-class rooms with the same grammar as the work surfaces. */

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";
import { AB_TOOLS, OTHER_CONNECTIONS, SITE_ROWS, type Connection, type Site } from "@/lib/console/fake";
import { Empty, Meta, PageHeader, Pill, Section, Th, Toolbar } from "./ui";
import { SkillsPanel } from "./skills";
import { SiteProfile, UnderstandingPill } from "./customer-context";

const scriptPill = (s: Site["envs"][number]) =>
  s.script === "verified" ? <Pill tone="ok">Installed</Pill>
  : s.script === "checking" ? <Pill tone="muted">Checking…</Pill>
  : <Pill tone="warn">Not found</Pill>;

/* ── Sites ─────────────────────────────────────────────────────────── */

export function SitesView({ open, onAdd, rows = SITE_ROWS }: { open: (id: string) => void; onAdd?: () => void; rows?: Site[] }) {
  return (
    <>
      <PageHeader title="Sites" count={`${rows.length} site${rows.length === 1 ? "" : "s"}`} actions={<Button size="sm" onClick={onAdd}>Add a site</Button>} />
      <Toolbar>
        <span className="text-[13px] text-muted">
          A customer can have any number of sites, and each site has its own environments and its own source code.
        </span>
      </Toolbar>
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-surface-2/80 backdrop-blur">
            <tr><Th first>Site</Th><Th>Environments</Th><Th>Script</Th><Th>Source code</Th><Th>Understanding</Th><Th>Experiments</Th></tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const missing = s.envs.filter((e) => e.script === "missing").length;
              return (
                <tr key={s.id} onClick={() => open(s.id)} className="cursor-pointer hover:bg-surface-2/60 border-b border-border">
                  <td className="px-4 pl-6 py-3">
                    <div className="text-[14px] font-medium">{s.domain}</div>
                    <div className="text-[12.5px] text-muted-2 mt-0.5">{s.label}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {s.envs.map((e) => (
                        <span key={e.label} className={cn("text-[11.5px] rounded px-1.5 py-0.5 border", e.isProduction ? "border-border-strong text-foreground font-semibold" : "border-border text-muted")}>
                          {e.label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">{!s.envs.length ? <Pill tone="muted">No environments yet</Pill> : missing ? <Pill tone="warn">{missing} missing</Pill> : <Pill tone="ok">All installed</Pill>}</td>
                  <td className="px-4 py-3 text-[13px] text-muted">{s.repo ? <span className="font-mono text-[12px]">{s.repo}</span> : <Pill tone="warn">Not connected</Pill>}</td>
                  <td className="px-4 py-3"><UnderstandingPill id={s.id} /></td>
                  <td className="px-4 py-3 text-[13px] text-muted tabular-nums">{s.experiments}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function SiteDetail({ s, back, understand }: { s: Site; back: () => void; understand: (id: string) => void }) {
  return (
    <>
      <header className="shrink-0 border-b border-border bg-surface px-6 pt-3 pb-4">
        <button onClick={back} className="text-[12.5px] text-muted-2 hover:text-foreground mb-1.5">Sites</button>
        <div className="flex items-start gap-3">
          <div>
            <h1 className="text-[19px] font-semibold tracking-[-0.01em]">{s.domain}</h1>
            <div className="text-[13px] text-muted-2 mt-1">{s.label} · {s.experiments} experiments</div>
          </div>
          <div className="ml-auto flex gap-2">
            <Button size="sm">Add an environment</Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-4">
        <Section title="Environments" action={<span className="text-[12.5px] text-muted-2">Call them whatever you call them. Only “is production” changes what Prism allows.</span>}>
          <table className="w-full border-collapse">
            <thead><tr><Th first>Environment</Th><Th>Address</Th><Th>Prism script</Th><Th>Last seen</Th></tr></thead>
            <tbody>
              {s.envs.map((e) => (
                <tr key={e.label} className="border-b border-border last:border-0">
                  <td className="px-4 pl-6 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-medium">{e.label}</span>
                      {e.isProduction && <Pill tone="accent">Production</Pill>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-muted font-mono">{e.url}</td>
                  <td className="px-4 py-3">{scriptPill(e)}</td>
                  <td className="px-4 py-3 text-[13px] text-muted-2">
                    {e.lastSeen ?? <button className="text-accent font-medium">Send install instructions →</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <div className="flex gap-4 items-start">
          <Section title="Source code" className="flex-1">
            <div className="p-5">
              {s.repo ? (
                <>
                  <Meta k="Repository" v={s.repo} mono />
                  <Meta k="Branch prefix" v={s.branchPrefix} mono />
                  <Meta k="Artifact" v="dist/variation.js" mono />
                  <p className="text-[13px] text-muted-2 mt-3">Each site can live in its own repository. Prototypes for this site are branches here.</p>
                </>
              ) : (
                <div className="text-center py-4">
                  <p className="text-[14px] text-muted mb-3">No repository connected. Prism can still measure this site, but it can&rsquo;t build anything for it.</p>
                  <Button size="sm" variant="outline">Connect a repository</Button>
                </div>
              )}
            </div>
          </Section>

        </div>

        <SiteProfile s={s} onRead={() => understand(s.id)} />
      </div>
    </>
  );
}

/* ── Connections ───────────────────────────────────────────────────── */

function ConnRow({ c }: { c: Connection }) {
  const dim = c.state === "unavailable";
  return (
    <div className={cn("flex items-center gap-4 px-5 py-3.5 border-b border-border last:border-0", dim && "opacity-55")}>
      <div className="w-9 h-9 rounded-lg border border-border bg-surface-2 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-medium">{c.name}</span>
          {c.note && <span className="text-[11px] text-muted-2 border border-border rounded px-1.5 py-0.5">{c.note}</span>}
        </div>
        <div className="text-[12.5px] text-muted-2 mt-0.5">{c.detail}</div>
      </div>
      {c.state === "connected" ? <Pill tone="ok">Connected</Pill> : c.state === "available" ? <Button size="sm" variant="outline">Connect</Button> : <Pill tone="muted">Coming soon</Pill>}
    </div>
  );
}

export function ConnectionsView() {
  return (
    <>
      <PageHeader title="Connections" actions={<Button size="sm" variant="outline">Test all</Button>} />
      <div className="flex-1 overflow-auto p-6 space-y-4">
        <Section title="A/B testing tool" action={<span className="text-[12.5px] text-muted-2">Bring your own. One per customer.</span>}>
          {AB_TOOLS.map((c) => <ConnRow key={c.id} c={c} />)}
        </Section>
        <Section title="Everything else">
          {OTHER_CONNECTIONS.map((c) => <ConnRow key={c.id} c={c} />)}
        </Section>
        <p className="text-[12.5px] text-muted-2 px-1">
          Keys are yours. Prism stores them for this customer only and never shares them between customers.
        </p>
        <SkillsPanel />
      </div>
    </>
  );
}

/* ── People & roles ────────────────────────────────────────────────── */

const PEOPLE = [
  { name: "Bryan Hopkins", email: "bryan@outrigger.com", roles: ["Author", "Approver", "Admin"] },
  { name: "Dana Kealoha", email: "dana@outrigger.com", roles: ["Reviewer", "Approver"] },
  { name: "Malia Kahale", email: "malia@outrigger.com", roles: ["Author"] },
  { name: "Kai Nakamura", email: "kai@outrigger.com", roles: ["Author"] },
  { name: "Prism Agent", email: "agent · not a person", roles: ["Builder"] },
];

export function PeopleView() {
  const approvers = PEOPLE.filter((p) => p.roles.includes("Approver")).length;
  return (
    <>
      <PageHeader title="People & roles" count={`${PEOPLE.length} people`} actions={<Button size="sm">Invite someone</Button>} />
      <div className="flex-1 overflow-auto p-6 space-y-4">
        <Section>
          {PEOPLE.map((p) => (
            <div key={p.email} className="flex items-center gap-4 px-5 py-3.5 border-b border-border last:border-0">
              <div className="w-8 h-8 rounded-full bg-border-strong shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium">{p.name}</div>
                <div className="text-[12.5px] text-muted-2">{p.email}</div>
              </div>
              <div className="flex gap-1.5">
                {p.roles.map((r) => <span key={r} className="text-[12px] text-muted bg-surface-2 rounded px-2 py-0.5">{r}</span>)}
              </div>
              <button className="text-[13px] text-accent font-medium w-16 text-right">Change</button>
            </div>
          ))}
        </Section>

        <Section title="Approval">
          <div className="p-5 flex items-start gap-5">
            <div className="flex-1">
              <div className="text-[14.5px] font-semibold mb-1">Require a second person to approve</div>
              <p className="text-[13.5px] text-muted leading-relaxed">
                Whoever wrote or built an experiment can&rsquo;t be the one who approves it going live, or who records the result.
              </p>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                <Pill tone="ok">On</Pill>
                <span className="text-[13px] text-muted">
                  {approvers} people can approve — enough for this to work.
                </span>
              </div>
            </div>
            <div className="w-11 h-6 rounded-full bg-ok relative shrink-0 mt-1">
              <span className="absolute right-[3px] top-[3px] w-[18px] h-[18px] rounded-full bg-white" />
            </div>
          </div>
        </Section>
        <p className="text-[12.5px] text-muted-2 px-1">Turning this off is recorded in Activity, with who and when.</p>
      </div>
    </>
  );
}

/* ── Guardrails ────────────────────────────────────────────────────── */

const GUARDRAILS = [
  { name: "Bookings", why: "The number that pays for everything.", on: true },
  { name: "Revenue per visit", why: "Catches a win that sells cheaper rooms.", on: true },
  { name: "Page errors", why: "Catches a build that broke something.", on: true },
  { name: "Cancellation rate", why: "Catches a win that over-promises.", on: false },
  { name: "Bounce rate", why: "Catches a change that drives people away.", on: false },
];

export function GuardrailsView() {
  return (
    <>
      <PageHeader title="Guardrails" actions={<Button size="sm" variant="outline">Add a guardrail</Button>} />
      <Toolbar>
        <span className="text-[13px] text-muted">
          What must never get worse, whatever an experiment is trying to improve. These are offered on every new experiment, already ticked.
        </span>
      </Toolbar>
      <div className="flex-1 overflow-auto p-6">
        <Section>
          {GUARDRAILS.map((g) => (
            <div key={g.name} className="flex items-center gap-4 px-5 py-3.5 border-b border-border last:border-0">
              <span className={cn("w-4 h-4 rounded border grid place-items-center shrink-0", g.on ? "bg-accent border-accent text-accent-fg" : "border-border-strong")}>
                {g.on && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
              </span>
              <div className="flex-1">
                <div className="text-[14px] font-medium">{g.name}</div>
                <div className="text-[12.5px] text-muted-2 mt-0.5">{g.why}</div>
              </div>
              {g.on && <Pill tone="muted">On by default</Pill>}
            </div>
          ))}
        </Section>
      </div>
    </>
  );
}

/* ── Activity ──────────────────────────────────────────────────────── */

const ACTIVITY = [
  { at: "Today, 14:02", who: "Bryan Hopkins", what: "Recorded a decision on Rate-calendar best-price promise — it won.", sealed: true },
  { at: "Today, 09:15", who: "Prism Agent", what: "Pushed a build to Kona package ribbon.", sealed: true },
  { at: "Yesterday, 16:40", who: "Dana Kealoha", what: "Sent Hero without the offer badge back with a note." },
  { at: "Yesterday, 11:02", who: "Bryan Hopkins", what: "Invited kai@outrigger.com as an Author." },
  { at: "8 Sep, 06:00", who: "Prism", what: "Run 4 closed on Rate-calendar best-price promise." },
  { at: "6 Sep, 10:22", who: "Bryan Hopkins", what: "Connected Optimizely project 24138040550." },
];

export function ActivityView() {
  return (
    <>
      <PageHeader title="Activity" actions={<Button size="sm" variant="outline">Export</Button>} />
      <Toolbar>
        <span className="text-[13px] text-muted">Everything anyone did, including Prism. Nothing here can be edited or removed.</span>
      </Toolbar>
      <div className="flex-1 overflow-auto p-6">
        <Section>
          {ACTIVITY.map((a, i) => (
            <div key={i} className="flex gap-4 px-5 py-3.5 border-b border-border last:border-0">
              <div className="w-[110px] shrink-0 text-[12.5px] text-muted-2">{a.at}</div>
              <div className="flex-1">
                <div className="text-[13.5px]"><span className="font-medium">{a.who}</span></div>
                <div className="text-[13.5px] text-muted mt-0.5">{a.what}</div>
              </div>
              {a.sealed && (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-muted-2 shrink-0 mt-1"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
              )}
            </div>
          ))}
        </Section>
      </div>
    </>
  );
}

export { Empty };
