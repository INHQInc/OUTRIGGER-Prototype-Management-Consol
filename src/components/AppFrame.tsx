"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import type { SiteNavNode } from "./SiteSwitcher";
import type { OrgOption } from "./OrgSwitcher";
import type { SessionPayload } from "@/lib/auth/types";

export function AppFrame({
  user,
  sites,
  orgs,
  activeOrgId,
  canCreate,
  children,
}: {
  user: SessionPayload | null;
  sites: SiteNavNode[];
  orgs: OrgOption[];
  activeOrgId: string | null;
  canCreate: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const bare = pathname.startsWith("/login");

  if (bare) return <>{children}</>;

  return (
    <>
      <Sidebar user={user} sites={sites} orgs={orgs} activeOrgId={activeOrgId} canCreate={canCreate} />
      <main className="flex-1 min-w-0 flex flex-col">{children}</main>
    </>
  );
}
