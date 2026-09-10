"use client";

/** The CONFIGURE surfaces. Eight of the nine use cases the operator listed are
 *  setup, so these are not an afterthought behind a Settings gear — they are
 *  first-class rooms with the same grammar as the work surfaces.
 *
 *  Every click here does what it says, inside the session. Where the product
 *  would call an API, the mock changes the state the screen reads and writes a
 *  line to Activity — because the customer's own record of who did what is the
 *  part of setup that has to be true from day one. */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/ui/cn";
import { AB_TOOLS, ME, OTHER_CONNECTIONS, PROJECT_EVENTS, SITE_ROWS, type Connection, type Site } from "@/lib/console/fake";
import { Empty, Meta, PageHeader, Pill, Section, Th, Toolbar } from "./ui";
import { SkillsPanel } from "./skills";
import { SiteProfile, UnderstandingPill } from "./customer-context";

/* ── Session memory ────────────────────────────────────────────────── */

/** Everything anyone did this session, newest first. Activity renders it above the fixture. */
const SESSION_ACTIVITY: { at: string; who: string; what: string; sealed?: boolean }[] = [];
export const logActivity = (what: string, who: string = ME.name) => { SESSION_ACTIVITY.unshift({ at: "Just now", who, what }); };

/** Edits to a site's environments and source made this session, so leaving the page doesn't lose them. */
const SITE_EDITS = new Map<string, { envs?: Site["envs"]; repo?: string; branchPrefix?: string }>();

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
          An account can have any number of sites, and each site has its own environments, its own source code and its own understanding.
        </span>
      </Toolbar>
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-surface-2/80 backdrop-blur">
            <tr><Th first>Site</Th><Th>Environments</Th><Th>Script</Th><Th>Source code</Th><Th>Understanding</Th><Th>Experiments</Th></tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const edits = SITE_EDITS.get(s.id);
              const envs = edits?.envs ?? s.envs;
              const repo = edits?.repo ?? s.repo;
              const missing = envs.filter((e) => e.script === "missing").length;
              return (
                <tr key={s.id} onClick={() => open(s.id)} className="cursor-pointer hover:bg-surface-2/60 border-b border-border">
                  <td className="px-4 pl-6 py-3">
                    <div className="text-[14px] font-medium">{s.domain}</div>
                    <div className="text-[12.5px] text-muted-2 mt-0.5">{s.label}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {envs.map((e) => (
                        <span key={e.label} className={cn("text-[11.5px] rounded px-1.5 py-0.5 border", e.isProduction ? "border-border-strong text-foreground font-semibold" : "border-border text-muted")}>
                          {e.label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">{!envs.length ? <Pill tone="muted">No environments yet</Pill> : missing ? <Pill tone="warn">{missing} missing</Pill> : <Pill tone="ok">All installed</Pill>}</td>
                  <td className="px-4 py-3 text-[13px] text-muted">{repo ? <span className="font-mono text-[12px]">{repo}</span> : <Pill tone="warn">Not connected</Pill>}</td>
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

/** Repositories the connected GitHub account can see. The connection is real state; this list is what it would return. */
const REPOS = ["INHQInc/outrigger-prototypes", "INHQInc/kona-web", "INHQInc/beachcomber-site", "INHQInc/starter"];

const SCRIPT_TAG = '<script src="https://tag.prism.build/opmc.js" data-tag="…" async></script>';

export function SiteDetail({ s, back, understand }: { s: Site; back: () => void; understand: (id: string) => void }) {
  const edits = SITE_EDITS.get(s.id);
  const [envs, setEnvs] = useState<Site["envs"]>(edits?.envs ?? s.envs);
  const [repo, setRepo] = useState<string | undefined>(edits?.repo ?? s.repo);
  const [branchPrefix, setBranchPrefix] = useState(edits?.branchPrefix ?? s.branchPrefix ?? "prototype/");
  const remember = (patch: { envs?: Site["envs"]; repo?: string; branchPrefix?: string }) => SITE_EDITS.set(s.id, { ...(SITE_EDITS.get(s.id) ?? {}), ...patch });

  const [addingEnv, setAddingEnv] = useState(false);
  const [envLabel, setEnvLabel] = useState("");
  const [envUrl, setEnvUrl] = useState("");
  const [envProd, setEnvProd] = useState(false);

  const [sending, setSending] = useState<number | null>(null);
  const [sendTo, setSendTo] = useState("");

  const [connecting, setConnecting] = useState(false);
  const [pick, setPick] = useState(REPOS[0]);
  const [prefix, setPrefix] = useState("prototype/");

  const addEnv = () => {
    const next = [...envs, { label: envLabel.trim(), url: `https://${envUrl.trim().replace(/^https?:\/\//, "")}`, isProduction: envProd, script: "checking" as const }]
      .map((e) => (envProd && e.label !== envLabel.trim() ? { ...e, isProduction: false } : e));
    setEnvs(next); remember({ envs: next });
    logActivity(`Added the ${envLabel.trim()} environment to ${s.domain}${envProd ? " and marked it production" : ""}.`);
    setAddingEnv(false); setEnvLabel(""); setEnvUrl(""); setEnvProd(false);
  };
  const sendInstall = () => {
    if (sending === null) return;
    const next = envs.map((e, i) => (i === sending ? { ...e, script: "checking" as const, lastSeen: undefined, sentTo: sendTo.trim() } : e));
    setEnvs(next); remember({ envs: next });
    logActivity(`Sent the Prism script for ${envs[sending].url} to ${sendTo.trim()}.`);
    setSending(null); setSendTo("");
  };
  const connect = () => {
    setRepo(pick); setBranchPrefix(prefix); remember({ repo: pick, branchPrefix: prefix });
    logActivity(`Connected ${pick} as the repository for ${s.domain}.`);
    setConnecting(false);
  };

  return (
    <>
      <header className="shrink-0 border-b border-border bg-surface px-6 pt-3 pb-4">
        <button onClick={back} className="text-[12.5px] text-muted-2 hover:text-foreground mb-1.5">Sites</button>
        <div className="flex items-start gap-3">
          <div>
            <h1 className="text-[19px] font-semibold tracking-[-0.01em]">{s.domain}</h1>
            <div className="text-[13px] text-muted-2 mt-1">{s.label} · {s.experiments} experiment{s.experiments === 1 ? "" : "s"}</div>
          </div>
          <div className="ml-auto flex gap-2">
            <Button size="sm" onClick={() => setAddingEnv(true)}>Add an environment</Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-4">
        <Section title="Environments" action={<span className="text-[12.5px] text-muted-2">Call them whatever you call them. Only “is production” changes what Prism allows.</span>}>
          {envs.length === 0 ? (
            <div className="px-5 py-6 text-center">
              <p className="text-[14px] text-muted mb-3">No environments yet. An environment is an address Prism can look at, plus one bit: whether real guests reach it.</p>
              <Button size="sm" variant="outline" onClick={() => setAddingEnv(true)}>Add the first one</Button>
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead><tr><Th first>Environment</Th><Th>Address</Th><Th>Prism script</Th><Th>Last seen</Th></tr></thead>
              <tbody>
                {envs.map((e, i) => (
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
                      {e.lastSeen ?? (e.sentTo
                        ? <span>Sent to {e.sentTo} · listening for the first beacon</span>
                        : <button onClick={() => { setSending(i); setSendTo(""); }} className="text-accent font-medium">Send install instructions →</button>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <div className="flex gap-4 items-start">
          <Section title="Source code" className="flex-1">
            <div className="p-5">
              {repo ? (
                <>
                  <Meta k="Repository" v={repo} mono />
                  <Meta k="Branch prefix" v={branchPrefix} mono />
                  <Meta k="Artifact" v="dist/variation.js" mono />
                  <p className="text-[13px] text-muted-2 mt-3">Each site can live in its own repository. Prototypes for this site are branches here — Prism never touches your main branch.</p>
                </>
              ) : (
                <div className="text-center py-4">
                  <p className="text-[14px] text-muted mb-3">No repository connected. Prism can still measure this site, but it can&rsquo;t build anything for it.</p>
                  <Button size="sm" variant="outline" onClick={() => setConnecting(true)}>Connect a repository</Button>
                </div>
              )}
            </div>
          </Section>
        </div>

        <SiteProfile s={s} onRead={() => understand(s.id)} />
      </div>

      <Dialog open={addingEnv} onOpenChange={setAddingEnv}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add an environment to {s.domain}</DialogTitle>
            <DialogDescription>An address Prism can look at. The only thing that changes what Prism allows is whether real guests reach it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="env-label" className="mb-1.5">What your team calls it</Label>
              <Input id="env-label" value={envLabel} onChange={(e) => setEnvLabel(e.target.value)} placeholder="UAT" autoFocus />
            </div>
            <div>
              <Label htmlFor="env-url" className="mb-1.5">Address</Label>
              <Input id="env-url" value={envUrl} onChange={(e) => setEnvUrl(e.target.value)} placeholder={`uat.${s.domain}`} spellCheck={false} />
            </div>
            <Label htmlFor="env-prod" className="items-start gap-3 rounded-xl border border-border px-4 py-3 cursor-pointer font-normal text-foreground">
              <Checkbox id="env-prod" checked={envProd} onCheckedChange={(v) => setEnvProd(v === true)} className="mt-0.5" />
              <span className="flex-1">
                <span className="block text-[14px] font-medium">Real guests reach this one</span>
                <span className="block text-[12.5px] text-muted-2 mt-0.5">Makes it production. An experiment can only reach real guests here, and only with an approval. {envs.some((e) => e.isProduction) && "It replaces the current production environment."}</span>
              </span>
            </Label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddingEnv(false)}>Cancel</Button>
            <Button disabled={envLabel.trim().length < 2 || envUrl.trim().length < 4} onClick={addEnv}>Add it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sending !== null} onOpenChange={(o) => !o && setSending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send the script for {sending !== null ? envs[sending]?.url : ""}</DialogTitle>
            <DialogDescription>
              One line goes in the page&rsquo;s <span className="font-mono">&lt;head&gt;</span>. Prism writes the email — what it is, what it does, what it can&rsquo;t, and where it goes — and hears the first beacon itself, so nobody has to report back.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-surface-2/40 px-3.5 py-2.5 font-mono text-[12px] text-muted break-all">{SCRIPT_TAG}</div>
            <div>
              <Label htmlFor="send-to" className="mb-1.5">Whoever looks after the site</Label>
              <Input id="send-to" type="email" value={sendTo} onChange={(e) => setSendTo(e.target.value)} placeholder="kea@outrigger.com" autoFocus />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSending(null)}>Not now</Button>
            <Button disabled={!/.+@.+\..+/.test(sendTo)} onClick={sendInstall}>Send it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={connecting} onOpenChange={setConnecting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect a repository for {s.domain}</DialogTitle>
            <DialogDescription>Prism builds each experiment as a branch here. It never writes to your main branch, and never to your production source.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="repo-pick" className="mb-1.5">Repository <span className="font-normal text-muted-2">— what your GitHub connection can see</span></Label>
              <Select value={pick} onValueChange={setPick}>
                <SelectTrigger id="repo-pick" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{REPOS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="repo-prefix" className="mb-1.5">Branch prefix</Label>
              <Input id="repo-prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} spellCheck={false} />
              <p className="text-[12.5px] text-muted-2 mt-2">Every experiment on this site becomes <span className="font-mono">{prefix || "prototype/"}&lt;experiment&gt;</span>.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConnecting(false)}>Cancel</Button>
            <Button onClick={connect}>Connect it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ── Connections ───────────────────────────────────────────────────── */

type Check = { ok: boolean; detail: string };
/** What a live check would come back with. A connection is real state; these are its answers. */
const CHECKS: Record<string, Check> = {
  optimizely: { ok: true, detail: "48 events · 210 ms" },
  github: { ok: true, detail: "token expires in 61 days" },
  anthropic: { ok: true, detail: "Claude Opus 4.8 reachable" },
  firecrawl: { ok: true, detail: "1,240 credits left" },
  openai: { ok: true, detail: "gpt-5 reachable" },
};

function ConnRow({ c, checking, result, onConnect }: { c: Connection; checking: boolean; result?: Check; onConnect?: () => void }) {
  const dim = c.state === "unavailable";
  return (
    <div className={cn("flex items-center gap-4 px-5 py-3.5 border-b border-border last:border-0", dim && "opacity-55")}>
      <div className="w-9 h-9 rounded-lg border border-border bg-surface-2 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-medium">{c.name}</span>
          {c.note && <span className="text-[11px] text-muted-2 border border-border rounded px-1.5 py-0.5">{c.note}</span>}
        </div>
        <div className="text-[12.5px] text-muted-2 mt-0.5">{c.detail}{result && <span className={result.ok ? " text-ok" : " text-danger"}> · {result.ok ? "OK" : "Failed"} · {result.detail}</span>}</div>
      </div>
      {c.state === "connected"
        ? (checking ? <Pill tone="muted">Checking…</Pill> : <Pill tone="ok">Connected</Pill>)
        : c.state === "available" ? <Button size="sm" variant="outline" onClick={onConnect}>Connect</Button> : <Pill tone="muted">Coming soon</Pill>}
    </div>
  );
}

export function ConnectionsView() {
  const [others, setOthers] = useState<Connection[]>(OTHER_CONNECTIONS);
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState<Record<string, Check>>({});
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const connectingConn = [...AB_TOOLS, ...others].find((c) => c.id === connectingId);

  const testAll = () => {
    setChecking(true); setResults({});
    const connected = [...AB_TOOLS, ...others].filter((c) => c.state === "connected");
    connected.forEach((c, i) => setTimeout(() => setResults((r) => ({ ...r, [c.id]: CHECKS[c.id] ?? { ok: true, detail: "reachable" } })), 500 + i * 450));
    setTimeout(() => setChecking(false), 500 + connected.length * 450);
    logActivity("Tested every connection.");
  };
  const connect = () => {
    if (!connectingConn) return;
    setOthers((os) => os.map((c) => (c.id === connectingId ? { ...c, state: "connected", detail: "Your own key", note: "Bring your own" } : c)));
    logActivity(`Connected ${connectingConn.name} with your own key.`);
    setConnectingId(null); setKey("");
  };

  return (
    <>
      <PageHeader title="Connections" actions={<Button size="sm" variant="outline" onClick={testAll} disabled={checking}>{checking ? "Testing…" : "Test all"}</Button>} />
      <div className="flex-1 overflow-auto p-6 space-y-4">
        <Section title="A/B testing tool" action={<span className="text-[12.5px] text-muted-2">Bring your own. One per account.</span>}>
          {AB_TOOLS.map((c) => <ConnRow key={c.id} c={c} checking={checking && !results[c.id]} result={results[c.id]} onConnect={() => setConnectingId(c.id)} />)}
        </Section>
        <Section title="Everything else">
          {others.map((c) => <ConnRow key={c.id} c={c} checking={checking && !results[c.id]} result={results[c.id]} onConnect={() => setConnectingId(c.id)} />)}
        </Section>
        <p className="text-[12.5px] text-muted-2 px-1">
          Keys are yours. Prism stores them for this account only, never shows them again after you save them, and never shares them between accounts.
        </p>
        <SkillsPanel />
      </div>

      <Dialog open={Boolean(connectingId)} onOpenChange={(o) => !o && setConnectingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect {connectingConn?.name}</DialogTitle>
            <DialogDescription>Your account, your usage, your data-handling agreement. The key is stored for this account only and is not shown again after you save it.</DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="conn-key" className="mb-1.5">{connectingConn?.name} API key</Label>
            <Input id="conn-key" type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-…" autoComplete="off" spellCheck={false} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConnectingId(null)}>Cancel</Button>
            <Button disabled={key.trim().length < 8} onClick={connect}>Save and connect</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ── People & roles ────────────────────────────────────────────────── */

type Role = "Author" | "Reviewer" | "Approver" | "Admin";
const ROLES: { role: Role; does: string }[] = [
  { role: "Author", does: "Writes experiments and gets them built. Cannot approve one going live or record its result." },
  { role: "Reviewer", does: "Checks a build before it goes live and can send it back with a note." },
  { role: "Approver", does: "Approves an experiment going live and records its result — never one they wrote or built." },
  { role: "Admin", does: "People, connections, guardrails and sites." },
];

interface Person { name: string; email: string; roles: string[]; agent?: boolean; invited?: boolean }

const PEOPLE: Person[] = [
  { name: "Bryan Hopkins", email: "bryan@outrigger.com", roles: ["Author", "Approver", "Admin"] },
  { name: "Dana Kealoha", email: "dana@outrigger.com", roles: ["Reviewer", "Approver"] },
  { name: "Malia Kahale", email: "malia@outrigger.com", roles: ["Author"] },
  { name: "Kai Nakamura", email: "kai@outrigger.com", roles: ["Author"] },
  { name: "Prism Agent", email: "agent · not a person", roles: ["Builder"], agent: true },
];

function RolePicker({ id, value, onChange }: { id: string; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="space-y-2">
      {ROLES.map((r) => (
        <Label key={r.role} htmlFor={`${id}-${r.role}`} className="items-start gap-3 rounded-xl border border-border px-4 py-3 cursor-pointer font-normal text-foreground">
          <Checkbox id={`${id}-${r.role}`} checked={value.includes(r.role)} className="mt-0.5"
            onCheckedChange={(v) => onChange(v === true ? [...value, r.role] : value.filter((x) => x !== r.role))} />
          <span className="flex-1"><span className="block text-[14px] font-medium">{r.role}</span><span className="block text-[12.5px] text-muted-2 mt-0.5">{r.does}</span></span>
        </Label>
      ))}
    </div>
  );
}

export function PeopleView() {
  const [people, setPeople] = useState<Person[]>(PEOPLE);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<string[]>(["Author"]);
  const [editing, setEditing] = useState<Person | null>(null);
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [enforce, setEnforce] = useState(true);
  const [confirmOff, setConfirmOff] = useState(false);

  const approvers = people.filter((p) => p.roles.includes("Approver") && !p.invited).length;
  const enforceable = approvers >= 2;

  const invite = () => {
    const local = email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    setPeople((ps) => [...ps.filter((p) => !p.agent), { name: local, email: email.trim(), roles, invited: true }, ...ps.filter((p) => p.agent)]);
    logActivity(`Invited ${email.trim()} as ${roles.join(", ") || "a member"}.`);
    setInviting(false); setEmail(""); setRoles(["Author"]);
  };
  const saveRoles = () => {
    if (!editing) return;
    setPeople((ps) => ps.map((p) => (p.email === editing.email ? { ...p, roles: editRoles } : p)));
    logActivity(`Changed ${editing.name}'s roles to ${editRoles.join(", ") || "none"}.`);
    setEditing(null);
  };

  return (
    <>
      <PageHeader title="People & roles" count={`${people.filter((p) => !p.agent).length} people`} actions={<Button size="sm" onClick={() => setInviting(true)}>Invite someone</Button>} />
      <div className="flex-1 overflow-auto p-6 space-y-4">
        <Section>
          {people.map((p) => (
            <div key={p.email} className="flex items-center gap-4 px-5 py-3.5 border-b border-border last:border-0">
              <div className={cn("w-8 h-8 rounded-full shrink-0", p.invited ? "border border-dashed border-border-strong" : "bg-border-strong")} />
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium">{p.name}</div>
                <div className="text-[12.5px] text-muted-2">{p.email}</div>
              </div>
              {p.invited && <Pill tone="warn">Invited</Pill>}
              <div className="flex gap-1.5">
                {p.roles.map((r) => <span key={r} className="text-[12px] text-muted bg-surface-2 rounded px-2 py-0.5">{r}</span>)}
              </div>
              {p.agent
                ? <span className="text-[12.5px] text-muted-2 w-16 text-right">not a person</span>
                : <button onClick={() => { setEditing(p); setEditRoles(p.roles); }} className="text-[13px] text-accent font-medium w-16 text-right">Change</button>}
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
                {enforce && enforceable ? <Pill tone="ok">On</Pill> : enforce ? <Pill tone="warn">Can&rsquo;t be met</Pill> : <Pill tone="muted">Off</Pill>}
                <span className="text-[13px] text-muted">
                  {enforceable
                    ? `${approvers} people can approve — enough for this to work.`
                    : `Only ${approvers} ${approvers === 1 ? "person" : "people"} can approve. Until someone else has the Approver role, every approval will be blocked.`}
                </span>
              </div>
            </div>
            <Switch tone="ok" checked={enforce} onCheckedChange={(v) => (v ? setEnforce(true) : setConfirmOff(true))} aria-label="Require a second person to approve" className="mt-1" />
          </div>
        </Section>
        <p className="text-[12.5px] text-muted-2 px-1">Turning this off is recorded in Activity, with who and when.</p>
      </div>

      <Dialog open={inviting} onOpenChange={setInviting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite someone</DialogTitle>
            <DialogDescription>Roles decide what someone can do — and whether they can approve an experiment they didn&rsquo;t write. You can change them later.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="invite-email" className="mb-1.5">Email</Label>
              <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="lani@outrigger.com" autoFocus />
            </div>
            <div>
              <Label className="mb-2" id="invite-roles">Roles</Label>
              <div aria-labelledby="invite-roles"><RolePicker id="inv" value={roles} onChange={setRoles} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInviting(false)}>Cancel</Button>
            <Button disabled={!/.+@.+\..+/.test(email) || roles.length === 0} onClick={invite}>Send the invitation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.name}&rsquo;s roles</DialogTitle>
            <DialogDescription>Takes effect immediately and is recorded in Activity. An experiment they wrote can never be approved by them, whatever the roles say.</DialogDescription>
          </DialogHeader>
          <RolePicker id="edit" value={editRoles} onChange={setEditRoles} />
          {editing?.roles.includes("Approver") && !editRoles.includes("Approver") && approvers <= 2 && (
            <p className="text-[12.5px] text-warn leading-relaxed">Removing Approver leaves {approvers - 1} — the second-person rule can&rsquo;t be met until someone else can approve.</p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveRoles}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOff} onOpenChange={setConfirmOff}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Turn off the second-person rule?</DialogTitle>
            <DialogDescription>From now on the person who wrote an experiment can approve it going live and record its result. This is written to Activity with your name and the time, and the account&rsquo;s Owner is told.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOff(false)}>Keep it on</Button>
            <Button variant="danger" onClick={() => { setEnforce(false); setConfirmOff(false); logActivity("Turned off the second-person approval rule."); }}>Turn it off</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ── Guardrails ────────────────────────────────────────────────────── */

interface Guardrail { name: string; why: string; on: boolean; event?: string; direction?: "fall" | "rise" }

const GUARDRAILS: Guardrail[] = [
  { name: "Bookings", why: "The number that pays for everything.", on: true, event: "24138040550_book_now_button_clicks", direction: "fall" },
  { name: "Revenue per visit", why: "Catches a win that sells cheaper rooms.", on: true, direction: "fall" },
  { name: "Page errors", why: "Catches a build that broke something.", on: true, direction: "rise" },
  { name: "Cancellation rate", why: "Catches a win that over-promises.", on: false, direction: "rise" },
  { name: "Bounce rate", why: "Catches a change that drives people away.", on: false, direction: "rise" },
];

export function GuardrailsView() {
  const [rails, setRails] = useState<Guardrail[]>(GUARDRAILS);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [why, setWhy] = useState("");
  const [event, setEvent] = useState<string>("");
  const [direction, setDirection] = useState<"fall" | "rise">("fall");
  const dupes = new Set(PROJECT_EVENTS.map((e) => e.name).filter((n, i, a) => a.indexOf(n) !== i));

  const toggle = (i: number) => {
    setRails((rs) => rs.map((r, j) => (i === j ? { ...r, on: !r.on } : r)));
    logActivity(`${rails[i].on ? "Stopped offering" : "Started offering"} the ${rails[i].name} guardrail on new experiments.`);
  };
  const add = () => {
    setRails((rs) => [...rs, { name: name.trim(), why: why.trim(), on: true, event: event || undefined, direction }]);
    logActivity(`Added the ${name.trim()} guardrail${event ? ` on ${event}` : ""}.`);
    setAdding(false); setName(""); setWhy(""); setEvent(""); setDirection("fall");
  };

  return (
    <>
      <PageHeader title="Guardrails" actions={<Button size="sm" variant="outline" onClick={() => setAdding(true)}>Add a guardrail</Button>} />
      <Toolbar>
        <span className="text-[13px] text-muted">
          What must never get worse, whatever an experiment is trying to improve. Ticked ones are offered on every new experiment, already selected.
        </span>
      </Toolbar>
      <div className="flex-1 overflow-auto p-6">
        <Section>
          {rails.map((g, i) => (
            <Label key={g.name} htmlFor={`rail-${i}`} className="flex items-center gap-4 px-5 py-3.5 border-b border-border last:border-0 cursor-pointer font-normal text-foreground">
              <Checkbox id={`rail-${i}`} checked={g.on} onCheckedChange={() => toggle(i)} />
              <span className="flex-1">
                <span className="block text-[14px] font-medium">{g.name}</span>
                <span className="block text-[12.5px] text-muted-2 mt-0.5">{g.why}{g.event && <span className="font-mono"> · {g.event}</span>}{!g.event && <span className="text-warn"> · not bound to an event yet</span>}</span>
              </span>
              <span className="text-[12px] text-muted-2 whitespace-nowrap">must not {g.direction === "rise" ? "rise" : "fall"}</span>
              {g.on && <Pill tone="muted">On by default</Pill>}
            </Label>
          ))}
        </Section>
        <p className="text-[12.5px] text-muted-2 mt-4 max-w-2xl leading-relaxed">
          A guardrail without an event is a wish. Two of these are bound to nothing this project measures — a run can still be judged, but not on them.
        </p>
      </div>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a guardrail</DialogTitle>
            <DialogDescription>Name what must not get worse, then bind it to something this project actually measures. The events are the real ones from Optimizely project 24138040550.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="rail-name" className="mb-1.5">Name</Label>
              <Input id="rail-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Offers page reach" autoFocus />
            </div>
            <div>
              <Label htmlFor="rail-why" className="mb-1.5">What it catches</Label>
              <Input id="rail-why" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="A win that starves the offers page" />
            </div>
            <div>
              <Label htmlFor="rail-event" className="mb-1.5">Bound to</Label>
              <Select value={event} onValueChange={setEvent}>
                <SelectTrigger id="rail-event" className="w-full"><SelectValue placeholder="Pick an event this project reports" /></SelectTrigger>
                <SelectContent>
                  {PROJECT_EVENTS.map((e) => (
                    <SelectItem key={e.key} value={e.key}>{e.name}{dupes.has(e.name) ? ` — ${e.key}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {event && dupes.has(PROJECT_EVENTS.find((e) => e.key === event)?.name ?? "") && (
                <p className="text-[12.5px] text-warn mt-2">Two events share this display name. You picked the one with key <span className="font-mono">{event}</span>.</p>
              )}
            </div>
            <div>
              <Label className="mb-2" id="rail-dir">Direction</Label>
              <RadioGroup aria-labelledby="rail-dir" value={direction} onValueChange={(v) => setDirection(v as "fall" | "rise")} className="grid-cols-2">
                {([["fall", "Must not fall"], ["rise", "Must not rise"]] as const).map(([v, l]) => (
                  <Label key={v} htmlFor={`dir-${v}`} className={cn("gap-3 rounded-xl border px-4 py-3 cursor-pointer font-normal text-foreground", direction === v ? "border-accent bg-accent/5" : "border-border")}>
                    <RadioGroupItem id={`dir-${v}`} value={v} /><span className="text-[14px] font-medium">{l}</span>
                  </Label>
                ))}
              </RadioGroup>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            <Button disabled={name.trim().length < 2 || !event} onClick={add}>Add it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  const rows = [...SESSION_ACTIVITY, ...ACTIVITY];
  const exportCsv = () => {
    const csv = ["when,who,what,sealed", ...rows.map((a) => [a.at, a.who, a.what, a.sealed ? "yes" : "no"].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: "prism-activity.csv" });
    link.click(); URL.revokeObjectURL(url);
  };
  return (
    <>
      <PageHeader title="Activity" count={`${rows.length} entries`} actions={<Button size="sm" variant="outline" onClick={exportCsv}>Export</Button>} />
      <Toolbar>
        <span className="text-[13px] text-muted">Everything anyone did, including Prism. Nothing here can be edited or removed.</span>
      </Toolbar>
      <div className="flex-1 overflow-auto p-6">
        <Section>
          {rows.map((a, i) => (
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
