import { getActiveOrgId } from "@/lib/active-org";
import { getOrg, listMembers } from "@/lib/orgs";
import { currentUser } from "@/lib/auth/current";
import { PageHeader, EmptyState } from "@/components/ui";
import { MembersManager } from "@/components/MembersManager";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const [orgId, user] = await Promise.all([getActiveOrgId(), currentUser()]);
  if (!orgId) {
    return (
      <>
        <PageHeader title="Members" />
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <EmptyState title="No active org." hint="Create or select a customer first (top of the sidebar)." />
        </div>
      </>
    );
  }
  const [org, members] = await Promise.all([getOrg(orgId), listMembers(orgId)]);
  return (
    <>
      <PageHeader title="Members" subtitle={`Who can access ${org?.name ?? orgId}`} />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <MembersManager initialMembers={members} canManage={user?.role === "admin"} />
      </div>
    </>
  );
}
