"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Tabs for the prototype workspace: the work, the definition, the config. */
export function PrototypeTabs({ prototypeKey }: { prototypeKey: string }) {
  const pathname = usePathname();
  const base = `/prototypes/${prototypeKey}`;
  const tabs = [
    { href: base, label: "Setup", exact: true },
    { href: `${base}/pages`, label: "Pages" },
    { href: `${base}/build`, label: "Build" },
    { href: `${base}/experiment`, label: "Experiment" },
    { href: `${base}/settings`, label: "Settings" },
  ];
  return (
    <div className="flex items-center gap-1 border-b border-border -mb-px overflow-x-auto">
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
              active ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
