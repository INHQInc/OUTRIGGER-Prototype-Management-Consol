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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/ui/cn";
import { ME, type CodeHost, type Site } from "@/lib/console/fake";
import { logActivity } from "./config";
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

/** What the connected host can see. Prism reaches exactly one organisation per site
 *  (D16), so the candidates come from the org just connected — never from a list that
 *  would offer one customer another customer's repositories. */
const repoCandidates = (org: string) => {
  const base = org.trim().split("/")[0] || "your-org";
  return [`${base}/web`, `${base}/design-system`, `${base}/components`];
};

/** ADDING A SITE IS INFRASTRUCTURE — address, code, environments, script. What Prism
 *  UNDERSTANDS about the site is a separate flow (customer-context.tsx), because the read
 *  happens once, over both sources, and the questions it can't settle need a person.
 *  The wizard used to read the site itself and then Understand read it again. */
const STEPS_S = ["Address", "Code", "Environments", "The script"];

export function SiteOnboarding({ onClose, onDone }: { onClose: () => void; onDone: (site: Site) => void }) {
  const [step, setStep] = useState(0);
  const [domain, setDomain] = useState("");
  const [envs, setEnvs] = useState([
    { label: "Production", url: "www.outrigger.com", prod: true },
    { label: "Prep", url: "prep.outrigger.com", prod: false },
  ]);
  const [repo, setRepo] = useState("");
  const [source, setSource] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [pick, setPick] = useState("");
  // WHERE THE CODE LIVES comes first, because nothing else on this step means
  // anything without it: buildBlockers short-circuits on a missing host before it
  // looks at the source or the repository (fake.ts). The Setup room asks in this
  // same order — host, then reads-from, then writes-to — so the two are one grammar.
  const [host, setHost] = useState<CodeHost | undefined>(undefined);
  const [connectingHost, setConnectingHost] = useState(false);
  const [hostKind, setHostKind] = useState<CodeHost["kind"]>("GitHub");
  const [hostOrg, setHostOrg] = useState("");
  // Both repositories are REQUIRED before anything can be built, but not required to add
  // the site — you may not know them yet, and being unable to finish adding a site is worse
  // than a site that says plainly what it still needs. The gate is on Build (D14).
  const ok = [domain.trim().length > 3, true, envs.length > 0, true][step];
  const domainOf = domain.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const finish = () => onDone({
    id: domainOf, domain: domainOf, label: "Added just now", experiments: 0,
    codeHost: host,
    repo: repo.trim() || undefined, branchPrefix: repo.trim() ? "prototype/" : undefined, source: source ?? undefined,
    envs: envs.map((e) => ({ label: e.label, url: `https://${e.url.replace(/^https?:\/\//, "")}`, isProduction: e.prod, script: "checking" as const })),
  });
  const connectHost = () => {
    const h: CodeHost = { kind: hostKind, org: hostOrg.trim(), repos: 12, connectedBy: ME.name };
    setHost(h); setPick(repoCandidates(h.org)[0]); setConnectingHost(false);
    logActivity(`Connected ${h.kind} on ${h.org} for ${domainOf}.`);
  };
  const connectSource = () => {
    setSource(pick); setConnecting(false);
    logActivity(`Connected ${pick} as a read-only source for ${domainOf}.`);
  };

  return (
    <Wizard title="Add a site" steps={STEPS_S} step={step} setStep={setStep} onClose={onClose}
      canContinue={ok} finishLabel="Add the site" saved={domain.trim().length > 3} onFinish={finish}>
      {step === 0 && (
        <Q n={1} of={4} title="What&rsquo;s the website?" help="The address visitors reach. Prism reads it once the site exists — it changes nothing and publishes nothing.">
          <label className="block text-[13px] font-semibold text-muted mb-1.5">Address</label>
          <Text value={domain} onChange={setDomain} placeholder="outrigger.com" prefix="https://" />
          <p className="text-[12.5px] text-muted-2 mt-2.5">Everything after this is about this site alone: its code, its environments, what Prism understands about it.</p>
        </Q>
      )}

      {step === 1 && (
        <Q n={2} of={4} title="Where does this site&rsquo;s code live?"
          help="A host, and two repositories doing two different things. This site names its own host — another site on this account can be somewhere else entirely, and often is.">
          <Section title="Where the code lives — this site&rsquo;s own host">
            <div className="p-5">
              {host ? (
                <div className="flex items-center gap-2 text-[13px]">
                  <Pill tone="ok">Connected</Pill>
                  <span>{host.kind}</span>
                  <span className="font-mono text-[12.5px] text-muted-2">{host.org}</span>
                  <button onClick={() => { setHost(undefined); setSource(null); }} className="ml-auto text-[12.5px] text-muted-2 hover:text-foreground">Remove</button>
                </div>
              ) : (
                <>
                  <p className="text-[13px] text-muted leading-relaxed mb-3">
                    Prism reaches only the organisation you name — nothing else on that host. Without it Prism cannot see this site&rsquo;s code at all, so neither repository below can be chosen.
                  </p>
                  <Button size="sm" variant="outline" onClick={() => setConnectingHost(true)}>Connect a code host</Button>
                  <p className="text-[12.5px] text-warn mt-2.5">Needed before a build — it is the first thing Prism checks. You can add it later, from the site itself.</p>
                </>
              )}
            </div>
          </Section>

          <Section title="Where Prism builds — it writes here" className="mt-4">
            <div className="p-5">
              <label htmlFor="proto-repo" className="block text-[13px] font-semibold text-muted mb-1.5">Repository for experiments</label>
              <Text value={repo} onChange={setRepo} placeholder={host ? `${host.org.split("/")[0]}/prototypes` : "your-org/prototypes"} />
              <p className="text-[12.5px] text-muted-2 mt-2.5">
                Each experiment becomes a branch here under <span className="font-mono">prototype/</span>. Prism never touches its main branch, and never writes to the repository below.
              </p>
              {!repo.trim() && <p className="text-[12.5px] text-warn mt-2">Needed before a build — there is nowhere to put one without it. You can add it later.</p>}
            </div>
          </Section>

          <Section title="Where Prism reads — read-only" className="mt-4">
            <div className="p-5">
              {source ? (
                <div className="flex items-center gap-2 text-[13px]">
                  <Pill tone="ok">Connected</Pill>
                  <span className="font-mono text-[12.5px]">{source}</span>
                  <span className="text-muted-2">· read-only</span>
                  <button onClick={() => setSource(null)} className="ml-auto text-[12.5px] text-muted-2 hover:text-foreground">Remove</button>
                </div>
              ) : (
                <>
                  <p className="text-[13px] text-muted leading-relaxed mb-3">
                    This site&rsquo;s real stylesheets and components. It is what the agent builds against — without it there is nothing to reuse,
                    and anything built would be written from the outside of a page rather than from the system behind it.
                  </p>
                  <Button size="sm" variant="outline" disabled={!host} onClick={() => setConnecting(true)}>Connect a read-only source</Button>
                  <p className="text-[12.5px] text-warn mt-2.5">
                    {host
                      ? "Needed before a build — Prism builds from this code and cannot build without it. You can add it later, from the site itself."
                      : "Connect a code host first — this list is what that connection can see."}
                  </p>
                </>
              )}

              <div className="mt-4 pt-4 border-t border-border">
                <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-2">WHAT IT CHANGES</div>
                <ul className="space-y-1.5 text-[13px] text-muted leading-relaxed">
                  <li>· The palette arrives <span className="text-foreground">named</span> — <span className="font-mono text-[12px]">$clr-deep-turquoise</span>, not &ldquo;#004561, used 73 times&rdquo;.</li>
                  <li>· Type gets <span className="text-foreground">roles</span>: which family is for headlines is a line in the stylesheet, not a guess from counts.</li>
                  <li>· The agent reuses your <span className="text-foreground">actual components</span> instead of writing parallel ones.</li>
                  <li>· <span className="text-foreground">Three of the seven questions</span> Prism would otherwise ask are answered by the code, so the interview gets shorter.</li>
                </ul>
                <p className="text-[12.5px] text-muted-2 mt-3">
                  Read-only, always. Prism reads it and never writes to it — every build lands in the repository above.
                </p>
              </div>
            </div>
          </Section>

          <Dialog open={connectingHost} onOpenChange={setConnectingHost}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Where does {domainOf || "this site"}&rsquo;s code live?</DialogTitle>
                <DialogDescription>
                  This site&rsquo;s own host — another site can be somewhere else entirely, and often is. Prism reaches only the organisation you name here.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label className="mb-2" id="new-host-kind">Host</Label>
                  <RadioGroup aria-labelledby="new-host-kind" value={hostKind} onValueChange={(v) => setHostKind(v as CodeHost["kind"])} className="grid-cols-2">
                    {(["GitHub", "GitLab", "Bitbucket", "Azure DevOps"] as const).map((k) => (
                      <Label key={k} htmlFor={`new-host-${k}`} className={cn("gap-3 rounded-xl border px-4 py-2.5 cursor-pointer font-normal text-foreground", hostKind === k ? "border-accent bg-accent/5" : "border-border")}>
                        <RadioGroupItem id={`new-host-${k}`} value={k} /><span className="text-[13.5px]">{k}</span>
                      </Label>
                    ))}
                  </RadioGroup>
                </div>
                <div>
                  <Label htmlFor="new-host-org" className="mb-1.5">Organisation or group</Label>
                  <Input id="new-host-org" value={hostOrg} onChange={(e) => setHostOrg(e.target.value)} placeholder="your-org" spellCheck={false} />
                  <p className="text-[12.5px] text-muted-2 mt-2">Prism can see repositories here and nowhere else on that host. If this site is built by an agency, it is usually theirs, not yours.</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setConnectingHost(false)}>Cancel</Button>
                <Button disabled={hostOrg.trim().length < 2} onClick={connectHost}>Connect it</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={connecting} onOpenChange={setConnecting}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Connect a read-only source</DialogTitle>
                <DialogDescription>The repository that holds this site&rsquo;s real stylesheets and components. Prism reads it and never writes to it.</DialogDescription>
              </DialogHeader>
              <div>
                <Label htmlFor="source-pick" className="mb-1.5">Repository <span className="font-normal text-muted-2">— what the {host?.kind ?? "code host"} connection on {host?.org ?? "this site"} can see</span></Label>
                <Select value={pick} onValueChange={setPick}>
                  <SelectTrigger id="source-pick" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{repoCandidates(host?.org ?? "").map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setConnecting(false)}>Cancel</Button>
                <Button onClick={connectSource}>Connect it</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Q>
      )}

      {step === 2 && (
        <Q n={3} of={4} title="Where does this site run?" help="Call them whatever your team calls them. The only one that changes what Prism allows is production — an experiment can only reach real visitors there, and only with an approval.">
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
        <Q n={4} of={4} title="One line goes on the site" help="A single script tag lets Prism show an experiment on the page. Until it's there, you can build and preview but nothing reaches a real visitor.">
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
              <Button onClick={finish}>Send to a developer</Button>
              <Button variant="outline" onClick={finish}>I&rsquo;ll add it myself</Button>
            </div>
          </div>
        </Q>
      )}
    </Wizard>
  );
}
