"use client";

/**
 * ONBOARDING — the wizard shell, and the site flow.
 *
 * One shell for every flow, so the shape is learned once. Creating a CUSTOMER
 * lives in the back office (customer-context.tsx) and uses this same shell;
 * an experiment is created in new-experiment.tsx. Each step is
 * individually valid and saved, because these are long jobs done by busy people
 * who get interrupted — "Save & close" must leave a coherent record, never a
 * half-written blob.
 *
 * The rule the flows are written against: ask only what this person can answer
 * unaided, and never ask for anything the system can find out for itself. The
 * site flow READS the site rather than interviewing you about it, which is the
 * moment the product proves it is worth the setup.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";
import { Pill, Section } from "./ui";

/* ── shared shell ──────────────────────────────────────────────────── */

export function Wizard({
  title, steps, step, setStep, onClose, canContinue, finishLabel, children, saved = true, onFinish,
}: {
  title: string; steps: string[]; step: number; setStep: (n: number) => void;
  onClose: () => void; canContinue: boolean; finishLabel: string;
  children: React.ReactNode; saved?: boolean; onFinish?: () => void;
}) {
  const last = step === steps.length - 1;
  return (
    <>
      <header className="h-14 shrink-0 border-b border-border bg-surface flex items-center px-6 gap-3">
        <h1 className="text-[15px] font-semibold">{title}</h1>
        {saved && <Pill tone="muted">Saved</Pill>}
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden lg:inline text-[12.5px] text-muted-2">You can stop here and come back — nothing is lost.</span>
          <Button variant="outline" size="sm" onClick={onClose}>Save &amp; close</Button>
        </div>
      </header>

      <div className="px-6 py-3 border-b border-border bg-surface flex items-center gap-1.5 overflow-x-auto">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => i < step && setStep(i)}
              className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5", i < step && "hover:bg-surface-2")}>
              <span className={cn("w-5 h-5 rounded-full grid place-items-center text-[11px] font-bold",
                i < step ? "bg-ok text-white" : i === step ? "bg-accent text-accent-fg" : "border border-border-strong text-muted-2")}>
                {i < step ? "✓" : i + 1}
              </span>
              <span className={cn("text-[13px] whitespace-nowrap", i === step ? "font-semibold" : i < step ? "text-muted" : "text-muted-2")}>{s}</span>
            </button>
            {i < steps.length - 1 && <span className="w-4 h-px bg-border shrink-0" />}
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-auto flex justify-center px-6 py-9">{children}</div>

      <footer className="shrink-0 border-t border-border bg-surface px-6 py-3.5 flex items-center">
        <Button variant="ghost" onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>{step === 0 ? "Cancel" : "Back"}</Button>
        <Button disabled={!canContinue} className="ml-auto" onClick={() => (last ? onFinish?.() : setStep(step + 1))}>
          {last ? finishLabel : "Continue"}
        </Button>
      </footer>
    </>
  );
}

export const Q = ({ n, of, title, help, children, wide }: { n: number; of: number; title: string; help?: string; children: React.ReactNode; wide?: boolean }) => (
  <div className={wide ? "w-[960px] max-w-full" : "w-[620px]"}>
    <div className="text-[11.5px] font-semibold tracking-[0.07em] text-muted-2 mb-2">STEP {n} OF {of}</div>
    <h2 className="text-[24px] font-semibold tracking-[-0.02em] mb-2">{title}</h2>
    {help && <p className="text-[14.5px] text-muted leading-relaxed mb-6">{help}</p>}
    {children}
  </div>
);

const Text = ({ value, onChange, placeholder, prefix }: { value: string; onChange: (v: string) => void; placeholder: string; prefix?: string }) => (
  <div className={cn("flex items-center h-12 rounded-xl border bg-surface px-4 gap-1", value ? "border-accent" : "border-border")}>
    {prefix && <span className="text-[15px] text-muted-2">{prefix}</span>}
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} spellCheck={false}
      className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-2" />
  </div>
);


/* ── Site onboarding ───────────────────────────────────────────── */

const FOUND_PAGES = [
  { name: "Home", path: "/", visits: "48,210 / mo", on: true },
  { name: "All offers", path: "/offers", visits: "9,780 / mo", on: true },
  { name: "Property detail — Reef Waikiki", path: "/hawaii/oahu/outrigger-reef-waikiki-beach-resort", visits: "31,004 / mo", on: false },
  { name: "Destinations", path: "/destinations", visits: "6,140 / mo", on: false },
  { name: "Rooms &amp; suites", path: "/hawaii/oahu/outrigger-reef-waikiki-beach-resort/rooms", visits: "12,400 / mo", on: false },
];

const STEPS_S = ["Address", "Pages", "Environments", "Source code", "The script"];

export function SiteOnboarding({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [domain, setDomain] = useState("");
  const [read, setRead] = useState(false);
  const [pages, setPages] = useState(FOUND_PAGES.map((p) => p.on));
  const [envs, setEnvs] = useState([
    { label: "Production", url: "www.outrigger.com", prod: true },
    { label: "Prep", url: "prep.outrigger.com", prod: false },
  ]);
  const [repo, setRepo] = useState("");
  const chosen = pages.filter(Boolean).length;
  const ok = [domain.trim().length > 3 && read, chosen > 0, envs.length > 0, true, true][step];

  return (
    <Wizard title="Add a site" steps={STEPS_S} step={step} setStep={setStep} onClose={onClose}
      canContinue={ok} finishLabel="Finish" saved={read} onFinish={onDone}>
      {step === 0 && (
        <Q n={1} of={5} title="What&rsquo;s the website?" help="Prism reads it once to learn your pages, your components and the way you write. Nothing is changed and nothing is published.">
          <label className="block text-[13px] font-semibold text-muted mb-1.5">Address</label>
          <Text value={domain} onChange={setDomain} placeholder="outrigger.com" prefix="https://" />
          {!read ? (
            <Button className="mt-4" disabled={domain.trim().length < 4} onClick={() => setRead(true)}>Read this site</Button>
          ) : (
            <div className="mt-5 rounded-xl border border-border bg-surface p-5">
              <div className="flex items-center gap-2.5 pb-4 border-b border-border">
                <span className="w-4 h-4 rounded-full bg-ok grid place-items-center shrink-0">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                </span>
                <span className="text-[14px] font-medium">Read {domain}</span>
                <span className="text-[12.5px] text-muted-2 ml-auto">6 seconds</span>
              </div>
              <div className="flex gap-8 pt-4">
                {[["24", "pages found"], ["11", "repeated components"], ["1", "thing still to do"]].map(([n, l]) => (
                  <div key={l}><div className={cn("text-[20px] font-semibold tabular-nums tracking-[-0.02em]", l.includes("still") && "text-warn")}>{n}</div>
                    <div className="text-[12.5px] text-muted-2 mt-0.5">{l}</div></div>
                ))}
              </div>
            </div>
          )}
        </Q>
      )}

      {step === 1 && (
        <Q n={2} of={5} title="Which pages will you test?" help="Pick the ones you expect to work on. You can add more at any time — this just decides what Prism keeps a close eye on.">
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            {FOUND_PAGES.map((p, i) => (
              <button key={p.path} onClick={() => setPages((ps) => ps.map((v, j) => (i === j ? !v : v)))}
                className="w-full flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 text-left hover:bg-surface-2/60">
                <span className={cn("w-4 h-4 rounded border grid place-items-center shrink-0", pages[i] ? "bg-accent border-accent" : "border-border-strong")}>
                  {pages[i] && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium" dangerouslySetInnerHTML={{ __html: p.name }} />
                  <div className="text-[12.5px] text-muted-2 truncate">{domain}{p.path}</div>
                </div>
                <span className="text-[12.5px] text-muted-2 shrink-0">{p.visits}</span>
              </button>
            ))}
            <div className="px-4 py-2.5 bg-surface-2/40 text-[13px] text-accent">Show 19 more</div>
          </div>
          <p className="text-[12.5px] text-muted-2 mt-3">{chosen} selected</p>
        </Q>
      )}

      {step === 2 && (
        <Q n={3} of={5} title="Where does this site run?" help="Call them whatever your team calls them. The only one that changes what Prism allows is production — an experiment can only reach real guests there, and only with an approval.">
          <div className="rounded-xl border border-border bg-surface overflow-hidden mb-3">
            {envs.map((e, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0">
                <input value={e.label} onChange={(ev) => setEnvs((es) => es.map((x, j) => (i === j ? { ...x, label: ev.target.value } : x)))}
                  className="w-32 bg-transparent text-[14px] font-medium outline-none border-b border-transparent focus:border-accent" />
                <span className="text-[13px] text-muted-2">https://</span>
                <input value={e.url} onChange={(ev) => setEnvs((es) => es.map((x, j) => (i === j ? { ...x, url: ev.target.value } : x)))}
                  className="flex-1 bg-transparent text-[13px] font-mono text-muted outline-none border-b border-transparent focus:border-accent" />
                <button onClick={() => setEnvs((es) => es.map((x, j) => ({ ...x, prod: i === j })))}>
                  {e.prod ? <Pill tone="accent">Production</Pill> : <span className="text-[12.5px] text-muted-2 hover:text-foreground">Mark as production</span>}
                </button>
              </div>
            ))}
          </div>
          <button onClick={() => setEnvs((es) => [...es, { label: "UAT", url: "uat.outrigger.com", prod: false }])}
            className="text-[13px] text-accent">+ Add another</button>
        </Q>
      )}

      {step === 3 && (
        <Q n={4} of={5} title="Where does this site&rsquo;s code live?" help="Each site can have its own repository. Prism builds each experiment as a branch here — it never touches your main branch, and never writes to your production source.">
          <label className="block text-[13px] font-semibold text-muted mb-1.5">Repository for experiments</label>
          <Text value={repo} onChange={setRepo} placeholder="INHQInc/outrigger-prototypes" />
          <div className="mt-4 rounded-xl border border-border bg-surface p-4">
            <div className="text-[13.5px] font-semibold mb-1">Your production source, read-only</div>
            <p className="text-[13px] text-muted leading-relaxed mb-2.5">
              Optional, and worth it. With your real stylesheets in front of it, the agent reuses your actual components and tokens
              instead of guessing from what a browser computed — which silently misses media queries and hover states.
            </p>
            <Button size="sm" variant="outline">Connect a read-only source</Button>
          </div>
          <p className="text-[12.5px] text-muted-2 mt-3">You can skip this. Prism can still measure the site — it just can&rsquo;t build anything for it.</p>
        </Q>
      )}

      {step === 4 && (
        <Q n={5} of={5} title="One line goes on the site" help="A single script tag lets Prism show an experiment on the page. Until it's there, you can build and preview but nothing reaches a real guest.">
          <Section title="Where it needs to go">
            {envs.map((e) => (
              <div key={e.label} className="flex items-center gap-3 px-5 py-3.5 border-b border-border last:border-0">
                <div className="flex-1">
                  <div className="text-[14px] font-medium">{e.label}</div>
                  <div className="text-[12.5px] text-muted-2 font-mono mt-0.5">{e.url}</div>
                </div>
                {e.prod ? <Pill tone="warn">Needed for live tests</Pill> : <Pill tone="muted">Needed to preview</Pill>}
              </div>
            ))}
          </Section>
          <div className="mt-4 rounded-xl border-[1.5px] border-accent bg-surface p-5">
            <div className="text-[15px] font-semibold mb-1.5">Send it to whoever looks after the site</div>
            <p className="text-[13.5px] text-muted leading-relaxed mb-4">
              Prism writes the email: what the script is, what it does, what it can&rsquo;t, and where to put it.
              It tells us the moment it&rsquo;s live, so nobody has to report back.
            </p>
            <div className="flex gap-2.5">
              <Button onClick={onDone}>Send to a developer</Button>
              <Button variant="outline" onClick={onDone}>I&rsquo;ll add it myself</Button>
            </div>
          </div>
        </Q>
      )}
    </Wizard>
  );
}
