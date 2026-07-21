import { getActiveOrgId } from "@/lib/active-org";
import { getContentStore } from "@/lib/content/store";
import { resolvePrototypeOrg } from "@/lib/prototypes/org";
import { PageHeader, EmptyState } from "@/components/ui";
import { PrototypeBoard } from "@/components/PrototypeBoard";

export const dynamic = "force-dynamic";

/** The customer-wide prototype board — every experiment, grouped by stage. */
export default async function PrototypesBoard() {
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

  const store = await getContentStore();
  const all = await store.listPrototypes();
  const orgs = await Promise.all(all.map((p) => resolvePrototypeOrg(p)));
  const prototypes = all.filter((_, i) => orgs[i] === orgId);

  return (
    <>
      <PageHeader title="Prototypes" subtitle="Every experiment for this customer — author, review, promote" />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <PrototypeBoard prototypes={prototypes} />
      </div>
    </>
  );
}
