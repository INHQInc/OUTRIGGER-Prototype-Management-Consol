import { getActiveOrgId } from "@/lib/active-org";
import { PageHeader, EmptyState } from "@/components/ui";
import Link from "next/link";
import { ProgramBoard } from "@/components/ProgramBoard";
import { PrototypeList } from "@/components/PrototypeList";
import { buildBoard } from "@/lib/prototypes/board";

export const dynamic = "force-dynamic";

/** The customer-wide prototype view — one truth, two lenses (Board | List). */
export default async function PrototypesBoard({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const view = (await searchParams).view === "list" ? "list" : "board";
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

  const tab = (id: string, label: string) => (
    <Link href={id === "board" ? "/prototypes" : `/prototypes?view=${id}`}
      className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${view === id ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"}`}>
      {label}
    </Link>
  );
  return (
    <>
      <PageHeader
        title="Prototypes"
        subtitle="Where every experiment actually is — same truth, two lenses"
        actions={<div className="flex items-center gap-1 rounded-lg border border-border p-0.5">{tab("board", "Board")}{tab("list", "List")}</div>}
      />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {view === "list" ? <PrototypeList cards={cards} /> : <ProgramBoard cards={cards} archivedCount={archivedCount} />}
      </div>
    </>
  );
}
