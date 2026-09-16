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
import { type Site } from "@/lib/console/fake";
import { CodeHostCard, logActivity } from "./config";
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
                i < step ? "bg-ok text-ok-fg" : i === step ? "bg-accent text-accent-fg" : "border border-border-strong text-muted-2")}>
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

/** ADDING A SITE IS INFRASTRUCTURE — address, code, environments, script. What Prism
 *  UNDERSTANDS about the site is a separate flow (customer-context.tsx), because the read
 *  happens once, over both sources, and the questions it can't settle need a person.
 *  The wizard used to read the site itself and then Understand read it again. */
const STEPS_S = ["Address", "Code"];

/** ADD A SITE — two questions, and the site is real after the first.
 *
 *  It used to be four steps that discarded everything if you left: the shell
 *  promised "nothing is lost" and showed a Saved pill while writing no draft at
 *  all. The fix is not a draft map. The site is COMMITTED the moment its address
 *  validates, so there is nothing pending to lose, and "nothing is lost" becomes
 *  a fact about a row in the site selector rather than a promise held in memory.
 *
 *  Steps 3 and 4 are gone. Environments and the install instructions live in the
 *  Setup room, durably and per environment, and always did — the wizard was a
 *  second copy of them that also shipped every new site on every account a
 *  pre-filled www.outrigger.com. The reads-from and writes-to repositories are
 *  gone for the same reason, and because neither can be chosen before a host
 *  exists anyway. What survives is the host, and it survives as the SAME
 *  component the Setup room renders.
 *
 *  What is still missing is never guessed at here: it is on the readiness card
 *  on Overview, derived from siteSteps(). */
export function SiteOnboarding({ onCreate, onLeave }: {
  onCreate: (site: Site) => void;
  onLeave: () => void;
}) {
  const [step, setStep] = useState(0);
  const [domain, setDomain] = useState("");
  const [created, setCreated] = useState<Site | null>(null);
  const domainOf = domain.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const ok = [domainOf.length > 3, true][step];

  // Committing happens HERE, on the way to step 2 — not in a finish handler.
  const advance = (n: number) => {
    if (step === 0 && n === 1 && !created) {
      const site: Site = { id: domainOf, domain: domainOf, label: "Added just now", experiments: 0, envs: [] };
      setCreated(site);
      onCreate(site);
      logActivity(`Added ${domainOf}.`);
    }
    setStep(n);
  };

  return (
    <Wizard title="Add a site" steps={STEPS_S} step={step} setStep={advance} onClose={onLeave}
      canContinue={ok} finishLabel="Done" saved={Boolean(created)} onFinish={onLeave}>
      {step === 0 && (
        <Q n={1} of={2} title="What&rsquo;s the website?" help="The address visitors reach. Prism reads it the moment the site exists — it changes nothing and publishes nothing.">
          <label className="block text-[13px] font-semibold text-muted mb-1.5">Address</label>
          <Text value={domain} onChange={setDomain} placeholder="example.com" prefix="https://" />
          <p className="text-[12.5px] text-muted-2 mt-2.5">
            The site is added as soon as you continue, so you can stop at any point and pick it up from the
            Overview — it will tell you what this site still needs.
          </p>
        </Q>
      )}

      {step === 1 && created && (
        <Q n={2} of={2} title="Where does this site&rsquo;s code live?"
          help="This site names its own host — another site on this account can be somewhere else entirely, and often is. Nothing else about its code can be chosen until this is connected.">
          <Section title="Where the code lives">
            <div className="p-5"><CodeHostCard site={created} /></div>
          </Section>
          <p className="text-[12.5px] text-muted-2 mt-3">
            Everything after this — the code Prism reads, the repository it writes to, the environments and the
            script — is on {domainOf}&rsquo;s own Setup room, and on the Overview until it is done.
          </p>
        </Q>
      )}
    </Wizard>
  );
}