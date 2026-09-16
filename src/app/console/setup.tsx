"use client";

/**
 * SETUP · AGENT HANDSHAKE · INJECTION PROOF
 *
 * The three surfaces a customer meets before anything of theirs has ever run.
 * Each one exists to replace a guess with a fact, and the rules underneath them
 * are the reason they look the way they do:
 *
 *  · A STEP IS DERIVED, NEVER TICKED. Completion comes from the same state the
 *    rest of the console reads — an environment row exists, the host app is
 *    installed, a token lists projects, a tag reported in. A checkbox anyone can
 *    click is a claim; this list is an observation.
 *  · A BLOCKED STEP CARRIES ITS REASON. Prerequisites are stated on the row, so
 *    they are read rather than discovered through a failure three screens later.
 *    Numbering is the order that works — not a lock. A step opens the moment its
 *    own prerequisite is met, because hard locks make honest mistakes unfixable.
 *  · THE CHECKLIST IS SCAFFOLDING. It removes itself when the last step ticks
 *    and says so before it does, so nobody learns a room that is about to vanish.
 *  · "AGENT ENGAGED" IS A BEACON, NOT A BOX. A session checks in with the branch,
 *    the host and the digest of the skills it loaded. That digest is what makes
 *    "restart it" provable: SKILL.md is read once at session start and does not
 *    hot-load, so a re-synced branch and a running session can disagree, and the
 *    console can see that they do.
 *  · PROOF IS PER TARGET PAGE, NOT PER ENVIRONMENT. A tag on the home page says
 *    nothing about the one page a prototype actually targets. And the worst
 *    result is not ABSENT — it is a prep tag answering on a production URL.
 *  · A SERVER-SIDE FETCH CANNOT SEE A CLIENT-SIDE INJECTION. Where the served
 *    HTML carries something that could inject the tag after load, the honest
 *    answer is "can't tell" and a person may vouch for it — attributed, dated,
 *    persisted, and never quietly upgraded to FOUND.
 *
 * Frozen facts — a beacon that arrived, a person who vouched — render as a
 * bordered mono receipt with a lock. Tokens, projects, branches and READMEs are
 * mutable, so they are plain text.
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/ui/cn";
import { Pill, Section, Meta, Th, PageHeader, Toolbar, Chip, Empty } from "./ui";
import { logActivity, resolveSite } from "./config";
import { understandingOf } from "./customer-context";
import { firstUnmet, siteReady, siteSteps, type Site, type SiteStepKey } from "@/lib/console/fake";

/* ── Fixtures ──────────────────────────────────────────────────────── */

const ME = { name: "Bryan Hopkins", role: "Approver" };
const PROTOTYPE = "Rate-calendar best-price promise";
const BUILD = "8c1d7e2";

/** The tag as it is pasted, for one environment's own id. Said once: the checklist shows it, Injection proof copies it. */
const TAG_LINES = (tag: string) => [
  `<script src="https://tag.prism.build/opmc.js"`,
  `        data-tag="${tag}" async></script>`,
];

/* ── Small parts ───────────────────────────────────────────────────── */

const Lock = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

const Check = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

/** A frozen fact: observed, attributed, never editable in place. */
function Receipt({ title, rows, tone }: { title: string; rows: [string, string][]; tone?: "accent" }) {
  return (
    <div className={cn("rounded-lg border bg-surface-2/50 overflow-hidden", tone === "accent" ? "border-accent/40" : "border-border-strong")}>
      <div className={cn("flex items-center gap-1.5 px-3.5 py-2 border-b border-border text-[10.5px] font-semibold tracking-[0.07em]",
        tone === "accent" ? "text-accent" : "text-muted-2")}>
        <Lock />{title}
      </div>
      <dl className="px-3.5 py-2.5 font-mono text-[12px] leading-[1.85] tabular-nums">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3">
            <dt className="w-[92px] shrink-0 text-muted-2">{k}</dt>
            <dd className="min-w-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** A line to paste. Mono because it is typed, but NOT a receipt — it is not a fact. */
function CodeBlock({ label, lines }: { label: string; lines: string[] }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(lines.join("\n")); setCopied(true); };
  return (
    <div className="rounded-lg border border-border bg-surface-2/50 overflow-hidden">
      <div className="flex items-center gap-3 px-3.5 py-2 border-b border-border">
        <span className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2">{label}</span>
        {copied && <span className="text-[11.5px] text-ok">Copied — {lines.length} lines</span>}
        <Button size="sm" variant="outline" className="ml-auto h-7 px-2.5 text-[12px]" onClick={copy}>Copy</Button>
      </div>
      <div className="px-3.5 py-2.5 overflow-x-auto font-mono text-[12px] leading-[1.8] text-muted">
        {lines.map((l, i) => <div key={i} className="whitespace-pre">{l}</div>)}
      </div>
    </div>
  );
}

/* ══ 1 · SETUP CHECKLIST ═══════════════════════════════════════════════
 *
 * Five steps, each one derived. The list is ordered the way the work actually
 * flows, and only genuine prerequisites block — Optimizely does not need a
 * repository, so it never waits for one.
 */

type StepState = "done" | "ready" | "blocked" | "listening";

const STEP_PILL: Record<StepState, { tone: "ok" | "accent" | "muted" | "warn"; label: string }> = {
  done: { tone: "ok", label: "Done" },
  ready: { tone: "accent", label: "Your move" },
  blocked: { tone: "muted", label: "Blocked" },
  listening: { tone: "warn", label: "Listening" },
};

const Numeral = ({ n, state }: { n: number; state: StepState }) => (
  <span className={cn("w-6 h-6 rounded-full grid place-items-center text-[11.5px] font-bold shrink-0 tabular-nums border",
    state === "done" ? "bg-ok/10 text-ok border-ok/30"
      : state === "ready" ? "bg-accent text-accent-fg border-accent"
        : state === "listening" ? "bg-warn/10 text-warn border-warn/35"
          : "border-border-strong text-muted-2")}>
    {state === "done" ? <Check /> : n}
  </span>
);

function StepRow({ n, state, title, why, reason, children }: {
  n: number; state: StepState; title: string; why: string; reason?: string; children?: React.ReactNode;
}) {
  const pill = STEP_PILL[state];
  return (
    <div className={cn("flex items-start gap-3.5 px-5 py-3.5 border-b border-border last:border-0", state === "ready" && "bg-accent/[0.04]")}>
      <Numeral n={n} state={state} />
      <div className="flex-1 min-w-0">
        <div className="text-[14.5px] font-medium">{title}</div>
        <p className="text-[13px] text-muted-2 mt-0.5 max-w-[68ch] leading-relaxed">{why}</p>
        {reason && (
          <p className="text-[13px] text-warn mt-1.5 max-w-[68ch] leading-relaxed">{reason}</p>
        )}
        {children && <div className="mt-3">{children}</div>}
      </div>
      <Pill tone={pill.tone}>{pill.label}</Pill>
    </div>
  );
}

/** `environments` is the fixture for OUTRIGGER; a customer created this session passes none. */
/** The teaching a wizard used to do, kept for the ONE step a person is on.
 *  Only the first not-done step renders its passage, so the card stays a list. */
const TEACHING: Partial<Record<SiteStepKey, React.ReactNode>> = {
  env: (
    <p className="text-[13px] text-muted-2 max-w-[68ch] leading-relaxed">
      Call them whatever your team calls them. The only one that changes what Prism allows is production —
      an experiment can only reach real visitors there, and only with an approval.
    </p>
  ),
  host: (
    <p className="text-[13px] text-muted-2 max-w-[68ch] leading-relaxed">
      Prism can see repositories in the organisation you name and nowhere else on that host. If this site is
      built by an agency, it is usually theirs, not yours.
    </p>
  ),
  source: (
    <div>
      <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-2">WHAT IT CHANGES</div>
      <ul className="space-y-1.5 text-[13px] text-muted leading-relaxed max-w-[68ch]">
        <li>· The palette arrives <span className="text-foreground">named</span> — <span className="font-mono text-[12px]">$clr-deep-turquoise</span>, not &ldquo;#004561, used 73 times&rdquo;.</li>
        <li>· Type gets <span className="text-foreground">roles</span>: which family is for headlines is a line in the stylesheet, not a guess from counts.</li>
        <li>· The agent reuses your <span className="text-foreground">actual components</span> instead of writing parallel ones.</li>
        <li>· <span className="text-foreground">Three of the seven questions</span> Prism would otherwise ask are answered by the code, so the interview gets shorter.</li>
      </ul>
    </div>
  ),
  tag: (
    <p className="text-[13px] text-muted-2 max-w-[68ch] leading-relaxed">
      Until it is there you can build and preview, but nothing reaches a real visitor. Send the install
      instructions from the environment itself — Prism writes the email and listens for the first beacon.
    </p>
  ),
};

/** WHAT EACH SITE STILL NEEDS — the only resume surface.
 *
 *  This replaces SetupChecklist, which was account-level and rendered behind
 *  `fresh &&` in work.tsx — meaning it only ever appeared for an account created
 *  in the session and entered through a support session. A customer's own Owner
 *  never saw it. It also asserted an account-wide code host, which D16 makes
 *  untrue at the second site, from a fixture that contradicted the site fixtures.
 *
 *  Every state here comes from siteSteps() in fake.ts, whose three build gates
 *  ARE buildBlockers() (D14). Nothing on this card is a flag anyone can set.
 *  It derives its own emptiness: when every site is ready it renders nothing,
 *  which the preamble warns about before it happens. */
export function SiteReadiness({ sites, picked, onFix }: {
  sites: Site[];
  picked: string | null;
  onFix: (siteId: string, room: "Setup" | "Understanding") => void;
}) {
  const rows = sites.map((site) => {
    const resolved = resolveSite(site.domain) ?? site;
    const steps = siteSteps(resolved, understandingOf(site.id));
    return { site, steps, next: firstUnmet(steps), ready: siteReady(steps) };
  });
  const unready = rows.filter((r) => !r.ready);
  // Nothing to say. The card goes, and does not come back.
  if (unready.length === 0) return null;

  const only = sites.length === 1;
  return (
    <Section
      title="What each site still needs"
      action={
        <span className="text-[12.5px] text-muted-2 tabular-nums">
          {rows.length - unready.length} of {rows.length} site{rows.length === 1 ? "" : "s"} ready
        </span>
      }>
      <div className="px-5 py-3.5 border-b border-border">
        <p className="text-[13.5px] text-muted max-w-[72ch] leading-relaxed">
          Every step below ticks itself from state the rest of the console already reads — none of them is a
          box you can check. A step opens the moment its own prerequisite is met.
          <span className="text-foreground"> When the last one ticks, this list deletes itself and does not come back.</span>
        </p>
      </div>

      {unready.map(({ site, steps, next }) => {
        const done = steps.filter((x) => x.state === "done").length;
        const open = only || site.id === picked;
        if (!open) {
          return (
            <div key={site.id} className="flex items-center gap-3 px-5 py-3.5 border-b border-border last:border-0">
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium truncate">{site.domain}</div>
                <div className="text-[12.5px] text-muted-2 mt-0.5 truncate">{next?.todo}</div>
              </div>
              <span className="text-[12.5px] text-muted-2 tabular-nums shrink-0">{done} of {steps.length}</span>
              <Button size="sm" variant="outline" className="shrink-0"
                onClick={() => next && onFix(site.id, next.room)}>Open →</Button>
            </div>
          );
        }
        return (
          <div key={site.id} className="border-b border-border last:border-0">
            {!only && (
              <div className="flex items-center gap-3 px-5 pt-3.5 pb-1">
                <div className="text-[14px] font-medium">{site.domain}</div>
                <span className="ml-auto text-[12.5px] text-muted-2 tabular-nums">{done} of {steps.length}</span>
              </div>
            )}
            {steps.map((st) => (
              <StepRow key={st.key} n={st.n} state={st.state} title={st.title} why={st.why} reason={st.reason}>
                {st.key === next?.key ? TEACHING[st.key] : undefined}
              </StepRow>
            ))}
          </div>
        );
      })}
    </Section>
  );
}

/* ══ 2 · AGENT HANDSHAKE ═══════════════════════════════════════════════ */

const BRANCH = {
  name: "opmc/reef-rate-calendar-promise",
  repo: "outrigger-digital/outrigger-prototypes",
  cutFrom: "main @ 4a91f30",
  provisioned: "26 Aug 2026 09:16 HST",
  head: BUILD,
};

interface TreeRow { path: string; owner: "console" | "agent"; what: string; last: string }

const TREE: TreeRow[] = [
  { path: ".opmc/brief.md", owner: "console", what: "The brief the build is judged against", last: "26 Aug 09:14 · revision 3" },
  { path: ".opmc/measurement.json", owner: "console", what: "The plan, bound to 24138040550_book_now_button_clicks", last: "26 Aug 09:14" },
  { path: ".opmc/target.json", owner: "console", what: "The page and the element to attach to", last: "26 Aug 09:16" },
  { path: ".opmc/events.json", owner: "console", what: "All 48 event keys and display names in the project", last: "26 Aug 09:16" },
  { path: ".opmc/SKILL.md", owner: "console", what: "How an agent builds for outrigger.com", last: "12 Aug 14:20 · v6" },
  { path: "src/**", owner: "agent", what: "The change, as source a person can read", last: "8 Sep 16:41 · 6 files" },
  { path: "dist/variation.js", owner: "agent", what: "The built file Optimizely serves · 2.4 KB", last: `8 Sep 16:42 · build ${BUILD}` },
];

interface SyncFile { path: string; onBranch: string; inConsole: string; stale: boolean; skill?: boolean }

const SYNC_FILES: SyncFile[] = [
  { path: ".opmc/brief.md", onBranch: "revision 3 · frozen 26 Aug 09:14", inConsole: "revision 3 · frozen 26 Aug 09:14", stale: false },
  { path: ".opmc/measurement.json", onBranch: "8 metrics · bound 26 Aug", inConsole: "8 metrics · bound 26 Aug", stale: false },
  { path: ".opmc/target.json", onBranch: "1 page · 1 element", inConsole: "1 page · 1 element", stale: false },
  { path: ".opmc/events.json", onBranch: "48 events · read 26 Aug", inConsole: "48 events · re-read 9 Sep 11:18", stale: true },
  { path: ".opmc/SKILL.md", onBranch: "v6 · 12 Aug 14:20", inConsole: "v7 · 9 Sep 11:20 · mobile-width rule, single-mount guard", stale: true, skill: true },
];

const SKILLS_V6 = { rev: "v6", digest: "sha256:0c41…8ab3" };
const SKILLS_V7 = { rev: "v7", digest: "sha256:7d90…412c" };

interface CheckIn { at: string; session: string; host: string; agent: string; skillRev: string; skillDigest: string; heartbeats: number; agoSec: number }

const FIRST_CHECKIN: CheckIn = {
  at: "8 Sep 2026 15:58:04 HST", session: "sess_9f31c0a4", host: "bryan-mbp16 · macOS 15.6",
  agent: "Claude Code 2.1.4", skillRev: SKILLS_V6.rev, skillDigest: SKILLS_V6.digest, heartbeats: 96, agoSec: 41,
};

const RESTART_CHECKIN: CheckIn = {
  at: "10 Sep 2026 11:56:31 HST", session: "sess_a7d2f118", host: "bryan-mbp16 · macOS 15.6",
  agent: "Claude Code 2.1.4", skillRev: SKILLS_V7.rev, skillDigest: SKILLS_V7.digest, heartbeats: 3, agoSec: 12,
};

/** Silence is not progress. Past this, the row says NOT ENGAGED — never "working". */
const STALE_AFTER_SEC = 900;

export function AgentHandshake() {
  const [runner, setRunner] = useState<"you" | "hosted">("you");
  const [files, setFiles] = useState<SyncFile[]>(SYNC_FILES);
  const [branchSkills, setBranchSkills] = useState(SKILLS_V6);
  const [checkIn, setCheckIn] = useState<CheckIn>(FIRST_CHECKIN);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);

  // Everything below is computed here and rendered somewhere below.
  const byConsole = TREE.filter((t) => t.owner === "console");
  const byAgent = TREE.filter((t) => t.owner === "agent");
  const root = (p: string) => p.split("/")[0];
  const contested = byConsole.filter((c) => byAgent.some((a) => root(a.path) === root(c.path)));

  const stale = files.filter((f) => f.stale);
  const skillsStale = stale.some((f) => f.skill);
  const engaged = checkIn.agoSec < STALE_AFTER_SEC;
  const restartNeeded = checkIn.skillDigest !== branchSkills.digest;

  const resync = () => {
    setFiles((fs) => fs.map((f) => (f.stale ? { ...f, onBranch: f.inConsole, stale: false } : f)));
    setBranchSkills(SKILLS_V7);
    setSyncedAt("10 Sep 2026 11:52:08 HST");
    logActivity(`Re-synced ${stale.length} file${stale.length === 1 ? "" : "s"} onto ${BRANCH.name} — skills now ${SKILLS_V7.rev}.`);
  };

  return (
    <div className="space-y-4">

      {/* Who runs it. One fact, one home. */}
      <Section title="Who runs the agent"
        action={<Pill tone="muted">{PROTOTYPE} · build {BUILD}</Pill>}>
        <div className="px-5 py-3.5 border-b border-border">
          <p className="text-[13.5px] text-muted max-w-[72ch] leading-relaxed">
            The agent is a session someone starts, on a machine the console does not own. Naming that person is the
            difference between &ldquo;the build is in progress&rdquo; and a build nobody is actually running.
          </p>
        </div>
        {[
          { id: "you" as const, title: `${ME.name} runs it`, sub: `On this machine, in your own terminal. Prism hands over a line to paste and then watches the branch — it never reaches into your session.`, ok: true },
          { id: "hosted" as const, title: "Prism runs it on a hosted runner", sub: "Not available here: the runner would need write access to outrigger-digital, and only the GitHub app&rsquo;s read scope is granted.", ok: false },
        ].map((o) => (
          <button key={o.id} onClick={() => o.ok && setRunner(o.id)} disabled={!o.ok}
            className={cn("w-full flex items-start gap-3 px-5 py-3.5 border-b border-border last:border-0 text-left",
              runner === o.id && o.ok && "bg-accent/[0.04]", !o.ok && "cursor-not-allowed")}>
            <span className={cn("w-4 h-4 rounded-full border-2 shrink-0 mt-0.5",
              runner === o.id && o.ok ? "border-accent border-[5px]" : "border-border-strong")} />
            <div className="flex-1 min-w-0">
              <div className={cn("text-[14.5px] font-medium", !o.ok && "text-muted-2")}>{o.title}</div>
              <p className={cn("text-[13px] mt-0.5 max-w-[68ch] leading-relaxed", o.ok ? "text-muted-2" : "text-warn")}>{o.sub}</p>
            </div>
            {runner === o.id && o.ok && <Pill tone="accent">Selected</Pill>}
          </button>
        ))}
      </Section>

      {/* The branch, and the two trees on it. */}
      <Section title="The branch the console provisioned"
        action={<span className="text-[12.5px] text-muted-2 tabular-nums">{byConsole.length} paths ours · {byAgent.length} the agent&rsquo;s · {contested.length} contested</span>}>
        <div className="px-5 py-4 border-b border-border flex flex-wrap gap-5 items-start">
          <div className="min-w-[300px] flex-1">
            <Meta k="Branch" v={BRANCH.name} mono />
            <Meta k="Repository" v={BRANCH.repo} mono />
            <Meta k="Head" v={`${BRANCH.head} · the build under review`} mono />
            <Meta k="Renaming" v="Allowed — the launch line names the branch, so a rename only means pasting the new line." />
          </div>
          <Receipt title="PROVISIONED — CANNOT BE RE-CUT" rows={[
            ["branch", BRANCH.name],
            ["cut from", BRANCH.cutFrom],
            ["at", BRANCH.provisioned],
            ["by", "the console, not a person"],
          ]} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr><Th first>Path on the branch</Th><Th>Written by</Th><Th>What it is</Th><Th>Last write</Th></tr>
            </thead>
            <tbody>
              {TREE.map((t) => (
                <tr key={t.path} className="border-b border-border last:border-0">
                  <td className="px-4 pl-6 py-2.5 font-mono text-[12.5px] whitespace-nowrap">{t.path}</td>
                  <td className="px-4 py-2.5">
                    {t.owner === "console" ? <Pill tone="accent">the console</Pill> : <Pill tone="muted">the agent</Pill>}
                  </td>
                  <td className="px-4 py-2.5 text-[13px] text-muted">{t.what}</td>
                  <td className="px-4 py-2.5 text-[12.5px] text-muted-2 whitespace-nowrap tabular-nums">{t.last}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3.5 border-t border-border">
          <p className="text-[13.5px] text-muted max-w-[72ch] leading-relaxed">
            Two trees, and <span className="text-foreground tabular-nums">{contested.length}</span> paths in both. That is the
            whole trick: the console rewrites <span className="font-mono text-[12px]">.opmc/</span> in place and never opens
            <span className="font-mono text-[12px]"> src/</span> or <span className="font-mono text-[12px]">dist/</span>, so a
            re-sync is an overwrite rather than a merge and cannot land on top of work the agent is mid-way through.
          </p>
        </div>
      </Section>

      {/* The launch line. */}
      <Section title="The line to paste">
        <div className="p-5 space-y-3">
          <CodeBlock label="START THE AGENT" lines={[
            "cd ~/outrigger/prototypes",
            `git fetch origin && git switch ${BRANCH.name}`,
            'claude "read .opmc/SKILL.md, then build what .opmc/brief.md asks for"',
          ]} />
          <p className="text-[13.5px] text-muted max-w-[72ch] leading-relaxed">
            The branch is named in the line, so pasting the wrong prototype&rsquo;s line fails on <span className="font-mono text-[12px]">git switch</span> instead
            of quietly building the right change on the wrong branch. Nothing else is installed and no key is pasted — the
            agent reads the brief off the branch it just checked out.
          </p>
        </div>
      </Section>

      {/* The beacon. This is what makes "engaged" a fact. */}
      <Section title="Has the agent actually engaged?"
        action={engaged
          ? <Pill tone="ok">Engaged · heartbeat {checkIn.agoSec}s ago</Pill>
          : <Pill tone="danger">Not engaged</Pill>}>
        <div className="px-5 py-4 border-b border-border flex flex-wrap gap-5 items-start">
          <Receipt title="CHECK-IN — WHAT THE SESSION SENT" rows={[
            ["at", checkIn.at],
            ["session", checkIn.session],
            ["host", checkIn.host],
            ["agent", checkIn.agent],
            ["branch", BRANCH.name],
            ["skills", `${checkIn.skillDigest} · SKILL.md ${checkIn.skillRev}`],
          ]} />
          <div className="min-w-[300px] flex-1">
            <p className="text-[13.5px] text-muted max-w-[68ch] leading-relaxed">
              A session announces itself once, then sends a heartbeat. <span className="text-foreground tabular-nums">{checkIn.heartbeats} heartbeats</span> so
              far, the last <span className="text-foreground tabular-nums">{checkIn.agoSec} seconds</span> ago. After
              <span className="tabular-nums"> {STALE_AFTER_SEC / 60} minutes</span> of silence this row reads
              <span className="text-foreground"> not engaged</span> — never &ldquo;working&rdquo;, because we would have no way to know that.
            </p>
            <p className="text-[13px] text-muted-2 mt-2.5 max-w-[68ch] leading-relaxed">
              The digest in the receipt is the point of the whole beacon: it says which SKILL.md the running session
              actually loaded, which is the only way anyone can tell a stale session from a busy one.
            </p>
          </div>
        </div>
      </Section>

      {/* Re-sync, and the restart it may imply. */}
      <Section title="Re-sync the brief and the skills"
        action={stale.length > 0
          ? <Pill tone="warn">{stale.length} of {files.length} behind</Pill>
          : restartNeeded ? <Pill tone="danger">Restart required</Pill> : <Pill tone="ok">Branch and session agree</Pill>}>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr><Th first>File</Th><Th>On the branch</Th><Th>In the console</Th><Th>State</Th></tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.path} className={cn("border-b border-border last:border-0", f.stale && "bg-warn/[0.05]")}>
                  <td className="px-4 pl-6 py-2.5 font-mono text-[12.5px] whitespace-nowrap">{f.path}</td>
                  <td className="px-4 py-2.5 text-[13px] text-muted">{f.onBranch}</td>
                  <td className="px-4 py-2.5 text-[13px] text-muted">{f.inConsole}</td>
                  <td className="px-4 py-2.5">{f.stale ? <Pill tone="warn">behind</Pill> : <Pill tone="ok">same</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-4 border-t border-border space-y-3">
          {/* The sentence, assembled from what is actually different. */}
          {stale.length > 0 ? (
            <p className="text-[14px] leading-relaxed max-w-[74ch]">
              Re-sync rewrites <span className="text-foreground tabular-nums">{stale.length}</span> file
              {stale.length === 1 ? "" : "s"} on <span className="font-mono text-[12.5px]">{BRANCH.name}</span>
              {" "}({stale.map((f) => f.path.replace(".opmc/", "")).join(", ")})
              {skillsStale ? (
                <>
                  {" "}— and then <span className="font-semibold">restart the agent</span>. SKILL.md is read once when a
                  session starts and does not hot-load, so the session now running would keep building against
                  {" "}<span className="font-mono text-[12.5px]">{checkIn.skillRev}</span> while the branch carries the new one.
                </>
              ) : (
                <> — no restart needed. The agent re-reads the brief on its next pass; only SKILL.md is pinned at session start.</>
              )}
            </p>
          ) : (
            <p className="text-[14px] leading-relaxed max-w-[74ch]">
              The branch matches the console. {restartNeeded
                ? <>The running session does not: it loaded <span className="font-mono text-[12.5px]">{checkIn.skillRev}</span> and the branch now carries <span className="font-mono text-[12.5px]">{branchSkills.rev}</span>. Restart it — this is not a warning that clears itself, it is two digests that disagree.</>
                : <>So does the running session: both are on <span className="font-mono text-[12.5px]">{branchSkills.rev}</span>, digest <span className="font-mono text-[12.5px]">{branchSkills.digest}</span>.</>}
            </p>
          )}

          {syncedAt && (
            <Receipt title="RE-SYNC — WRITTEN TO THE BRANCH" rows={[
              ["at", syncedAt],
              ["by", `${ME.name} · ${ME.role}`],
              ["files", `${SYNC_FILES.filter((f) => f.stale).length} rewritten under .opmc/`],
              ["skills", `${SKILLS_V6.rev} → ${SKILLS_V7.rev} · ${SKILLS_V7.digest}`],
              ["agent tree", "untouched — src/** and dist/variation.js"],
            ]} />
          )}

          {restartNeeded && stale.length === 0 && (
            <CodeBlock label="RESTART THE SESSION" lines={[
              "# in the agent's terminal",
              "/exit",
              `claude "re-read .opmc/SKILL.md — it changed — then continue on ${BRANCH.name}"`,
            ]} />
          )}

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <Button size="sm" disabled={stale.length === 0} onClick={resync}>
              {stale.length === 0 ? "Nothing to re-sync" : `Re-sync ${stale.length} file${stale.length === 1 ? "" : "s"}`}
            </Button>
            {restartNeeded && (
              <Button size="sm" variant="outline" onClick={() => setCheckIn(RESTART_CHECKIN)}>Look for a new check-in</Button>
            )}
            <span className="text-[12.5px] text-muted-2 max-w-[52ch] leading-relaxed">
              &ldquo;Restarted&rdquo; is never something you tell us. It clears when a session checks in carrying the
              branch&rsquo;s own skills digest.
            </span>
          </div>
        </div>
      </Section>
    </div>
  );
}

/* ══ 3 · INJECTION PROOF ═══════════════════════════════════════════════ */

type ProofState = "found" | "wrong-env" | "absent" | "unknown" | "confirmed";

interface Target {
  id: string;
  url: string;
  env: string;
  isProduction: boolean;
  expect: string;
  /** What the served HTML actually carried. Null means our tag was not in it. */
  found: string | null;
  /** The Optimizely snippet is in the served HTML — something here could inject after load. */
  optiSnippet: boolean;
  bytes: number;
  checked: string;
  prototype: string;
  evidence: string[];
}

const TARGETS: Target[] = [
  {
    id: "reef-prod",
    url: "outrigger.com/hawaii/oahu/outrigger-reef-waikiki-beach-resort",
    env: "Production", isProduction: true, expect: "opmc-prod-7f31", found: "opmc-prod-7f31",
    optiSnippet: true, bytes: 214_907, checked: "10 Sep 2026 11:41 HST", prototype: PROTOTYPE,
    evidence: [
      "<!-- served HTML, line 38 of <head> -->",
      '<script src="https://cdn.optimizely.com/js/24138040550.js"></script>',
      '<script src="https://tag.prism.build/opmc.js" data-tag="opmc-prod-7f31" async></script>',
    ],
  },
  {
    id: "reef-prep",
    url: "prep.outrigger.com/hawaii/oahu/outrigger-reef-waikiki-beach-resort",
    env: "Prep", isProduction: false, expect: "opmc-prep-2c08", found: "opmc-prep-2c08",
    optiSnippet: true, bytes: 211_004, checked: "10 Sep 2026 11:41 HST", prototype: PROTOTYPE,
    evidence: [
      "<!-- served HTML, line 36 of <head> -->",
      '<script src="https://tag.prism.build/opmc.js" data-tag="opmc-prep-2c08" async></script>',
    ],
  },
  {
    id: "offers-prod",
    url: "outrigger.com/offers",
    env: "Production", isProduction: true, expect: "opmc-prod-7f31", found: "opmc-prod-7f31",
    optiSnippet: true, bytes: 168_320, checked: "10 Sep 2026 11:41 HST", prototype: "Offer card price-first ordering",
    evidence: [
      "<!-- served HTML, line 41 of <head> -->",
      '<script src="https://tag.prism.build/opmc.js" data-tag="opmc-prod-7f31" async></script>',
      "<!-- this page is what fires 24138040550_all_offers_page -->",
    ],
  },
  {
    id: "waikiki-prod",
    url: "outrigger.com/hawaii/oahu/outrigger-waikiki-beach-resort",
    env: "Production", isProduction: true, expect: "opmc-prod-7f31", found: null,
    optiSnippet: true, bytes: 226_441, checked: "10 Sep 2026 11:41 HST", prototype: "Hero CTA wording, Waikiki Beach",
    evidence: [
      "<!-- 226,441 bytes scanned · 0 matches for tag.prism.build -->",
      '<script src="https://cdn.optimizely.com/js/24138040550.js"></script>',
      "<!-- and a tag manager container, which can write a <script> after load -->",
    ],
  },
  {
    id: "honuakai-prod",
    url: "outrigger.com/hawaii/maui/outrigger-honua-kai-resort-and-spa",
    env: "Production", isProduction: true, expect: "opmc-prod-7f31", found: "opmc-prep-2c08",
    optiSnippet: true, bytes: 231_776, checked: "10 Sep 2026 11:41 HST", prototype: "Resort-fee disclosure above the fold",
    evidence: [
      "<!-- served HTML, line 39 of <head> -->",
      '<script src="https://tag.prism.build/opmc.js" data-tag="opmc-prep-2c08" async></script>',
      "<!-- expected opmc-prod-7f31 — this is the prep tag, on a page real visitors reach -->",
    ],
  },
  {
    id: "kona-prod",
    url: "outrigger.com/hawaii/hawaii-island/outrigger-kona-resort-and-spa",
    env: "Production", isProduction: true, expect: "opmc-prod-7f31", found: null,
    optiSnippet: false, bytes: 198_115, checked: "10 Sep 2026 11:41 HST", prototype: "Rate-calendar best-price promise (queued)",
    evidence: [
      "<!-- 198,115 bytes scanned · 0 matches for tag.prism.build -->",
      "<!-- 0 matches for cdn.optimizely.com either -->",
    ],
  },
];

const PROOF: Record<ProofState, { label: string; tone: "ok" | "warn" | "danger" | "muted" | "accent" }> = {
  found: { label: "Found", tone: "ok" },
  "wrong-env": { label: "Wrong environment", tone: "danger" },
  absent: { label: "Absent", tone: "warn" },
  unknown: { label: "Can’t tell", tone: "muted" },
  confirmed: { label: "Confirmed by a person", tone: "accent" },
};

interface Vouch { by: string; role: string; at: string; client: string; digest: string }

/** A re-check is a moment on the row, not a result. While it runs the row says so; when it lands the row goes back
 *  to whatever the fetch derives, and only the "checked" time has moved. */
type Recheck = "checking" | "just now";

export function InjectionProof() {
  const [filter, setFilter] = useState<"all" | ProofState>("all");
  const [openId, setOpenId] = useState<string>(TARGETS[0].id);
  const [vouched, setVouched] = useState<Record<string, Vouch>>({});
  const [recheck, setRecheck] = useState<Record<string, Recheck>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [vouching, setVouching] = useState<Target | null>(null);

  // Timers this panel started, cleared on unmount — leaving the stage mid-check
  // leaves nothing ticking behind it.
  const timers = useRef<number[]>([]);
  useEffect(() => { const t = timers.current; return () => t.forEach(window.clearTimeout); }, []);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };

  /** Derived, never stored: what the fetch saw decides the state. */
  const stateOf = (t: Target): ProofState =>
    vouched[t.id] ? "confirmed"
      : t.found === null ? (t.optiSnippet ? "unknown" : "absent")
        : t.found === t.expect ? "found" : "wrong-env";

  const toneOf = (t: Target): "ok" | "warn" | "danger" | "muted" | "accent" => {
    const s = stateOf(t);
    // A mismatched tag on a page visitors can reach is the one result worse than nothing.
    if (s === "wrong-env" && !t.isProduction) return "warn";
    return PROOF[s].tone;
  };

  const counts = (["found", "wrong-env", "absent", "unknown", "confirmed"] as ProofState[])
    .map((s) => ({ s, n: TARGETS.filter((t) => stateOf(t) === s).length }));
  const rows = filter === "all" ? TARGETS : TARGETS.filter((t) => stateOf(t) === filter);
  const open = TARGETS.find((t) => t.id === openId) ?? TARGETS[0];
  const openState = stateOf(open);
  const envCount = new Set(TARGETS.map((t) => t.env)).size;
  const attention = TARGETS.filter((t) => ["wrong-env", "absent", "unknown"].includes(stateOf(t))).length;

  const vouch = (t: Target) => {
    setVouched((v) => ({
      ...v,
      [t.id]: { by: ME.name, role: ME.role, at: "10 Sep 2026 11:47:22 HST", client: "Chrome 141 · macOS", digest: "html sha256:b2e7…4c19" },
    }));
    setVouching(null);
    logActivity(`Vouched for the tag on ${t.url} — the server-side fetch could not see it.`);
  };

  const checking = (t: Target) => recheck[t.id] === "checking";
  const checkedText = (t: Target) => (recheck[t.id] === "just now" ? "just now" : t.checked);
  const anyChecking = TARGETS.some(checking);
  const allJustChecked = TARGETS.every((t) => recheck[t.id] === "just now");

  /** Fetch again, one page after another. Nothing underneath changes — the result is derived from what came back. */
  const checkAgain = (targets: Target[]) => {
    setRecheck((r) => ({ ...r, ...Object.fromEntries(targets.map((t) => [t.id, "checking" as const])) }));
    targets.forEach((t, i) => later(() => setRecheck((r) => ({ ...r, [t.id]: "just now" })), 900 + i * 180));
    logActivity(targets.length === 1 ? `Checked ${targets[0].url} again.` : `Checked all ${targets.length} target pages again.`);
  };

  // No clipboard, or a refused one, is not a copy: the label stays put and nothing is logged.
  const copyTag = (t: Target) => {
    navigator.clipboard?.writeText(TAG_LINES(t.expect).join("\n")).then(() => {
      setCopiedId(t.id);
      logActivity(`Copied the ${t.env} tag.`);
      later(() => setCopiedId((id) => (id === t.id ? null : id)), 1500);
    }, () => setCopiedId(null));
  };

  return (
    <>
      <PageHeader
        title="Injection proof"
        count={`${TARGETS.length} target pages · ${attention} need someone${allJustChecked ? " · Checked just now" : ""}`}
        actions={
          <Button size="sm" variant="outline" disabled={anyChecking} onClick={() => checkAgain(TARGETS)}>
            {anyChecking ? "Checking…" : "Check all again"}
          </Button>
        }
      />

      <Toolbar>
        <Chip on={filter === "all"} onClick={() => setFilter("all")}>
          All <span className="opacity-60 tabular-nums">{TARGETS.length}</span>
        </Chip>
        {counts.map(({ s, n }) => (
          <Chip key={s} on={filter === s} onClick={() => setFilter(s)}>
            {PROOF[s].label} <span className="opacity-60 tabular-nums">{n}</span>
          </Chip>
        ))}
        <span className="text-[12.5px] text-muted-2 ml-2 max-w-[46ch] leading-relaxed">
          One row per page a prototype points at, across {envCount} environments — a tag on the home page proves nothing
          about the rest of the site.
        </span>
      </Toolbar>

      <div className="flex-1 overflow-auto p-6 space-y-4">
        <Section title="What the check found, page by page">
          {rows.length === 0 ? (
            <Empty
              title="Nothing in this filter"
              body="No target page is in that state right now. That is a result, not an empty list — the counts on the filters above are the whole picture."
              action={<Button size="sm" variant="outline" onClick={() => setFilter("all")}>Show all {TARGETS.length} pages</Button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr><Th first>Target page</Th><Th>Environment</Th><Th>Expected tag</Th><Th>Found</Th><Th>Result</Th><Th>Checked</Th></tr>
                </thead>
                <tbody>
                  {rows.map((t) => {
                    const s = stateOf(t);
                    return (
                      <tr key={t.id} onClick={() => setOpenId(t.id)}
                        className={cn("cursor-pointer border-b border-border last:border-0 hover:bg-surface-2/60", t.id === open.id && "bg-surface-2/70")}>
                        <td className="px-4 pl-6 py-3">
                          <div className="font-mono text-[12.5px] truncate max-w-[420px]">{t.url}</div>
                          <div className="text-[12.5px] text-muted-2 mt-0.5">{t.prototype}</div>
                        </td>
                        <td className="px-4 py-3">
                          {t.isProduction ? <Pill tone="accent">{t.env}</Pill> : <Pill tone="muted">{t.env}</Pill>}
                        </td>
                        <td className="px-4 py-3 font-mono text-[12px] text-muted-2 whitespace-nowrap">{t.expect}</td>
                        <td className={cn("px-4 py-3 font-mono text-[12px] whitespace-nowrap", t.found === null ? "text-muted-2" : t.found === t.expect ? "text-muted" : "text-danger")}>
                          {t.found ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          {checking(t) ? <Pill tone="muted">Checking…</Pill> : <Pill tone={toneOf(t)}>{PROOF[s].label}</Pill>}
                        </td>
                        <td className="px-4 py-3 text-[12.5px] text-muted-2 whitespace-nowrap tabular-nums">
                          {checking(t) ? "checking…" : checkedText(t)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* The evidence for one page. Reading it should settle the question. */}
        <Section title="What the check actually saw"
          action={checking(open) ? <Pill tone="muted">Checking…</Pill> : <Pill tone={toneOf(open)}>{PROOF[openState].label}</Pill>}>
          <div className="px-5 py-4 border-b border-border flex flex-wrap gap-6 items-start">
            <div className="min-w-[320px] flex-1">
              <Meta k="Page" v={open.url} mono />
              <Meta k="Environment" v={`${open.env}${open.isProduction ? " · real visitors reach this" : " · nobody outside the team reaches this"}`} />
              <Meta k="Expected" v={open.expect} mono />
              <Meta k="Found" v={open.found ?? "nothing from tag.prism.build"} mono />
              <Meta k="HTML scanned" v={<span className="tabular-nums">{open.bytes.toLocaleString("en-US")} bytes · fetched server-side</span>} />
              <Meta k="Prototype" v={open.prototype} />
            </div>
            <div className="min-w-[320px] flex-1 rounded-lg border border-border bg-surface-2/50 px-3.5 py-2.5 overflow-x-auto">
              <div className="font-mono text-[12px] leading-[1.8] text-muted">
                {open.evidence.map((l, i) => <div key={i} className="whitespace-pre">{l}</div>)}
              </div>
            </div>
          </div>

          {/* One reading per state. They are genuinely different findings. */}
          <div className="px-5 py-4 border-b border-border">
            {openState === "found" && (
              <p className="text-[14px] text-muted max-w-[74ch] leading-relaxed">
                The tag for this environment is in the HTML the server sends, before anything runs. That is as settled as
                this question gets — no person has to vouch for it and nothing about it can drift without the next check saying so.
              </p>
            )}
            {openState === "wrong-env" && (
              <p className="text-[14px] max-w-[74ch] leading-relaxed">
                <span className="text-danger font-medium">This is worse than finding nothing.</span> The page carries
                <span className="font-mono text-[12.5px]"> {open.found}</span>, which belongs to Prep, on a URL a real
                visitor can open. Two things follow, and both are already true: whatever Prep points at can be served to
                a real visitor, and every beacon from this page files under the wrong environment — so a Prep experiment&rsquo;s
                numbers quietly include production traffic. Remove the tag before anything else on this screen.
              </p>
            )}
            {openState === "absent" && (
              <p className="text-[14px] text-muted max-w-[74ch] leading-relaxed">
                Nothing from <span className="font-mono text-[12.5px]">tag.prism.build</span> — and no Optimizely snippet
                either, so there is nothing on this page that could inject one after load. That makes absence a real
                finding rather than a blind spot: this page runs nothing at all today, and no person can vouch it into
                working. Install the tag.
              </p>
            )}
            {openState === "unknown" && (
              <div className="max-w-[74ch]">
                <p className="text-[14px] text-muted leading-relaxed">
                  We fetch this page the way a server does, and the tag is not in what comes back. But the page carries
                  the Optimizely snippet and a tag-manager container, either of which can write the tag in after load — and
                  a client-side injection is invisible to a server-side fetch, permanently. So the honest answer is that we
                  cannot tell, not that it is missing.
                </p>
                <p className="text-[13px] text-muted-2 mt-2 leading-relaxed">
                  Open the page in a browser. If the tag is there, say so — your name goes on it.
                </p>
                <Button size="sm" className="mt-3" onClick={() => setVouching(open)}>I can see the tag on this page</Button>
              </div>
            )}
            {openState === "confirmed" && vouched[open.id] && (
              <div className="max-w-[74ch] space-y-3">
                <p className="text-[14px] text-muted leading-relaxed">
                  A person vouched for this page. It is <span className="text-foreground">not</span> filed as Found and it
                  never will be — an automated find and a human confirmation are different kinds of evidence, and merging
                  them would lose the only part that matters here: who said so.
                </p>
                <Receipt tone="accent" title="CONFIRMED BY A PERSON — PERSISTED" rows={[
                  ["page", open.url],
                  ["by", `${vouched[open.id].by} · ${vouched[open.id].role}`],
                  ["at", vouched[open.id].at],
                  ["saw it in", vouched[open.id].client],
                  ["html then", vouched[open.id].digest],
                ]} />
                <p className="text-[13px] text-muted-2 leading-relaxed">
                  The digest is what the confirmation is pinned to. When this page&rsquo;s served HTML changes, the row goes
                  back to <span className="text-foreground">can&rsquo;t tell</span> and asks again — somebody vouched for a
                  page, not for every future version of it.
                </p>
              </div>
            )}
          </div>

          <div className="px-5 py-3.5 flex flex-wrap items-center gap-3">
            <Button size="sm" variant="outline" disabled={checking(open)} onClick={() => checkAgain([open])}>
              {checking(open) ? "Checking…" : "Check this page again"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => copyTag(open)}>
              {copiedId === open.id ? "Copied" : `Copy the tag for ${open.env}`}
            </Button>
            <span className="text-[12.5px] text-muted-2 tabular-nums">
              {checking(open) ? "Checking…" : `Last checked ${checkedText(open)}`}
            </span>
          </div>
        </Section>
      </div>

      {/* A vouch is a permanent attributed receipt, so it is asked for once and never taken from a stray click. */}
      <Dialog open={vouching !== null} onOpenChange={(o) => { if (!o) setVouching(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Say you can see the tag on this page</DialogTitle>
            <DialogDescription>
              Your name, your role and the time go on this page and stay there. The row reads
              {" "}<span className="text-foreground">Confirmed by a person</span> from then on — never
              {" "}<span className="text-foreground">Found</span>, because what you saw and what a server-side fetch
              sees are different kinds of evidence.
            </DialogDescription>
          </DialogHeader>
          {vouching && (
            <div className="rounded-lg border border-border bg-surface-2/40 px-3.5 py-2.5 space-y-1">
              <div className="font-mono text-[12px] break-all">{vouching.url}</div>
              <div className="text-[12.5px] text-muted-2 leading-relaxed">
                Open that page in a browser and look for
                {" "}<span className="font-mono text-[12px]">{vouching.expect}</span> before you answer.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setVouching(null)}>Not now</Button>
            <Button onClick={() => { if (vouching) vouch(vouching); }}>Yes — I can see it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
