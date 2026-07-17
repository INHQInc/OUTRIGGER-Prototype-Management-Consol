"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Sites & Pages", icon: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" },
  { href: "/features", label: "Features", icon: "M12 2l2.4 7.4H22l-6 4.6 2.3 7.4L12 17l-6.3 4.4L8 14 2 9.4h7.6z" },
  { href: "/deploys", label: "Deploys", icon: "M12 2L2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5" },
  { href: "/handoff", label: "Handoff", icon: "M4 4h16v12H5.2L4 17.2zM8 9h8M8 12h5" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-60 shrink-0 border-r border-border bg-surface flex flex-col">
      <div className="px-5 h-16 flex items-center gap-2.5 border-b border-border">
        <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center text-accent-fg font-bold text-sm">
          O
        </div>
        <div className="leading-tight">
          <div className="text-[13px] font-semibold tracking-tight">Prototype Console</div>
          <div className="text-[11px] text-muted-2">Outrigger</div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                active
                  ? "bg-surface-2 text-foreground"
                  : "text-muted hover:text-foreground hover:bg-surface-2/50"
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={active ? "text-accent" : ""}>
                <path d={item.icon} />
              </svg>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-border">
        <div className="px-3 py-2 text-[11px] text-muted-2 leading-relaxed">
          Snapshots are frozen & sanitized.<br />No tracking ships in clones.
        </div>
      </div>
    </aside>
  );
}
