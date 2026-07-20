import { getActiveOrgId } from "@/lib/active-org";
import { getOrg } from "@/lib/orgs";
import { currentUser } from "@/lib/auth/current";
import { getExperimentationStatus } from "@/lib/experimentation";
import { PageHeader, EmptyState } from "@/components/ui";
import { ExperimentationSettings } from "@/components/ExperimentationSettings";

export const dynamic = "force-dynamic";

export default async function BrandSettingsPage() {
  const [orgId, user] = await Promise.all([getActiveOrgId(), currentUser()]);
  if (!orgId) {
    return (
      <>
        <PageHeader title="Brand settings" />
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <EmptyState title="No active brand." hint="Create or select a customer first (top of the sidebar)." />
        </div>
      </>
    );
  }
  const [org, status] = await Promise.all([getOrg(orgId), getExperimentationStatus(orgId)]);
  return (
    <>
      <PageHeader title="Brand settings" subtitle={org?.name ?? orgId} />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-2xl">
          <ExperimentationSettings initialStatus={status} canManage={user?.role === "admin"} />
        </div>
      </div>
    </>
  );
}
