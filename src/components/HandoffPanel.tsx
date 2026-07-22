"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface HandoffRecord { prLink?: string; at: string; by?: string }

/**
 * Handoff to source — integrate the winning build into the site's production
 * code. "Local compute, hosted record": Claude computes the integration diff
 * locally against the read-only source clone; the console stores the record.
 */
export function HandoffPanel({ prototypeKey, repoFullName, latestVersion, handoff }: {
  prototypeKey: string;
  repoFullName?: string;
  latestVersion?: number;
  handoff: HandoffRecord | null;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [pr, setPr] = useState(handoff?.prLink ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dir = repoFullName?.split("/")[1] ?? prototypeKey;

  const cmds =
`# 1. refresh your read-only source clone
cd <your source clone> && git pull

# 2. from the prototype repo, have Claude generate the native integration
cd ${dir}
claude "Integrate the winning build v${latestVersion ?? "<n>"} of ${prototypeKey} into the production source at <source clone path>: port dist/variation.js into native components, produce a reviewable PR/patch, and do NOT push to the source."`;

  async function record(markOnly = false) {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/prototypes/handoff", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: prototypeKey, prLink: markOnly ? "" : pr.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error ?? "Failed to record handoff"); return; }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to record handoff");
    } finally { setBusy(false); }
  }
  async function copy() { try { await navigator.clipboard.writeText(cmds); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* */ } }

  if (!latestVersion) {
    return (
      <div className="rounded-xl border border-border bg-surface px-4 py-3 text-[12px] text-muted-2">
        <span className="font-semibold text-muted">Handoff to source</span> — cut a version first; you hand off the frozen winner.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <div>
          <span className="text-[12px] font-semibold">Handoff to source</span>
          <span className="text-[11px] text-muted-2 ml-2">Integrate the winner into the site&apos;s production code. Claude computes the diff locally; the console keeps the record.</span>
        </div>
        {handoff && <span className="text-[11px] text-ok">✓ Shipped</span>}
      </div>
      <div className="p-4 space-y-3">
        {handoff ? (
          <div className="text-[12px] text-muted">
            Handed off {handoff.by ? `by ${handoff.by}` : ""} · {new Date(handoff.at).toLocaleDateString()}
            {handoff.prLink && <> · <a href={handoff.prLink} target="_blank" rel="noreferrer" className="text-accent hover:text-accent-hover break-all">{handoff.prLink}</a></>}
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-border bg-surface-2/20 overflow-hidden">
              <div className="px-3 py-2 flex items-center justify-between border-b border-border/60">
                <span className="text-[11px] text-muted">Run this to generate the integration</span>
                <button onClick={copy} className="text-[11px] text-accent hover:text-accent-hover font-medium">{copied ? "Copied" : "Copy"}</button>
              </div>
              <pre className="px-3 py-2.5 text-[11px] font-mono text-muted leading-relaxed overflow-x-auto">{cmds}</pre>
            </div>
            <div className="flex items-center gap-2">
              <input value={pr} onChange={(e) => setPr(e.target.value)} placeholder="Paste the PR / patch link (optional)" className="flex-1 rounded-lg bg-background border border-border px-3 py-2 text-[12px] font-mono text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none" />
              <button onClick={() => record()} disabled={busy} className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40 shrink-0">{busy ? "Saving…" : "Mark shipped"}</button>
            </div>
            <div className="text-[11px] text-muted-2">The Outrigger source (Azure DevOps) is read-only from here — the PR is opened by a human against their repo. Marking shipped records it + sets the stage to Shipped.</div>
          </>
        )}
        {err && <div className="text-[12px] text-danger">{err}</div>}
      </div>
    </div>
  );
}
