import { getActiveOrgId } from "@/lib/active-org";
import { PageHeader, EmptyState } from "@/components/ui";
import { ProgramBoard } from "@/components/ProgramBoard";
import { buildBoard } from "@/lib/prototypes/board";

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

  const { cards, archivedCount } = await buildBoard(orgId);

  return (
    <>
      <PageHeader title="Prototypes" subtitle="The program board — where every experiment actually is" />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <ProgramBoard cards={cards} archivedCount={archivedCount} />
      </div>
    </>
  );
}
