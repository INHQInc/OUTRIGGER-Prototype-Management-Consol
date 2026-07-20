"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AddSiteModal } from "./AddSite";

export interface SiteNavNode {
  key: string;
  label: string;
  origin: string;
  pages: { slug: string; path: string }[];
}

function host(origin: string): string {
  try { return new URL(origin).host; } catch { return origin; }
}

/** Workspace switcher: current site (or All sites) → dropdown to switch / add. */
export function SiteSwitcher({ sites, currentSiteKey }: { sites: SiteNavNode[]; currentSiteKey: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [q, setQ] = useState("");

  const current = currentSiteKey ? sites.find((s) => s.key === currentSiteKey) : null;
  const filtered = q
    ? sites.filter((s) => s.label.toLowerCase().includes(q.toLowerCase()) || s.key.includes(q.toLowerCase()))
    : sites;

  function go(href: string) {
    setOpen(false);
    setQ("");
    router.push(href);
  }

  return (
    <div className="relative px-3 pt-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border border-border bg-surface-2/40 hover:bg-surface-2 transition-colors text-left"
      >
        <div className="w-6 h-6 rounded bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-accent flex items-center justify-center text-[11px] font-bold shrink-0">
          {(current?.label ?? "A").slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold truncate">{current ? current.label : "All sites"}</div>
          <div className="text-[10px] text-muted-2 truncate">
            {current ? host(current.origin) : `${sites.length} site${sites.length === 1 ? "" : "s"}`}
          </div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-2 shrink-0">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 left-3 right-3 mt-1 rounded-xl border border-border bg-surface shadow-2xl overflow-hidden">
            {sites.length > 6 && (
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                autoFocus
                placeholder="Search sites…"
                className="w-full px-3 py-2 text-[12px] bg-background border-b border-border text-foreground placeholder:text-muted-2 focus:outline-none"
              />
            )}
            <div className="max-h-72 overflow-y-auto py-1">
              <button
                onClick={() => go("/")}
                className={`w-full text-left px-3 py-2 text-[13px] flex items-center gap-2 hover:bg-surface-2/60 ${!currentSiteKey ? "text-foreground" : "text-muted"}`}
              >
                <span className="w-6 h-6 flex items-center justify-center text-muted-2">▦</span>
                All sites
                {!currentSiteKey && <span className="ml-auto text-accent">✓</span>}
              </button>
              <div className="h-px bg-border my-1" />
              {filtered.map((s) => (
                <button
                  key={s.key}
                  onClick={() => go(`/sites/${s.key}`)}
                  className={`w-full text-left px-3 py-2 text-[13px] flex items-center gap-2 hover:bg-surface-2/60 ${s.key === currentSiteKey ? "text-foreground" : "text-muted"}`}
                >
                  <span className="w-6 h-6 rounded bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-accent flex items-center justify-center text-[10px] font-bold shrink-0">
                    {s.label.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="truncate">{s.label}</span>
                  {s.key === currentSiteKey && <span className="ml-auto text-accent">✓</span>}
                </button>
              ))}
              {filtered.length === 0 && <div className="px-3 py-2 text-[12px] text-muted-2">No sites match “{q}”.</div>}
            </div>
            <div className="h-px bg-border" />
            <button
              onClick={() => { setOpen(false); setAddOpen(true); }}
              className="w-full text-left px-3 py-2 text-[13px] text-accent hover:bg-surface-2/60 flex items-center gap-2"
            >
              <span className="w-6 h-6 flex items-center justify-center">＋</span>
              Add a website
            </button>
          </div>
        </>
      )}

      <AddSiteModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
