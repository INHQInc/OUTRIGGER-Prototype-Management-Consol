"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { SessionPayload } from "@/lib/auth/types";
import { OrgSwitcher, type OrgOption } from "./OrgSwitcher";
import { ThemeToggle } from "./ThemeToggle";

interface NavItem { href: string; label: string; icon: string; exact?: boolean }

const ICON = {
  overview: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  prototypes: "M14 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0M3 21l8-14.3M13 6.7l1.9 3.5M19 12c-3.9 4-7.1 4-11 0M21 21l-2.2-3.8",
  pages: "M4 4h16v4H4zM4 10h16v4H4zM4 16h16v4H4z",
  deploys: "M12 2L2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  handoff: "M11 17l2 2a1 1 0 1 0 3-3M14 14l2.5 2.5a1 1 0 1 0 3-3l-3.9-3.9a3 3 0 0 0-4.2 0l-.9.9a1 1 0 1 1-3-3l2.8-2.8a5.8 5.8 0 0 1 7.1-.9l.5.3a2 2 0 0 0 1.4.2L21 4M21 3l1 11h-2M3 3L2 14l6.5 6.5a1 1 0 1 0 3-3M3 4h8",
  flask: "M10 2v7.5a2 2 0 0 1-.2.9L4.7 20.6a1 1 0 0 0 .9 1.4h12.8a1 1 0 0 0 .9-1.4L14.2 10.4a2 2 0 0 1-.2-.9V2M8.5 2h7M7 16h10",
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  brand: "M3 21h18M5 21V7l8-4v18M19 21V11l-6-3M9 9v.01M9 12v.01M9 15v.01M9 18v.01",
};

export function Sidebar({ user, orgs, activeOrgId, canCreate }: { user: SessionPayload | null; orgs: OrgOption[]; activeOrgId: string | null; canCreate: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const sectionHeader = (label: string) => (
    <div className="px-3 pt-3 pb-1 text-[12.5px] font-semibold uppercase tracking-wider text-muted-2">{label}</div>
  );

  const renderLink = (item: NavItem) => {
    const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[15px] font-medium transition-colors ${
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
        <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center text-accent-fg font-bold text-[15px]">O</div>
        <div className="text-[15px] font-semibold tracking-tight">Prototype Console</div>
      </div>

      <OrgSwitcher orgs={orgs} activeOrgId={activeOrgId} canCreate={canCreate} />

      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {sectionHeader("Work")}
        {renderLink({ href: "/", label: "Dashboard", icon: ICON.overview, exact: true })}
        {renderLink({ href: "/prototypes", label: "Prototypes", icon: ICON.prototypes })}
        {renderLink({ href: "/handoff", label: "Handoff", icon: ICON.handoff })}
        {renderLink({ href: "/ideas", label: "Ideas", icon: ICON.activity })}

        {sectionHeader("Configuration")}
        {renderLink({ href: "/environments", label: "Environments", icon: ICON.pages })}
        {renderLink({ href: "/skills", label: "Skills", icon: ICON.flask })}

        {sectionHeader("Settings")}
        {renderLink({ href: "/settings/experimentation", label: "Experimentation", icon: ICON.flask })}
        {renderLink({ href: "/settings/repositories", label: "Repositories", icon: ICON.deploys })}
        {renderLink({ href: "/settings/members", label: "Users", icon: ICON.users })}
        {renderLink({ href: "/settings/activity", label: "Activity", icon: ICON.activity })}

        {sectionHeader("Operator")}
        {renderLink({ href: "/customers", label: "Customers", icon: ICON.brand })}
        {user?.role === "admin" && renderLink({ href: "/settings/users", label: "Console users", icon: ICON.users })}
      </nav>

      {user ? (
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="w-7 h-7 rounded-full bg-surface-2 border border-border flex items-center justify-center text-[13px] font-semibold uppercase">
              {(user.name ?? user.sub).slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-[14px] font-medium truncate">{user.name ?? user.sub}</div>
              <div className="text-[12.5px] text-muted-2 capitalize">{user.role}</div>
            </div>
            <ThemeToggle />
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
