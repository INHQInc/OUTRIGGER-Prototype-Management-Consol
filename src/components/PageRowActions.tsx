"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** Per-page actions: open, re-sync (re-capture), delete. */
export function PageRowActions({ siteKey, slug, url }: { siteKey: string; slug: string; url: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "sync" | "del">(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resync() {
    if (busy) return;
    setBusy("sync"); setError(null);
    try {
      const res = await fetch("/api/pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteKey, url }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Re-sync failed"); return; }
      router.refresh();
    } finally { setBusy(null); }
  }

  async function del() {
    if (busy) return;
    setBusy("del"); setError(null);
    try {
      const res = await fetch(`/api/pages?site=${encodeURIComponent(siteKey)}&slug=${encodeURIComponent(slug)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Delete failed"); return; }
      setConfirming(false);
      router.refresh();
    } finally { setBusy(null); }
  }

  return (
    <div className="flex items-center justify-end gap-3">
      {error && <span className="text-[11px] text-danger">{error}</span>}
      <Link href={`/pages/${siteKey}/${slug}`} className="text-accent hover:text-accent-hover font-medium">Open</Link>
      <button onClick={resync} disabled={!!busy} title="Re-capture this page" className="text-muted-2 hover:text-foreground disabled:opacity-40">{busy === "sync" ? "Syncing…" : "Re-sync"}</button>
      {confirming ? (
        <span className="flex items-center gap-1.5">
          <button onClick={del} disabled={!!busy} className="text-danger font-medium hover:opacity-80 disabled:opacity-40">{busy === "del" ? "Deleting…" : "Confirm"}</button>
          <button onClick={() => setConfirming(false)} className="text-muted-2 hover:text-foreground">Cancel</button>
        </span>
      ) : (
        <button onClick={() => setConfirming(true)} className="text-danger/80 hover:text-danger">Delete</button>
      )}
    </div>
  );
}
