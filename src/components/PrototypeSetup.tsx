"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

const link = "text-accent hover:text-accent-hover font-medium";

interface LiveStatus { targetCount: number; loaderVerified: boolean }
interface ExpStatus { active: boolean; experimentUrl?: string }

/**
 * Overview — the prototype's home: the checklist ladder to local dev + a
 * status strip across the three modes (Local Dev / Live Page / Experiment).
 * The build brief lives on its own tab.
 */
export function PrototypeSetup({ prototypeKey, repo, hasBrief, hasPages, consoleUrl, previewUrl, buildStatus, provisioned, liveStatus, expStatus, claudeStatus }: {
  prototypeKey: string;
  repo?: { fullName: string; branch: string };
  hasBrief: boolean;
  hasPages: boolean;
  consoleUrl: string;
  previewUrl?: string;
  buildStatus: { found: boolean | null; headSha?: string; bytes?: number; branchExists?: boolean };
  provisioned: boolean;
  liveStatus: LiveStatus;
  expStatus: ExpStatus;
  claudeStatus: { seen: boolean; text: string };
}) {
  const router = useRouter();
  const base = `/prototypes/${prototypeKey}`;
  const hasRepo = Boolean(repo);
  const ready = hasRepo && hasBrief && hasPages && provisioned;

  return (
    <div className="space-y-4 max-w-2xl">
      <StatusStrip base={base} provisioned={provisioned} buildStatus={buildStatus} liveStatus={liveStatus} expStatus={expStatus} claudeStatus={claudeStatus} />
      <Ladder
        base={base}
        prototypeKey={prototypeKey}
        hasRepo={hasRepo}
        hasBrief={hasBrief}
        hasPages={hasPages}
        provisioned={provisioned}
        ready={ready}
        repo={repo}
        onChange={() => router.refresh()}
      />
      {ready && <Commands prototypeKey={prototypeKey} repo={repo} consoleUrl={consoleUrl} previewUrl={previewUrl} buildStatus={buildStatus} />}
    </div>
  );
}

/** Status across the three modes — where this prototype is right now. */
function StatusStrip({ base, provisioned, buildStatus, liveStatus, expStatus, claudeStatus }: {
  base: string; provisioned: boolean;
  buildStatus: { found: boolean | null };
  liveStatus: LiveStatus; expStatus: ExpStatus;
  claudeStatus: { seen: boolean; text: string };
}) {
  const local = !provisioned
    ? { tone: "muted", text: "Not set up" }
    : buildStatus.found === true
    ? { tone: "ok", text: "Build present" }
    : { tone: "accent", text: "Ready — run the command" };
  const live = liveStatus.targetCount === 0
    ? { tone: "muted", text: "No pages yet" }
    : liveStatus.loaderVerified
    ? { tone: "ok", text: "Loader verified" }
    : { tone: "warn", text: "Verify injection" };
  const exp = expStatus.active
    ? { tone: "ok", text: "In Optimizely" }
    : { tone: "muted", text: "Not started" };

  return (
    <div className="grid grid-cols-2 gap-3">
      <ModeCard title="Claude" tone={claudeStatus.seen ? "ok" : "muted"} text={claudeStatus.text} href={base} />
      <ModeCard title="Local Dev" tone={local.tone} text={local.text} href={base} />
      <ModeCard title="Live Page" tone={live.tone} text={live.text} href={`${base}/pages`} />
      <ModeCard title="Experiment" tone={exp.tone} text={exp.text} href={expStatus.experimentUrl ?? `${base}/ship`} external={Boolean(expStatus.experimentUrl)} />
    </div>
  );
}

const TONE: Record<string, string> = {
  ok: "text-ok", accent: "text-accent", warn: "text-warn", muted: "text-muted-2",
};

function ModeCard({ title, tone, text, href, external }: { title: string; tone: string; text: string; href: string; external?: boolean }) {
  const body = (
    <>
      <div className="text-[11px] text-muted-2 uppercase tracking-wide">{title}</div>
      <div className={`text-[13px] font-medium mt-1 ${TONE[tone] ?? "text-foreground"}`}>{text}{external ? " ↗" : ""}</div>
    </>
  );
  const cls = "rounded-xl border border-border bg-surface p-3 hover:border-border-strong transition-colors block";
  return external
    ? <a href={href} target="_blank" rel="noreferrer" className={cls}>{body}</a>
    : <Link href={href} className={cls}>{body}</Link>;
}

/** The ladder to local dev — steps light up; the final rung reveals the command. */
function Ladder({ base, prototypeKey, hasRepo, hasBrief, hasPages, provisioned, ready, repo, onChange }: {
  base: string;
  prototypeKey: string;
  hasRepo: boolean;
  hasBrief: boolean;
  hasPages: boolean;
  provisioned: boolean;
  ready: boolean;
  repo?: { fullName: string; branch: string };
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  async function prepare() {
    if (busy) return;
    setBusy(true); setErr(null); setWarn(null);
    try {
      const res = await fetch("/api/prototypes/provision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: prototypeKey }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error ?? "Couldn't prepare the workspace"); return; }
      const failed = (data.result?.captures ?? []).filter((c: { ok: boolean }) => !c.ok);
      if (failed.length) setWarn(`Prepared — but ${failed.length} page snapshot${failed.length === 1 ? "" : "s"} couldn't be captured (check FIRECRAWL_API_KEY on the server). Claude still gets the brief; the offline snapshot just won't be there.`);
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't prepare the workspace");
    } finally { setBusy(false); }
  }

  const steps: { label: string; sub?: string; done: boolean; action: React.ReactNode }[] = [
    { label: "Code location", sub: hasRepo ? repo?.fullName : undefined, done: hasRepo,
      action: hasRepo ? null : <Link href="/settings/repositories" className={link}>Connect your code repo →</Link> },
    { label: "Build brief", sub: hasBrief ? undefined : "what to build — a line or two", done: hasBrief,
      action: hasBrief ? null : <Link href={`${base}/brief`} className={link}>Write the brief →</Link> },
    { label: "Test page(s)", done: hasPages,
      action: hasPages ? null : <Link href={`${base}/pages`} className={link}>Add a page →</Link> },
    { label: "Prepare workspace", sub: provisioned ? "ready" : "snapshots the page so Claude works offline", done: provisioned,
      action: provisioned ? null : <button onClick={prepare} disabled={busy || !hasRepo} className="h-7 px-3 rounded-lg bg-accent text-accent-fg text-[12px] font-semibold hover:bg-accent-hover disabled:opacity-40">{busy ? "Preparing…" : "Prepare"}</button> },
  ];

  return (
    <div className="rounded-xl border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] overflow-hidden">
      <div className="px-4 py-3 border-b border-accent/30">
        <span className="text-[13px] font-semibold">Get to local dev</span>
        <span className="text-[11px] text-muted-2 ml-2">Finish these and your run command unlocks below.</span>
      </div>
      {steps.map((s, i) => (
        <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold border shrink-0 ${s.done ? "bg-accent/15 text-accent border-accent/40" : "bg-surface-2 text-muted-2 border-border"}`}>{s.done ? "✓" : i + 1}</span>
            <div className="min-w-0">
              <span className={`text-[13px] ${s.done ? "text-muted-2" : ""}`}>{s.label}</span>
              {s.sub && <span className="text-[11px] text-muted-2 ml-2 font-mono">{s.sub}</span>}
            </div>
          </div>
          {s.action && <div className="shrink-0">{s.action}</div>}
        </div>
      ))}
      <div className={`flex items-center gap-2.5 px-4 py-2.5 ${ready ? "" : "opacity-60"}`}>
        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold border shrink-0 ${ready ? "bg-accent text-accent-fg border-accent" : "bg-surface-2 text-muted-2 border-border"}`}>{ready ? "★" : "5"}</span>
        <span className={`text-[13px] font-medium ${ready ? "text-foreground" : "text-muted-2"}`}>
          {ready ? "Start local dev — your run command is below 👇" : "Start local dev — locked until the steps above are done"}
        </span>
      </div>
      {err && <div className="px-4 pb-3 text-[12px] text-danger">{err}</div>}
      {warn && <div className="px-4 pb-3 text-[12px] text-warn">{warn}</div>}
    </div>
  );
}

function Commands({ prototypeKey, repo, consoleUrl, previewUrl, buildStatus }: { prototypeKey: string; repo?: { fullName: string; branch: string }; consoleUrl: string; previewUrl?: string; buildStatus: { found: boolean | null; headSha?: string; bytes?: number; branchExists?: boolean } }) {
  const [copied, setCopied] = useState(false);
  const fullName = repo?.fullName ?? "owner/repo";
  const branch = repo?.branch || `prototype/${prototypeKey}`;
  const dir = fullName.split("/")[1] ?? prototypeKey;

  // (BuildSection guards the starter-branch case before we get here.)
  // Existing branch → checkout; new branch → fork off starter (never clobber).
  const checkout = buildStatus.branchExists
    ? `git checkout ${branch}`
    : `git checkout -b ${branch} origin/starter && git push -u origin ${branch}`;

  const previewLine = previewUrl
    ? `\n\n# 3. LOCAL DEV — the real page with your build injected, reloads on save (no token)\nTARGET_URL="${previewUrl}" node dev.mjs      # open http://localhost:4400`
    : `\n\n# 3. LOCAL DEV — the real page with your build injected (add a target page on the Pages tab)\nTARGET_URL="https://<your target page>" node dev.mjs      # open http://localhost:4400`;

  const cmds =
`# 1. clone + get on your prototype branch (zero install, zero token)
git clone git@github.com:${fullName}.git ${dir}
cd ${dir} && ${checkout}

# 2. build with Claude — it reads .opmc/ (your brief + the page snapshot)
claude${previewLine}`;

  async function copy() {
    try { await navigator.clipboard.writeText(cmds); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  }

  return (
    <div className="rounded-xl border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] overflow-hidden">
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-accent/30">
        <div>
          <span className="text-[12px] font-semibold">✓ Provisioned — run this to build locally</span>
          <span className="text-[11px] text-muted-2 ml-2">Claude wakes up with your brief + page snapshot in the tree.</span>
        </div>
        <button onClick={copy} className="text-[12px] text-accent hover:text-accent-hover font-medium">{copied ? "Copied" : "Copy"}</button>
      </div>
      <pre className="px-4 py-3 text-[11px] font-mono text-muted leading-relaxed overflow-x-auto">{cmds}</pre>
      <div className="px-4 pb-3 text-[11px] text-muted-2 border-t border-border/60 pt-2.5 space-y-1">
        <div>
          <span className="font-medium text-muted">The loop:</span> edit → save (localhost:4400 reloads) → happy? commit + push → review on real prep at{" "}
          <span className="font-mono">{previewUrl ? `${previewUrl}?opmc=${prototypeKey}` : `<page>?opmc=${prototypeKey}`}</span>.
          The API token (<Link href="/settings/repositories" className="text-accent hover:text-accent-hover">API access</Link>) is only needed to <em>cut a version</em>.
        </div>
        <div>
          Build status:{" "}
          {buildStatus.found === true
            ? <span className="text-ok">✓ built variation present{buildStatus.headSha ? ` · ${buildStatus.headSha.slice(0, 7)}` : ""}{typeof buildStatus.bytes === "number" ? ` · ${buildStatus.bytes.toLocaleString()} bytes` : ""}</span>
            : buildStatus.found === false
            ? <span className="text-warn">not built yet — build it locally, then Cut a version on the Build tab</span>
            : <span className="text-muted-2">couldn&apos;t read the repo (check GitHub connection)</span>}
        </div>
      </div>
    </div>
  );
}
