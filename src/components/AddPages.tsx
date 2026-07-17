"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SITE_OPTIONS = [
  { key: "outrigger", label: "Outrigger.com" },
  { key: "hvc", label: "Hawaii Vacation Condos" },
];

interface CaptureResult {
  url: string;
  ok: boolean;
  slug?: string;
  version?: string;
  assetCount?: number;
  removedCount?: number;
  error?: string;
}

export function AddPages() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [siteKey, setSiteKey] = useState("outrigger");
  const [urlText, setUrlText] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<CaptureResult[] | null>(null);

  const urls = urlText
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("http"));

  async function run() {
    if (!urls.length) return;
    setBusy(true);
    setResults(null);
    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteKey, urls }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResults([{ url: "(request)", ok: false, error: data.error ?? "Capture failed" }]);
      } else {
        setResults(data.results);
        router.refresh();
      }
    } catch (e) {
      setResults([{ url: "(request)", ok: false, error: e instanceof Error ? e.message : String(e) }]);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover transition-colors"
      >
        + Add Pages
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-8 overflow-y-auto" onClick={() => !busy && setOpen(false)}>
      <div className="w-full max-w-xl bg-surface border border-border rounded-2xl shadow-2xl mt-12" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-[14px] font-semibold">Add Pages</h2>
          <button onClick={() => !busy && setOpen(false)} className="text-muted-2 hover:text-foreground text-lg leading-none">×</button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-muted mb-1.5">Site</label>
            <div className="flex gap-2">
              {SITE_OPTIONS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSiteKey(s.key)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${
                    siteKey === s.key ? "border-accent text-accent bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]" : "border-border text-muted hover:text-foreground"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-muted mb-1.5">
              URLs <span className="text-muted-2">(one per line)</span>
            </label>
            <textarea
              value={urlText}
              onChange={(e) => setUrlText(e.target.value)}
              rows={5}
              spellCheck={false}
              placeholder="https://www.outrigger.com/hawaii/oahu/outrigger-waikiki-beach-resort"
              className="w-full rounded-lg bg-background border border-border px-3 py-2 text-[12px] font-mono text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none resize-none"
            />
            <p className="text-[11px] text-muted-2 mt-1">{urls.length} valid URL{urls.length === 1 ? "" : "s"} · each is scraped, sanitized, and stored as an immutable version.</p>
          </div>

          {results && (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {results.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px]">
                  <span className={r.ok ? "text-ok" : "text-danger"}>{r.ok ? "✔" : "✘"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-muted">{r.url}</div>
                    {r.ok ? (
                      <div className="text-muted-2">{r.assetCount} assets · {r.removedCount} tracking removed</div>
                    ) : (
                      <div className="text-danger">{r.error}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <span className="text-[11px] text-muted-2">{busy ? "Capturing… this can take a minute per page." : ""}</span>
          <div className="flex gap-2">
            <button onClick={() => !busy && setOpen(false)} className="h-9 px-4 rounded-lg text-[13px] text-muted hover:text-foreground">Close</button>
            <button
              onClick={run}
              disabled={busy || !urls.length}
              className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {busy ? "Capturing…" : `Capture ${urls.length || ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
