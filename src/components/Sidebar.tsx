"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { SessionPayload } from "@/lib/auth/types";
import { SiteSwitcher, type SiteNavNode } from "./SiteSwitcher";

interface NavItem { href: string; label: string; icon: string; exact?: boolean }

const ICON = {
  overview: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  prototypes: "M12 2l2.4 7.4H22l-6 4.6 2.3 7.4L12 17l-6.3 4.4L8 14 2 9.4h7.6z",
  pages: "M4 4h16v4H4zM4 10h16v4H4zM4 16h16v4H4z",
  deploys: "M12 2L2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  handoff: "M4 4h16v12H5.2L4 17.2zM8 9h8M8 12h5",
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
};

export function Sidebar({ user, sites }: { user: SessionPayload | null; sites: SiteNavNode[] }) {
  const pathname = usePathname();
  const router = useRouter();

  const m = pathname.match(/^\/sites\/([^/]+)/);
  const currentSiteKey = m ? decodeURIComponent(m[1]) : null;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const siteNav: NavItem[] = currentSiteKey
    ? [
        { href: `/sites/${currentSiteKey}`, label: "Overview", icon: ICON.overview, exact: true },
        { href: `/sites/${currentSiteKey}/prototypes`, label: "Prototypes", icon: ICON.prototypes },
        { href: `/sites/${currentSiteKey}/pages`, label: "Pages", icon: ICON.pages },
        { href: `/sites/${currentSiteKey}/deploys`, label: "Deploys", icon: ICON.deploys },
        { href: `/sites/${currentSiteKey}/settings`, label: "Settings", icon: ICON.settings },
      ]
    : [];

  const globalNav: NavItem[] = [
    { href: "/", label: "All sites", icon: ICON.overview, exact: true },
    { href: "/features", label: "Prototypes", icon: ICON.prototypes },
    { href: "/handoff", label: "Handoff", icon: ICON.handoff },
    ...(user?.role === "admin" ? [{ href: "/settings/users", label: "Users", icon: ICON.users }] : []),
  ];

  const items = currentSiteKey ? siteNav : globalNav;

  const renderLink = (item: NavItem) => {
    const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
          active ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground hover:bg-surface-2/50"
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={active ? "text-accent" : ""}>
          <path d={item.icon} />
        </svg>
        {item.label}
      </Link>
    );
  };

  return (
    <aside className="w-60 shrink-0 border-r border-border bg-surface flex flex-col">
      <div className="px-5 h-14 flex items-center gap-2.5 border-b border-border">
        <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center text-accent-fg font-bold text-[13px]">O</div>
        <div className="text-[13px] font-semibold tracking-tight">Prototype Console</div>
      </div>

      <SiteSwitcher sites={sites} currentSiteKey={currentSiteKey} />

      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {currentSiteKey && <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-2">Site</div>}
        {items.map(renderLink)}
      </nav>

      {user ? (
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="w-7 h-7 rounded-full bg-surface-2 border border-border flex items-center justify-center text-[11px] font-semibold uppercase">
              {(user.name ?? user.sub).slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-[12px] font-medium truncate">{user.name ?? user.sub}</div>
              <div className="text-[10px] text-muted-2 capitalize">{user.role}</div>
            </div>
            <button onClick={logout} title="Sign out" className="text-muted-2 hover:text-foreground p-1">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
