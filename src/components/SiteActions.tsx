"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** Inline site actions on the All-sites list: open, settings, delete (cascade). */
export function SiteActions({ siteKey }: { siteKey: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function del() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/sites?site=${encodeURIComponent(siteKey)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Delete failed"); setBusy(false); return; }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e)); setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 text-[12px]">
      <Link href={`/sites/${siteKey}`} className="text-accent hover:text-accent-hover font-medium">Open</Link>
      <Link href={`/sites/${siteKey}/settings`} className="text-muted-2 hover:text-foreground">Settings</Link>
      {confirming ? (
        <span className="flex items-center gap-2 ml-auto">
          {error && <span className="text-danger text-[11px]">{error}</span>}
          <span className="text-[11px] text-muted-2">Delete site + all content?</span>
          <button onClick={del} disabled={busy} className="text-danger font-medium hover:opacity-80 disabled:opacity-40">{busy ? "Deleting…" : "Confirm"}</button>
          <button onClick={() => setConfirming(false)} disabled={busy} className="text-muted-2 hover:text-foreground">Cancel</button>
        </span>
      ) : (
        <button onClick={() => setConfirming(true)} className="text-danger/80 hover:text-danger ml-auto">Delete</button>
      )}
    </div>
  );
}
