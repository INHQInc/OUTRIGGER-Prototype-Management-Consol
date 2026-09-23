import { getActiveOrgId } from "@/lib/active-org";
import { getOrg } from "@/lib/orgs";
import { currentUser } from "@/lib/auth/current";
import { brandStatus } from "@/lib/brand/onboarding";
import { PageHeader, EmptyState } from "@/components/ui";
import { BrandEditor } from "@/components/BrandEditor";

export const dynamic = "force-dynamic";

/**
 * STEP ONE of a customer. Creating one lands here, and the setup checklist's
 * first row links here — the same screen both times, because a brand has one
 * editor, not a wizard plus a settings page that disagree about it.
 */
export default async function BrandPage() {
  const [orgId, user] = await Promise.all([getActiveOrgId(), currentUser()]);
  if (!orgId) {
    return (
      <>
        <PageHeader title="Brand" />
        <div className="flex-1 overflow-y-auto px-8 py-6"><EmptyState title="No customer selected." hint="Pick or create a customer at the top of the sidebar." /></div>
      </>
    );
  }
  const [org, status] = await Promise.all([getOrg(orgId), brandStatus(orgId)]);
  return (
    <>
      <PageHeader title="Brand" subtitle={`${org?.name ?? orgId} — the words and voice every prototype, readout and email is written in`} />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-2xl">
          <BrandEditor initial={status} canManage={user?.role === "admin"} />
        </div>
      </div>
    </>
  );
}
