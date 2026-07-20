"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Add a website = register a brand's addressable presence (URL + label). No
 * up-front clone/live choice: a site is just a target. Snapshots are captured
 * on demand later (Pages tab), and a prototype picks its own authoring source
 * (live vs clone) per target. See docs/LIFECYCLE-ARCHITECTURE.md.
 */
export function AddSiteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [origin, setOrigin] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() { setOrigin(""); setLabel(""); setBusy(false); setError(null); }
  function close() { if (busy) return; reset(); onClose(); router.refresh(); }

  async function add() {
    const value = origin.trim();
    if (!value || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/sites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ origin: value, label: label.trim() || undefined }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Could not add site"); setBusy(false); return; }
      const key = data.site.siteKey;
      reset();
      onClose();
      router.push(`/sites/${key}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-8 overflow-y-auto" onClick={close}>
      <div className="w-full max-w-lg bg-surface border border-border rounded-2xl shadow-2xl mt-14" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-[14px] font-semibold">Add a website</h2>
            <div className="text-[11px] text-muted-2 mt-0.5">Register the brand&apos;s site — you set up environments and prototypes next.</div>
          </div>
          <button onClick={close} disabled={busy} className="text-muted-2 hover:text-foreground text-lg leading-none disabled:opacity-40">×</button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-muted mb-1.5">Website URL</label>
            <input
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !busy && add()}
              spellCheck={false}
              autoFocus
              placeholder="https://www.example.com"
              className="w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] font-mono text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none"
            />
            <p className="text-[11px] text-muted-2 mt-1">The site&apos;s production URL. It becomes the site&apos;s Production environment — add staging/dev in Settings.</p>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-muted mb-1.5">Label <span className="text-muted-2">(optional)</span></label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !busy && add()}
              placeholder="e.g. Example Resorts"
              className="w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none"
            />
          </div>
          {error && <div className="text-[12px] text-danger">{error}</div>}
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-2">
          <button onClick={close} disabled={busy} className="h-9 px-4 rounded-lg text-[13px] text-muted hover:text-foreground disabled:opacity-40">Cancel</button>
          <button onClick={add} disabled={busy || !origin.trim()} className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {busy ? "Adding…" : "Add site"}
          </button>
        </div>
      </div>
    </div>
  );
}
