"use client";

import Link from "next/link";
import { useState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { TimeAgo } from "@/components/ui";

const inp = "w-full rounded-lg bg-background border border-border px-3 py-2 text-[14px] font-mono text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none";
/** `~` doesn't expand inside quotes; rewrite to $HOME (which does) so paths with spaces stay safe. */
const expandHome = (p: string) => (p.startsWith("~") ? `$HOME${p.slice(1)}` : p);
const isAbsolute = (p: string) => /^[/~]/.test(p);

/** One numbered step of the build loop — done ✓, active (accent), or locked (dim). */
function Step({ n, title, state, children }: { n: number; title: string; state: "done" | "active" | "locked"; children: ReactNode }) {
  const badge = state === "done" ? "bg-ok text-accent-fg" : state === "active" ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted-2";
  return (
    <div className={`rounded-xl border bg-surface overflow-hidden ${state === "active" ? "border-accent/40" : "border-border"} ${state === "locked" ? "opacity-55" : ""}`}>
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2.5">
        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0 ${badge}`}>{state === "done" ? "✓" : n}</span>
        <span className="text-[14px] font-semibold">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

/**
 * The BUILD room — the develop loop as an OBVIOUS, ORDERED, required sequence:
 *   1. Prepare the branch (provision brief + snapshots + skills into .opmc)
 *   2. Set your local folder (where it clones; optional site source)
 *   3. Start the agent (the clone + claude command — needs 1 and 2)
 *   4. Keep it in sync (re-run when the brief or skills change)
 * Each step is locked until its prerequisites are met, so the order can't be
 * done wrong. Local folders live HERE (per-machine, part of the loop); the
 * registered repo + skills are one-time setup in Settings.
 */
export function InitScript({ prototypeKey, repo, provisioned, previewUrl, buildStatus, briefDone = true, claudeSeenAt = null, inSync = true }: {
  prototypeKey: string;
  repo?: { fullName: string; branch: string };
  provisioned: boolean;
  previewUrl?: string;
  buildStatus: { found: boolean | null; headSha?: string; bytes?: number; branchExists?: boolean };
  briefDone?: boolean;
  /** Ground truth that the agent actually started: its check-in beacon. */
  claudeSeenAt?: string | null;
  /** Ground truth that the branch matches the console (brief/pages unchanged). */
  inSync?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [synced, setSynced] = useState<string | null>(null);

  // Local folders — per-machine, saved in the browser (not the DB).
  const [draftPath, setDraftPath] = useState("");
  const [draftSource, setDraftSource] = useState("");
  const [savedPath, setSavedPath] = useState("");
  const [savedSource, setSavedSource] = useState("");
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const pathKey = `opmc:initpath:${prototypeKey}`;
  const sourceKey = `opmc:sourcepath:${repo?.fullName ?? "default"}`;

  useEffect(() => {
    try {
      const p = localStorage.getItem(pathKey) ?? "";
      const s = localStorage.getItem(sourceKey) ?? (repo?.fullName ? localStorage.getItem("opmc:sourcepath:default") : null) ?? "";
      setDraftPath(p); setSavedPath(p);
      setDraftSource(s); setSavedSource(s);
    } catch { /* private window — Save will report it */ }
  }, [pathKey, sourceKey, repo?.fullName]);

  const path = savedPath.trim();
  const src = savedSource.trim();
  const pathOk = path.length > 0;
  const dirty = draftPath.trim() !== savedPath.trim() || draftSource.trim() !== savedSource.trim();

  function savePaths() {
    const p = draftPath.trim(); const s = draftSource.trim();
    if (!p) { setSaveMsg({ ok: false, text: "Local folder is required — paste the absolute path." }); return; }
    if (!isAbsolute(p)) { setSaveMsg({ ok: false, text: "Local folder must be an absolute path (start with / or ~)." }); return; }
    if (s && !isAbsolute(s)) { setSaveMsg({ ok: false, text: "Website source must be an absolute path (start with / or ~)." }); return; }
    try {
      localStorage.setItem(pathKey, p); localStorage.setItem(sourceKey, s);
      if (localStorage.getItem(pathKey) !== p) throw new Error("read-back mismatch");
      setSavedPath(p); setSavedSource(s);
      setSaveMsg({ ok: true, text: "Saved in this browser." });
    } catch { setSaveMsg({ ok: false, text: "Couldn't save — this browser blocked local storage (private window?)." }); }
  }

  /** Provision / re-provision the branch: writes .opmc/** + .claude/skills/**. */
  async function provision(isResync: boolean) {
    if (busy) return;
    setBusy(true); setErr(null); setSynced(null);
    try {
      const res = await fetch("/api/prototypes/provision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: prototypeKey }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error ?? (isResync ? "Re-sync failed" : "Couldn't prepare the branch")); return; }
      if (isResync) {
        const r = data.result ?? data;
        setSynced(r?.noChange ? "Already up to date — nothing changed."
          : `Synced${r?.commitSha ? ` · ${String(r.commitSha).slice(0, 7)}` : ""}. Run git pull, then restart the agent to load new skills.`);
      }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : isResync ? "Re-sync failed" : "Couldn't prepare the branch");
    } finally { setBusy(false); }
  }

  if (!repo) {
    return <div className="rounded-xl border border-warn/40 bg-[color-mix(in_srgb,var(--warn)_5%,transparent)] px-4 py-3 text-[14px]">This prototype has no repo yet. <Link href={`/prototypes/${prototypeKey}?tab=repo`} className="text-accent hover:text-accent-hover font-medium">Choose one in Settings →</Link></div>;
  }

  const fullName = repo.fullName;
  const branch = repo.branch || `prototype/${prototypeKey}`;
  const checkout = buildStatus.branchExists ? `git checkout ${branch}` : `git checkout -b ${branch} origin/starter && git push -u origin ${branch}`;
  const linkLine = src ? `\nln -sfn "${expandHome(src)}" source-site && echo "source-site" >> .git/info/exclude   # real site source — local only` : "";
  // Launch the agent WITH its first task, so it wakes up oriented — reads the
  // brief, loads the skill, and starts building — instead of asking what to do.
  const orient = `You are the OPMC prototype engineer for the ${prototypeKey} prototype. Before anything else: read .opmc/brief.md and .opmc/context.json, load the opmc-prototype skill, then summarize the brief and its target page(s) and your build plan in a few lines, and start building. Do not ask what to work on — you are building this prototype.`;
  const cmds = `git clone git@github.com:${fullName}.git "${expandHome(path)}"\ncd "${expandHome(path)}"\n${checkout}${linkLine}\nclaude "${orient}"`;
  // Ground truth the agent started: its check-in beacon, or a real build landed.
  const agentStarted = Boolean(claudeSeenAt || buildStatus.found);
  // Preview is a SECOND terminal — claude above is interactive and blocks this one.
  const previewCmd = `${previewUrl ? `TARGET_URL="${previewUrl}" ` : ""}node dev.mjs`;
  async function copy() { try { await navigator.clipboard.writeText(cmds); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ } }
  async function copyPreview() { try { await navigator.clipboard.writeText(previewCmd); } catch { /* clipboard blocked */ } }
  const tokenIssue = err ? /(403|not allowed|not accessible|Contents|reconnect|token)/i.test(err) : false;

  return (
    <div className="space-y-3">
      {/* 1 · Prepare the branch */}
      <Step n={1} title="Prepare the branch" state={provisioned ? "done" : briefDone ? "active" : "locked"}>
        {provisioned ? (
          <div className="text-[13px] text-muted-2">Branch provisioned — the brief, page snapshots and skills are in <span className="font-mono">.opmc/</span>. Re-run below whenever they change.</div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <span className={`text-[13px] ${briefDone ? "text-muted-2" : "text-warn"}`}>{briefDone ? "Writes the brief + snapshots + skills into the branch (one commit to .opmc/** — never your code)." : "Finish the brief first (the change AND a success metric) — it's the gate."}</span>
            <button onClick={() => provision(false)} disabled={busy || !briefDone} className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[15px] font-semibold hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed shrink-0">{busy ? "Preparing…" : err ? "Try again" : "Prepare branch"}</button>
          </div>
        )}
        {err && !provisioned && (
          <div className="mt-2 rounded-lg border border-danger/30 bg-[color-mix(in_srgb,var(--danger)_6%,transparent)] px-3 py-2 space-y-1">
            <div className="text-[14px] text-danger leading-relaxed">{err}</div>
            {tokenIssue && <Link href="/settings/repositories" className="inline-block text-[14px] text-accent hover:text-accent-hover font-medium">Manage the GitHub connection →</Link>}
          </div>
        )}
      </Step>

      {/* 2 · Set your local folder */}
      <Step n={2} title="Set your local folder" state={pathOk && !dirty ? "done" : "active"}>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="block text-[13px] text-muted-2">Where the prototype clones to <span className="text-danger">*</span></label>
            <input value={draftPath} onChange={(e) => { setDraftPath(e.target.value); setSaveMsg(null); }} spellCheck={false} placeholder="/Users/you/Projects/room-compare" className={inp} />
            <div className="text-[12.5px] text-muted-2 leading-relaxed">In Finder: right-click the folder → hold <span className="font-mono">⌥ Option</span> → &ldquo;Copy … as Pathname.&rdquo; The clone lands here; nothing else is touched.</div>
          </div>
          <div className="space-y-1">
            <label className="block text-[13px] text-muted-2">Website source checkout <span className="text-muted-2">(optional — lets the agent read the real markup)</span></label>
            <input value={draftSource} onChange={(e) => { setDraftSource(e.target.value); setSaveMsg(null); }} spellCheck={false} placeholder="/Users/you/Projects/Outrigger_Website" className={inp} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className={`text-[13px] ${saveMsg ? (saveMsg.ok ? "text-ok" : "text-danger") : dirty ? "text-warn" : pathOk ? "text-ok" : "text-muted-2"}`}>
              {saveMsg ? saveMsg.text : dirty ? "Unsaved — the command below uses the saved path." : pathOk ? "Saved in this browser." : "Paste the folder path, then Save."}
            </span>
            {dirty || !pathOk ? (
              <button onClick={savePaths} className="h-8 px-3 rounded-lg bg-accent text-accent-fg text-[14px] font-semibold hover:bg-accent-hover shrink-0">Save</button>
            ) : (
              <span className="h-8 px-3 rounded-lg border border-ok/40 text-ok text-[14px] font-semibold flex items-center shrink-0">Saved ✓</span>
            )}
          </div>
        </div>
      </Step>

      {/* 3 · Start the agent — DONE from ground truth: the agent's check-in
          beacon, or a real build on the branch. Never eternally "active". */}
      <Step n={3} title="Start the agent" state={!provisioned || !pathOk ? "locked" : agentStarted ? "done" : "active"}>
        {!provisioned || !pathOk ? (
          <div className="text-[13px] text-warn">Finish {[!provisioned ? "step 1" : null, !pathOk ? "step 2" : null].filter(Boolean).join(" and ")} first — then your clone + start command appears here.</div>
        ) : (
          <div className="space-y-3">
            {agentStarted && (
              <div className="text-[13px] text-ok">
                {claudeSeenAt ? <>Agent engaged <TimeAgo iso={claudeSeenAt} /></> : "The agent has built on the branch"}
                {buildStatus.found === true && <span> · ✓ built (<span className="font-mono">{buildStatus.headSha?.slice(0, 7)}</span>)</span>}
              </div>
            )}
            <div className="rounded-lg border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] overflow-hidden">
              <div className="px-3 py-2 flex items-center justify-between border-b border-accent/30">
                <span className="text-[13px] font-medium">{agentStarted ? "Start another session — run this in your terminal" : "Run this in your terminal"}</span>
                <button onClick={copy} className="text-[13px] text-accent hover:text-accent-hover font-medium">{copied ? "Copied" : "Copy"}</button>
              </div>
              <pre className="px-3 py-2.5 text-[13px] font-mono text-muted leading-relaxed overflow-x-auto">{cmds}</pre>
              <div className="px-3 pb-2.5 text-[12.5px] text-muted-2 border-t border-border/60 pt-2">
                Clones into <span className="font-mono">{path}</span>, then launches the agent already tasked to read the brief and build — no coaching needed.{src ? <> It reads the real site source at <span className="font-mono">source-site/</span>.</> : null}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12.5px] text-muted-2">Live preview — a <b>second</b> terminal (the agent above holds the first):</span>
                <button onClick={copyPreview} className="text-[12.5px] text-accent hover:text-accent-hover font-medium">Copy</button>
              </div>
              <pre className="rounded-lg border border-border bg-background/60 px-3 py-2 text-[12.5px] font-mono text-muted overflow-x-auto">{previewCmd}<span className="text-muted-2">   # → http://localhost:4400</span></pre>
            </div>
          </div>
        )}
      </Step>

      {/* Sync status — NOT a numbered step: it's ongoing maintenance with a live
          state (in sync / drifted), so it renders as a status card. This card is
          the HOME of the drift fact; the header alert deep-links here. */}
      <div className={`rounded-xl border bg-surface overflow-hidden ${!provisioned ? "border-border opacity-55" : inSync ? "border-ok/30" : "border-warn/50"}`}>
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2.5">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${!provisioned ? "bg-border-strong" : inSync ? "bg-ok" : "bg-warn"}`} />
          <span className="text-[14px] font-semibold">Sync</span>
          <span className={`text-[13px] ${!provisioned ? "text-muted-2" : inSync ? "text-ok" : "text-warn"}`}>
            {!provisioned ? "starts after the branch is prepared" : inSync ? "in sync — the branch matches the console" : "the brief or pages changed — re-sync so the agent builds against the current brief"}
          </span>
          <button onClick={() => provision(true)} disabled={busy || !provisioned}
            className={`ml-auto h-8 px-3 rounded-lg text-[14px] font-semibold shrink-0 disabled:opacity-40 ${inSync ? "border border-border text-muted hover:text-foreground hover:border-border-strong" : "bg-warn text-accent-fg hover:opacity-90"}`}>
            {busy ? "Re-syncing…" : "Re-sync"}
          </button>
        </div>
        <div className="px-4 py-2.5">
          <div className="text-[12.5px] text-muted-2 leading-relaxed">Writes the current brief, page snapshots and selected skills into the branch. Then <span className="font-mono">git pull</span> — and restart the agent so it picks up new skills.</div>
          {err && provisioned && <div className="text-[13px] text-danger mt-1">{err}</div>}
          {synced && <div className="text-[13px] text-ok mt-1">{synced}</div>}
        </div>
      </div>
    </div>
  );
}
