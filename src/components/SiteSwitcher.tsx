"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface SiteOption { id: string; name: string; url: string; status: "setup" | "ready" }

function setActiveSiteCookie(id: string) {
  document.cookie = "opmc_site=" + encodeURIComponent(id) + "; path=/; max-age=31536000; samesite=lax";
}

function host(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

const GLOBE = "M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18";

function SiteTile() {
  return (
    <span className="w-5 h-5 rounded bg-foreground/10 flex items-center justify-center shrink-0">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="9" /><path d={GLOBE} />
      </svg>
    </span>
  );
}

/**
 * The site selector — directly under the customer switcher. Exactly one site
 * is always selected; there is no "All sites" (Bryan, 23 Sep: "there cannot be
 * an all sites in the drop down"). A site whose setup is unfinished carries an
 * orange dot. Selecting a site only changes what the pages list — a
 * prototype's site always comes from its own record.
 */
export function SiteSwitcher({ sites, activeSiteId, canCreate }: { sites: SiteOption[]; activeSiteId: string | null; canCreate: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const current = sites.find((s) => s.id === activeSiteId) ?? null;

  function switchTo(id: string) {
    setActiveSiteCookie(id);
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="relative px-3 pt-1">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={current ? `Site: ${current.name}${current.status === "setup" ? ", setup not finished" : ""}` : "Site: none yet"}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-surface-2/50 transition-colors text-left"
      >
        <SiteTile />
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] text-muted-2 uppercase tracking-wider leading-none">Site</div>
          <div className="text-[14px] font-semibold leading-tight flex items-center gap-1.5 min-w-0">
            <span className="truncate">{current ? current.name : "No site yet"}</span>
            {current?.status === "setup" && <span className="w-2 h-2 rounded-full bg-warn shrink-0" title="Setup not finished" />}
          </div>
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted-2 shrink-0"><path d="M8 9l4-4 4 4M8 15l4 4 4-4" /></svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div role="menu" aria-label="Sites" className="absolute z-50 left-3 right-3 mt-1 rounded-xl border border-border bg-surface shadow-2xl overflow-hidden">
            <div className="px-3 pt-2 pb-1 text-[12.5px] text-muted-2">{sites.length ? "Sites" : "No sites yet"}</div>
            {sites.length > 0 && (
              <div className="max-h-64 overflow-y-auto pb-1">
                {sites.map((s) => (
                  <button key={s.id} role="menuitem" onClick={() => switchTo(s.id)}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-surface-2/60 ${s.id === activeSiteId ? "text-foreground" : "text-muted"}`}>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[15px]">
                        <span className="truncate">{s.name}</span>
                        {s.status === "setup" && <span className="w-2 h-2 rounded-full bg-warn shrink-0" title="Setup not finished" />}
                      </span>
                      {s.url && <span className="block text-[12.5px] text-muted-2 font-mono truncate">{host(s.url)}</span>}
                    </span>
                    {s.id === activeSiteId && <span className="text-accent shrink-0">✓</span>}
                  </button>
                ))}
              </div>
            )}
            {canCreate && (
              <>
                <div className="h-px bg-border" />
                <button role="menuitem" onClick={() => { setOpen(false); router.push("/sites/new"); }}
                  className="w-full text-left px-3 py-2 text-[15px] text-accent hover:bg-surface-2/60 flex items-center gap-2">
                  <span className="w-5 text-center">＋</span> Add a site
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
