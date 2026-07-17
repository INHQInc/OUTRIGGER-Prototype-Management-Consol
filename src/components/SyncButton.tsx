"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SyncButton({ siteKey, url }: { siteKey: string; url: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteKey, urls: [url] }),
      });
      const data = await res.json();
      const r = data.results?.[0];
      if (r?.ok) {
        setMsg(`New version · ${r.removedCount} tracking removed`);
        router.refresh();
      } else {
        setMsg(r?.error ?? data.error ?? "Sync failed");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(null), 4000);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-[11px] text-muted-2">{msg}</span>}
      <button
        onClick={sync}
        disabled={busy}
        className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-50 transition-colors flex items-center gap-2"
      >
        {busy && <span className="w-3 h-3 border-2 border-accent-fg/40 border-t-accent-fg rounded-full animate-spin" />}
        {busy ? "Syncing…" : "Sync Content"}
      </button>
    </div>
  );
}
