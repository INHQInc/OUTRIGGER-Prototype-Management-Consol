import { getActiveOrgId } from "@/lib/active-org";
import { getOrg } from "@/lib/orgs";
import { currentUser } from "@/lib/auth/current";
import { listOrgRepos } from "@/lib/git/org-repos";
import { PageHeader, EmptyState } from "@/components/ui";
import { RepoRegistry } from "@/components/RepoRegistry";
import { GitHubConnection } from "@/components/GitHubConnection";
import { getGitConnectionStatus } from "@/lib/git/connection";

export const dynamic = "force-dynamic";

export default async function RepositoriesPage() {
  const [orgId, user] = await Promise.all([getActiveOrgId(), currentUser()]);
  if (!orgId) {
    return (
      <>
        <PageHeader title="Repositories" />
        <div className="flex-1 overflow-y-auto px-8 py-6"><EmptyState title="No customer selected." hint="Pick or create a customer at the top of the sidebar." /></div>
      </>
    );
  }
  const [org, repos, gitStatus] = await Promise.all([getOrg(orgId), listOrgRepos(orgId), getGitConnectionStatus(orgId)]);
  return (
    <>
      <PageHeader title="Repositories" subtitle={`${org?.name ?? orgId} — where prototype code and production source live`} />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-2xl space-y-5">
          <GitHubConnection initialStatus={gitStatus} canManage={user?.role === "admin"} />
          <RepoRegistry initialRepos={repos} canManage={user?.role === "admin"} />
        </div>
      </div>
    </>
  );
}
