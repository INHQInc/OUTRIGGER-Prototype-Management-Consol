"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PROTOTYPE_STAGES, STAGE_LABEL, normalizeStage, type PrototypeStage } from "@/lib/prototypes/types";

const STEPS: { label: string; sub: string }[] = [
  { label: "Build", sub: "code in the repo" },
  { label: "Review", sub: "inject on a lower env" },
  { label: "Experiment", sub: "Optimizely" },
  { label: "Ship", sub: "handoff" },
];
// stage → which pipeline step it sits at
const STEP_OF: Record<PrototypeStage, number> = { draft: 0, review: 1, live: 2, shipped: 3, archived: 3 };
const HINT: Record<PrototypeStage, string> = {
  draft: "Build the variation in the repo, then cut a version from it.",
  review: "Share the preview link for QA, then promote to production when approved.",
  live: "Running as an experiment — start it in Optimizely, or hand off the winner.",
  shipped: "Shipped. Nothing more to do here.",
  archived: "Archived.",
};

/** Guided-but-skippable pipeline indicator + manual stage control. */
export function PipelineHeader({ prototypeKey, initialStage }: { prototypeKey: string; initialStage: PrototypeStage }) {
  const router = useRouter();
  const [stage, setStage] = useState<PrototypeStage>(initialStage);
  const [busy, setBusy] = useState(false);
  const current = STEP_OF[stage];
  const archived = stage === "archived";

  async function setStageTo(next: PrototypeStage) {
    if (next === stage || busy) return;
    setBusy(true);
    const prev = stage;
    setStage(next);
    try {
      const res = await fetch("/api/prototypes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: prototypeKey, status: next }) });
      if (!res.ok) { setStage(prev); return; }
      router.refresh();
    } catch { setStage(prev); } finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center">
          {STEPS.map((step, i) => {
            const state = archived ? "done" : i < current ? "done" : i === current ? "current" : "upcoming";
            return (
              <div key={step.label} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center text-center">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold border ${
                    state === "current" ? "bg-accent text-accent-fg border-accent"
                    : state === "done" ? "bg-accent/15 text-accent border-accent/40"
                    : "bg-surface-2 text-muted-2 border-border"
                  }`}>{state === "done" ? "✓" : i + 1}</div>
                  <div className={`text-[11px] font-semibold mt-1 ${state === "upcoming" ? "text-muted-2" : "text-foreground"}`}>{step.label}</div>
                  <div className="text-[10px] text-muted-2 leading-tight">{step.sub}</div>
                </div>
                {i < STEPS.length - 1 && <div className={`h-px flex-1 mx-2 -mt-6 ${i < current && !archived ? "bg-accent/40" : "bg-border"}`} />}
              </div>
            );
          })}
        </div>
      </div>
      <div className="px-4 py-2.5 border-t border-border flex items-center justify-between gap-3 bg-surface-2/20">
        <span className="text-[11px] text-muted-2">{HINT[stage]}</span>
        <label className="flex items-center gap-1.5 text-[11px] text-muted-2 shrink-0">
          Stage
          <select value={stage} onChange={(e) => setStageTo(normalizeStage(e.target.value))} disabled={busy} className="rounded-lg bg-background border border-border px-2 py-1 text-[12px] text-foreground focus:border-accent focus:outline-none">
            {PROTOTYPE_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}
