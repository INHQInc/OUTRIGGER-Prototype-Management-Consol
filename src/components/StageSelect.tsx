"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PROTOTYPE_STAGES, STAGE_LABEL, normalizeStage, type PrototypeStage } from "@/lib/prototypes/types";

/** Compact lifecycle-stage control (replaces the old stepper). */
export function StageSelect({ prototypeKey, initialStage }: { prototypeKey: string; initialStage: PrototypeStage }) {
  const router = useRouter();
  const [stage, setStage] = useState<PrototypeStage>(initialStage);
  const [busy, setBusy] = useState(false);

  async function set(next: PrototypeStage) {
    if (next === stage || busy) return;
    const prev = stage;
    setStage(next); setBusy(true);
    try {
      const res = await fetch("/api/prototypes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: prototypeKey, status: next }) });
      if (!res.ok) { setStage(prev); return; }
      router.refresh();
    } catch { setStage(prev); } finally { setBusy(false); }
  }

  return (
    <select
      value={stage}
      onChange={(e) => set(normalizeStage(e.target.value))}
      disabled={busy}
      className="rounded-lg bg-surface-2 border border-border px-2 py-1 text-[12px] font-medium text-foreground focus:border-accent focus:outline-none"
    >
      {PROTOTYPE_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
    </select>
  );
}
