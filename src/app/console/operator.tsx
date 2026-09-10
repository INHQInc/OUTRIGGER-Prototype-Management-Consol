"use client";

/**
 * THE BACK OFFICE — the operator's console, above any one customer.
 *
 * Deliberately a DIFFERENT SHELL, not a section of the customer console. The
 * audience and the blast radius are different, and mixing them is how somebody
 * approves an experiment on the wrong brand. Amber rail, always-visible
 * "you are in the back office", and one obvious way back.
 *
 * The thing it fixes: today `accessibleOrgIds()` returns EVERY org when the
 * console role is admin (active-org.ts:16), so an operator is silently inside
 * every customer's data — no acting-as state, no audit, and the customer can
 * never know. Here, entering a customer is a SUPPORT SESSION: a reason, a clock,
 * an audit row, and a line in that customer's own Activity.
 *
 * ONE RULE FOR EVERY ACTION HERE: an operator never does a thing on a
 * customer's behalf that needs the customer's credentials. Reconnect, renew,
 * install, nudge — each one is a MESSAGE to the person who can, with the exact
 * thing they need to do. Prism tells us when it's done; nobody reports back.
 */

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { ThemeScope } from "@/components/ui/theme-scope";
import { cn } from "@/lib/ui/cn";
import { CustomerWizard } from "./customer-context";
import { Pill, Section, Th } from "./ui";

interface Cust {
  id: string; name: string; sites: number; experiments: number; people: number;
  running: number; health: "ok" | "warn" | "down"; issue?: string; usage: string; since: string;
  /** Created this session: setup is unfinished and their console shows the checklist. */
  fresh?: boolean;
  /** The sites the wizard created, none of them read yet. */
  siteDomains?: string[];
}

export const CUSTOMERS: Cust[] = [
  { id: "outrigger", name: "OUTRIGGER Hotels & Resorts", sites: 3, experiments: 7, people: 5, running: 2, health: "warn", issue: "Script missing on outriggerkona.com production", usage: "$412 / mo", since: "Mar 2026" },
  { id: "kbh", name: "Kona Beach Hotels", sites: 1, experiments: 3, people: 2, running: 1, health: "ok", usage: "$96 / mo", since: "Jun 2026" },
  { id: "pacifica", name: "Pacifica Resorts Group", sites: 2, experiments: 0, people: 4, running: 0, health: "down", issue: "Optimizely token expired 3 days ago", usage: "$0 / mo", since: "Aug 2026" },
  { id: "islandco", name: "Island Collective", sites: 1, experiments: 12, people: 6, running: 3, health: "ok", usage: "$780 / mo", since: "Nov 2025" },
];

interface ConsoleUser { name: string; email: string; role: "Owner" | "Support"; last: string; invited?: boolean }

const CONSOLE_USERS: ConsoleUser[] = [
  { name: "Bryan Hopkins", email: "bryan@brandgraphai.com", role: "Owner", last: "now" },
  { name: "Rae Whitfield", email: "rae@brandgraphai.com", role: "Support", last: "2 hours ago" },
  { name: "Jonas Ek", email: "jonas@brandgraphai.com", role: "Support", last: "yesterday" },
];

interface Session { who: string; cust: string; reason: string; started: string; expires: string; live: boolean }

const SESSIONS: Session[] = [
  { who: "Rae Whitfield", cust: "Pacifica Resorts Group", reason: "Their Optimizely token expired — checking what their console shows before they reconnect it themselves", started: "14:02", expires: "in 48 min", live: true },
  { who: "Bryan Hopkins", cust: "OUTRIGGER Hotels & Resorts", reason: "Investigating a readout that reported no winner", started: "Yesterday 09:20", expires: "ended 10:05", live: false },
  { who: "Jonas Ek", cust: "Island Collective", reason: "Walking them through their first approval", started: "8 Sep 11:00", expires: "ended 11:40", live: false },
];

interface Issue {
  sev: "down" | "warn"; cust: string; what: string; action: string;
  /** Who the action reaches, and exactly what it asks of them. Every action is a message. */
  to: string; does: string;
  /** Once sent, the row says so and stops asking. Prism clears it when the state changes. */
  sent?: boolean;
}

const HEALTH: Issue[] = [
  { sev: "down", cust: "Pacifica Resorts Group", what: "Optimizely token expired 3 days ago — nothing can be measured or pushed", action: "Reconnect",
    to: "Pacifica's Owner (Tomas Reyes)", does: "Sends a link to reconnect Optimizely from their own console. Prism can't enter their token for them — and shouldn't be able to. The moment a new token works, this row clears itself." },
  { sev: "warn", cust: "OUTRIGGER Hotels & Resorts", what: "Prism script not found on outriggerkona.com production", action: "Resend install",
    to: "whoever looks after outriggerkona.com (Malia K. named Kea Fernandez)", does: "Sends the one-line script with where it goes and what it can't do. Prism hears the first beacon and clears this row — nobody has to report back." },
  { sev: "warn", cust: "Island Collective", what: "GitHub token expires in 9 days", action: "Renew",
    to: "Island Collective's Owner (Priya Nair)", does: "Tells them the token expires on 19 Sep, with where to renew it and what stops working if they don't. Builds keep working until then." },
  { sev: "warn", cust: "OUTRIGGER Hotels & Resorts", what: "An experiment has sat in review for 6 days", action: "Nudge",
    to: "the reviewer it's waiting on (Ana Kealoha)", does: "Reminds her that “Hero without the offer badge” is waiting on her, with a link straight to the review. Prism never approves on anyone's behalf." },
];

const NAV = ["Customers", "Console users", "Support sessions", "Health", "Usage"] as const;
type Room = (typeof NAV)[number];

const healthPill = (h: Cust["health"]) =>
  h === "ok" ? <Pill tone="ok">Healthy</Pill> : h === "warn" ? <Pill tone="warn">Needs attention</Pill> : <Pill tone="danger">Blocked</Pill>;

export function BackOffice({ exit, enterCustomer }: { exit: () => void; enterCustomer: (name: string, reason: string, fresh?: boolean, sites?: string[]) => void }) {
  const scope = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<Room>("Customers");
  const [list, setList] = useState<Cust[]>(CUSTOMERS);
  const [adding, setAdding] = useState(false);
  const [asking, setAsking] = useState<Cust | null>(null);
  const [reason, setReason] = useState("");

  const [users, setUsers] = useState<ConsoleUser[]>(CONSOLE_USERS);
  const [inviting, setInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<ConsoleUser["role"]>("Support");

  const [sessions, setSessions] = useState<Session[]>(SESSIONS);
  const [issues, setIssues] = useState<Issue[]>(HEALTH);
  const [acting, setActing] = useState<number | null>(null);

  const open = issues.filter((i) => !i.sent).length;
  const live = sessions.filter((s) => s.live).length;
  const custsWithIssues = new Set(issues.map((i) => i.cust)).size;

  const sendInvite = () => {
    const local = inviteEmail.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    setUsers((u) => [...u, { name: local, email: inviteEmail.trim(), role: inviteRole, last: "invited — not signed in yet", invited: true }]);
    setInviting(false); setInviteEmail(""); setInviteRole("Support");
  };

  return (
    <ThemeScope.Provider value={scope}>
    <div ref={scope} className="fixed inset-0 z-50 flex bg-background" data-backoffice>
      {/* Same ground as a customer console, but an amber rail down the left and
          an amber label: the tone the support banner uses, so "privileged place"
          is one colour everywhere. Inverting the whole sidebar was distinct but
          blinding against a true-black theme. */}
      <nav className="w-[236px] shrink-0 flex flex-col bg-surface border-r border-border border-l-[3px] border-l-warn">
        <div className="h-14 flex items-center gap-2.5 px-4 border-b border-border">
          <div className="w-[22px] h-[22px] rounded-md bg-warn" />
          <div>
            <div className="text-[14px] font-semibold leading-none">Prism</div>
            <div className="text-[10.5px] text-warn font-semibold mt-0.5 tracking-[0.08em]">BACK OFFICE</div>
          </div>
        </div>
        <div className="flex-1 px-3 pt-3">
          {NAV.map((n) => (
            <button key={n} onClick={() => { setRoom(n); setAdding(false); }}
              className={cn("w-full text-left rounded-lg px-2.5 py-[7px] mb-0.5 text-[13.5px]",
                room === n ? "bg-surface-2 font-semibold text-foreground" : "text-muted hover:text-foreground hover:bg-surface-2/60")}>
              {n}
              {n === "Health" && open > 0 && <span className="float-right text-[11px] font-bold bg-warn text-warn-fg rounded-full px-1.5 tabular-nums">{open}</span>}
              {n === "Support sessions" && live > 0 && <span className="float-right text-[11px] font-bold bg-ok text-ok-fg rounded-full px-1.5 tabular-nums">{live}</span>}
            </button>
          ))}
        </div>
        <button onClick={exit} className="m-3 rounded-lg border border-border px-3 py-2 text-[13px] text-muted hover:text-foreground hover:border-border-strong">
          ← Back to a customer console
        </button>
      </nav>

      <main className="flex-1 min-w-0 flex flex-col">
        {adding && (
          <CustomerWizard onClose={() => setAdding(false)} onDone={(name, sites) => {
            const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
            setList((l) => [{ id, name, sites: sites.length, experiments: 0, people: 1, running: 0, health: "warn",
              issue: `Setup unfinished — ${sites.length} site${sites.length === 1 ? "" : "s"} not read yet, no A/B tool connected`, usage: "$0 / mo", since: "Sep 2026", fresh: true, siteDomains: sites }, ...l]);
            setAdding(false); setRoom("Customers");
          }} />
        )}
        {!adding && (<>
        <header className="h-14 shrink-0 border-b border-border bg-surface flex items-center px-6 gap-3">
          <h1 className="text-[15px] font-semibold">{room}</h1>
          {room === "Customers" && <span className="text-[13px] text-muted-2">{list.length} customers</span>}
          <div className="ml-auto flex gap-2">
            {room === "Customers" && <Button size="sm" onClick={() => setAdding(true)}>Add a customer</Button>}
            {room === "Console users" && <Button size="sm" onClick={() => setInviting(true)}>Invite a colleague</Button>}
          </div>
        </header>

        <div className="flex-1 overflow-auto">
          {room === "Customers" && (
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-surface-2/80 backdrop-blur">
                <tr><Th first>Customer</Th><Th>Health</Th><Th>Sites</Th><Th>Experiments</Th><Th>People</Th><Th>AI usage</Th><Th>Since</Th><Th>Access</Th></tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id} className="border-b border-border hover:bg-surface-2/50">
                    <td className="px-4 pl-6 py-3">
                      <div className="text-[14px] font-medium">{c.name}</div>
                      {c.issue && <div className="text-[12.5px] text-warn mt-0.5">{c.issue}</div>}
                    </td>
                    <td className="px-4 py-3">{healthPill(c.health)}</td>
                    <td className="px-4 py-3 text-[13.5px] text-muted tabular-nums">{c.sites}</td>
                    <td className="px-4 py-3 text-[13.5px] text-muted tabular-nums">{c.experiments}{c.running > 0 && <span className="text-ok"> · {c.running} live</span>}</td>
                    <td className="px-4 py-3 text-[13.5px] text-muted tabular-nums">{c.people}</td>
                    <td className="px-4 py-3 text-[13.5px] text-muted tabular-nums">{c.usage}</td>
                    <td className="px-4 py-3 text-[13px] text-muted-2 whitespace-nowrap">{c.since}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => { setAsking(c); setReason(""); }} className="text-[13px] font-medium text-accent whitespace-nowrap">Open their console →</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {room === "Console users" && (
            <div className="p-6 space-y-4">
              <Section title="Who can reach the back office">
                {users.map((u) => (
                  <div key={u.email} className="flex items-center gap-4 px-5 py-3.5 border-b border-border last:border-0">
                    <div className={cn("w-8 h-8 rounded-full shrink-0", u.invited ? "border border-dashed border-border-strong" : "bg-border-strong")} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-medium">{u.name}</div>
                      <div className="text-[12.5px] text-muted-2">{u.email}</div>
                    </div>
                    {u.invited && <Pill tone="warn">Invited</Pill>}
                    <Pill tone={u.role === "Owner" ? "accent" : "muted"}>{u.role}</Pill>
                    <span className="text-[13px] text-muted-2 w-44 text-right">{u.last}</span>
                  </div>
                ))}
              </Section>
              <p className="text-[13px] text-muted leading-relaxed max-w-2xl">
                Back-office access is not access to customer data. Reaching a customer&rsquo;s console always opens a support
                session with a reason and a clock, and it appears in <span className="text-foreground">that customer&rsquo;s own Activity</span> —
                so they can see who looked, when, and why.
              </p>
            </div>
          )}

          {room === "Support sessions" && (
            <div className="p-6 space-y-4">
              <Section title={live ? "Open now" : "Nothing open"}>
                {live === 0 && <div className="px-5 py-4 text-[13.5px] text-muted-2">No one is inside a customer&rsquo;s console right now.</div>}
                {sessions.filter((s) => s.live).map((s) => (
                  <div key={s.started} className="flex items-start gap-4 px-5 py-4">
                    <span className="w-2 h-2 rounded-full bg-ok mt-1.5 shrink-0" />
                    <div className="flex-1">
                      <div className="text-[14px] font-medium">{s.who} is in {s.cust}</div>
                      <div className="text-[13px] text-muted mt-0.5">{s.reason}</div>
                      <div className="text-[12.5px] text-muted-2 mt-1">Started {s.started} · expires {s.expires}</div>
                    </div>
                    <Button size="sm" variant="outline"
                      onClick={() => setSessions((ss) => ss.map((x) => (x === s ? { ...x, live: false, expires: "ended just now — by you" } : x)))}>
                      End it now
                    </Button>
                  </div>
                ))}
              </Section>
              <Section title="Earlier">
                {sessions.filter((s) => !s.live).map((s) => (
                  <div key={s.started} className="flex items-start gap-4 px-5 py-3.5 border-b border-border last:border-0">
                    <div className="flex-1">
                      <div className="text-[13.5px]"><span className="font-medium">{s.who}</span> <span className="text-muted-2">in {s.cust}</span></div>
                      <div className="text-[13px] text-muted mt-0.5">{s.reason}</div>
                    </div>
                    <span className="text-[12.5px] text-muted-2 whitespace-nowrap">{s.started} · {s.expires}</span>
                  </div>
                ))}
              </Section>
              <p className="text-[13px] text-muted-2 leading-relaxed max-w-2xl">
                Ending a session ends it for the person inside it — their next click lands back here. The row stays, because the customer saw it start.
              </p>
            </div>
          )}

          {room === "Health" && (
            <div className="p-6">
              <Section title={open ? `${open} thing${open === 1 ? "" : "s"} need${open === 1 ? "s" : ""} attention across ${custsWithIssues} customers` : "Nothing is waiting on us"}>
                {issues.map((h, i) => (
                  <div key={i} className={cn("flex items-center gap-4 px-5 py-3.5 border-b border-border last:border-0", h.sent && "opacity-70")}>
                    <span className={cn("w-2 h-2 rounded-full shrink-0", h.sent ? "bg-border-strong" : h.sev === "down" ? "bg-danger" : "bg-warn")} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px]">{h.what}</div>
                      <div className="text-[12.5px] text-muted-2 mt-0.5">{h.cust}{h.sent && <span> · sent to {h.to.split(" (")[0]} — clears itself when the state changes</span>}</div>
                    </div>
                    {h.sent ? <Pill tone="muted">Sent · waiting</Pill> : <Button size="sm" variant="outline" onClick={() => setActing(i)}>{h.action}</Button>}
                  </div>
                ))}
              </Section>
              <p className="text-[13px] text-muted-2 mt-4 leading-relaxed max-w-2xl">
                Everything here is derived from real state — a token&rsquo;s expiry date, a script that has not beaconed, an
                experiment&rsquo;s age in a stage. Nothing is a manual flag somebody has to remember to clear, and every action
                is a message to the one person who can fix it: we never hold a customer&rsquo;s credentials.
              </p>
            </div>
          )}

          {room === "Usage" && (
            <div className="p-6 space-y-4">
              <Section title="AI usage this month">
                {list.map((c) => (
                  <div key={c.id} className="flex items-center gap-4 px-5 py-3.5 border-b border-border last:border-0">
                    <div className="flex-1 text-[14px]">{c.name}</div>
                    <span className="text-[12.5px] text-muted-2">{c.fresh ? "nothing connected yet" : c.id === "outrigger" || c.id === "islandco" ? "their own key" : "Prism's key · billed"}</span>
                    <span className="text-[14px] tabular-nums w-20 text-right font-medium">{c.usage}</span>
                  </div>
                ))}
              </Section>
              <p className="text-[13px] text-muted-2">
                A customer on their own key is metered but never billed here — the cost lands on their account, which is
                the point of offering it.
              </p>
            </div>
          )}
        </div>
        </>)}
      </main>

      {/* Entering a customer is a support session, never a silent switch. */}
      <Dialog open={Boolean(asking)} onOpenChange={(o) => !o && setAsking(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Open {asking?.name}&rsquo;s console</DialogTitle>
            <DialogDescription>
              You&rsquo;ll be acting inside their account. They will see that you were there, why, and for how long —
              it appears in their own Activity, not only in ours.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="reason" className="mb-1.5">Why do you need to go in?</Label>
            <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} autoFocus
              placeholder="Their readout reported no winner — looking at what they see" className="resize-none" />
          </div>
          <DialogFooter className="sm:justify-start items-center">
            <Button disabled={reason.trim().length < 8} onClick={() => { if (asking) enterCustomer(asking.name, reason, asking.fresh, asking.siteDomains); setAsking(null); }}>
              Start a 1-hour session
            </Button>
            <Button variant="ghost" onClick={() => setAsking(null)}>Cancel</Button>
            <span className="text-[12.5px] text-muted-2 sm:ml-auto">Ends automatically</span>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inviting a colleague grants the back office, never a customer. */}
      <Dialog open={inviting} onOpenChange={setInviting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a colleague to the back office</DialogTitle>
            <DialogDescription>
              They can see every customer&rsquo;s health and usage. Opening any customer&rsquo;s console still needs a reason and starts a
              session that customer can see.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="invite-email" className="mb-1.5">Email</Label>
              <Input id="invite-email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="colleague@brandgraphai.com" autoFocus />
            </div>
            <div>
              <Label id="invite-role" className="mb-2">Role</Label>
              <RadioGroup aria-labelledby="invite-role" value={inviteRole} onValueChange={(v) => setInviteRole(v as ConsoleUser["role"])}>
                {([
                  ["Support", "Can open a customer's console with a reason, and act on Health."],
                  ["Owner", "Everything Support can, plus inviting and removing back-office users and creating customers."],
                ] as const).map(([r, sub]) => (
                  <Label key={r} htmlFor={`role-${r}`}
                    className={cn("items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer font-normal text-foreground", inviteRole === r ? "border-accent bg-accent/5" : "border-border hover:border-border-strong")}>
                    <RadioGroupItem id={`role-${r}`} value={r} className="mt-0.5" />
                    <span className="flex-1"><span className="block text-[14px] font-medium">{r}</span><span className="block text-[12.5px] text-muted-2 mt-0.5">{sub}</span></span>
                  </Label>
                ))}
              </RadioGroup>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInviting(false)}>Cancel</Button>
            <Button disabled={!/.+@.+\..+/.test(inviteEmail)} onClick={sendInvite}>Send the invitation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* A Health action is a message to the one person who can fix it. */}
      <Dialog open={acting !== null} onOpenChange={(o) => !o && setActing(null)}>
        {acting !== null && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{issues[acting].action} — {issues[acting].cust}</DialogTitle>
              <DialogDescription>
                <span className="block text-foreground mb-2">{issues[acting].what}.</span>
                Goes to <span className="text-foreground">{issues[acting].to}</span>. {issues[acting].does}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setActing(null)}>Not now</Button>
              <Button onClick={() => { setIssues((is) => is.map((x, j) => (j === acting ? { ...x, sent: true } : x))); setActing(null); }}>
                Send it
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
    </ThemeScope.Provider>
  );
}

/** The banner that must never be absent while acting inside a customer. */
export function SupportBanner({ customer, reason, end }: { customer: string; reason: string; end: () => void }) {
  return (
    <div className="shrink-0 bg-warn/15 border-b border-warn/40 px-6 py-2 flex items-center gap-3">
      <span className="w-2 h-2 rounded-full bg-warn shrink-0" />
      <span className="text-[13px]">
        <span className="font-semibold">Support session</span> — you are acting inside <span className="font-semibold">{customer}</span>. They can see this.
      </span>
      <span className="text-[12.5px] text-muted-2 truncate max-w-md">&ldquo;{reason}&rdquo;</span>
      <span className="text-[12.5px] text-muted-2 ml-auto whitespace-nowrap">57 min left</span>
      <button onClick={end} className="text-[13px] font-semibold text-accent whitespace-nowrap">End session</button>
    </div>
  );
}
