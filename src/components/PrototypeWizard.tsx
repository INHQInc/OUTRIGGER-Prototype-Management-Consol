"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Target = { url: string; source: "clone" | "live" };

const inp = "w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none";
const lbl = "block text-[12px] font-medium text-muted mb-1";
const hint = "text-[11px] text-muted-2 mt-1";

function isUrl(s: string): boolean {
  try { new URL(s.trim()); return true; } catch { return false; }
}

/**
 * New-prototype form — SCAFFOLDING ONLY. Name + the page(s) it runs on; the
 * repo + branch are assigned for you. The brief is deliberately NOT here — it
 * takes time and shouldn't block getting a workspace set up. You write it
 * (with Claude) on the workspace right after.
 */
export function PrototypeWizard({ envUrls }: { envUrls: string[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [targets, setTargets] = useState<Target[]>([{ url: "", source: "live" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanTargets = targets.filter((t) => t.url.trim()).map((t) => ({ url: t.url.trim(), source: t.source }));
  const valid = name.trim().length > 0 && cleanTargets.length > 0 && targets.every((t) => !t.url.trim() || isUrl(t.url));

  function setTarget(i: number, patch: Partial<Target>) {
    setTargets((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  }

  async function create() {
    if (busy || !valid) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/prototypes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), targets: cleanTargets }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Could not create prototype"); setBusy(false); return; }
      // Land on the workspace — where you write the brief and prepare the build.
      router.push(`/prototypes/${data.prototype.key}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e)); setBusy(false);
    }
  }

  return (
    <div className="max-w-lg">
      <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
        <div>
          <label className={lbl}>Name</label>
          <input className={inp} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !busy && valid && create()} autoFocus placeholder="e.g. a short name for this experiment" />
          <div className={hint}>Your prototype&apos;s label. A code branch is set up for it automatically.</div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={`${lbl} mb-0`}>Which page(s) does it run on?</label>
            <button type="button" onClick={() => setTargets((ts) => [...ts, { url: "", source: "live" }])} className="text-[12px] text-accent hover:text-accent-hover font-medium">+ Add page</button>
          </div>
          {targets.map((t, i) => (
            <div key={i} className="flex items-center gap-2 mb-2">
              <input list={`w-envs-${i}`} className={`${inp} font-mono`} value={t.url} onChange={(e) => setTarget(i, { url: e.target.value })} placeholder="https://prep.example.com/path/to/page" spellCheck={false} />
              <datalist id={`w-envs-${i}`}>{envUrls.map((u) => <option key={u} value={u} />)}</datalist>
              {targets.length > 1 && <button type="button" onClick={() => setTargets((ts) => ts.filter((_, j) => j !== i))} className="text-[13px] text-danger hover:opacity-80 px-1">✕</button>}
            </div>
          ))}
          <div className={hint}>The page(s) it changes and gets reviewed on. The console snapshots them so Claude can work offline.</div>
        </div>

        {error && <div className="text-[12px] text-danger">{error}</div>}
      </div>

      <div className="flex items-center justify-between mt-4">
        <button onClick={() => router.push("/prototypes")} disabled={busy} className="h-9 px-4 rounded-lg text-[13px] text-muted hover:text-foreground disabled:opacity-40">Cancel</button>
        <button onClick={create} disabled={busy || !valid} className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          {busy ? "Creating…" : "Create & set up"}
        </button>
      </div>
      <p className="text-[11px] text-muted-2 mt-3">Next, on the workspace: write the brief (with Claude), prepare the build, and get your run command. No rush — the brief can grow as you go.</p>
    </div>
  );
}
