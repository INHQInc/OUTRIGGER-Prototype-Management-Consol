"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { seg: "", label: "Overview" },
  { seg: "pages", label: "Pages" },
  { seg: "prototypes", label: "Prototypes" },
  { seg: "deploys", label: "Deploys" },
  { seg: "settings", label: "Settings" },
];

/** Tab bar for the Site Workspace. Highlights the active sub-route. */
export function SiteTabs({ siteKey }: { siteKey: string }) {
  const pathname = usePathname();
  const base = `/sites/${siteKey}`;

  return (
    <nav className="flex items-center gap-1 px-8 border-b border-border">
      {TABS.map((t) => {
        const href = t.seg ? `${base}/${t.seg}` : base;
        const active = t.seg ? pathname === href || pathname.startsWith(`${href}/`) : pathname === base;
        return (
          <Link
            key={t.seg || "overview"}
            href={href}
            className={`px-3 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
              active ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
