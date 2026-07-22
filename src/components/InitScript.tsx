"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const inp = "w-full rounded-lg bg-background border border-border px-3 py-2 text-[12px] font-mono text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none";

/**
 * "Build with Claude" — the init prompt. First you say WHERE it should live on
 * your machine (a required absolute path — the browser can't read that from a
 * folder picker, so you paste it). Then provisioning sets up the branch, and
 * the command clones straight into that folder + launches Claude. The path is
 * remembered per-prototype in localStorage (it's machine-specific).
 */
export function InitScript({ prototypeKey, repo, provisioned, previewUrl, buildStatus }: {
  prototypeKey: string;
  repo?: { fullName: string; branch: string };
  provisioned: boolean;
  previewUrl?: string;
  buildStatus: { found: boolean | null; headSha?: string; bytes?: number; branchExists?: boolean };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [localPath, setLocalPath] = useState("");

  const storageKey = `opmc:initpath:${prototypeKey}`;
  useEffect(() => {
    try { const v = localStorage.getItem(storageKey); if (v) setLocalPath(v); } catch { /* no localStorage */ }
  }, [storageKey]);

  function updatePath(v: string) {
    setLocalPath(v);
    try { localStorage.setItem(storageKey, v); } catch { /* no localStorage */ }
  }

  const path = localPath.trim();
  const pathOk = path.length > 0;
  const looksAbsolute = path.startsWith("/") || path.startsWith("~");

  async function prepare() {
    if (busy || !pathOk) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/prototypes/provision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: prototypeKey }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error ?? "Couldn't set up the workspace"); return; }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't set up the workspace");
    } finally { setBusy(false); }
  }

  if (!repo) {
    return <div className="rounded-xl border border-warn/40 bg-[color-mix(in_srgb,var(--warn)_5%,transparent)] px-4 py-3 text-[12px]">This prototype has no repo. <Link href={`/prototypes/${prototypeKey}/settings`} className="text-accent hover:text-accent-hover font-medium">Set one →</Link></div>;
  }

  // The required "where does it live locally" field — shared by both states.
  const pathField = (
    <div className="space-y-1">
      <label className="block text-[11px] text-muted-2">Local folder — absolute path <span className="text-danger">*</span></label>
      <input value={localPath} onChange={(e) => updatePath(e.target.value)} spellCheck={false} placeholder="/Users/you/Projects/room-detail-overlay" className={inp} />
      <div className="text-[10px] text-muted-2 leading-relaxed">
        In Finder: right-click the folder → hold <span className="font-mono">⌥ Option</span> → &ldquo;Copy … as Pathname&rdquo; → paste. The clone lands here; nothing else on your machine is touched.
        {pathOk && !looksAbsolute && <span className="text-warn"> · use an absolute path (starts with <span className="font-mono">/</span> or <span className="font-mono">~</span>)</span>}
      </div>
    </div>
  );

  if (!provisioned) {
    const tokenIssue = err ? /(403|not allowed|not accessible|Contents|reconnect|token)/i.test(err) : false;
    return (
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-4 py-3 space-y-3">
          <div className="text-[12px] text-muted-2 max-w-md">Get your init script — sets up the branch so Claude wakes up loaded with this prototype and its page(s).</div>
          {pathField}
          <div className="flex items-center justify-between gap-4">
            <span className="text-[11px] text-muted-2">{pathOk ? "Ready — this is where it clones to." : "Set where it lives locally first."}</span>
            <button onClick={prepare} disabled={busy || !pathOk} className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40 shrink-0">{busy ? "Setting up…" : err ? "Try again" : "Get init script"}</button>
          </div>
        </div>
        {err && (
          <div className="px-4 py-3 border-t border-danger/30 bg-[color-mix(in_srgb,var(--danger)_6%,transparent)] space-y-1.5">
            <div className="text-[12px] text-danger leading-relaxed">{err}</div>
            {tokenIssue && <Link href="/settings/repositories" className="inline-block text-[12px] text-accent hover:text-accent-hover font-medium">Manage the GitHub connection in Settings → Repositories →</Link>}
          </div>
        )}
      </div>
    );
  }

  // provisioned → build the command from the chosen path
  const fullName = repo.fullName;
  const branch = repo.branch || `prototype/${prototypeKey}`;
  // `~` doesn't expand inside quotes; rewrite to $HOME (which does) so paths with spaces stay safe.
  const expanded = path.startsWith("~") ? `$HOME${path.slice(1)}` : path;
  const checkout = buildStatus.branchExists ? `git checkout ${branch}` : `git checkout -b ${branch} origin/starter && git push -u origin ${branch}`;
  const preview = previewUrl ? `TARGET_URL="${previewUrl}" node dev.mjs      # preview → http://localhost:4400` : `node dev.mjs      # preview → http://localhost:4400`;
  const cmds = `git clone git@github.com:${fullName}.git "${expanded}"\ncd "${expanded}"\n${checkout}\nclaude\n${preview}`;

  async function copy() { try { await navigator.clipboard.writeText(cmds); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ } }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-surface p-4">{pathField}</div>
      {pathOk ? (
        <div className="rounded-xl border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] overflow-hidden">
          <div className="px-4 py-2.5 flex items-center justify-between border-b border-accent/30">
            <span className="text-[12px] font-semibold">Run this to build</span>
            <button onClick={copy} className="text-[12px] text-accent hover:text-accent-hover font-medium">{copied ? "Copied" : "Copy"}</button>
          </div>
          <pre className="px-4 py-3 text-[11px] font-mono text-muted leading-relaxed overflow-x-auto">{cmds}</pre>
          <div className="px-4 pb-3 text-[11px] text-muted-2 border-t border-border/60 pt-2.5">
            Clones straight into <span className="font-mono">{path}</span> — that folder becomes the repo (no nested subfolder). Edit → save → <span className="font-mono">localhost:4400</span> reloads on the real page. Push when it&apos;s good.
            {buildStatus.found === true && <span className="text-ok"> · ✓ built ({buildStatus.headSha?.slice(0, 7)})</span>}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-warn/40 bg-[color-mix(in_srgb,var(--warn)_6%,transparent)] px-4 py-3 text-[12px] text-warn">Set the local folder above to generate your clone command.</div>
      )}
    </div>
  );
}
