"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Per-site mode (clone/live). Built-in sites are fixed; user-added sites can switch. */
export function SiteModeControl({ siteKey, initialMode, builtIn }: { siteKey: string; initialMode: "clone" | "live"; builtIn: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"clone" | "live">(initialMode);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(next: "clone" | "live") {
    if (next === mode || busy) return;
    const prev = mode;
    setMode(next); setBusy(true); setSaved(false);
    try {
      const res = await fetch("/api/sites", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteKey, mode: next }) });
      if (res.ok) { setSaved(true); router.refresh(); } else { setMode(prev); }
    } catch {
      setMode(prev);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <span className="text-[13px] font-semibold">Mode</span>
        {saved && <span className="text-[11px] text-ok">saved</span>}
      </div>
      <div className="p-4">
        {builtIn ? (
          <div className="text-[12px] text-muted-2">Built-in site — mode is <span className="text-muted">{mode}</span> (fixed).</div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {([
              ["clone", "Clone", "Snapshot pages; build against frozen copies."],
              ["live", "Live", "Prototypes run on the real site; no cloning."],
            ] as ["clone" | "live", string, string][]).map(([m, t, h]) => (
              <button
                key={m}
                onClick={() => save(m)}
                disabled={busy}
                className={`text-left px-3 py-2.5 rounded-lg border transition-colors disabled:opacity-60 ${mode === m ? "border-accent bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]" : "border-border hover:bg-surface-2/40"}`}
              >
                <div className="text-[13px] font-semibold">{t}</div>
                <div className="text-[11px] text-muted-2 mt-0.5 leading-snug">{h}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
