"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step = "details" | "pages" | "done";
interface CaptureResult { url: string; ok: boolean; error?: string }

/** Guided "add a website" wizard: add site → capture homepage → discover pages → capture picks. */
export function AddSiteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("details");
  const [origin, setOrigin] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [siteKey, setSiteKey] = useState("");
  const [siteLabel, setSiteLabel] = useState("");
  const [homeOk, setHomeOk] = useState(false);
  const [links, setLinks] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<CaptureResult[] | null>(null);

  function reset() {
    setStep("details"); setOrigin(""); setLabel(""); setBusy(false); setStatus(""); setError(null);
    setSiteKey(""); setSiteLabel(""); setHomeOk(false); setLinks([]); setSelected(new Set()); setResults(null);
  }
  function close() {
    if (busy) return;
    reset();
    onClose();
    router.refresh();
  }

  async function startScan() {
    const value = origin.trim();
    if (!value) return;
    setBusy(true); setError(null);
    try {
      setStatus("Adding site…");
      const sRes = await fetch("/api/sites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ origin: value, label: label.trim() || undefined }) });
      const sData = await sRes.json();
      if (!sRes.ok) { setError(sData.error ?? "Could not add site"); setBusy(false); setStatus(""); return; }
      setSiteKey(sData.site.siteKey);
      setSiteLabel(sData.site.label);

      setStatus("Capturing homepage… (this can take a minute)");
      const cRes = await fetch("/api/capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteKey: sData.site.siteKey, urls: [sData.site.origin] }) });
      const cData = await cRes.json();
      const home = cData.results?.[0];
      setHomeOk(Boolean(home?.ok));

      if (home?.ok) {
        setStatus("Scanning homepage for pages…");
        const dRes = await fetch("/api/discover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteKey: sData.site.siteKey, slug: home.slug }) });
        const dData = await dRes.json();
        setLinks(dData.links ?? []);
      }
      setStep("pages");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false); setStatus("");
    }
  }

  function toggleLink(u: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(u)) next.delete(u); else next.add(u);
      return next;
    });
  }

  async function captureSelected() {
    const urls = [...selected];
    if (!urls.length) { setStep("done"); return; }
    setBusy(true); setStatus(`Capturing ${urls.length} page${urls.length === 1 ? "" : "s"}…`); setError(null);
    try {
      const res = await fetch("/api/capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteKey, urls }) });
      const data = await res.json();
      setResults(data.results ?? []);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false); setStatus("");
    }
  }

  if (!open) return null;

  const stepNum = step === "details" ? 1 : step === "pages" ? 2 : 3;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-8 overflow-y-auto" onClick={close}>
      <div className="w-full max-w-lg bg-surface border border-border rounded-2xl shadow-2xl mt-14" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-[14px] font-semibold">Add a website</h2>
            <div className="text-[11px] text-muted-2 mt-0.5">Step {stepNum} of 3 · {step === "details" ? "details" : step === "pages" ? "pick pages" : "done"}</div>
          </div>
          <button onClick={close} disabled={busy} className="text-muted-2 hover:text-foreground text-lg leading-none disabled:opacity-40">×</button>
        </div>

        {/* STEP 1 — details */}
        {step === "details" && (
          <>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-muted mb-1.5">Website URL</label>
                <input
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !busy && startScan()}
                  spellCheck={false}
                  autoFocus
                  placeholder="https://www.example.com"
                  className="w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] font-mono text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none"
                />
                <p className="text-[11px] text-muted-2 mt-1">Enter the homepage. We add the site, clone the homepage, and scan it for pages you can capture.</p>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-muted mb-1.5">Label <span className="text-muted-2">(optional)</span></label>
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !busy && startScan()}
                  placeholder="e.g. Example Resorts"
                  className="w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none"
                />
              </div>
              {error && <div className="text-[12px] text-danger">{error}</div>}
            </div>
            <div className="px-6 py-4 border-t border-border flex items-center justify-between">
              <span className="text-[11px] text-muted-2">{status}</span>
              <div className="flex gap-2">
                <button onClick={close} disabled={busy} className="h-9 px-4 rounded-lg text-[13px] text-muted hover:text-foreground disabled:opacity-40">Cancel</button>
                <button onClick={startScan} disabled={busy || !origin.trim()} className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  {busy ? "Working…" : "Add site & scan"}
                </button>
              </div>
            </div>
          </>
        )}

        {/* STEP 2 — pick pages */}
        {step === "pages" && (
          <>
            <div className="p-6 space-y-3">
              <div className="text-[12px] text-muted">
                <span className="text-foreground font-medium">{siteLabel}</span> added.{" "}
                {homeOk ? "Homepage captured." : "Homepage couldn't be captured — you can add pages manually later."}
              </div>
              {links.length > 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-medium text-muted">Pages found on the homepage ({links.length})</span>
                    <div className="flex gap-3 text-[11px]">
                      <button onClick={() => setSelected(new Set(links))} className="text-accent hover:text-accent-hover">Select all</button>
                      <button onClick={() => setSelected(new Set())} className="text-muted-2 hover:text-foreground">Clear</button>
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                    {links.map((u) => {
                      const path = u.replace(/^https?:\/\/[^/]+/, "") || "/";
                      const on = selected.has(u);
                      return (
                        <label key={u} className="flex items-center gap-2.5 px-3 py-2 text-[12px] cursor-pointer hover:bg-surface-2/40">
                          <input type="checkbox" checked={on} onChange={() => toggleLink(u)} className="accent-[var(--accent)]" />
                          <span className="font-mono text-muted truncate" title={u}>{path}</span>
                        </label>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="text-[12px] text-muted-2">No sub-pages detected on the homepage. You can add pages from the site later.</div>
              )}
              {error && <div className="text-[12px] text-danger">{error}</div>}
            </div>
            <div className="px-6 py-4 border-t border-border flex items-center justify-between">
              <span className="text-[11px] text-muted-2">{status || `${selected.size} selected`}</span>
              <div className="flex gap-2">
                <button onClick={() => setStep("done")} disabled={busy} className="h-9 px-4 rounded-lg text-[13px] text-muted hover:text-foreground disabled:opacity-40">Skip</button>
                <button onClick={captureSelected} disabled={busy} className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  {busy ? "Capturing…" : selected.size ? `Capture ${selected.size}` : "Finish"}
                </button>
              </div>
            </div>
          </>
        )}

        {/* STEP 3 — done */}
        {step === "done" && (
          <>
            <div className="p-6 space-y-3">
              <div className="text-[13px] font-medium">✔ {siteLabel} is ready.</div>
              <div className="text-[12px] text-muted-2">
                {homeOk ? "Homepage captured" : "Homepage not captured"}
                {results ? ` · ${results.filter((r) => r.ok).length}/${results.length} selected pages captured` : ""}.
              </div>
              {results && results.some((r) => !r.ok) && (
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {results.filter((r) => !r.ok).map((r, i) => (
                    <div key={i} className="text-[11px] text-danger truncate">✘ {r.url} — {r.error}</div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-2">
              <button onClick={close} className="h-9 px-4 rounded-lg text-[13px] text-muted hover:text-foreground">Close</button>
              <button
                onClick={() => { const k = siteKey; reset(); onClose(); router.push(`/sites/${k}`); }}
                className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover transition-colors"
              >
                Go to site →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
