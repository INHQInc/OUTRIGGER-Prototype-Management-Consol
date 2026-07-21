"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export interface SetupStep {
  label: string;
  done: boolean;
  href: string;
  action: string;
  /** Present on the manual loader step: shows a "Mark installed" toggle. */
  manualKey?: "loader";
  disabled?: boolean;
  hint?: string;
}

/**
 * Customer setup, sequenced and completable. Owns the top of the Dashboard
 * until every step is done — capture (stubs) is never blocked, execution
 * prerequisites are stated here instead of being discovered via errors.
 */
export function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const doneCount = steps.filter((s) => s.done).length;

  async function markLoader() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/orgs/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ loaderInstalled: true }) });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] overflow-hidden">
      <div className="px-4 py-3 border-b border-accent/30 flex items-center justify-between">
        <div>
          <span className="text-[13px] font-semibold">Customer setup</span>
          <span className="text-[11px] text-muted-2 ml-2">Finish these once — everything downstream depends on them.</span>
        </div>
        <span className="text-[12px] font-semibold tabular-nums">{doneCount} of {steps.length}</span>
      </div>
      {steps.map((s, i) => (
        <div key={i} className={`flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border/60 last:border-0 ${s.disabled ? "opacity-50" : ""}`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold border shrink-0 ${s.done ? "bg-accent/15 text-accent border-accent/40" : "bg-surface-2 text-muted-2 border-border"}`}>
              {s.done ? "✓" : i + 1}
            </span>
            <div className="min-w-0">
              <span className={`text-[13px] ${s.done ? "text-muted-2 line-through" : ""}`}>{s.label}</span>
              {s.hint && !s.done && <div className="text-[11px] text-muted-2">{s.hint}</div>}
            </div>
          </div>
          {!s.done && !s.disabled && (
            <div className="flex items-center gap-3 shrink-0">
              <Link href={s.href} className="text-[12px] text-accent hover:text-accent-hover font-medium">{s.action} →</Link>
              {s.manualKey === "loader" && (
                <button onClick={markLoader} disabled={busy} className="text-[12px] text-muted-2 hover:text-foreground disabled:opacity-40">Mark installed</button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
