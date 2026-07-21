import { headers } from "next/headers";
import { getActiveOrgId } from "@/lib/active-org";
import { getOrg } from "@/lib/orgs";
import { currentUser } from "@/lib/auth/current";
import { listOrgEnvironments, envLoaderSeenAt } from "@/lib/environments";
import { PageHeader, EmptyState } from "@/components/ui";
import { OrgEnvironments } from "@/components/OrgEnvironments";

export const dynamic = "force-dynamic";

/** Environments = WHERE prototypes are reviewed/tested/run for this customer. */
export default async function EnvironmentsPage() {
  const [orgId, user, hdrs] = await Promise.all([getActiveOrgId(), currentUser(), headers()]);
  if (!orgId) {
    return (
      <>
        <PageHeader title="Environments" />
        <div className="flex-1 overflow-y-auto px-8 py-6"><EmptyState title="No customer selected." hint="Pick or create a customer at the top of the sidebar." /></div>
      </>
    );
  }
  const [org, environments] = await Promise.all([getOrg(orgId), listOrgEnvironments(orgId)]);
  const seenEntries = await Promise.all(environments.map(async (e) => [e.id, await envLoaderSeenAt(e)] as const));
  const seenAt = Object.fromEntries(seenEntries);
  const consoleUrl = `https://${hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "console"}`;

  return (
    <>
      <PageHeader title="Environments" subtitle={`${org?.name ?? orgId} — where prototypes are reviewed, tested, and run`} />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <OrgEnvironments initialEnvironments={environments} seenAt={seenAt} consoleUrl={consoleUrl} canManage={Boolean(user)} />
      </div>
    </>
  );
}
