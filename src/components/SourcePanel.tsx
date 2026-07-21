"use client";

import { useState, useEffect, useCallback } from "react";
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

/**
 * The prototype's code source: its feature-repo branch. The variation is built
 * in the repo (with Claude) and committed as a self-contained artifact; the
 * console pulls it — it doesn't author code. "Cut version from repo" pins a
 * version to the branch HEAD with that built code.
 */
export function SourcePanel({ prototypeKey }: { prototypeKey: string }) {
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
      const data = await res.json();
      if (!res.ok) { setCutErr(data.error ?? "Couldn't cut a version"); return; }
      setCutMsg(`Cut v${data.version.version} from ${data.version.gitRef ?? "repo"} · ${String(data.version.gitSha).slice(0, 7)}`);
      await load();
      router.refresh();
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
        {loadErr && <div className="text-[12px] text-danger">{loadErr}</div>}

        {status && (
          <>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
              <span className="text-muted-2">Repo</span><span className="font-mono">{status.repo}</span>
              <span className="text-muted-2">Branch</span><span className="font-mono">{status.branch}</span>
              <span className="text-muted-2">Artifact</span><span className="font-mono">{status.artifactPath}</span>
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
            ) : (
              <div className="rounded-lg border border-warn/40 bg-[color-mix(in_srgb,var(--warn)_6%,transparent)] px-3 py-2 text-[12px] text-muted">
                {status.error ?? `Build the prototype on ${status.branch} and commit ${status.artifactPath}.`}
                <div className="text-[11px] text-muted-2 mt-1">Build it in the repo with Claude — a self-contained script that finds its anchor and injects. The console pulls it here.</div>
              </div>
            )}
          </>
        )}

        {cutErr && <div className="text-[12px] text-danger">{cutErr}</div>}
        {cutMsg && <div className="text-[12px] text-ok">{cutMsg}</div>}

        <p className="text-[11px] text-muted-2">Preview on a live env: open the page with <span className="font-mono text-muted">?opmc={prototypeKey}</span> (the loader injects the current build).</p>
      </div>
    </div>
  );
}
