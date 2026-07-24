"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PROTOTYPE_STAGES, STAGE_LABEL, normalizeStage, type PrototypeStage } from "@/lib/prototypes/types";

/** Compact lifecycle-stage control (replaces the old stepper). */
export function StageSelect({ prototypeKey, initialStage }: { prototypeKey: string; initialStage: PrototypeStage }) {
  const router = useRouter();
  const [stage, setStage] = useState<PrototypeStage>(initialStage);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  // Resync when the server advances the stage (e.g. a promotion auto-nudges it).
  useEffect(() => { setStage(initialStage); }, [initialStage]);

  async function set(next: PrototypeStage) {
    if (next === stage || busy) return;
    const prev = stage;
    setStage(next); setBusy(true); setErr(false);
    try {
      const res = await fetch("/api/prototypes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: prototypeKey, status: next }) });
      if (!res.ok) { setStage(prev); setErr(true); return; }
      router.refresh();
    } catch { setStage(prev); setErr(true); } finally { setBusy(false); }
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={stage}
        onChange={(e) => set(normalizeStage(e.target.value))}
        disabled={busy}
        className={`rounded-lg bg-surface-2 border px-2 py-1 text-[14px] font-medium text-foreground focus:outline-none ${err ? "border-danger focus:border-danger" : "border-border focus:border-accent"}`}
      >
        {PROTOTYPE_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
      </select>
      {err && <span className="text-[13px] text-danger">couldn&apos;t update</span>}
    </div>
  );
}
