"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Delete a prototype (cascades overlay + versions + promotions) with confirm. */
export function DeletePrototype({ prototypeKey, name }: { prototypeKey: string; name: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function del() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/prototypes?key=${encodeURIComponent(prototypeKey)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Delete failed"); setBusy(false); return; }
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e)); setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-danger/40 bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] p-4 flex items-center justify-between gap-4">
      <div className="text-[12px] text-muted-2">Delete <span className="font-medium text-foreground">{name}</span> and its overlay, versions, and promotions.</div>
      {confirming ? (
        <div className="flex items-center gap-2 shrink-0">
          {error && <span className="text-[11px] text-danger">{error}</span>}
          <button onClick={del} disabled={busy} className="h-9 px-4 rounded-lg bg-danger text-white text-[12px] font-semibold hover:opacity-90 disabled:opacity-40">{busy ? "Deleting…" : "Confirm delete"}</button>
          <button onClick={() => setConfirming(false)} disabled={busy} className="h-9 px-3 rounded-lg text-[12px] text-muted hover:text-foreground">Cancel</button>
        </div>
      ) : (
        <button onClick={() => setConfirming(true)} className="h-9 px-4 rounded-lg border border-danger/50 text-danger text-[12px] font-medium hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] shrink-0">Delete prototype</button>
      )}
    </div>
  );
}
