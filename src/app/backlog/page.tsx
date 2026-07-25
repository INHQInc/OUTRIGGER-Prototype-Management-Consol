import { getActiveOrgId } from "@/lib/active-org";
import { currentUser } from "@/lib/auth/current";
import { listBacklog } from "@/lib/ideas/ideas";
import { PageHeader } from "@/components/ui";
import { Backlog } from "@/components/Backlog";

export const dynamic = "force-dynamic";

export default async function BacklogPage() {
  const [orgId, user] = await Promise.all([getActiveOrgId(), currentUser()]);
  const items = await listBacklog(orgId).catch(() => []);
  return (
    <>
      <PageHeader title="Backlog" subtitle="Ideas to build — promote the ones worth testing into prototypes" />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <Backlog initial={items} canManage={Boolean(user)} />
      </div>
    </>
  );
}
