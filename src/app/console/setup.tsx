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
 *    nothing about the resort page a prototype actually targets. And the worst
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

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";
import { Pill, Section, Meta, Th, PageHeader, Toolbar, Chip, Empty } from "./ui";

/* ── Fixtures ──────────────────────────────────────────────────────── */

const ME = { name: "Bryan Hopkins", role: "Approver" };
const CUSTOMER = "OUTRIGGER Hotels and Resorts";
const PROTOTYPE = "Rate-calendar best-price promise";
const BUILD = "8c1d7e2";

const ENVIRONMENTS = [
  { label: "Production", host: "outrigger.com", isProduction: true, tag: "opmc-prod-7f31" },
  { label: "Prep", host: "prep.outrigger.com", isProduction: false, tag: "opmc-prep-2c08" },
];

const CODE_HOST = { kind: "GitHub", org: "outrigger-digital", repos: 14 };

const REPO_CANDIDATES = [
  { name: "outrigger-digital/outrigger-prototypes", hint: "empty but for a README — made for this", ok: true },
  { name: "outrigger-digital/outrigger-web", hint: "the live site — Prism will not open branches here", ok: false },
  { name: "outrigger-digital/outrigger-brand-assets", hint: "no build, nothing to compile", ok: false },
];

const OPTI_PROJECTS = [
  { id: "24138040550", name: "Outrigger — Web", events: 48, duplicateNames: 7, conversionEvent: false },
  { id: "24101992774", name: "OHANA by Outrigger", events: 11, duplicateNames: 0, conversionEvent: false },
];

/** Two keys, one display name — the evidence for the duplicate count above. */
const DUPLICATE_PAIR = [
  { key: "24138040550_book_now_button_clicks", attached: true },
  { key: "24138040550_offer_detail_book_now_button_clicks", attached: false },
];

const LOADER_BEACON = {
  env: "Prep",
  url: "prep.outrigger.com/hawaii/oahu/outrigger-reef-waikiki-beach-resort",
  tag: "opmc-prep-2c08",
  at: "10 Sep 2026 09:07:12 HST",
  loader: "loader 1.6.2",
  client: "Chrome 141 · macOS",
};

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

const Mono = ({ children }: { children: React.ReactNode }) => (
  <span className="font-mono text-[11px] text-muted-2 bg-surface-2 rounded px-1.5 py-0.5">{children}</span>
);

const Label = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-1.5">{children}</div>
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

export function SetupChecklist() {
  // Nothing here is a stored "step 3 complete" flag. Each of these is the state
  // some other surface reads too, and completion falls out of it.
  const [hostConnected, setHostConnected] = useState(false);
  const [repo, setRepo] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [beaconSeen, setBeaconSeen] = useState(false);
  const [checks, setChecks] = useState(0);
  const [reveal, setReveal] = useState(false);

  const tokenValid = token.trim().length >= 8;
  const project = OPTI_PROJECTS.find((p) => p.id === projectId) ?? null;
  const prod = ENVIRONMENTS.find((e) => e.isProduction);

  const state: Record<string, StepState> = {
    env: ENVIRONMENTS.length > 0 ? "done" : "ready",
    host: hostConnected ? "done" : "ready",
    repo: repo ? "done" : hostConnected ? "ready" : "blocked",
    opti: tokenValid && project ? "done" : "ready",
    loader: beaconSeen ? "done" : "listening",
  };

  const steps = Object.values(state);
  const done = steps.filter((s) => s === "done").length;
  const blocked = steps.filter((s) => s === "blocked").length;
  const complete = done === steps.length;

  // The whole thing is finished, so the whole thing goes away.
  if (complete && !reveal) {
    return (
      <Section title="Setup">
        <Empty
          title="Set up. This checklist has removed itself."
          body={`All five steps derive from state that is now true for ${CUSTOMER}, so there is nothing left for the list to watch. It was scaffolding for the first run, not a room — each fact still lives where it is edited: environments on the site, the repository in Connections, the project in Measurement.`}
          action={<Button size="sm" variant="outline" onClick={() => setReveal(true)}>Show the five steps again</Button>}
        />
      </Section>
    );
  }

  return (
    <Section
      title="Before Prism can build anything"
      action={
        <div className="flex items-center gap-3">
          <span className="text-[12.5px] text-muted-2 tabular-nums">
            {done} of {steps.length} done{blocked > 0 && ` · ${blocked} blocked`}
          </span>
          {complete && <Button size="sm" variant="outline" onClick={() => setReveal(false)}>Dismiss</Button>}
        </div>
      }>

      <div className="px-5 py-3.5 border-b border-border">
        <p className="text-[13.5px] text-muted max-w-[72ch] leading-relaxed">
          Every step below ticks itself from state the rest of the console already reads — none of them is a box you can
          check. The numbers are the order that works, not a lock: a step opens the moment its own prerequisite is met.
          <span className="text-foreground"> When the fifth ticks, this list deletes itself and does not come back.</span>
        </p>
      </div>

      {/* 1 — environments. True before anyone arrives, so it opens already done. */}
      <StepRow n={1} state={state.env}
        title="An environment to work against"
        why="An environment is an address Prism can look at, plus one bit: whether real guests can reach it.">
        <div className="flex flex-wrap gap-1.5">
          {ENVIRONMENTS.map((e) => (
            <span key={e.label} className={cn("inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12.5px]",
              e.isProduction ? "border-border-strong" : "border-border")}>
              <span className="font-medium">{e.label}</span>
              <span className="font-mono text-[11.5px] text-muted-2">{e.host}</span>
              {e.isProduction && <Pill tone="accent">Production</Pill>}
            </span>
          ))}
        </div>
      </StepRow>

      {/* 2 — the code host. */}
      <StepRow n={2} state={state.host}
        title="A code host Prism can read"
        why="Prototypes are branches in your own repository, so Prism needs read access to the account that holds it. It never writes to your live site&rsquo;s default branch.">
        {hostConnected ? (
          <p className="text-[13px] text-muted">
            {CODE_HOST.kind} app installed on <span className="font-mono text-[12px] text-foreground">{CODE_HOST.org}</span> ·
            <span className="tabular-nums"> {CODE_HOST.repos}</span> repositories readable · installed by {ME.name}. Revocable from
            GitHub at any time, which is why this is plain text and not a receipt.
          </p>
        ) : (
          <Button size="sm" onClick={() => setHostConnected(true)}>Connect {CODE_HOST.kind}</Button>
        )}
      </StepRow>

      {/* 3 — the prototypes repo. The one genuinely blocked step. */}
      <StepRow n={3} state={state.repo}
        title="A repository to keep prototypes in"
        why="One repository, separate from the live site. Every prototype is a branch under a prefix, and every build is a commit you can read."
        reason={state.repo === "blocked"
          ? `Waiting on step 2. Prism cannot offer you a list of repositories it has no way to read — connect ${CODE_HOST.kind} and this list fills itself in.`
          : undefined}>
        {repo ? (
          <p className="text-[13px] text-muted">
            <span className="font-mono text-[12px] text-foreground">{repo}</span> · branches under
            <span className="font-mono text-[12px]"> opmc/</span> · the built file each prototype must produce is
            <span className="font-mono text-[12px]"> dist/variation.js</span>. Change any of this in Connections.
          </p>
        ) : hostConnected ? (
          <div className="space-y-1.5">
            {REPO_CANDIDATES.map((r) => (
              <button key={r.name} onClick={() => r.ok && setRepo(r.name)} disabled={!r.ok}
                className={cn("w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left",
                  r.ok ? "border-border bg-surface hover:border-border-strong" : "border-border bg-surface-2/40 cursor-not-allowed")}>
                <span className={cn("w-4 h-4 rounded-full border-2 shrink-0", r.ok ? "border-border-strong" : "border-border")} />
                <span className="font-mono text-[12.5px] min-w-0 truncate">{r.name}</span>
                <span className={cn("text-[12px] ml-auto text-right", r.ok ? "text-muted-2" : "text-warn")}>{r.hint}</span>
              </button>
            ))}
          </div>
        ) : null}
      </StepRow>

      {/* 4 — Optimizely. Two facts, one step: the token, then the project it can see. */}
      <StepRow n={4} state={state.opti}
        title="An Optimizely token, and the project it should default to"
        why="The token is how Prism reads your events and pushes a variation. The default project is which of them it means when you don&rsquo;t say."
        reason={tokenValid ? undefined : "The project list stays empty until a token is in — Prism will not let you type a project ID it has never seen answer."}>
        <div className="flex flex-wrap items-center gap-2.5">
          <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Personal access token" spellCheck={false}
            className="h-9 w-[240px] px-3 rounded-lg border border-border bg-surface text-[13px] font-mono placeholder:font-sans placeholder:text-muted-2 focus:border-accent focus:outline-none" />
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!tokenValid}
            title={tokenValid ? "Projects this token can see" : "Paste a token first"}
            className="h-9 px-2.5 rounded-lg border border-border bg-surface text-[13px] text-muted disabled:opacity-50 focus:border-accent focus:outline-none">
            <option value="">Default project…</option>
            {OPTI_PROJECTS.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.id}</option>)}
          </select>
          {tokenValid && (
            <span className="text-[12.5px] text-ok tabular-nums">Token accepted — it can see {OPTI_PROJECTS.length} projects</span>
          )}
        </div>

        {project && (
          <div className="mt-3 rounded-lg border border-warn/40 bg-warn/5 px-3.5 py-3">
            <Label>WHAT PRISM READ OUT OF {project.name.toUpperCase()}</Label>
            <p className="text-[13.5px] text-muted max-w-[70ch] leading-relaxed">
              <span className="text-foreground tabular-nums">{project.events} events</span>, and
              {project.conversionEvent
                ? " a conversion event to judge against."
                : " not one of them records a booking, a conversion or revenue."} Prism will not stand a lookalike in for
              one, so anything you brief as &ldquo;more bookings&rdquo; gets measured as reaching the booking step and
              labelled that way.
              <span className="text-foreground tabular-nums"> {project.duplicateNames} display names</span> are used by more
              than one event — one of them is the pair below, where only the first is attached to this experiment:
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DUPLICATE_PAIR.map((d) => (
                <span key={d.key} className="inline-flex items-center gap-1.5">
                  <Mono>{d.key}</Mono>
                  <span className={cn("text-[11.5px]", d.attached ? "text-ok" : "text-warn")}>{d.attached ? "attached" : "not attached"}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </StepRow>

      {/* 5 — the loader. The step nobody can tick by hand. */}
      <StepRow n={5} state={state.loader}
        title="The tag has reported in at least once"
        why="This one cannot be ticked by hand and there is no button that says &ldquo;installed&rdquo;. It ticks when a page carrying the tag loads and the tag says so itself."
        reason={beaconSeen ? undefined : `Nothing has reported in yet. Listening since 09:02 HST · ${checks} re-checks · the tag belongs in <head> on ${prod?.host ?? "your site"} and on prep.`}>
        {beaconSeen ? (
          <div className="space-y-2.5">
            <Receipt title="FIRST REPORT — RECORDED AS IT ARRIVED" rows={[
              ["arrived", LOADER_BEACON.at],
              ["from", LOADER_BEACON.url],
              ["tag", `${LOADER_BEACON.tag} · ${LOADER_BEACON.env}`],
              ["version", LOADER_BEACON.loader],
              ["client", LOADER_BEACON.client],
            ]} />
            <p className="text-[13px] text-muted-2 max-w-[70ch] leading-relaxed">
              That is one page on one environment — enough to prove the tag works, and no proof at all about the page a
              prototype targets. Per-page proof is Injection proof, and it is a different question.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            <CodeBlock label="THE TAG — LAST THING IN <HEAD>" lines={[
              `<script src="https://tag.prism.build/opmc.js"`,
              `        data-tag="${prod?.tag ?? ""}" async></script>`,
            ]} />
            <Button size="sm" variant="outline" onClick={() => { setChecks((c) => c + 1); if (checks >= 1) setBeaconSeen(true); }}>
              Check again
            </Button>
          </div>
        )}
      </StepRow>
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
          { id: "hosted" as const, title: "Prism runs it on a hosted runner", sub: "Not available for this customer: the runner would need write access to outrigger-digital, and only the GitHub app&rsquo;s read scope is granted.", ok: false },
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
      "<!-- expected opmc-prod-7f31 — this is the prep tag, on a page real guests reach -->",
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

export function InjectionProof() {
  const [filter, setFilter] = useState<"all" | ProofState>("all");
  const [openId, setOpenId] = useState<string>(TARGETS[0].id);
  const [vouched, setVouched] = useState<Record<string, Vouch>>({});

  /** Derived, never stored: what the fetch saw decides the state. */
  const stateOf = (t: Target): ProofState =>
    vouched[t.id] ? "confirmed"
      : t.found === null ? (t.optiSnippet ? "unknown" : "absent")
        : t.found === t.expect ? "found" : "wrong-env";

  const toneOf = (t: Target): "ok" | "warn" | "danger" | "muted" | "accent" => {
    const s = stateOf(t);
    // A mismatched tag on a page guests can reach is the one result worse than nothing.
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

  const vouch = (t: Target) => setVouched((v) => ({
    ...v,
    [t.id]: { by: ME.name, role: ME.role, at: "10 Sep 2026 11:47:22 HST", client: "Chrome 141 · macOS", digest: "html sha256:b2e7…4c19" },
  }));

  return (
    <>
      <PageHeader
        title="Injection proof"
        count={`${TARGETS.length} target pages · ${attention} need someone`}
        actions={<Button size="sm" variant="outline">Check all again</Button>}
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
          about a resort page.
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
                          <Pill tone={toneOf(t)}>{PROOF[s].label}</Pill>
                        </td>
                        <td className="px-4 py-3 text-[12.5px] text-muted-2 whitespace-nowrap tabular-nums">{t.checked}</td>
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
          action={<Pill tone={toneOf(open)}>{PROOF[openState].label}</Pill>}>
          <div className="px-5 py-4 border-b border-border flex flex-wrap gap-6 items-start">
            <div className="min-w-[320px] flex-1">
              <Meta k="Page" v={open.url} mono />
              <Meta k="Environment" v={`${open.env}${open.isProduction ? " · real guests reach this" : " · nobody outside the team reaches this"}`} />
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
                <span className="font-mono text-[12.5px]"> {open.found}</span>, which belongs to Prep, on a URL a paying guest
                can open. Two things follow, and both are already true: whatever Prep points at can be served to a real
                guest, and every beacon from this page files under the wrong environment — so a Prep experiment&rsquo;s
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
                <Button size="sm" className="mt-3" onClick={() => vouch(open)}>I can see the tag on this page</Button>
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
            <Button size="sm" variant="outline">Check this page again</Button>
            <Button size="sm" variant="outline">Copy the tag for {open.env}</Button>
            <span className="text-[12.5px] text-muted-2 tabular-nums">Last checked {open.checked}</span>
          </div>
        </Section>
      </div>
    </>
  );
}
