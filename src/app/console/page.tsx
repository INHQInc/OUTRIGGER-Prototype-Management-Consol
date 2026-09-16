"use client";

/**
 * CONSOLE — enterprise UX mock on fake data. Dev-only route.
 *
 * Persistent left navigation, real tables, detail pages with a metadata rail.
 * Conventional on purpose: enterprise users scan and look things up, and a
 * discoverable shell is a feature.
 *
 * Two rules the whole thing is built on:
 *  · one grammar — every screen is assembled from ui.tsx, so a new surface
 *    cannot invent a second visual language;
 *  · THE THING YOU MUST READ BELONGS INSIDE THE THING YOU MUST DO — the frozen
 *    hypothesis sits in the same card as the buttons that adjudicate it.
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";
import { EXPERIMENTS, ME, SITE_ROWS, needsMe, type Site } from "@/lib/console/fake";
import { ThemeScope } from "@/components/ui/theme-scope";
import { Archived, ArchivedBanner, EndOfLife, type AccountState, type Holdings } from "./lifecycle";
import { PageHeader as RoomHeader } from "./ui";
import { Empty, PageHeader } from "./ui";
import { ActivityView, ConnectionsView, GuardrailsView, PeopleView, SiteDetail, rememberSite } from "./config";
import { SiteProfile } from "./customer-context";
import { ExperimentDetail, ExperimentsView, IdeasView, OverviewView, ReadoutsView } from "./work";
import { NewExperiment } from "./new-experiment";
import { UnderstandSite, UnderstandingPill, markRead } from "./customer-context";
import { SiteOnboarding } from "./onboarding";
import { BackOffice, CUSTOMERS, SupportBanner } from "./operator";
import { VerdictPicker } from "./verdict";

/** A GROUP NAMES A SCOPE, not a verb. "Configure" held six things with nothing in
 *  common — one site's setup, account integrations, people, experiment defaults, an
 *  audit record and account lifecycle — and gave no way to tell which of them followed
 *  the site you had just chosen. Exactly one did. Now the header says whose settings
 *  these are, and Activity sits with the things you READ rather than the things you set. */
const NAV = [
  {
    group: null, items: [
      ["Overview", "M3 12h4l3 8 4-16 3 8h4"],
      ["Experiments", "M3 5h18M3 12h18M3 19h12"],
      ["Ideas", "M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"],
      ["Readouts", "M4 4h16v12H4zM8 9h8M8 12h5"],
      ["Activity", "M3 12h4l3 8 4-16 3 8h4"],
    ] as const,
  },
  {
    /** Replaced at render with the chosen site's domain; absent when none is chosen. */
    group: "SITE", items: [
      ["Setup", "M2 12h20M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20"],
      ["Understanding", "M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2zM9 21h6"],
    ] as const,
  },
  {
    group: "ACCOUNT", items: [
      ["Connections", "M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8"],
      ["People & roles", "M16 20v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8"],
      ["Guardrails", "M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6z"],
      ["Account", "M3 21h18M5 21V8l7-5 7 5v13M10 21v-6h4v6"],
    ] as const,
  },
  {
    group: "DEMO", items: [
      ["All verdict states", "M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20M12 8v4l3 2"],
    ] as const,
  },
];

/** A customer created this session has nothing but the sites its wizard named. */
const FreshEmpty = ({ title, pick }: { title: string; pick: () => void }) => (
  <>
    <PageHeader title={title} />
    <Empty title="Nothing here yet" body="This starts once a site has been read and understood — that's the first thing to do for a new account. Pick a site at the top of the sidebar."
      action={<Button onClick={pick}>Pick a site</Button>} />
  </>
);

export default function Console() {
  const scope = useRef<HTMLDivElement>(null);
  const [nav, setNav] = useState("Overview");
  const [expId, setExpId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [flow, setFlow] = useState<null | "site">(null);
  const [switcher, setSwitcher] = useState(false);
  /** The site the console is scoped to; null is every site. Set by the site selector, never by an account. */
  const [siteFilter, setSiteFilter] = useState<string | null>(null);
  /** The site being read / asked / corrected right now, if any. */
  const [understanding, setUnderstanding] = useState<string | null>(null);
  /** Ending an account (lifecycle.tsx). Archived is readable and unwritable. */
  const [accountState, setAccountState] = useState<AccountState>("active");
  const [archivedOn, setArchivedOn] = useState<string | undefined>();
  const [stoppedByArchive, setStoppedByArchive] = useState(0);
  const [backOffice, setBackOffice] = useState(false);
  const [support, setSupport] = useState<{ customer: string; reason: string } | null>(null);
  /** A customer created in this session is the only one whose setup is unfinished. */
  const [fresh, setFresh] = useState(false);
  const [freshSites, setFreshSites] = useState<string[]>([]);
  /** Sites added this session through Add a site. */
  const [sessionSites, setSessionSites] = useState<Site[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    const on = (ev: Event) => { setToast((ev as CustomEvent<string>).detail); };
    window.addEventListener("mock-not-built", on);
    return () => window.removeEventListener("mock-not-built", on);
  }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t); }, [toast]);
  // `console:go` — any panel can ask for a room or an experiment: {nav} or {expId}. Stages are handled by ExperimentDetail.
  useEffect(() => {
    const on = (ev: Event) => {
      const d = (ev as CustomEvent<{ nav?: string; expId?: string }>).detail;
      if (d?.expId) { setNav("Experiments"); setExpId(d.expId); setCreating(false); setFlow(null); setUnderstanding(null); }
      else if (d?.nav) { setNav(d.nav); setExpId(null); setCreating(false); setFlow(null); setUnderstanding(null); }
    };
    window.addEventListener("console:go", on);
    return () => window.removeEventListener("console:go", on);
  }, []);

  const exp = EXPERIMENTS.find((e) => e.id === expId) ?? null;
  // ONE ROW PER DOMAIN. The fixture keys sites by slug ("outrigger") and both wizards
  // key them by hostname, so filtering by id left two rows claiming outrigger.com —
  // one set up, one not. A site added this session replaces the one it names.
  const baseRows: Site[] = fresh ? freshSites.map((d) => ({ id: d, domain: d, label: "Not set up yet", experiments: 0, envs: [] })) : SITE_ROWS;
  const rows: Site[] = [...baseRows.filter((b) => !sessionSites.some((x) => x.domain === b.domain)), ...sessionSites];
  const learning = rows.find((s) => s.id === understanding) ?? null;
  /** Whose console this is — the support session's account, or the signed-in account. */
  const account = support?.customer ?? CUSTOMERS[0].name;
  const scoped = fresh ? [] : EXPERIMENTS.filter((e) => !siteFilter || e.site === (rows.find((r) => r.id === siteFilter)?.domain ?? siteFilter));
  const waiting = scoped.filter(needsMe).length;
  const count: Record<string, number | undefined> = { Experiments: scoped.length };
  const picked = siteFilter ? rows.find((r) => r.id === siteFilter) ?? null : null;
  /** Counted from state, never stored — the same rule the setup checklist follows. */
  const holdings: Holdings = {
    name: account,
    live: accountState === "archived" ? 0 : EXPERIMENTS.filter((e) => e.status === "running").length,
    inFlight: EXPERIMENTS.filter((e) => e.status === "building" || e.status === "review" || e.status === "drafting").length,
    beaconing: rows.flatMap((r) => r.envs.filter((e) => e.script === "verified").map((e) => ({ env: e.label, url: e.url }))),
    decisions: EXPERIMENTS.filter((e) => e.status === "shipped" || e.status === "decide").length,
    sharedLinks: 6,
    branches: EXPERIMENTS.length,
    people: 5,
    archivedOn,
  };

  const go = (s: string) => { setNav(s); setExpId(null); setCreating(false); setFlow(null); setUnderstanding(null); };
  /** Choosing a site scopes the console; the site's own setup lives under CONFIGURE while it is chosen. */
  const pickSite = (id: string | null) => { setSiteFilter(id); setSwitcher(false); setUnderstanding(null); if (!id && (nav === "Setup" || nav === "Understanding")) go("Overview"); };
  const openExp = (id: string) => { setNav("Experiments"); setExpId(id); };

  if (backOffice) {
    return <BackOffice exit={() => setBackOffice(false)}
      enterCustomer={(customer, reason, fresh, sites) => { setSupport({ customer, reason }); setFresh(Boolean(fresh)); setFreshSites(sites ?? []); setBackOffice(false); go("Overview"); }} />;
  }

  return (
    <ThemeScope.Provider value={scope}>
    <Archived.Provider value={accountState === "archived"}>
    <div ref={scope} className="fixed inset-0 z-50 bg-background flex flex-col" data-console>
      {support && <SupportBanner customer={support.customer} reason={support.reason} end={() => { setSupport(null); setBackOffice(true); }} />}
      {accountState === "archived" && archivedOn && (
        <ArchivedBanner on={archivedOn} onUnarchive={() => { setAccountState("active"); setArchivedOn(undefined); setFresh(true); }} />
      )}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[70] rounded-lg border border-border bg-surface px-4 py-2.5 text-[13px] shadow-lg">
          <span className="font-semibold">&ldquo;{toast}&rdquo;</span> <span className="text-muted">isn&rsquo;t built in this mock yet.</span>
        </div>
      )}
      <div className="flex-1 min-h-0 flex">
      <nav className="w-[244px] shrink-0 border-r border-border bg-surface flex flex-col">
        <div className="h-14 flex items-center gap-2.5 px-4 border-b border-border">
          <div className="w-[22px] h-[22px] rounded-md bg-accent" />
          <span className="text-[14px] font-semibold tracking-[-0.01em]">Prism</span>
        </div>

        {/* Signed in, you belong to ONE account — so this picks a SITE, never an
            account. Other accounts are reachable only through the back office,
            which loads you into one with its sites (a support session). */}
        <div className="relative mx-3 mt-3 mb-1">
          <div className="px-1 pb-1 text-[11px] text-muted-2 truncate">{account}</div>
          <button onClick={() => setSwitcher((v) => !v)} aria-haspopup="listbox" aria-expanded={switcher} title="Choose a site"
            className="w-full flex items-center gap-2.5 rounded-lg border border-border px-2.5 py-2 hover:border-border-strong text-left">
            <div className="w-[18px] h-[18px] rounded bg-border-strong shrink-0" />
            <span className="text-[13px] font-medium flex-1 truncate">{siteFilter ? (rows.find((r) => r.id === siteFilter)?.domain ?? siteFilter) : "All sites"}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-muted-2"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          {switcher && (
            <div role="listbox" className="absolute left-0 right-0 top-full mt-1 z-20 rounded-lg border border-border bg-surface shadow-lg py-1">
              <button role="option" aria-selected={siteFilter === null} onClick={() => pickSite(null)}
                className={cn("w-full text-left px-3 py-1.5 text-[13px] hover:bg-surface-2", siteFilter === null ? "font-semibold" : "text-muted")}>All sites</button>
              {rows.map((r) => (
                <button key={r.id} role="option" aria-selected={siteFilter === r.id} onClick={() => pickSite(r.id)}
                  className={cn("w-full text-left px-3 py-1.5 hover:bg-surface-2", siteFilter === r.id ? "font-semibold" : "text-muted")}>
                  <span className="block text-[13px] truncate">{r.domain}</span>
                  <span className="flex items-center gap-2 mt-0.5 font-normal">
                    <span className="text-[11.5px] text-muted-2 truncate min-w-0 flex-1">{r.label}</span>
                    <UnderstandingPill id={r.id} />
                  </span>
                </button>
              ))}
              <div className="border-t border-border mt-1 pt-1">
                <button onClick={() => { setSwitcher(false); go("Overview"); setFlow("site"); }} className="w-full text-left px-3 py-1.5 text-[12.5px] text-muted hover:text-foreground hover:bg-surface-2">+ Add a site</button>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-3 pt-2">
          {NAV.map((sec, si) => {
            // The site group only exists while a site is chosen — and it is titled with
            // the domain, so what follows it is unambiguously that site's.
            if (sec.group === "SITE" && !picked) return null;
            return (
            <div key={si} className={sec.group ? "mt-5" : ""}>
              {sec.group && (
                <div className="px-2.5 pb-1.5 text-[10.5px] font-semibold tracking-[0.08em] text-muted-2 truncate">
                  {sec.group === "SITE" ? picked?.domain.toUpperCase() : sec.group}
                </div>
              )}
              {sec.items.map(([label, d]) => {
                const on = label === nav;
                return (
                  <button key={label} onClick={() => go(label)}
                    className={cn("w-full flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] mb-0.5 text-left transition-colors",
                      on ? "bg-accent/10 text-accent" : "text-muted hover:bg-surface-2 hover:text-foreground")}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
                    <span className={cn("text-[13.5px]", on ? "font-semibold" : "font-normal")}>{label}</span>
                    {label === "Overview" && waiting > 0 && (
                      <span className="ml-auto text-[11px] font-bold text-accent-fg bg-accent rounded-full px-1.5 tabular-nums">{waiting}</span>
                    )}
                    {count[label] !== undefined && <span className="ml-auto text-[11px] font-semibold text-muted-2 tabular-nums">{count[label]}</span>}
                    {/* No understanding dot here. That fact now has three homes —
                        the selector row's pill, the readiness step on Overview, and
                        the Understanding room itself — and this was the only one of
                        the four that was a colour with no sentence: a status you
                        cannot act on from where you see it (§6). */}
                  </button>
                );
              })}
            </div>
            );
          })}
        </div>

        <button onClick={() => setBackOffice(true)}
          className="mx-3 mb-1 rounded-lg border border-border px-2.5 py-1.5 text-[12.5px] text-muted hover:text-foreground hover:border-border-strong text-left">
          Back office →
        </button>
        <div className="border-t border-border px-4 py-3 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-border-strong grid place-items-center text-[11px] font-semibold text-muted">{ME.initials}</div>
          <div className="min-w-0">
            <div className="text-[12.5px] font-medium truncate">{ME.name}</div>
            <div className="text-[11.5px] text-muted-2">{ME.role}</div>
          </div>
        </div>
      </nav>

      <main className="flex-1 min-w-0 flex flex-col">
        {flow === "site" && (
          <SiteOnboarding
            // The site is real from step 1, so everything that makes it real
            // fires there — not in a finish handler that leaving would skip.
            onCreate={(site) => { markRead(site.id); rememberSite(site); setSessionSites((ss) => [...ss.filter((x) => x.domain !== site.domain), site]); setSiteFilter(site.id); }}
            // Leaving lands on the READ, not on a restatement of what is missing:
            // markRead set `unseen`, so the receipt plays, and the first thing the
            // product shows about a new site is that it has already read it.
            onLeave={() => { setFlow(null); setNav("Understanding"); }} />
        )}
        {!flow && nav === "Overview" && <OverviewView open={openExp} rows={scoped} sites={rows} picked={siteFilter}
              onFix={(id, room) => { setSiteFilter(id); setNav(room); }} />}
        {!flow && nav === "Experiments" && fresh && <FreshEmpty title="Experiments" pick={() => setSwitcher(true)} />}
        {!flow && nav === "Ideas" && fresh && <FreshEmpty title="Ideas" pick={() => setSwitcher(true)} />}
        {!flow && nav === "Readouts" && fresh && <FreshEmpty title="Readouts" pick={() => setSwitcher(true)} />}
        {!flow && nav === "Experiments" && !fresh && (
          creating ? <NewExperiment sites={rows} cancel={() => setCreating(false)} done={() => { setCreating(false); setExpId("room-compare"); }} />
          : exp ? <ExperimentDetail e={exp} back={() => setExpId(null)} />
          : <ExperimentsView open={setExpId} onNew={() => setCreating(true)} all={scoped} />
        )}
        {!flow && nav === "Ideas" && !fresh && <IdeasView promote={() => openExp("room-compare")} write={() => { setNav("Experiments"); setCreating(true); }} />}
        {!flow && nav === "Readouts" && !fresh && <ReadoutsView rows={scoped} />}
        {!flow && nav === "Setup" && (picked
          ? <SiteDetail s={picked} onRemoved={(site) => {
              setSessionSites((ss) => ss.filter((x) => x.domain !== site.domain));
              setSiteFilter(null); setNav("Overview");
            }} />
          : <FreshEmpty title="Setup" pick={() => setSwitcher(true)} />)}
        {!flow && nav === "Understanding" && (
          learning ? (
            <UnderstandSite key={learning.id} site={learning} others={rows.filter((s) => s.id !== learning.id)}
              onClose={() => setUnderstanding(null)} onDone={() => { setSiteFilter(learning.id); setUnderstanding(null); }}
              onAnother={(id) => { if (id) { setSiteFilter(id); setUnderstanding(id); } else { setUnderstanding(null); setFlow("site"); } }} />
          ) : picked ? (
            <>
              <RoomHeader title="Understanding" count={picked.domain} />
              <div className="flex-1 overflow-auto p-6 space-y-4">
                <SiteProfile s={picked} onRead={() => setUnderstanding(picked.id)} room />
              </div>
            </>
          ) : <FreshEmpty title="Understanding" pick={() => setSwitcher(true)} />
        )}
        {!flow && nav === "Connections" && <ConnectionsView />}
        {!flow && nav === "People & roles" && <PeopleView />}
        {!flow && nav === "Guardrails" && <GuardrailsView />}
        {!flow && nav === "Activity" && <ActivityView />}
        {!flow && nav === "Account" && (
          <>
            <RoomHeader title="Account" count={account} />
            <div className="flex-1 overflow-auto p-6 space-y-4">
              {stoppedByArchive > 0 && accountState === "archived" && (
                <div className="rounded-xl border border-warn/40 bg-warn/[0.06] px-4 py-3 text-[13px] leading-relaxed">
                  <span className="font-semibold text-warn">{stoppedByArchive} run{stoppedByArchive === 1 ? " was" : "s were"} stopped when this was archived.</span>{" "}
                  <span className="text-muted">
                    Each one is recorded as stopped because the account was archived — not as refuted. Nothing was disproved, so nothing was written into what this account has learned.
                  </span>
                </div>
              )}
              <EndOfLife h={holdings} state={accountState}
                onArchive={(stopped) => { setAccountState("archived"); setArchivedOn("11 Sep 2026"); setStoppedByArchive(stopped); }}
                onUnarchive={() => { setAccountState("active"); setArchivedOn(undefined); setFresh(true); }}
                onDelete={() => { setAccountState("active"); setArchivedOn(undefined); setBackOffice(true); setSupport(null); }} />
            </div>
          </>
        )}
        {!flow && nav === "All verdict states" && <VerdictPicker />}
      </main>
      </div>
    </div>
    </Archived.Provider>
    </ThemeScope.Provider>
  );
}
