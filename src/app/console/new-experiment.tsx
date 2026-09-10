"use client";

/**
 * NEW EXPERIMENT — six questions, one per screen.
 *
 * The test for every field (TARGET-ARCHITECTURE §6): can an Author answer this
 * unaided, and does the answer change what gets built or how it is judged?
 * Repository, branch, artifact path, site key, loader tag, project ids and the
 * word "skill" all fail that test and live in CONFIGURE instead. There is no
 * terminal here, and no question about how it will be built.
 *
 * The stepper is horizontal because the app already owns the left edge — and
 * it is there so the whole shape is visible from question one. One question at
 * a time is only calm if you can see how many are left.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";
import { SITE_ROWS } from "@/lib/console/fake";
import { Pill } from "./ui";

const STEPS = ["Where", "What changes", "Who for", "What you expect", "How we'll know", "What must not get worse"];

const PAGES = [
  { name: "Home", path: "/", visits: "48,210 / mo" },
  { name: "Property detail — Reef Waikiki", path: "/hawaii/oahu/outrigger-reef-waikiki-beach-resort", visits: "31,004 / mo" },
  { name: "All offers", path: "/offers", visits: "9,780 / mo" },
  { name: "Destinations", path: "/destinations", visits: "6,140 / mo" },
];

const POLICY = ["Bookings", "Revenue per visit", "Page errors"];

interface Draft {
  site: string; page: string; change: string; audience: string;
  expect: string; because: string; metric: string; direction: "up" | "down" | null;
  guardrails: string[];
}

const EMPTY: Draft = { site: "outrigger.com", page: "", change: "", audience: "Everyone", expect: "", because: "", metric: "", direction: null, guardrails: [...POLICY] };

const Q = ({ n, title, help, children }: { n: number; title: string; help?: string; children: React.ReactNode }) => (
  <div className="w-[640px]">
    <div className="text-[11.5px] font-semibold tracking-[0.07em] text-muted-2 mb-2">QUESTION {n} OF 6</div>
    <h1 className="text-[24px] font-semibold tracking-[-0.02em] mb-2">{title}</h1>
    {help && <p className="text-[14.5px] text-muted leading-relaxed mb-6">{help}</p>}
    {children}
  </div>
);

const Field = ({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder: string; rows?: number }) => (
  <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder}
    className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-[15px] leading-relaxed resize-none placeholder:text-muted-2 focus:border-accent focus:outline-none" />
);

export function NewExperiment({ cancel, done }: { cancel: () => void; done: (d: Draft) => void }) {
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(EMPTY);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  /** Every step is individually valid — leaving after any of them is coherent.
   *  Only question 5 is a hard gate, because a direction that was never stated
   *  propagates all the way to the verdict as an assumption. */
  const ok = [Boolean(d.page), d.change.trim().length > 8, true, d.expect.trim().length > 5, Boolean(d.metric.trim().length > 5 && d.direction), true][step];

  const last = step === STEPS.length - 1;

  return (
    <>
      <header className="h-14 shrink-0 border-b border-border bg-surface flex items-center px-6 gap-3">
        <h1 className="text-[15px] font-semibold">New experiment</h1>
        <Pill tone="muted">Draft saved</Pill>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[12.5px] text-muted-2 mr-1">You can close this and come back — nothing is lost.</span>
          <Button variant="outline" size="sm" onClick={cancel}>Save &amp; close</Button>
        </div>
      </header>

      <div className="px-6 py-3 border-b border-border bg-surface flex items-center gap-1.5 overflow-x-auto">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => i < step && setStep(i)}
              className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors", i < step && "hover:bg-surface-2")}>
              <span className={cn("w-5 h-5 rounded-full grid place-items-center text-[11px] font-bold",
                i < step ? "bg-ok text-white" : i === step ? "bg-accent text-accent-fg" : "border border-border-strong text-muted-2")}>
                {i < step ? "✓" : i + 1}
              </span>
              <span className={cn("text-[13px] whitespace-nowrap", i === step ? "font-semibold" : i < step ? "text-muted" : "text-muted-2")}>{s}</span>
            </button>
            {i < STEPS.length - 1 && <span className="w-4 h-px bg-border shrink-0" />}
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-auto flex justify-center px-6 py-10">
        {step === 0 && (
          <Q n={1} title="Which page are you testing?" help="These are the real pages on your site — Prism read them, so you don't have to find a URL.">
            <select value={d.site} onChange={(e) => set("site", e.target.value)}
              className="h-10 px-3 mb-3 rounded-lg border border-border bg-surface text-[14px] focus:border-accent focus:outline-none">
              {SITE_ROWS.map((s) => <option key={s.id}>{s.domain}</option>)}
            </select>
            <div className="rounded-xl border border-border bg-surface overflow-hidden">
              {PAGES.map((p) => (
                <button key={p.path} onClick={() => set("page", p.path)}
                  className={cn("w-full flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 text-left hover:bg-surface-2/60",
                    d.page === p.path && "bg-accent/5")}>
                  <span className={cn("w-4 h-4 rounded-full border-2 shrink-0", d.page === p.path ? "border-accent border-[5px]" : "border-border-strong")} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium">{p.name}</div>
                    <div className="text-[12.5px] text-muted-2 truncate">{d.site}{p.path}</div>
                  </div>
                  <span className="text-[12.5px] text-muted-2 shrink-0">{p.visits}</span>
                </button>
              ))}
            </div>
            <button className="text-[13px] text-accent mt-3">Test a page that isn&rsquo;t listed →</button>
          </Q>
        )}

        {step === 1 && (
          <Q n={2} title="What are you changing?" help="In your own words. Prism's agent builds from this, so describe what a guest would see — not how to build it.">
            <Field value={d.change} onChange={(v) => set("change", v)} rows={5}
              placeholder="Remove the offer badge from the hero so the Check availability button is the only thing competing for attention." />
            <p className="text-[12.5px] text-muted-2 mt-3">Prism knows this site&rsquo;s components, type scale and how you write, so you don&rsquo;t need to describe any of that.</p>
          </Q>
        )}

        {step === 2 && (
          <Q n={3} title="Who should see it?" help="Most experiments run for everyone. Narrow it only if the change is for a specific group.">
            {["Everyone", "First-time visitors", "Returning visitors", "Mobile only"].map((a) => (
              <button key={a} onClick={() => set("audience", a)}
                className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl border mb-2 text-left",
                  d.audience === a ? "border-accent bg-accent/5" : "border-border bg-surface hover:border-border-strong")}>
                <span className={cn("w-4 h-4 rounded-full border-2 shrink-0", d.audience === a ? "border-accent border-[5px]" : "border-border-strong")} />
                <span className="text-[14.5px]">{a}</span>
                {a === "Everyone" && <span className="ml-auto text-[12px] text-muted-2">recommended</span>}
              </button>
            ))}
          </Q>
        )}

        {step === 3 && (
          <Q n={4} title="What do you expect to happen — and why?" help="This is the sentence you'll be held to. It gets frozen the moment the experiment goes live, and the result is judged against it.">
            <label className="block text-[13px] font-semibold text-muted mb-1.5">You expect…</label>
            <Field value={d.expect} onChange={(v) => set("expect", v)} rows={2} placeholder="More guests will click Check availability." />
            <label className="block text-[13px] font-semibold text-muted mt-4 mb-1.5">…because</label>
            <Field value={d.because} onChange={(v) => set("because", v)} rows={2} placeholder="the offer badge competes with the booking call to action and pulls attention away from it." />
          </Q>
        )}

        {step === 4 && (
          <Q n={5} title="How will we know it worked?" help="Say it the way you'd say it to a colleague. Prism works out which of your site's measurements that means once the experiment is set up — and asks you if it isn't sure.">
            <label className="block text-[13px] font-semibold text-muted mb-1.5">The outcome that decides it</label>
            <Field value={d.metric} onChange={(v) => set("metric", v)} rows={2}
              placeholder="More guests get all the way through to a completed booking — not just more people starting one." />
            <p className="text-[12.5px] text-muted-2 mt-2 mb-4">
              Prism never invents a measurement. It can only use what your A/B tool already records on this site, and it will show you the match before anything runs.
            </p>
            <label className="block text-[13px] font-semibold text-muted mb-1.5">Which way should it move?</label>
            <div className="flex gap-2.5">
              {(["up", "down"] as const).map((dir) => (
                <button key={dir} onClick={() => set("direction", dir)}
                  className={cn("flex-1 rounded-xl border px-4 py-3 text-left", d.direction === dir ? "border-accent bg-accent/5" : "border-border bg-surface hover:border-border-strong")}>
                  <div className="text-[14.5px] font-medium">{dir === "up" ? "Up — more is better" : "Down — less is better"}</div>
                  <div className="text-[12.5px] text-muted-2 mt-0.5">{dir === "up" ? "clicks, bookings, engagement" : "bounces, errors, cancellations"}</div>
                </button>
              ))}
            </div>
            {!d.direction && <p className="text-[13px] text-warn mt-3">Say which way it should move. Prism will not guess — a direction nobody stated turns into a caveat on the result.</p>}
          </Q>
        )}

        {step === 5 && (
          <Q n={6} title="What must not get worse?" help="Even if the experiment wins on its own number, these can veto it. They come from your guardrail policy — change them only if this experiment is unusual.">
            <div className="rounded-xl border border-border bg-surface overflow-hidden">
              {[...POLICY, "Cancellation rate", "Bounce rate"].map((g) => {
                const on = d.guardrails.includes(g);
                return (
                  <button key={g} onClick={() => set("guardrails", on ? d.guardrails.filter((x) => x !== g) : [...d.guardrails, g])}
                    className="w-full flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 text-left hover:bg-surface-2/60">
                    <span className={cn("w-4 h-4 rounded border grid place-items-center shrink-0", on ? "bg-accent border-accent" : "border-border-strong")}>
                      {on && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                    </span>
                    <span className="text-[14px]">{g}</span>
                    {POLICY.includes(g) && <span className="ml-auto text-[12px] text-muted-2">from your policy</span>}
                  </button>
                );
              })}
            </div>
          </Q>
        )}
      </div>

      <footer className="shrink-0 border-t border-border bg-surface px-6 py-3.5 flex items-center gap-3">
        <Button variant="ghost" onClick={() => (step === 0 ? cancel() : setStep(step - 1))}>{step === 0 ? "Cancel" : "Back"}</Button>
        <div className="ml-auto flex items-center gap-3">
          {!ok && step === 4 && <span className="text-[13px] text-muted-2">Both answers are needed to continue</span>}
          <Button disabled={!ok} onClick={() => (last ? done(d) : setStep(step + 1))}>
            {last ? "Create and start building" : "Continue"}
          </Button>
        </div>
      </footer>
    </>
  );
}

export type { Draft };
