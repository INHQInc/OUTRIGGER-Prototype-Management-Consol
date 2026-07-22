import { getActiveOrgId } from "@/lib/active-org";
import { getOrg } from "@/lib/orgs";
import { currentUser } from "@/lib/auth/current";
import { listOrgRepos } from "@/lib/git/org-repos";
import { PageHeader, EmptyState } from "@/components/ui";
import { RepoRegistry } from "@/components/RepoRegistry";
import { ReferenceRepos } from "@/components/ReferenceRepos";
import { GitHubConnection } from "@/components/GitHubConnection";
import { getGitConnectionStatus, probeRepoWrite } from "@/lib/git/connection";
import { listReferenceRepos } from "@/lib/git/reference-repos";
import { ensureApiToken } from "@/lib/api-token";
import { ApiAccessTile } from "@/components/ApiAccessTile";
import { headers } from "next/headers";

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
  const [org, repos, gitStatus, apiToken, hdrs] = await Promise.all([getOrg(orgId), listOrgRepos(orgId), getGitConnectionStatus(orgId), ensureApiToken(orgId), headers()]);
  const consoleUrl = `https://${hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "console"}`;
  // Verify the connected token can actually WRITE to the prototypes repo (branch
  // creation needs it) — a read-only token connects fine but 403s at build time.
  const refRepos = await listReferenceRepos(orgId).catch(() => []);
  const protoRepo = repos.find((r) => r.defaultFor.includes("prototypes")) ?? repos.find((r) => r.roles.includes("prototypes")) ?? null;
  const writeProbe = protoRepo && (gitStatus.connected || gitStatus.envFallback) ? await probeRepoWrite(orgId, protoRepo.fullName) : null;
  return (
    <>
      <PageHeader title="Repositories" subtitle={`${org?.name ?? orgId} — where prototype code and production source live`} />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-2xl space-y-5">
          <GitHubConnection initialStatus={gitStatus} writeProbe={writeProbe} canManage={user?.role === "admin"} />
          <RepoRegistry initialRepos={repos} canManage={user?.role === "admin"} />
          <ReferenceRepos initial={refRepos} canManage={user?.role === "admin"} />
          <ApiAccessTile initialToken={apiToken} consoleUrl={consoleUrl} canManage={user?.role === "admin"} />
        </div>
      </div>
    </>
  );
}
