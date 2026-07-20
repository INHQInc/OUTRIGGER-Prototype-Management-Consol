"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Controlled "add a website" modal → POST /api/sites. */
export function AddSiteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [origin, setOrigin] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const value = origin.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: value, label: label.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not add site");
      } else {
        setOrigin("");
        setLabel("");
        router.refresh();
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-8 overflow-y-auto" onClick={() => !busy && onClose()}>
      <div className="w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl mt-16" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-[14px] font-semibold">Add a website</h2>
          <button onClick={() => !busy && onClose()} className="text-muted-2 hover:text-foreground text-lg leading-none">×</button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-muted mb-1.5">Website URL</label>
            <input
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
              spellCheck={false}
              autoFocus
              placeholder="https://www.example.com"
              className="w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] font-mono text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none"
            />
            <p className="text-[11px] text-muted-2 mt-1">Enter the site&apos;s homepage. We derive a key and asset host from it; then add pages to clone.</p>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-muted mb-1.5">
              Label <span className="text-muted-2">(optional)</span>
            </label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder="e.g. Example Resorts"
              className="w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none"
            />
          </div>

          {error && <div className="text-[12px] text-danger">{error}</div>}
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-2">
          <button onClick={() => !busy && onClose()} className="h-9 px-4 rounded-lg text-[13px] text-muted hover:text-foreground">Cancel</button>
          <button
            onClick={run}
            disabled={busy || !origin.trim()}
            className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? "Adding…" : "Add site"}
          </button>
        </div>
      </div>
    </div>
  );
}
