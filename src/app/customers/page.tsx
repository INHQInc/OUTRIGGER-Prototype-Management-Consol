import { listOrgs } from "@/lib/orgs";
import { accessibleOrgIds, getActiveOrgId } from "@/lib/active-org";
import { currentUser } from "@/lib/auth/current";
import { getContentStore } from "@/lib/content/store";
import { PageHeader } from "@/components/ui";
import { CustomersManager, type CustomerRow } from "@/components/CustomersManager";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const store = await getContentStore();
  const [orgs, ids, sites, activeOrgId, user] = await Promise.all([
    listOrgs(),
    accessibleOrgIds(),
    store.listDynamicSites(),
    getActiveOrgId(),
    currentUser(),
  ]);
  const accessible = new Set(ids);
  const counts = new Map<string, number>();
  for (const s of sites) counts.set(s.orgId, (counts.get(s.orgId) ?? 0) + 1);

  const customers: CustomerRow[] = orgs
    .filter((o) => accessible.has(o.id))
    .map((o) => ({ id: o.id, name: o.name, createdAt: o.createdAt, siteCount: counts.get(o.id) ?? 0 }));

  return (
    <>
      <PageHeader title="Customers" subtitle="Brands you manage prototypes for" />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <CustomersManager initialCustomers={customers} activeOrgId={activeOrgId} canManage={user?.role === "admin"} />
      </div>
    </>
  );
}
