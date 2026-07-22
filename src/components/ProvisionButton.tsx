"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Result {
  branch: string;
  branchCreated: boolean;
  commitUrl?: string;
  committedPaths: string[];
  captures: { url: string; ok: boolean; error?: string }[];
  noChange?: boolean;
}

/**
 * Provision the branch: the console commits .opmc/ (brief + DOM snapshots +
 * skeleton/selectors) so `clone + claude` is build-ready with no token. Also
 * the Re-sync action after the brief changes.
 */
export function ProvisionButton({ prototypeKey, provisioned }: { prototypeKey: string; provisioned: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/prototypes/provision", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: prototypeKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Provisioning failed"); return; }
      setResult(data.result);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Provisioning failed");
    } finally { setBusy(false); }
  }

  const done = provisioned || result;
  const okCaps = result?.captures.filter((c) => c.ok).length ?? 0;
  const totalCaps = result?.captures.length ?? 0;

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[12px] font-semibold">Provision branch</span>
          <span className="text-[11px] text-muted-2 ml-2">Commit the brief + page snapshots so <span className="font-mono">clone + claude</span> starts build-ready — no token.</span>
        </div>
        <button onClick={run} disabled={busy} className="h-8 px-3 rounded-lg bg-accent text-accent-fg text-[12px] font-semibold hover:bg-accent-hover disabled:opacity-40 shrink-0">
          {busy ? "Provisioning…" : done ? "Re-sync" : "Provision branch"}
        </button>
      </div>
      {(result || error) && (
        <div className="px-4 py-2.5 text-[12px]">
          {error && <div className="text-danger">{error}</div>}
          {result && !error && (
            <div className="space-y-1">
              {result.noChange ? (
                <div className="text-muted">Already up to date — nothing changed since the last provision.</div>
              ) : (
                <div className="text-ok">
                  ✓ {result.branchCreated ? "Branch created + provisioned" : "Re-synced"}: {result.committedPaths.length} files on <span className="font-mono">{result.branch}</span>
                  {result.commitUrl && <> · <a href={result.commitUrl} target="_blank" rel="noreferrer" className="text-accent hover:text-accent-hover">commit ↗</a></>}
                </div>
              )}
              <div className={totalCaps === 0 ? "text-muted-2" : okCaps === totalCaps ? "text-muted" : "text-warn"}>
                {totalCaps === 0 ? "No target pages to snapshot." : `${okCaps}/${totalCaps} page snapshot${totalCaps === 1 ? "" : "s"} captured`}
                {totalCaps > okCaps && " (check FIRECRAWL_API_KEY / the URL — the brief still committed)"}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
