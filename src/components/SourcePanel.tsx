"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { TimeAgo } from "@/components/ui";
import type { ArtifactVersion } from "@/lib/prototypes/types";
import { useRouter } from "next/navigation";

interface SourceStatus {
  repo: string;
  branch: string;
  artifactPath: string;
  branchExists: boolean;
  headSha?: string;
  found: boolean;
  bytes: number;
  error?: string;
}

/** Copy-paste bootstrap for a branch that doesn't exist yet — the console
 *  hands over exact commands; the repo (and Claude Code) do the rest. */
function GetStarted({ repo, branch }: { repo: string; branch: string }) {
  const [copied, setCopied] = useState(false);
  const dir = repo.split("/")[1] ?? repo;
  const cmds = `git clone git@github.com:${repo}.git  # once\ncd ${dir}\ngit checkout -b ${branch} origin/starter && git push -u origin ${branch}\nclaude`;
  async function copy() {
    try { await navigator.clipboard.writeText(cmds); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  }
  return (
    <div className="rounded-lg border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] overflow-hidden">
      <div className="px-3 py-2 flex items-center justify-between border-b border-border/60">
        <span className="text-[12px] font-medium">Get started — run this on your machine</span>
        <button onClick={copy} className="text-[12px] text-accent hover:text-accent-hover font-medium">{copied ? "Copied" : "Copy"}</button>
      </div>
      <pre className="px-3 py-2.5 text-[11px] font-mono text-muted leading-relaxed overflow-x-auto">{cmds}</pre>
      <div className="px-3 pb-2.5 text-[11px] text-muted-2">
        Claude Code loads the repo&apos;s <span className="font-mono">opmc-prototype</span> skill, pulls this brief, and knows the whole loop. First time on this machine? Set the env exports from <Link href="/settings/repositories" className="text-accent hover:text-accent-hover">Settings → Repositories → API access</Link>.
      </div>
    </div>
  );
}

/**
 * The prototype's code source: its feature-repo branch. The variation is built
 * in the repo (with Claude) and committed as a self-contained artifact; the
 * console pulls it — it doesn't author code. "Cut version from repo" pins a
 * version to the branch HEAD with that built code.
 */
export function SourcePanel({ prototypeKey, versions = [] }: { prototypeKey: string; versions?: ArtifactVersion[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<SourceStatus | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cutErr, setCutErr] = useState<string | null>(null);
  const [cutMsg, setCutMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadErr(null);
    try {
      const res = await fetch(`/api/prototypes/source?key=${encodeURIComponent(prototypeKey)}`);
      const data = await res.json();
      if (!res.ok) { setLoadErr(data.error ?? "Couldn't read the repo"); setStatus(null); return; }
      setStatus(data.source);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : String(e));
    }
  }, [prototypeKey]);

  useEffect(() => { load(); }, [load]);


  async function cutFromRepo() {
    if (busy) return;
    setBusy(true); setCutErr(null); setCutMsg(null);
    try {
      const res = await fetch("/api/prototypes/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prototypeKey, fromRepo: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setCutErr(data.error ?? "Couldn't cut a version"); return; }
      setCutMsg(`Cut v${data.version.version} from ${data.version.gitRef ?? "repo"} · ${String(data.version.gitSha).slice(0, 7)}`);
      await load();
      router.refresh();
    } catch (e) {
      setCutErr(e instanceof Error ? e.message : "Couldn't cut a version");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border">
        <span className="text-[12px] font-semibold">Source</span>
        <span className="text-[11px] text-muted-2 ml-2">The variation is built in the feature repo — the console pulls it (it never edits code).</span>
      </div>

      <div className="p-4 space-y-3">
        {loadErr && (
          <div className="rounded-lg border border-danger/40 bg-[color-mix(in_srgb,var(--danger)_6%,transparent)] px-3 py-2.5 flex items-center justify-between gap-3">
            <span className="text-[12px] text-danger">{loadErr}</span>
            {loadErr.includes("No repo set") && (
              <Link href={`/prototypes/${prototypeKey}/build`} className="text-[12px] text-accent hover:text-accent-hover font-medium shrink-0">Pick a repo →</Link>
            )}
          </div>
        )}

        {status && (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
                <span className="text-muted-2">Repo</span><span className="font-mono">{status.repo}</span>
                <span className="text-muted-2">Branch</span><span className="font-mono">{status.branch}</span>
                <span className="text-muted-2">Artifact</span><span className="font-mono">{status.artifactPath}</span>
              </div>
              <Link href={`/prototypes/${prototypeKey}/build`} className="text-[12px] text-muted-2 hover:text-foreground shrink-0">Change</Link>
            </div>


            {status.found ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2/30 px-3 py-2">
                <div className="text-[12px] text-ok">
                  ✓ Built variation present <span className="font-mono text-muted-2">· {status.headSha?.slice(0, 7)} · {status.bytes.toLocaleString()} bytes</span>
                </div>
                <button onClick={cutFromRepo} disabled={busy} className="h-8 px-3 rounded-lg bg-accent text-accent-fg text-[12px] font-semibold hover:bg-accent-hover disabled:opacity-40 transition-colors shrink-0">
                  {busy ? "Cutting…" : "Cut version from repo"}
                </button>
              </div>
            ) : !status.branchExists ? (
              <GetStarted repo={status.repo} branch={status.branch} />
            ) : (
              <div className="rounded-lg border border-warn/40 bg-[color-mix(in_srgb,var(--warn)_6%,transparent)] px-3 py-2 text-[12px] text-muted">
                {status.error ?? `Build the prototype on ${status.branch} and commit ${status.artifactPath}.`}
                <div className="text-[11px] text-muted-2 mt-1">Build it in the repo with Claude, run <span className="font-mono text-muted">node build.mjs</span>, commit <span className="font-mono text-muted">{status.artifactPath}</span>, push — the console pulls it here.</div>
              </div>
            )}
          </>
        )}

        {cutErr && <div className="text-[12px] text-danger">{cutErr}</div>}
        {cutMsg && <div className="text-[12px] text-ok">{cutMsg}</div>}

        {versions.length > 0 && (
          <div className="rounded-lg border border-border bg-surface-2/20 overflow-hidden">
            <div className="px-3 py-2 flex items-center justify-between text-[12px]">
              <span className="text-muted">Latest cut: <span className="font-semibold text-foreground">v{versions[0].version}</span> <span className="font-mono text-muted-2">{versions[0].gitSha.slice(0, 7)}</span> · <TimeAgo iso={versions[0].createdAt} /></span>
              {!versions[0].variationJs && <span className="text-[10px] text-warn">no code</span>}
            </div>
            {versions.length > 1 && (
              <details className="border-t border-border/60">
                <summary className="px-3 py-1.5 text-[11px] text-muted-2 cursor-pointer hover:text-foreground">Version history ({versions.length})</summary>
                {versions.map((v) => (
                  <div key={v.id} className="px-3 py-1.5 border-t border-border/60 flex items-center justify-between text-[11px]">
                    <span className="text-muted">v{v.version} · <span className="font-mono text-muted-2">{v.gitSha.slice(0, 7)}</span>{v.gitRef ? ` · ${v.gitRef}` : ""}</span>
                    <span className="text-muted-2"><TimeAgo iso={v.createdAt} />{v.createdBy ? ` · ${v.createdBy}` : ""}</span>
                  </div>
                ))}
              </details>
            )}
          </div>
        )}
        <p className="text-[11px] text-muted-2">Preview on a live env: open the page with <span className="font-mono text-muted">?opmc={prototypeKey}</span> (the loader injects the current build).</p>
      </div>
    </div>
  );
}
