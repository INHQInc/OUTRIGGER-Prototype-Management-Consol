"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Cascade-aware "delete site" — shows what's attached + requires a typed confirm. */
export function DeleteSite({
  siteKey,
  siteLabel,
  pageCount,
  prototypeCount,
  hasRepo,
}: {
  siteKey: string;
  siteLabel: string;
  pageCount: number;
  prototypeCount: number;
  hasRepo: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function del() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/sites?site=${encodeURIComponent(siteKey)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Delete failed"); setBusy(false); return; }
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e)); setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-danger/40 bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] overflow-hidden">
      <div className="px-4 py-3 border-b border-danger/30 text-[13px] font-semibold text-danger">Danger zone</div>
      <div className="p-4 flex items-center justify-between gap-4">
        <div className="text-[12px] text-muted-2">Permanently delete this site and everything attached to it.</div>
        <button onClick={() => setOpen(true)} className="h-9 px-4 rounded-lg border border-danger/50 text-danger text-[13px] font-medium hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] transition-colors shrink-0">
          Delete site
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-8 overflow-y-auto" onClick={() => !busy && setOpen(false)}>
          <div className="w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl mt-16" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-[14px] font-semibold">Delete {siteLabel}?</h2>
            </div>
            <div className="p-6 space-y-3">
              <div className="text-[12px] text-muted">This permanently removes from the console:</div>
              <ul className="text-[12px] space-y-1">
                <li className="flex items-center gap-2"><span className="text-danger">•</span> {pageCount} captured page{pageCount === 1 ? "" : "s"} (clones + assets)</li>
                <li className="flex items-center gap-2"><span className="text-danger">•</span> {prototypeCount} prototype{prototypeCount === 1 ? "" : "s"}</li>
                {hasRepo && <li className="flex items-center gap-2"><span className="text-danger">•</span> the repository binding</li>}
                <li className="flex items-center gap-2"><span className="text-danger">•</span> the site itself</li>
              </ul>
              <div className="text-[11px] text-muted-2 leading-relaxed rounded-lg bg-surface-2/50 border border-border p-2.5">
                This does <span className="text-muted">not</span> delete branches or deployments already pushed to the feature repo or Vercel — remove those in GitHub / Vercel if needed.
              </div>
              <div>
                <label className="block text-[12px] text-muted mb-1.5">Type <span className="font-mono text-foreground">{siteKey}</span> to confirm</label>
                <input value={confirm} onChange={(e) => setConfirm(e.target.value)} spellCheck={false} className="w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] font-mono text-foreground focus:border-danger focus:outline-none" />
              </div>
              {error && <div className="text-[12px] text-danger">{error}</div>}
            </div>
            <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-2">
              <button onClick={() => !busy && setOpen(false)} className="h-9 px-4 rounded-lg text-[13px] text-muted hover:text-foreground">Cancel</button>
              <button onClick={del} disabled={busy || confirm !== siteKey} className="h-9 px-4 rounded-lg bg-danger text-white text-[13px] font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity">
                {busy ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
