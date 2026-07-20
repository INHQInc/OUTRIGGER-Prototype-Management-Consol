"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { SessionPayload } from "@/lib/auth/types";
import { SitesTree, type SiteNavNode } from "./SitesTree";

const OVERVIEW = { href: "/", label: "Sites & Pages", icon: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" };
const NAV = [
  { href: "/features", label: "Features", icon: "M12 2l2.4 7.4H22l-6 4.6 2.3 7.4L12 17l-6.3 4.4L8 14 2 9.4h7.6z" },
  { href: "/deploys", label: "Deploys", icon: "M12 2L2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5" },
  { href: "/handoff", label: "Handoff", icon: "M4 4h16v12H5.2L4 17.2zM8 9h8M8 12h5" },
];

export function Sidebar({ user, sites }: { user: SessionPayload | null; sites: SiteNavNode[] }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const navItems = [...NAV];
  if (user?.role === "admin") {
    navItems.push({ href: "/settings/users", label: "Users", icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" });
  }

  const renderLink = (item: { href: string; label: string; icon: string }) => {
    const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
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
      <div className="px-5 h-16 flex items-center gap-2.5 border-b border-border">
        <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center text-accent-fg font-bold text-sm">O</div>
        <div className="leading-tight">
          <div className="text-[13px] font-semibold tracking-tight">Prototype Console</div>
          <div className="text-[11px] text-muted-2">Outrigger</div>
        </div>
      </div>

      <nav className="flex-1 p-3 overflow-y-auto space-y-0.5">
        {renderLink(OVERVIEW)}
        {user && <SitesTree sites={sites} />}
        <div className="pt-3 mt-1 border-t border-border space-y-0.5">
          {navItems.map(renderLink)}
        </div>
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
      ) : (
        <div className="p-3 border-t border-border">
          <div className="px-3 py-2 text-[11px] text-muted-2 leading-relaxed">
            Snapshots are frozen & sanitized.<br />No tracking ships in clones.
          </div>
        </div>
      )}
    </aside>
  );
}
