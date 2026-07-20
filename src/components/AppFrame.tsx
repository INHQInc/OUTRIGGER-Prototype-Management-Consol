"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import type { SiteNavNode } from "./SitesTree";
import type { SessionPayload } from "@/lib/auth/types";

export function AppFrame({ user, sites, children }: { user: SessionPayload | null; sites: SiteNavNode[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const bare = pathname.startsWith("/login");

  if (bare) return <>{children}</>;

  return (
    <>
      <Sidebar user={user} sites={sites} />
      <main className="flex-1 min-w-0 flex flex-col">{children}</main>
    </>
  );
}
