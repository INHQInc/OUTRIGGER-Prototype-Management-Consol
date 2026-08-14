"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import type { SessionPayload } from "@/lib/auth/types";
import type { BuildInfo } from "@/lib/build-info";
import { OrgSwitcher, type OrgOption } from "./OrgSwitcher";
import { ThemeToggle } from "./ThemeToggle";

interface NavItem { href: string; label: string; icon: string; exact?: boolean }

const RAIL_KEY = "opmc.rail.collapsed";
const RAIL_EVENT = "opmc:rail";

/**
 * THE RAIL PREFERENCE, as an external store.
 *
 * `localStorage` is exactly that — state React does not own — and reading it
 * into `useState` from an effect is both a lint error and a real hydration
 * hazard: the server renders the default, the client swaps it a frame later,
 * and the rail visibly jumps. `useSyncExternalStore` exists for this, with a
 * distinct server snapshot so the two renders agree by construction.
 */
const railStore = {
  subscribe(cb: () => void) {
    window.addEventListener("storage", cb);
    window.addEventListener(RAIL_EVENT, cb);
    return () => {
      window.removeEventListener("storage", cb);
      window.removeEventListener(RAIL_EVENT, cb);
    };
  },
  // A string, so React's Object.is check is stable across reads.
  get(): string | null {
    try { return window.localStorage.getItem(RAIL_KEY); } catch { return null; }
  },
  // No preference on the server — the caller falls back to the route default.
  server(): string | null { return null; },
  set(v: boolean) {
    try { window.localStorage.setItem(RAIL_KEY, v ? "1" : "0"); } catch { /* private mode: this session only */ }
    // Same-tab writes do not fire `storage`; this is what re-renders us.
    window.dispatchEvent(new Event(RAIL_EVENT));
  },
};

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
  reports: "M4 4h16v16H4zM8 9h8M8 13h8M8 17h5",
};

export function Sidebar({ user, orgs, activeOrgId, canCreate, build }: { user: SessionPayload | null; orgs: OrgOption[]; activeOrgId: string | null; canCreate: boolean; build: BuildInfo }) {
  const pathname = usePathname();
  const router = useRouter();

  // THE NAV NEVER LEAVES. It used to vanish inside a prototype, because a
  // second LABELLED column beside the workspace rail said nothing twice
  // (user: "look how many navigation management areas we have now"). The
  // rooms are a horizontal tab row now, so this is the only vertical nav in
  // the app and there is nothing left for it to compete with — and you can
  // move between prototypes without going back out first.
  //
  // Inside a prototype it defaults to the ICON RAIL: present, oriented, out
  // of the way. Anywhere else it starts labelled. An explicit choice beats
  // both and is remembered.
  const inPrototype = /^\/prototypes\/(?!new(?:\/|$))[^/]+/.test(pathname);
  const saved = useSyncExternalStore(railStore.subscribe, railStore.get, railStore.server);
  const collapsed = saved === "1" ? true : saved === "0" ? false : inPrototype;
  const setCollapsed = (v: boolean) => railStore.set(v);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  // A group header cannot be a word at 56px. Collapsed, the groups are said
  // with a rule instead — the grouping survives, the label does not pretend to.
  const sectionHeader = (label: string) =>
    collapsed
      ? <div className="mx-3 my-2 border-t border-border/60" aria-hidden />
      : <div className="px-3 pt-3 pb-1 text-[12.5px] font-semibold uppercase tracking-wider text-muted-2">{label}</div>;

  const renderLink = (item: NavItem) => {
    const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-label={item.label}
        // `title` gives the hover label for free, and unlike a rendered
        // tooltip it cannot be clipped by the rail's own overflow — which is
        // the failure mode of every hand-built tooltip inside a narrow column.
        title={collapsed ? item.label : undefined}
        className={`group relative flex items-center rounded-lg font-medium transition-colors ${
          collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2"
        } text-[15px] ${active ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground hover:bg-surface-2/50"}`}
      >
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${active ? "text-accent" : ""}`}>
          <path d={item.icon} />
        </svg>
        {!collapsed && item.label}
        {collapsed && (
          // The visible label. Rendered beside the rail rather than inside it,
          // so it is readable at 56px and never truncated.
          <span className="pointer-events-none absolute left-full ml-2 z-50 hidden group-hover:block whitespace-nowrap rounded-md border border-border bg-surface px-2 py-1 text-[12.5px] font-medium text-foreground shadow-lg">
            {item.label}
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside className={`shrink-0 border-r border-border bg-surface flex flex-col transition-[width] duration-150 ${collapsed ? "w-14" : "w-60"}`}>
      <div className={`h-14 flex items-center border-b border-border gap-2.5 ${collapsed ? "justify-center px-0" : "px-5"}`}>
        <Link href="/" aria-label="Dashboard" className="w-7 h-7 rounded-md bg-accent flex items-center justify-center text-accent-fg font-bold text-[15px] shrink-0">O</Link>
        {!collapsed && <div className="text-[15px] font-semibold tracking-tight">Prototype Console</div>}
        {!collapsed && (
          <button onClick={() => setCollapsed(true)} title="Collapse the sidebar" aria-label="Collapse the sidebar"
            className="ml-auto text-muted-2 hover:text-foreground p-1 rounded">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
      </div>
      {collapsed && (
        <button onClick={() => setCollapsed(false)} title="Expand the sidebar" aria-label="Expand the sidebar"
          className="mx-auto mt-2 text-muted-2 hover:text-foreground p-1 rounded">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      )}

      {/* THE CUSTOMER IS NEVER HIDDEN, only abbreviated. Which tenant you are
          acting on is the one thing that must not become ambiguous, so the
          collapsed rail keeps its initial with the full name on hover rather
          than dropping the control. */}
      {collapsed ? (
        <div className="flex justify-center py-2 border-b border-border" title={orgs.find((o) => o.id === activeOrgId)?.name ?? "Customer"}>
          <div className="w-7 h-7 rounded-md border border-border bg-surface-2 flex items-center justify-center text-[12.5px] font-bold uppercase">
            {(orgs.find((o) => o.id === activeOrgId)?.name ?? "?").slice(0, 1)}
          </div>
        </div>
      ) : (
        <OrgSwitcher orgs={orgs} activeOrgId={activeOrgId} canCreate={canCreate} />
      )}

      <nav className={`flex-1 space-y-0.5 overflow-y-auto overflow-x-visible ${collapsed ? "px-2 py-3" : "p-3"}`}>
        {sectionHeader("Work")}
        {renderLink({ href: "/", label: "Dashboard", icon: ICON.overview, exact: true })}
        {renderLink({ href: "/prototypes", label: "Prototypes", icon: ICON.prototypes })}
        {renderLink({ href: "/handoff", label: "Handoff", icon: ICON.handoff })}
        {renderLink({ href: "/backlog", label: "Backlog", icon: ICON.activity })}
        {/* A Report is a first-class object a human creates and names — the same
            class as a Prototype — and it spans prototypes, so it cannot live
            inside one. */}
        {renderLink({ href: "/reports", label: "Reports", icon: ICON.reports })}

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
        <div className={`border-t border-border ${collapsed ? "p-2" : "p-3"}`}>
          <div className={`flex items-center ${collapsed ? "flex-col gap-2" : "gap-2.5 px-2 py-1.5"}`}>
              <div title={collapsed ? `${user.name ?? user.sub} · ${user.role}` : undefined}
                className="w-7 h-7 rounded-full bg-surface-2 border border-border flex items-center justify-center text-[13px] font-semibold uppercase shrink-0">
                {(user.name ?? user.sub).slice(0, 1)}
              </div>
              {!collapsed && (
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="text-[14px] font-medium truncate">{user.name ?? user.sub}</div>
                  <div className="text-[12.5px] text-muted-2 capitalize">{user.role}</div>
                </div>
              )}
              <ThemeToggle />
              <button onClick={logout} title="Sign out" className="text-muted-2 hover:text-foreground p-1">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                </svg>
              </button>
          </div>
        </div>
      ) : null}

      {/* WHICH BUILD YOU ARE LOOKING AT. "Is the fix live?" was answered three
          times this week by inference — a header only middleware sets, a 401
          that became a 200, a button that did or did not appear — and once it
          was wrong for an hour because a deploy had not finished. The answer
          belongs on screen. Preview and development say so; production shows
          the commit alone, because there the environment is not the news. */}
      <div className={`pb-3 pt-1 text-[11px] leading-tight text-muted-2 print:hidden ${collapsed ? "px-1 text-center" : "px-4"}`}
        title={build.full ?? "running from source, not a build"}>
        <span className="font-mono">{build.sha}</span>
        {!collapsed && build.env !== "production" && <span className="ml-1.5 uppercase tracking-wide">{build.env}</span>}
        {!collapsed && build.ref && build.ref !== "main" && <span className="ml-1.5">{build.ref}</span>}
      </div>
    </aside>
  );
}
