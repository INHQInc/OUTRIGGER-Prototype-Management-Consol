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
        <PageHeader title="Users" />
        <div className="flex-1 overflow-y-auto px-8 py-6"><EmptyState title="No customer selected." hint="Pick or create a customer at the top of the sidebar." /></div>
      </>
    );
  }
  const [org, members] = await Promise.all([getOrg(orgId), listMembers(orgId)]);
  return (
    <>
      <PageHeader title="Users" subtitle={`Who can access ${org?.name ?? orgId}`} />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <MembersManager initialMembers={members} canManage={user?.role === "admin"} />
      </div>
    </>
  );
}
