"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

/** `~` doesn't expand inside quotes; rewrite to $HOME (which does) so paths with spaces stay safe. */
function expandHome(p: string): string {
  return p.startsWith("~") ? `$HOME${p.slice(1)}` : p;
}

/**
 * The BUILD room's workflow — the loop you actually run, in order:
 *   1. Prepare the branch (provision: brief + snapshots + skills → .opmc/**)
 *   2. Start Claude (clone into your saved local folder, link the site source)
 *   3. Sync brief & skills when the console-side context changes
 * Setup (repo, branch, local folders) lives in Source Control; this component
 * only READS the saved paths (same localStorage keys).
 */
export function InitScript({ prototypeKey, repo, provisioned, previewUrl, buildStatus, briefDone = true }: {
  prototypeKey: string;
  repo?: { fullName: string; branch: string };
  provisioned: boolean;
  previewUrl?: string;
  buildStatus: { found: boolean | null; headSha?: string; bytes?: number; branchExists?: boolean };
  briefDone?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [synced, setSynced] = useState<string | null>(null);
  const [path, setPath] = useState("");
  const [src, setSrc] = useState("");

  const pathKey = `opmc:initpath:${prototypeKey}`;
  const sourceKey = `opmc:sourcepath:${repo?.fullName ?? "default"}`;

  // Read-only here: the paths are set (and explained) in Source Control.
  useEffect(() => {
    try {
      setPath((localStorage.getItem(pathKey) ?? "").trim());
      // Fall back to the pre-repo "default" key so a source path saved before
      // the repo was configured still reaches the command.
      const s = localStorage.getItem(sourceKey) ?? (repo?.fullName ? localStorage.getItem("opmc:sourcepath:default") : null) ?? "";
      setSrc(s.trim());
    } catch { /* private window — the missing-path hint below covers it */ }
  }, [pathKey, sourceKey, repo?.fullName]);

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
        setSynced(r?.noChange
          ? "Already up to date — nothing changed."
          : `Synced${r?.commitSha ? ` · ${String(r.commitSha).slice(0, 7)}` : ""}. Run git pull, then restart the agent to load new skills.`);
      }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : isResync ? "Re-sync failed" : "Couldn't prepare the branch");
    } finally { setBusy(false); }
  }

  if (!repo) {
    return <div className="rounded-xl border border-warn/40 bg-[color-mix(in_srgb,var(--warn)_5%,transparent)] px-4 py-3 text-[14px]">This prototype has no repo yet. <Link href={`/prototypes/${prototypeKey}/settings`} className="text-accent hover:text-accent-hover font-medium">Set it up in Settings →</Link></div>;
  }

  if (!provisioned) {
    const tokenIssue = err ? /(403|not allowed|not accessible|Contents|reconnect|token)/i.test(err) : false;
    return (
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border">
          <span className="text-[14px] font-semibold">Prepare the branch</span>
          <span className="text-[13px] text-muted-2 ml-2">Writes the brief, page snapshots and selected skills into the branch — the agent wakes up loaded.</span>
        </div>
        <div className="px-4 py-3 flex items-center justify-between gap-4">
          <span className={`text-[13px] ${briefDone ? "text-muted-2" : "text-warn"}`}>{briefDone ? "One commit to .opmc/** — never your code." : "Finish the brief first (the change AND a success metric) — it's the gate. Building without a spec is how prototypes drift."}</span>
          <button onClick={() => provision(false)} disabled={busy || !briefDone} className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[15px] font-semibold hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed shrink-0">{busy ? "Preparing…" : err ? "Try again" : "Prepare branch"}</button>
        </div>
        {err && (
          <div className="px-4 py-3 border-t border-danger/30 bg-[color-mix(in_srgb,var(--danger)_6%,transparent)] space-y-1.5">
            <div className="text-[14px] text-danger leading-relaxed">{err}</div>
            {tokenIssue && <Link href="/settings/repositories" className="inline-block text-[14px] text-accent hover:text-accent-hover font-medium">Manage the GitHub connection in Settings → Repositories →</Link>}
          </div>
        )}
      </div>
    );
  }

  // provisioned → build the command from the paths saved in Source Control
  const fullName = repo.fullName;
  const branch = repo.branch || `prototype/${prototypeKey}`;
  const checkout = buildStatus.branchExists ? `git checkout ${branch}` : `git checkout -b ${branch} origin/starter && git push -u origin ${branch}`;
  const linkLine = src
    ? `\nln -sfn "${expandHome(src)}" source-site && echo "source-site" >> .git/info/exclude   # real site source — local only`
    : "";
  const preview = previewUrl ? `TARGET_URL="${previewUrl}" node dev.mjs      # preview → http://localhost:4400` : `node dev.mjs      # preview → http://localhost:4400`;
  const cmds = `git clone git@github.com:${fullName}.git "${expandHome(path)}"\ncd "${expandHome(path)}"\n${checkout}${linkLine}\nclaude\n${preview}`;

  async function copy() { try { await navigator.clipboard.writeText(cmds); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ } }

  return (
    <div className="space-y-3">
      {path ? (
        <div className="rounded-xl border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] overflow-hidden">
          <div className="px-4 py-2.5 flex items-center justify-between border-b border-accent/30">
            <span className="text-[14px] font-semibold">Start the agent</span>
            <button onClick={copy} className="text-[14px] text-accent hover:text-accent-hover font-medium">{copied ? "Copied" : "Copy"}</button>
          </div>
          <pre className="px-4 py-3 text-[13px] font-mono text-muted leading-relaxed overflow-x-auto">{cmds}</pre>
          <div className="px-4 pb-3 text-[13px] text-muted-2 border-t border-border/60 pt-2.5">
            Clones straight into <span className="font-mono">{path}</span> — that folder becomes the repo (no nested subfolder).
            {src
              ? <> The agent reads the real site source at <span className="font-mono">source-site/</span>, plus the page snapshot in <span className="font-mono">.opmc/</span>.</>
              : <> Add the website source checkout in <Link href={`/prototypes/${prototypeKey}/settings`} className="text-accent hover:text-accent-hover">Settings</Link> and the agent can build against real components instead of only the page snapshot.</>}
            {buildStatus.found === true && <span className="text-ok"> · ✓ built ({buildStatus.headSha?.slice(0, 7)})</span>}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-warn/40 bg-[color-mix(in_srgb,var(--warn)_6%,transparent)] px-4 py-3 text-[14px] text-warn">
          No local folder saved — <Link href={`/prototypes/${prototypeKey}/settings`} className="text-accent hover:text-accent-hover font-medium">set it in Settings →</Link> to generate your start command.
        </div>
      )}

      {/* Re-sync — the console rewrites .opmc/** and .claude/skills/** on the
          branch. Safe on a live branch: compare-and-swap, never touches src/
          or dist/. */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between gap-3">
          <span className="text-[14px] font-semibold">Sync brief &amp; skills to the branch</span>
          <button onClick={() => provision(true)} disabled={busy} className="h-8 px-3 rounded-lg border border-border text-[14px] font-semibold text-muted hover:text-foreground hover:border-border-strong disabled:opacity-40 shrink-0">
            {busy ? "Re-syncing…" : "Re-sync"}
          </button>
        </div>
        <div className="px-4 py-3">
          <div className="text-[13px] text-muted-2 leading-relaxed">
            Writes the current brief, page snapshots (<span className="font-mono">data.md</span>, <span className="font-mono">design-tokens.md</span>) and the selected skills into the branch. Then <span className="font-mono">git pull</span> — and restart the agent so it picks up new skills.
          </div>
          {err && <div className="text-[13px] text-danger mt-1">{err}</div>}
          {synced && <div className="text-[13px] text-ok mt-1">{synced}</div>}
        </div>
      </div>
    </div>
  );
}
