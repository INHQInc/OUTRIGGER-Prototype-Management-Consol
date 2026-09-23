"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import type { OrgOption } from "./OrgSwitcher";
import type { SiteOption } from "./SiteSwitcher";
import type { SessionPayload } from "@/lib/auth/types";
import type { BuildInfo } from "@/lib/build-info";

export function AppFrame({
  user,
  orgs,
  activeOrgId,
  sites,
  activeSiteId,
  canCreate,
  build,
  children,
}: {
  user: SessionPayload | null;
  orgs: OrgOption[];
  activeOrgId: string | null;
  sites: SiteOption[];
  activeSiteId: string | null;
  canCreate: boolean;
  build: BuildInfo;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const bare = pathname.startsWith("/login");

  if (bare) return <>{children}</>;

  return (
    <>
      <Sidebar user={user} orgs={orgs} activeOrgId={activeOrgId} sites={sites} activeSiteId={activeSiteId} canCreate={canCreate} build={build} />
      <main className="flex-1 min-w-0 flex flex-col">{children}</main>
    </>
  );
}
