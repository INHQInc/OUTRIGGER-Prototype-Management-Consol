import { getAllSites } from "@/lib/sites";
import { getActiveOrgId } from "@/lib/active-org";
import { getContentStore } from "@/lib/content/store";
import { PageHeader, EmptyState } from "@/components/ui";
import { PrototypeBoard } from "@/components/PrototypeBoard";

export const dynamic = "force-dynamic";

/** Home = the brand-wide prototype board (the primary workspace). */
export default async function Home() {
  const orgId = await getActiveOrgId();
  if (!orgId) {
    return (
      <>
        <PageHeader title="Prototypes" />
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <EmptyState title="No customer selected." hint="Pick or create a customer at the top of the sidebar." />
        </div>
      </>
    );
  }

  const sitesMap = await getAllSites();
  const siteList = Object.values(sitesMap).map((s) => ({ key: s.siteKey, label: s.label }));
  const siteKeys = new Set(Object.keys(sitesMap));
  const store = await getContentStore();
  const all = await store.listPrototypes();
  const prototypes = all
    .filter((p) => siteKeys.has(p.siteKey))
    .map((p) => ({ ...p, siteLabel: sitesMap[p.siteKey]?.label ?? p.siteKey }));

  return (
    <>
      <PageHeader title="Prototypes" subtitle="Every experiment across this brand — author, review, promote" />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <PrototypeBoard prototypes={prototypes} sites={siteList} />
      </div>
    </>
  );
}
