"use client";

/**
 * ENDING AN ACCOUNT — archive, and delete.
 *
 * The hard part is not the button. An account holds things Prism does not own:
 * a script tag in the customer's own HTML, branches in the customer's own code
 * host, readout links in other people's inboxes. It also holds the one thing
 * the product calls immutable — recorded decisions, the earned layer. So both
 * acts have to be honest about what they can reach and what they cannot.
 *
 * TWO ACTS, NOT ONE.
 *   Archive = stop.  Reversible. Nothing runs; everything stays readable.
 *   Delete  = leave. Irreversible, and only reachable FROM archived — you
 *                    cannot delete an account that still has something live.
 *
 * THE PRECONDITIONS ARE DERIVED, NEVER CHECKBOXES. Every line below is state
 * some other surface already reads — a run's status, a script's heartbeat, a
 * date. Nothing here is a flag somebody has to remember to set, which is the
 * same rule the setup checklist and back-office Health are built on.
 *
 * THE INVARIANT THAT MATTERS MOST. A run stopped because the account was
 * archived is NOT A FINDING. Nothing was disproved, so its verdict is
 * `not_adjudicable` with that reason recorded — never `refuted`. Writing an
 * administrative act into the earned layer as evidence would falsify the one
 * layer the product calls measured.
 *
 * The four calls this file settles (BETA-2.md §5):
 *   1. Delete waits 30 days from the archive date, shown as a date. An Owner's
 *      written request can shorten it, and the operator records the request.
 *   2. Both may delete: the Owner from their own account, the operator from the
 *      back office. Same preconditions, same words.
 *   3. Archiving keeps READ access. An archived account its owner cannot open is
 *      a hostage, not an archive.
 *   4. Un-archiving cannot put back a tag they removed, so it lands in the same
 *      setup state a new account has rather than pretending to be live.
 */

import { createContext, useContext, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/ui/cn";
import { Pill, Section } from "./ui";

export type AccountState = "active" | "archived";

/** Archived accounts are readable and unwritable. One context, read by PageHeader,
 *  so a room cannot forget: an archived account has no action buttons anywhere. */
export const Archived = createContext(false);
export const useArchived = () => useContext(Archived);

const TODAY = "11 Sep 2026";
const COOLING_OFF_DAYS = 30;
/** 30 days after TODAY. A constant, because the mock has no clock. */
const DELETABLE_FROM = "11 Oct 2026";

/** What the account holds when someone tries to end it. Everything here is
 *  counted from state, never stored. */
export interface Holdings {
  name: string;
  /** Runs reaching real visitors right now. */
  live: number;
  /** Experiments part-way through, not live. */
  inFlight: number;
  /** Environments whose tag is still calling home. */
  beaconing: { env: string; url: string }[];
  /** Recorded decisions — the earned layer. */
  decisions: number;
  /** Readout links held by people with no account. */
  sharedLinks: number;
  /** Branches Prism wrote into the customer's own repository. */
  branches: number;
  people: number;
  /** Set once archived. */
  archivedOn?: string;
}

export interface Precondition {
  id: string;
  what: string;
  detail: string;
  /** Met = nothing stands in the way. */
  met: boolean;
  /** Prism can clear this itself, as one deliberate act. */
  clear?: { label: string; run: () => void };
  /** Prism cannot do this — only the customer can. */
  theirs?: boolean;
}

/* ── What stands in the way ────────────────────────────────────────── */

export function archiveBlockers(h: Holdings, stopAll: () => void): Precondition[] {
  return [
    {
      id: "live",
      what: h.live === 0 ? "Nothing is reaching real visitors" : `${h.live} run${h.live === 1 ? " is" : "s are"} reaching real visitors`,
      detail: h.live === 0
        ? "No run is live, so archiving changes nothing a visitor can see."
        : "Archiving stops them. Each one stops with whatever the data supports, and the record says it was stopped because the account was archived — not that it was refuted. Nothing was disproved.",
      met: h.live === 0,
      clear: h.live > 0 ? { label: `Stop ${h.live} and archive`, run: stopAll } : undefined,
    },
  ];
}

export function deleteBlockers(h: Holdings, exported: boolean, waived: boolean, recheck?: () => void): Precondition[] {
  return [
    {
      id: "archived",
      what: h.archivedOn ? `Archived on ${h.archivedOn}` : "The account is still active",
      detail: h.archivedOn
        ? "Nothing has run since. Deleting is only ever reachable from here."
        : "Archive it first. Deleting an account that still has something live is how a run disappears mid-flight with nobody told.",
      met: Boolean(h.archivedOn),
    },
    {
      id: "cooling",
      what: waived ? "The wait was shortened on a written request" : `Deletable from ${DELETABLE_FROM}`,
      detail: waived
        ? "The Owner asked in writing. The request is on the record beside this deletion."
        : `${COOLING_OFF_DAYS} days from the archive date. Deleting cannot be undone, and most deletions that are regretted are regretted in the first week.`,
      met: waived || false,
    },
    {
      id: "script",
      what: h.beaconing.length === 0 ? "No page is still calling home" : `${h.beaconing.length} page${h.beaconing.length === 1 ? "" : "s"} still ${h.beaconing.length === 1 ? "carries" : "carry"} the tag`,
      detail: h.beaconing.length === 0
        ? "Prism has heard nothing from this account's pages."
        : "Prism cannot remove a tag from someone else's HTML. While the script is there it will keep calling, and Prism would have nothing to answer with. Remove it, then delete.",
      met: h.beaconing.length === 0,
      theirs: h.beaconing.length > 0,
      // Prism verifies by listening, not by asking someone to tick a box.
      clear: h.beaconing.length > 0 && recheck ? { label: "Check again", run: recheck } : undefined,
    },
    {
      id: "export",
      what: exported ? "Everything Prism learned has been exported" : "Nothing has been exported",
      detail: exported
        ? "The decisions, the readouts and the site profiles are downloaded. What is deleted next is the copy Prism holds."
        : `${h.decisions} recorded decision${h.decisions === 1 ? "" : "s"} and everything learned from them. This is the account's, not ours — take it before it goes.`,
      met: exported,
    },
  ];
}

/* ── The list ──────────────────────────────────────────────────────── */

function Preconditions({ items }: { items: Precondition[] }) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {items.map((p) => (
        <div key={p.id} className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-0">
          <span className={cn("mt-0.5 w-4 h-4 rounded-full grid place-items-center shrink-0",
            p.met ? "bg-ok text-ok-fg" : p.theirs ? "border-2 border-warn" : "border-2 border-border-strong")}>
            {p.met && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn("text-[13.5px]", p.met ? "text-muted" : "font-medium")}>{p.what}</span>
              {p.theirs && <Pill tone="warn">Only you can do this</Pill>}
            </div>
            <p className="text-[12.5px] text-muted-2 mt-0.5 leading-relaxed">{p.detail}</p>
          </div>
          {p.clear && !p.met && <Button size="sm" variant="outline" onClick={p.clear.run}>{p.clear.label}</Button>}
        </div>
      ))}
    </div>
  );
}

/** What survives, what goes, and what Prism cannot touch either way. */
function Consequences({ h, act }: { h: Holdings; act: "archive" | "delete" }) {
  const rows = act === "archive"
    ? [
        ["Recorded decisions and readouts", `All ${h.decisions} stay readable. This is the point of archiving.`, "ok"],
        ["People", `All ${h.people} keep read access and lose write. An archived account its owner cannot open is a hostage, not an archive.`, "ok"],
        ["The tag on their pages", "Prism serves nothing, so every page goes back to what it showed before, on the next load. The tag itself stays in your HTML — we cannot reach it.", "warn"],
        ["Branches in the repository", `All ${h.branches} are untouched. They are in your code host, not ours.`, "muted"],
        ["Shared readout links", `All ${h.sharedLinks} keep working.`, "ok"],
        ["Metered usage", "Stops today. Nothing is billed from here.", "muted"],
      ] as const
    : [
        ["Recorded decisions and readouts", `All ${h.decisions} are destroyed, along with everything learned from them. Export first — it is yours.`, "danger"],
        ["Shared readout links", `All ${h.sharedLinks} stop working. Anyone holding one sees nothing.`, "danger"],
        ["Keys", "The A/B tool, model and code-host credentials are revoked and destroyed.", "danger"],
        ["People and activity", `All ${h.people} lose access. The activity record goes too — it was your record of who looked at your data.`, "danger"],
        ["Branches in the repository", `All ${h.branches} are LEFT ALONE. Prism does not own that repository and will not delete from it. If you want them gone, delete them yourself.`, "warn"],
        ["What survives", "One line in our own audit: an account was deleted, when, by whom, and on whose request. No content of yours.", "muted"],
      ] as const;
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {rows.map(([k, v, tone]) => (
        <div key={k} className="px-4 py-2.5 border-b border-border last:border-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium">{k}</span>
            <span className={cn("ml-auto w-1.5 h-1.5 rounded-full shrink-0",
              tone === "ok" ? "bg-ok" : tone === "warn" ? "bg-warn" : tone === "danger" ? "bg-danger" : "bg-border-strong")} />
          </div>
          <p className="text-[12.5px] text-muted-2 mt-0.5 leading-relaxed">{v}</p>
        </div>
      ))}
    </div>
  );
}

/* ── Archive ───────────────────────────────────────────────────────── */

export function ArchiveDialog({ h, open, onOpenChange, onArchived }: {
  h: Holdings; open: boolean; onOpenChange: (o: boolean) => void; onArchived: (stopped: number) => void;
}) {
  const [stopping, setStopping] = useState(false);
  const stopAll = () => {
    setStopping(true);
    setTimeout(() => { setStopping(false); onArchived(h.live); onOpenChange(false); }, 1100);
  };
  const items = archiveBlockers(h, stopAll);
  const clear = items.every((p) => p.met);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!stopping) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-[620px]" showCloseButton={!stopping}>
        <DialogHeader>
          <DialogTitle>Archive {h.name}</DialogTitle>
          <DialogDescription>
            Nothing runs and nothing can change. Everything stays readable, and you can bring it back.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Preconditions items={items} />
          <div>
            <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-2">WHAT HAPPENS</div>
            <Consequences h={h} act="archive" />
          </div>
          {stopping && <p className="text-[13px] text-warn">Stopping {h.live} run{h.live === 1 ? "" : "s"}&hellip;</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={stopping} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!clear || stopping} onClick={() => { onArchived(0); onOpenChange(false); }}>
            Archive it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Delete ────────────────────────────────────────────────────────── */

export function DeleteDialog({ h, open, onOpenChange, onDeleted, operator = false }: {
  h: Holdings; open: boolean; onOpenChange: (o: boolean) => void; onDeleted: () => void;
  /** The operator's path asks who requested it; the Owner's does not — they are the request. */
  operator?: boolean;
}) {
  const [exported, setExported] = useState(false);
  const [waive, setWaive] = useState(false);
  const [request, setRequest] = useState("");
  const [typed, setTyped] = useState("");
  const [checking, setChecking] = useState(false);
  /** What Prism heard on the last check. Undefined = the account's own state. */
  const [quiet, setQuiet] = useState(false);
  const waived = waive && request.trim().length > 8;
  const heard: Holdings = quiet ? { ...h, beaconing: [] } : h;
  const recheck = () => {
    setChecking(true);
    setTimeout(() => { setChecking(false); setQuiet(true); }, 1400);
  };
  const items = deleteBlockers(heard, exported, waived, recheck);
  const blocking = items.filter((p) => !p.met);
  const nameMatches = typed.trim() === h.name;

  const exportAll = () => {
    const doc = [`Prism — everything learned about ${h.name}`, `Exported ${TODAY}`, "",
      `${h.decisions} recorded decisions, their readouts, and the site profiles behind them.`,
      "This file is a stand-in: the real export is a zip of the decision records, the readouts as written, and each site's context revisions."].join("\n");
    const url = URL.createObjectURL(new Blob([doc], { type: "text/plain" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `prism-${h.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-export.txt` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExported(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>Delete {h.name}</DialogTitle>
          <DialogDescription>
            This cannot be undone, and it is not the same as archiving. Everything Prism holds about this account is destroyed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[52vh] overflow-auto pr-1">
          <Preconditions items={items} />
          {checking && <p className="text-[13px] text-muted">Listening for {h.beaconing.length} page{h.beaconing.length === 1 ? "" : "s"}&hellip; Prism waits for a tag to call home rather than asking you to confirm it is gone.</p>}
          {quiet && h.beaconing.length > 0 && (
            <p className="text-[13px] text-muted-2">Nothing called home on the last check. If the tag goes back on a page after this, Prism will have nothing to answer with.</p>
          )}

          {!exported && (
            <Button size="sm" variant="outline" onClick={exportAll}>Export everything first</Button>
          )}

          {!waived && !items.find((p) => p.id === "cooling")?.met && (
            <div className="rounded-xl border border-border px-4 py-3">
              <Label htmlFor="waive" className="items-start gap-3 cursor-pointer font-normal text-foreground">
                <Checkbox id="waive" checked={waive} onCheckedChange={(v) => setWaive(v === true)} className="mt-0.5" />
                <span className="flex-1">
                  <span className="block text-[13.5px] font-medium">
                    {operator ? "The Owner has asked in writing to delete it sooner" : "Delete it before that date"}
                  </span>
                  <span className="block text-[12.5px] text-muted-2 mt-0.5">
                    {operator
                      ? "Paste what they said. It is kept on the record beside the deletion, so nobody has to remember why the wait was shortened."
                      : "You can waive the wait on your own account. Say why — it is kept on the record beside the deletion."}
                  </span>
                </span>
              </Label>
              {waive && (
                <Textarea className="mt-3" rows={2} value={request} onChange={(e) => setRequest(e.target.value)}
                  placeholder={operator ? "“We've moved to another tool — please remove our data now.” — Dana Reyes, 11 Sep" : "We've moved to another tool and want our data removed now."}
                  aria-label="The request to shorten the wait" />
              )}
            </div>
          )}

          <div>
            <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-2">WHAT HAPPENS</div>
            <Consequences h={heard} act="delete" />
          </div>

          {blocking.length === 0 && (
            <div>
              <Label htmlFor="confirm-name" className="mb-1.5">Type <span className="font-mono text-foreground">{h.name}</span> to confirm</Label>
              <Input id="confirm-name" value={typed} onChange={(e) => setTyped(e.target.value)} spellCheck={false} autoComplete="off" />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="danger" disabled={blocking.length > 0 || !nameMatches}
            onClick={() => { onDeleted(); onOpenChange(false); }}>
            {blocking.length > 0 ? `${blocking.length} thing${blocking.length === 1 ? "" : "s"} first` : "Delete it for good"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── The Owner's own surface ───────────────────────────────────────── */

export function EndOfLife({ h, state, onArchive, onUnarchive, onDelete }: {
  h: Holdings; state: AccountState;
  onArchive: (stopped: number) => void; onUnarchive: () => void; onDelete: () => void;
}) {
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <>
      <Section title="Ending this account">
        <div className="p-5">
          {state === "active" ? (
            <>
              <div className="flex items-start gap-5">
                <div className="flex-1">
                  <div className="text-[14.5px] font-semibold mb-1">Archive it</div>
                  <p className="text-[13.5px] text-muted leading-relaxed">
                    Stops everything and keeps everything. Nothing runs, nothing can change, and every readout and decision stays readable.
                    You can bring it back — though not the tag, if it gets removed from your pages while it is gone.
                  </p>
                </div>
                <Button variant="outline" onClick={() => setArchiving(true)}>Archive&hellip;</Button>
              </div>
              <div className="mt-4 pt-4 border-t border-border flex items-start gap-5">
                <div className="flex-1">
                  <div className="text-[14.5px] font-semibold mb-1">Delete it</div>
                  <p className="text-[13.5px] text-muted leading-relaxed">
                    Archive it first. Deleting is only ever reachable from archived, so nothing disappears mid-flight with nobody told.
                  </p>
                </div>
                <Button variant="ghost" disabled title="Archive the account first">Delete&hellip;</Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2.5 mb-3">
                <Badge variant="warn">Archived</Badge>
                <span className="text-[13px] text-muted">on {h.archivedOn} · readable, nothing runs</span>
              </div>
              <div className="flex items-start gap-5">
                <div className="flex-1">
                  <div className="text-[14.5px] font-semibold mb-1">Bring it back</div>
                  <p className="text-[13.5px] text-muted leading-relaxed">
                    Everything becomes writable again. It comes back to the setup checklist rather than to running — if the tag was taken off your
                    pages while it was archived, it has to go back on before anything can reach a visitor. Prism cannot tell until a page calls home.
                  </p>
                </div>
                <Button onClick={onUnarchive}>Un-archive</Button>
              </div>
              <div className="mt-4 pt-4 border-t border-border flex items-start gap-5">
                <div className="flex-1">
                  <div className="text-[14.5px] font-semibold mb-1">Delete it for good</div>
                  <p className="text-[13.5px] text-muted leading-relaxed">
                    Destroys everything Prism holds — {h.decisions} recorded decisions and everything learned from them. Export it first; it is yours.
                    Deletable from <span className="text-foreground">{DELETABLE_FROM}</span>, or sooner if you say why.
                  </p>
                </div>
                <Button variant="danger" onClick={() => setDeleting(true)}>Delete&hellip;</Button>
              </div>
            </>
          )}
        </div>
      </Section>

      <ArchiveDialog h={h} open={archiving} onOpenChange={setArchiving} onArchived={onArchive} />
      <DeleteDialog h={{ ...h, archivedOn: state === "archived" ? h.archivedOn : undefined }} open={deleting} onOpenChange={setDeleting} onDeleted={onDelete} />
    </>
  );
}

/** Never absent while an account is archived. The counterpart of the support banner. */
export function ArchivedBanner({ on, onUnarchive }: { on: string; onUnarchive: () => void }) {
  return (
    <div className="shrink-0 bg-surface-2 border-b border-border-strong px-6 py-2 flex items-center gap-3">
      <span className="w-2 h-2 rounded-full bg-border-strong shrink-0" />
      <span className="text-[13px]">
        <span className="font-semibold">Archived</span> on {on} — nothing runs and nothing can change. Everything here is readable.
      </span>
      <button onClick={onUnarchive} className="ml-auto text-[13px] font-semibold text-accent whitespace-nowrap">Un-archive</button>
    </div>
  );
}
