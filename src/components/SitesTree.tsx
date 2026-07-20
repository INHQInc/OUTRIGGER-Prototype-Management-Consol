"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AddPagesModal } from "./AddPages";
import { AddSiteModal } from "./AddSite";

export interface SiteNavNode {
  key: string;
  label: string;
  origin: string;
  pages: { slug: string; path: string }[];
}

/** Collapsible Sites → Pages tree for the sidebar, with inline add affordances. */
export function SitesTree({ sites }: { sites: SiteNavNode[] }) {
  const pathname = usePathname();
  const [openKeys, setOpenKeys] = useState<Set<string>>(
    () => new Set(sites.filter((s) => s.pages.length).map((s) => s.key))
  );
  const [addSiteOpen, setAddSiteOpen] = useState(false);
  const [addPageFor, setAddPageFor] = useState<string | null>(null);

  const siteOptions = sites.map((s) => ({ key: s.key, label: s.label }));

  function toggle(key: string) {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="pt-3">
      <div className="flex items-center justify-between px-3 mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-2">Sites</span>
        <button
          onClick={() => setAddSiteOpen(true)}
          title="Add a website"
          className="text-muted-2 hover:text-accent w-5 h-5 flex items-center justify-center rounded hover:bg-surface-2/60"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>

      {sites.length === 0 ? (
        <button onClick={() => setAddSiteOpen(true)} className="w-full text-left px-3 py-2 text-[12px] text-muted-2 hover:text-foreground">
          + Add your first website
        </button>
      ) : (
        <div className="space-y-0.5">
          {sites.map((site) => {
            const isOpen = openKeys.has(site.key);
            return (
              <div key={site.key}>
                <div
                  className={`flex items-center gap-1 rounded-lg pr-2 transition-colors ${
                    pathname.startsWith(`/sites/${site.key}`) ? "bg-surface-2/60" : "hover:bg-surface-2/50"
                  }`}
                >
                  <button
                    onClick={() => toggle(site.key)}
                    title={isOpen ? "Collapse" : "Expand"}
                    className="pl-2 py-1.5 text-muted-2 hover:text-foreground"
                  >
                    <svg
                      width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                      className={`shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
                    >
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </button>
                  <Link href={`/sites/${site.key}`} className="flex-1 min-w-0 py-1.5 text-[13px] font-medium text-muted hover:text-foreground truncate">
                    {site.label}
                  </Link>
                  <span className="text-[10px] text-muted-2 tabular-nums">{site.pages.length}</span>
                </div>

                {isOpen && (
                  <div className="ml-3 pl-2 border-l border-border space-y-0.5 py-0.5">
                    {site.pages.map((p) => {
                      const href = `/pages/${site.key}/${p.slug}`;
                      const active = pathname === href;
                      return (
                        <Link
                          key={p.slug}
                          href={href}
                          className={`block px-2 py-1 rounded-md text-[12px] truncate transition-colors ${
                            active ? "bg-surface-2 text-foreground" : "text-muted-2 hover:text-foreground hover:bg-surface-2/40"
                          }`}
                          title={p.path}
                        >
                          {p.path}
                        </Link>
                      );
                    })}
                    <button
                      onClick={() => setAddPageFor(site.key)}
                      className="w-full text-left px-2 py-1 rounded-md text-[12px] text-accent/80 hover:text-accent hover:bg-surface-2/40"
                    >
                      + Add page
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AddSiteModal open={addSiteOpen} onClose={() => setAddSiteOpen(false)} />
      <AddPagesModal
        open={addPageFor !== null}
        onClose={() => setAddPageFor(null)}
        sites={siteOptions}
        defaultSiteKey={addPageFor ?? undefined}
      />
    </div>
  );
}
