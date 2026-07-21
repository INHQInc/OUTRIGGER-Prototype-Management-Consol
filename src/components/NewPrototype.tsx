"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Target = { url: string; source: "clone" | "live" };

const inp = "w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none";
const lbl = "block text-[12px] font-medium text-muted mb-1.5";

/**
 * Minimal prototype stub: Site + Name (+ optional target pages). Everything
 * else — repo (auto-attached from the brand default), brief, hypothesis,
 * metrics — is filled in the workspace as the work progresses.
 */
export function NewPrototype({ siteKey, sites, defaultSite, defaultSource = "live" }: { siteKey?: string; sites?: { key: string; label: string }[]; defaultSite?: string; defaultSource?: "clone" | "live" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [siteSel, setSiteSel] = useState(siteKey ?? defaultSite ?? sites?.[0]?.key ?? "");
  const [name, setName] = useState("");
  const [targets, setTargets] = useState<Target[]>([{ url: "", source: defaultSource }]);
  const [sitePages, setSitePages] = useState<{ slug: string; url: string }[]>([]);

  // Captured pages of the selected site, as target suggestions.
  const activeSite = siteKey ?? siteSel;
  useEffect(() => {
    if (!open || !activeSite) { setSitePages([]); return; }
    let live = true;
    fetch(`/api/pages?site=${encodeURIComponent(activeSite)}`)
      .then((r) => (r.ok ? r.json() : { pages: [] }))
      .then((d) => { if (live) setSitePages(d.pages ?? []); })
      .catch(() => { if (live) setSitePages([]); });
    return () => { live = false; };
  }, [open, activeSite]);

  function setTarget(i: number, patch: Partial<Target>) {
    setTargets((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  }
  function addTarget() { setTargets((ts) => [...ts, { url: "", source: defaultSource }]); }
  function removeTarget(i: number) { setTargets((ts) => ts.filter((_, j) => j !== i)); }

  function reset() { setName(""); setTargets([{ url: "", source: defaultSource }]); setError(null); setBusy(false); }
  function close() { if (busy) return; reset(); setOpen(false); }

  async function create() {
    const targetSite = siteKey ?? siteSel;
    if (!targetSite) { setError("Choose a site for this prototype"); return; }
    if (!name.trim()) { setError("Give it a name"); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/prototypes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteKey: targetSite,
          name,
          targets: targets.filter((t) => t.url.trim()).map((t) => ({ url: t.url.trim(), source: t.source })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Could not create prototype"); setBusy(false); return; }
      reset(); setOpen(false);
      router.push(`/prototypes/${data.prototype.key}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e)); setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover transition-colors">
        + New prototype
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-8 overflow-y-auto" onClick={close}>
      <div className="w-full max-w-lg bg-surface border border-border rounded-2xl shadow-2xl mt-14" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-[14px] font-semibold">New prototype</h2>
          <button onClick={close} disabled={busy} className="text-muted-2 hover:text-foreground text-lg leading-none disabled:opacity-40">×</button>
        </div>

        <div className="p-6 space-y-4">
          {!siteKey && sites && sites.length > 1 && (
            <div>
              <label className={lbl}>Site</label>
              <select className={inp} value={siteSel} onChange={(e) => setSiteSel(e.target.value)}>
                {sites.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className={lbl}>Name</label>
            <input className={inp} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !busy && create()} autoFocus placeholder="e.g. Favorites bar on room cards" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className={`${lbl} mb-0`}>Target page(s) <span className="text-muted-2">(optional)</span></label>
              <button type="button" onClick={addTarget} className="text-[12px] text-accent hover:text-accent-hover font-medium">+ Add page</button>
            </div>
            {targets.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  list={`np-pages-${i}`}
                  className={`${inp} font-mono`}
                  value={t.url}
                  onChange={(e) => setTarget(i, { url: e.target.value })}
                  placeholder="https://…/rooms  or  /rooms/*"
                  spellCheck={false}
                />
                <datalist id={`np-pages-${i}`}>
                  {sitePages.map((p) => <option key={p.slug} value={p.url} />)}
                </datalist>
                <button
                  type="button"
                  onClick={() => setTarget(i, { source: t.source === "live" ? "clone" : "live" })}
                  title="Toggle live / clone"
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border shrink-0 transition-colors ${t.source === "live" ? "border-accent text-accent" : "border-border text-muted"}`}
                >
                  {t.source}
                </button>
                {targets.length > 1 && (
                  <button type="button" onClick={() => removeTarget(i)} title="Remove" className="text-[13px] text-danger hover:opacity-80 px-1">✕</button>
                )}
              </div>
            ))}
          </div>

          {error && <div className="text-[12px] text-danger">{error}</div>}
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <span className="text-[11px] text-muted-2">Repo, hypothesis, and metrics attach in the workspace.</span>
          <div className="flex gap-2">
            <button onClick={close} disabled={busy} className="h-9 px-4 rounded-lg text-[13px] text-muted hover:text-foreground disabled:opacity-40">Cancel</button>
            <button onClick={create} disabled={busy || !name.trim()} className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {busy ? "Creating…" : "Create prototype"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
