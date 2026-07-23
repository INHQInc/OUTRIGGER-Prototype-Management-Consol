import { getActiveOrgId } from "@/lib/active-org";
import { currentUser } from "@/lib/auth/current";
import { listIdeas } from "@/lib/ideas/ideas";
import { PageHeader } from "@/components/ui";
import { IdeaInbox } from "@/components/IdeaInbox";

export const dynamic = "force-dynamic";

export default async function IdeasPage() {
  const [orgId, user] = await Promise.all([getActiveOrgId(), currentUser()]);
  const ideas = await listIdeas(orgId).catch(() => []);
  return (
    <>
      <PageHeader title="Ideas" subtitle="Improvements proposed from inside the work" />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <IdeaInbox initial={ideas} canManage={Boolean(user)} />
      </div>
    </>
  );
}
