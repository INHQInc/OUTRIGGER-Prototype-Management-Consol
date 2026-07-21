import { listOrgs } from "@/lib/orgs";
import { listOrgEnvironments } from "@/lib/environments";
import { accessibleOrgIds, getActiveOrgId } from "@/lib/active-org";
import { currentUser } from "@/lib/auth/current";
import { getContentStore } from "@/lib/content/store";
import { PageHeader } from "@/components/ui";
import { CustomersManager, type CustomerRow } from "@/components/CustomersManager";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const store = await getContentStore();
  const [orgs, ids, sites, prototypes, activeOrgId, user] = await Promise.all([
    listOrgs(),
    accessibleOrgIds(),
    store.listDynamicSites(),
    store.listPrototypes(),
    getActiveOrgId(),
    currentUser(),
  ]);
  const accessible = new Set(ids);
  // Legacy prototypes resolve their org through the old site link.
  const siteOrg = new Map(sites.map((s) => [s.siteKey, s.orgId]));
  const protoCounts = new Map<string, number>();
  for (const p of prototypes) {
    const org = p.orgId || siteOrg.get(p.siteKey ?? "") || "";
    if (org) protoCounts.set(org, (protoCounts.get(org) ?? 0) + 1);
  }

  const visible = orgs.filter((o) => accessible.has(o.id));
  const envCounts = new Map<string, number>();
  for (const o of visible) envCounts.set(o.id, (await listOrgEnvironments(o.id)).length);

  const customers: CustomerRow[] = visible.map((o) => ({
    id: o.id,
    name: o.name,
    createdAt: o.createdAt,
    prototypeCount: protoCounts.get(o.id) ?? 0,
    envCount: envCounts.get(o.id) ?? 0,
  }));

  return (
    <>
      <PageHeader title="Customers" subtitle="Brands you manage prototypes for" />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <CustomersManager initialCustomers={customers} activeOrgId={activeOrgId} canManage={user?.role === "admin"} />
      </div>
    </>
  );
}
