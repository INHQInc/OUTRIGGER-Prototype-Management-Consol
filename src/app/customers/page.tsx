import { listOrgs } from "@/lib/orgs";
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
  // Cheap count: org-owned envs + legacy site-keyed envs for this org's sites.
  // (Avoids listOrgEnvironments' per-org lazy-adoption writes during a GET render.)
  const orgSiteKeys = new Map<string, string[]>();
  for (const st of sites) { const a = orgSiteKeys.get(st.orgId) ?? []; a.push(st.siteKey); orgSiteKeys.set(st.orgId, a); }
  const envCounts = new Map<string, number>();
  await Promise.all(visible.map(async (o) => {
    const own = await store.listEnvironmentsByOrg(o.id);
    const ids = new Set(own.map((e) => e.id));
    let legacy = 0;
    for (const sk of orgSiteKeys.get(o.id) ?? []) {
      for (const e of await store.listEnvironments(sk)) if (!e.orgId && !ids.has(e.id)) { ids.add(e.id); legacy++; }
    }
    envCounts.set(o.id, own.length + legacy);
  }));

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
