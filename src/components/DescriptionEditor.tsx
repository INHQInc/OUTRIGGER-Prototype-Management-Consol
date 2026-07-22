"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PrototypeBrief } from "@/lib/prototypes/types";

/** Compact description (the brief seed) — you + Claude both edit it. Full
 *  hypothesis/metrics live in Settings. */
export function DescriptionEditor({ prototypeKey, brief }: { prototypeKey: string; brief: PrototypeBrief }) {
  const router = useRouter();
  const [change, setChange] = useState(brief.change);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = change !== brief.change;

  async function save() {
    if (busy || !dirty) return;
    setBusy(true); setSaved(false);
    try {
      const res = await fetch("/api/prototypes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: prototypeKey, brief: { ...brief, change } }) });
      if (res.ok) { setSaved(true); router.refresh(); }
    } finally { setBusy(false); }
  }

  return (
    <div className="flex items-start gap-2">
      <textarea
        rows={2}
        value={change}
        onChange={(e) => { setChange(e.target.value); setSaved(false); }}
        placeholder="What are you building / testing? (Claude reads this.)"
        className="flex-1 rounded-lg bg-background border border-border px-3 py-2 text-[13px] text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none resize-none"
      />
      <button onClick={save} disabled={busy || !dirty} className="h-8 px-3 rounded-lg bg-accent text-accent-fg text-[12px] font-semibold hover:bg-accent-hover disabled:opacity-40 shrink-0">{busy ? "…" : saved ? "Saved" : "Save"}</button>
    </div>
  );
}
