"use client";

/** The five stage panels inside one experiment. The rail is navigable, so you
 *  can read the brief while a run is live — but only the CURRENT stage carries
 *  an action, and stages ahead say plainly what has to happen first. */

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";
import { STAGES, type Experiment, type Stage } from "@/lib/console/fake";
import { Meta, Pill, Section } from "./ui";

const Lock = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
    <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

const Frozen = ({ children }: { children: React.ReactNode }) => (
  <div className="inline-flex items-center gap-1.5 rounded border border-border bg-surface-2/60 px-2 py-1 font-mono text-[11px] text-muted-2">
    <Lock />{children}
  </div>
);

/** A stage the experiment has not reached: say what unlocks it, never grey it out silently. */
const NotYet = ({ what, needs }: { what: string; needs: string }) => (
  <Section>
    <div className="px-5 py-10 text-center">
      <h3 className="text-[15px] font-semibold mb-1.5">{what}</h3>
      <p className="text-[14px] text-muted max-w-md mx-auto leading-relaxed">{needs}</p>
    </div>
  </Section>
);

/* ── Brief ─────────────────────────────────────────────────────────── */

export function BriefPanel({ e }: { e: Experiment }) {
  const frozen = Boolean(e.frozen);
  const incomplete = e.guardrails.length === 0 || e.metric === "—";
  return (
    <div className="space-y-4">
      <Section title="The brief" action={frozen ? <Frozen>{e.frozen}</Frozen> : <Pill tone="warn">Editable — nothing has run yet</Pill>}>
        <div className="p-5 space-y-5">
          {[
            ["Which page", `${e.site}${e.path} · ${e.env}`],
            ["What changes", e.hypothesis],
            ["Who for", "Everyone"],
            ["What we expect", e.status === "drafting" ? "Not answered yet." : "More guests reach the booking step, because the change removes something competing with it."],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-1.5">{String(k).toUpperCase()}</div>
              <p className="text-[14.5px] leading-relaxed">{v}</p>
            </div>
          ))}

          <div className={cn("rounded-lg border p-4", incomplete ? "border-warn/40 bg-warn/5" : "border-border bg-surface-2/40")}>
            <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-1.5">HOW WE&rsquo;LL KNOW</div>
            {e.metric === "—" ? (
              <p className="text-[14px] text-warn">No decision metric and no direction. Nothing can be built until both are stated.</p>
            ) : (
              <p className="text-[14.5px]"><span className="font-semibold">{e.metric}</span> should go <span className="font-semibold">up</span>.</p>
            )}
            <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mt-4 mb-1.5">WHAT MUST NOT GET WORSE</div>
            {e.guardrails.length
              ? <p className="text-[14px] text-muted">{e.guardrails.join(" · ")}</p>
              : <p className="text-[14px] text-warn">None set. At least one is required.</p>}
          </div>
        </div>
      </Section>

      <Section title="Revisions">
        {["Brief 3 — current", "Brief 2", "Brief 1"].slice(0, frozen ? 3 : 1).map((r, i) => (
          <div key={r} className="flex items-center gap-4 px-5 py-3 border-b border-border last:border-0">
            <div className="flex-1 text-[13.5px]">{r}</div>
            {i === 0 && frozen && <Frozen>judged against this</Frozen>}
            {i > 0 && <span className="text-[12.5px] text-muted-2 line-through">superseded</span>}
            <button className="text-[13px] text-accent w-16 text-right">Compare</button>
          </div>
        ))}
      </Section>
    </div>
  );
}

/* ── Build ─────────────────────────────────────────────────────────── */

const BUILD_STEPS = [
  ["Read the page as it is today", "done"],
  ["Wrote the change", "done"],
  ["Built a self-contained file", "done"],
  ["Checked it loads and does not error", "done"],
] as const;

export function BuildPanel({ e }: { e: Experiment }) {
  if (e.stage === "Brief") return <NotYet what="Nothing has been built yet" needs="The brief needs a decision metric and a direction first. Once it is complete, Prism's agent starts building on its own." />;
  const building = e.status === "building";
  return (
    <div className="space-y-4">
      <Section title="Build" action={<Pill tone={building ? "accent" : "ok"}>{building ? "Building now" : "Built"}</Pill>}>
        <div className="p-5">
          <div className="flex items-center gap-3 pb-4 border-b border-border">
            <div className="w-9 h-9 rounded-lg bg-accent/10 grid place-items-center shrink-0">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-accent"><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3" /></svg>
            </div>
            <div className="flex-1">
              <div className="text-[14.5px] font-medium">Prism&rsquo;s agent built this</div>
              <div className="text-[13px] text-muted-2 mt-0.5">Nothing to install. You can also build it yourself — that&rsquo;s in Connections.</div>
            </div>
          </div>

          <ol className="py-4 space-y-2.5">
            {BUILD_STEPS.map(([label]) => (
              <li key={label} className="flex items-center gap-2.5">
                <span className="w-4 h-4 rounded-full bg-ok grid place-items-center shrink-0">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                </span>
                <span className="text-[14px] text-muted">{label}</span>
              </li>
            ))}
          </ol>

          <div className="flex items-center gap-3 pt-4 border-t border-border">
            <Frozen>{e.build} · this exact code is what runs</Frozen>
            <span className="text-[13px] text-muted-2">2.4 KB</span>
            <Button size="sm" variant="outline" className="ml-auto">See it on the page</Button>
          </div>
        </div>
      </Section>

      <Section title="What it knew while building">
        <div className="p-5 flex gap-8">
          {[["24", "pages of your site read"], ["11", "of your components reused"], ["6", "past results considered"]].map(([n, l]) => (
            <div key={l}><div className="text-[19px] font-semibold tabular-nums tracking-[-0.02em]">{n}</div><div className="text-[12.5px] text-muted-2 mt-0.5">{l}</div></div>
          ))}
          <p className="text-[13px] text-muted-2 self-center ml-auto max-w-[220px] leading-relaxed">Pinned to this build, so what the agent knew is part of the record.</p>
        </div>
      </Section>
    </div>
  );
}

/* ── Review ────────────────────────────────────────────────────────── */

export function ReviewPanel({ e }: { e: Experiment }) {
  if (e.stage === "Brief" || e.stage === "Build") return <NotYet what="Not ready for review" needs="Someone reviews this once there is a build to look at on the real page." />;
  return (
    <div className="space-y-4">
      <Section title="Does this do what the brief asked?" action={<span className="text-[12.5px] text-muted-2">Reviewer · owns the site</span>}>
        <div className="p-5">
          <div className="rounded-lg border border-border bg-surface-2/40 h-[190px] grid place-items-center mb-4">
            <div className="text-center">
              <div className="text-[13px] text-muted-2 mb-2">The change, on the real page</div>
              <Button size="sm" variant="outline">Open {e.site}{e.path}</Button>
            </div>
          </div>
          <div className="rounded-lg border border-border p-4 mb-4">
            <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-2">WHAT THE BRIEF ASKED FOR</div>
            <p className="text-[14px] leading-relaxed">{e.hypothesis}</p>
          </div>
          <p className="text-[13.5px] text-muted mb-4">
            You&rsquo;re signing off that it matches the brief and is safe on your site — not that it will win. Nothing reaches a real guest until someone approves the run.
          </p>
          <div className="flex gap-2.5">
            <Button>Looks right</Button>
            <Button variant="outline">Send back with a note</Button>
          </div>
        </div>
      </Section>
    </div>
  );
}

/* ── Run ───────────────────────────────────────────────────────────── */

export function RunPanel({ e }: { e: Experiment }) {
  const live = e.status === "running";
  if (!live && !e.frozen) return <NotYet what="Not running" needs="A run starts once someone with permission approves it. Approving names the build, the brief and the environment — and freezes all three." />;
  return (
    <div className="space-y-4">
      <Section title={live ? "Running now" : "The run"} action={live ? <Pill tone="ok">Live on {e.env}</Pill> : <Pill tone="muted">Closed</Pill>}>
        <div className="p-5">
          <div className="flex gap-10 pb-4 border-b border-border">
            {[[e.result?.value ?? "—", e.metric], ["50 / 50", "split"], [live ? "day 6 of 14" : "18,412", live ? "elapsed" : "sessions"]].map(([n, l]) => (
              <div key={String(l)}>
                <div className={cn("text-[20px] font-semibold tabular-nums tracking-[-0.02em]", e.result?.tone === "ok" && "text-ok")}>{n}</div>
                <div className="text-[12.5px] text-muted-2 mt-0.5">{l}</div>
              </div>
            ))}
          </div>
          <div className="py-4">
            <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-2.5">GUARDRAILS</div>
            {e.guardrails.map((g) => (
              <div key={g} className="flex items-center gap-2.5 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-ok" />
                <span className="text-[13.5px] text-muted flex-1">{g}</span>
                <span className="text-[13px] text-muted-2">holding</span>
              </div>
            ))}
          </div>
          <div className="pt-4 border-t border-border flex items-center gap-3">
            {e.frozen && <Frozen>{e.frozen}</Frozen>}
            {live && <Button variant="danger" size="sm" className="ml-auto">Stop this run</Button>}
          </div>
          {live && <p className="text-[12.5px] text-muted-2 mt-2.5">Stopping never needs a second person. Safety actions are never gated.</p>}
        </div>
      </Section>
    </div>
  );
}

/* ── Decision ──────────────────────────────────────────────────────── */

export function DecisionPanel({ e, action }: { e: Experiment; action: React.ReactNode }) {
  if (e.status === "shipped") {
    return (
      <Section title="Decision" action={<Frozen>stamped 2 Aug 2026 · results and statistics frozen</Frozen>}>
        <div className="p-5">
          <div className="flex items-baseline gap-3 mb-3">
            <span className="text-[22px] font-semibold text-ok tabular-nums">{e.result?.value}</span>
            <span className="text-[14px] text-muted">{e.metric} · it won</span>
          </div>
          <Meta k="Decided by" v="Marcus R. · Approver" />
          <Meta k="Author" v={e.owner} />
          <Meta k="Pre-registered" v="Brief 2, frozen 25 days before the numbers existed" />
          <Button size="sm" variant="outline" className="mt-4">Open the readout</Button>
        </div>
      </Section>
    );
  }
  if (!e.result) return <NotYet what="No decision yet" needs="A decision is recorded once the run closes. It freezes the result and the statistics together, and it cannot be the person who wrote or built it." />;
  return <>{action}</>;
}

export function StagePanel({ e, stage, action }: { e: Experiment; stage: Stage; action: React.ReactNode }) {
  if (stage === "Brief") return <BriefPanel e={e} />;
  if (stage === "Build") return <BuildPanel e={e} />;
  if (stage === "Review") return <ReviewPanel e={e} />;
  if (stage === "Run") return <RunPanel e={e} />;
  return <DecisionPanel e={e} action={action} />;
}

export { STAGES };
