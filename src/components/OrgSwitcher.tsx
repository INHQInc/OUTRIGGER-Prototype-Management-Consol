"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface OrgOption { id: string; name: string }

function setActiveOrgCookie(id: string) {
  document.cookie = "opmc_org=" + encodeURIComponent(id) + "; path=/; max-age=31536000; samesite=lax";
}

/** Tenant switcher — top of the sidebar. Switch org, or create one (admins). */
export function OrgSwitcher({ orgs, activeOrgId, canCreate }: { orgs: OrgOption[]; activeOrgId: string | null; canCreate: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = orgs.find((o) => o.id === activeOrgId) ?? null;

  function switchTo(id: string) {
    setActiveOrgCookie(id);
    setOpen(false);
    router.push("/");
    router.refresh();
  }

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/orgs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Could not create org"); return; }
      setActiveOrgCookie(data.org.id);
      setName(""); setCreating(false); setOpen(false);
      router.push("/"); router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative px-3 pt-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-surface-2/50 transition-colors text-left"
      >
        <div className="w-5 h-5 rounded bg-foreground/10 flex items-center justify-center text-[10px] font-bold shrink-0">
          {(current?.name ?? "?").slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] text-muted-2 uppercase tracking-wider leading-none">Customer</div>
          <div className="text-[12px] font-semibold truncate leading-tight">{current ? current.name : orgs.length ? "Select org" : "No orgs yet"}</div>
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted-2 shrink-0"><path d="M8 9l4-4 4 4M8 15l4 4 4-4" /></svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setCreating(false); }} />
          <div className="absolute z-50 left-3 right-3 mt-1 rounded-xl border border-border bg-surface shadow-2xl overflow-hidden">
            <div className="max-h-64 overflow-y-auto py-1">
              {orgs.length === 0 && <div className="px-3 py-2 text-[12px] text-muted-2">No orgs yet.</div>}
              {orgs.map((o) => (
                <button key={o.id} onClick={() => switchTo(o.id)} className={`w-full text-left px-3 py-2 text-[13px] flex items-center gap-2 hover:bg-surface-2/60 ${o.id === activeOrgId ? "text-foreground" : "text-muted"}`}>
                  <span className="w-5 h-5 rounded bg-foreground/10 flex items-center justify-center text-[10px] font-bold shrink-0">{o.name.slice(0, 1).toUpperCase()}</span>
                  <span className="truncate">{o.name}</span>
                  {o.id === activeOrgId && <span className="ml-auto text-accent">✓</span>}
                </button>
              ))}
            </div>
            {current && (
              <>
                <div className="h-px bg-border" />
                <button
                  onClick={() => { setOpen(false); router.push("/settings/customer"); }}
                  className="w-full text-left px-3 py-2 text-[13px] text-muted hover:text-foreground hover:bg-surface-2/60 flex items-center gap-2"
                >
                  <span className="w-5 text-center">⚙</span> Customer settings
                </button>
              </>
            )}
            {canCreate && (
              <>
                <div className="h-px bg-border" />
                {creating ? (
                  <div className="p-2 space-y-2">
                    <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} autoFocus placeholder="Customer / brand name" className="w-full rounded-lg bg-background border border-border px-2.5 py-1.5 text-[12px] focus:border-accent focus:outline-none" />
                    {error && <div className="text-[11px] text-danger px-1">{error}</div>}
                    <div className="flex gap-1.5">
                      <button onClick={() => { setCreating(false); setError(null); }} className="flex-1 h-8 rounded-lg text-[12px] text-muted hover:text-foreground">Cancel</button>
                      <button onClick={create} disabled={busy || !name.trim()} className="flex-1 h-8 rounded-lg bg-accent text-accent-fg text-[12px] font-semibold disabled:opacity-40">{busy ? "…" : "Create"}</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setCreating(true)} className="w-full text-left px-3 py-2 text-[13px] text-accent hover:bg-surface-2/60 flex items-center gap-2">
                    <span className="w-5 text-center">＋</span> New customer / brand
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
