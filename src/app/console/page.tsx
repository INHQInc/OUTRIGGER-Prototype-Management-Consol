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

import { useState } from "react";
import { cn } from "@/lib/ui/cn";
import { EXPERIMENTS, ME, SITE_ROWS, needsMe } from "@/lib/console/fake";
import { ActivityView, ConnectionsView, GuardrailsView, PeopleView, SiteDetail, SitesView } from "./config";
import { ExperimentDetail, ExperimentsView, IdeasView, OverviewView, ReadoutsView } from "./work";
import { NewExperiment } from "./new-experiment";
import { CustomerOnboarding, SiteOnboarding } from "./onboarding";
import { BackOffice, SupportBanner } from "./operator";
import { VerdictPicker } from "./verdict";

const NAV = [
  {
    group: null, items: [
      ["Overview", "M3 12h4l3 8 4-16 3 8h4"],
      ["Experiments", "M3 5h18M3 12h18M3 19h12"],
      ["Ideas", "M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"],
      ["Readouts", "M4 4h16v12H4zM8 9h8M8 12h5"],
    ] as const,
  },
  {
    group: "CONFIGURE", items: [
      ["Sites", "M2 12h20M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20"],
      ["Connections", "M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8"],
      ["People & roles", "M16 20v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8"],
      ["Guardrails", "M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6z"],
      ["Activity", "M3 12h4l3 8 4-16 3 8h4"],
    ] as const,
  },
  {
    group: "DEMO", items: [
      ["All verdict states", "M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20M12 8v4l3 2"],
    ] as const,
  },
];

const COUNT: Record<string, number | undefined> = {
  Experiments: EXPERIMENTS.length,
  Sites: SITE_ROWS.length,
};

export default function Console() {
  const [nav, setNav] = useState("Overview");
  const [expId, setExpId] = useState<string | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [flow, setFlow] = useState<null | "customer" | "site">(null);
  const [backOffice, setBackOffice] = useState(false);
  const [support, setSupport] = useState<{ customer: string; reason: string } | null>(null);

  const exp = EXPERIMENTS.find((e) => e.id === expId) ?? null;
  const site = SITE_ROWS.find((s) => s.id === siteId) ?? null;
  const waiting = EXPERIMENTS.filter(needsMe).length;

  const go = (s: string) => { setNav(s); setExpId(null); setSiteId(null); setCreating(false); setFlow(null); };
  const openExp = (id: string) => { setNav("Experiments"); setExpId(id); };

  if (backOffice) {
    return <BackOffice exit={() => setBackOffice(false)}
      enterCustomer={(customer, reason) => { setSupport({ customer, reason }); setBackOffice(false); }} />;
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col" data-console>
      {support && <SupportBanner customer={support.customer} reason={support.reason} end={() => { setSupport(null); setBackOffice(true); }} />}
      <div className="flex-1 min-h-0 flex">
      <nav className="w-[244px] shrink-0 border-r border-border bg-surface flex flex-col">
        <div className="h-14 flex items-center gap-2.5 px-4 border-b border-border">
          <div className="w-[22px] h-[22px] rounded-md bg-accent" />
          <span className="text-[14px] font-semibold tracking-[-0.01em]">Prism</span>
        </div>

        <button onClick={() => setFlow("customer")} title="Add a customer"
          className="mx-3 mt-3 mb-1 flex items-center gap-2.5 rounded-lg border border-border px-2.5 py-2 hover:border-border-strong text-left">
          <div className="w-[18px] h-[18px] rounded bg-border-strong shrink-0" />
          <span className="text-[13px] font-medium flex-1 truncate">OUTRIGGER Hotels</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-muted-2"><path d="m6 9 6 6 6-6" /></svg>
        </button>

        <div className="flex-1 overflow-y-auto px-3 pt-2">
          {NAV.map((sec, si) => (
            <div key={si} className={sec.group ? "mt-5" : ""}>
              {sec.group && <div className="px-2.5 pb-1.5 text-[10.5px] font-semibold tracking-[0.08em] text-muted-2">{sec.group}</div>}
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
                    {COUNT[label] !== undefined && <span className="ml-auto text-[11px] font-semibold text-muted-2 tabular-nums">{COUNT[label]}</span>}
                  </button>
                );
              })}
            </div>
          ))}
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
        {flow === "customer" && <CustomerOnboarding onClose={() => setFlow(null)} onDone={() => { setFlow("site"); }} />}
        {flow === "site" && <SiteOnboarding onClose={() => setFlow(null)} onDone={() => { setFlow(null); go("Sites"); }} />}
        {!flow && nav === "Overview" && <OverviewView open={openExp} />}
        {!flow && nav === "Experiments" && (
          creating ? <NewExperiment cancel={() => setCreating(false)} done={() => { setCreating(false); setExpId("room-compare"); }} />
          : exp ? <ExperimentDetail e={exp} back={() => setExpId(null)} />
          : <ExperimentsView open={setExpId} onNew={() => setCreating(true)} />
        )}
        {!flow && nav === "Ideas" && <IdeasView />}
        {!flow && nav === "Readouts" && <ReadoutsView />}
        {!flow && nav === "Sites" && (site ? <SiteDetail s={site} back={() => setSiteId(null)} /> : <SitesView open={setSiteId} onAdd={() => setFlow("site")} />)}
        {!flow && nav === "Connections" && <ConnectionsView />}
        {!flow && nav === "People & roles" && <PeopleView />}
        {!flow && nav === "Guardrails" && <GuardrailsView />}
        {!flow && nav === "Activity" && <ActivityView />}
        {!flow && nav === "All verdict states" && <VerdictPicker />}
      </main>
      </div>
    </div>
  );
}
