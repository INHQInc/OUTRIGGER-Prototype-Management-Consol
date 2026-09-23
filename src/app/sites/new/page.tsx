import { getActiveOrgId } from "@/lib/active-org";
import { currentUser } from "@/lib/auth/current";
import { getOrg } from "@/lib/orgs";
import { EmptyState } from "@/components/ui";
import { AddSiteForm } from "@/components/AddSiteForm";

export const dynamic = "force-dynamic";

/** Add a site — site setup, step 1 (the app's numbered setup-page grammar). */
export default async function AddSitePage() {
  const [orgId, user] = await Promise.all([getActiveOrgId(), currentUser()]);
  if (!orgId) {
    return (
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <EmptyState title="No customer selected." hint="Pick or create a customer at the top of the sidebar." />
      </div>
    );
  }
  if (user?.role !== "admin") {
    return (
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <EmptyState title="Only an admin can add a site." hint="Ask an admin on this customer to add it." />
      </div>
    );
  }
  const org = await getOrg(orgId);
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="text-[12.5px] font-semibold uppercase tracking-wider text-muted-2">Site setup · {org?.name ?? orgId}</div>
        <h1 className="text-[22px] font-bold tracking-tight mt-0.5">Add a site</h1>
        <p className="text-[13.5px] text-muted-2 mt-1.5 max-w-[70ch]">
          A site is one website this customer runs tests on. Its prototypes, environments and settings all belong to it.
        </p>
        <div className="mt-6"><AddSiteForm /></div>
      </div>
    </div>
  );
}
