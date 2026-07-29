import { getActiveOrgId } from "@/lib/active-org";
import { PageHeader, EmptyState } from "@/components/ui";
import Link from "next/link";
import { ProgramBoard } from "@/components/ProgramBoard";
import { PrototypeTable } from "@/components/PrototypeTable";
import { buildBoard } from "@/lib/prototypes/board";
import { NewPrototype } from "@/components/NewPrototype";

export const dynamic = "force-dynamic";

/**
 * The customer-wide prototype view. The TABLE is the front door — Optimizely's
 * Optimizations grammar, so an Opti user reads it with zero onboarding. The
 * board survives as a program lens (?view=board).
 */
export default async function PrototypesBoard({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const view = (await searchParams).view === "board" ? "board" : "table";
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
    <Link href={id === "table" ? "/prototypes" : `/prototypes?view=${id}`}
      className={`px-3 py-1.5 rounded-lg text-[14px] font-semibold transition-colors ${view === id ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"}`}>
      {label}
    </Link>
  );
  return (
    <>
      <PageHeader title="Prototypes" subtitle="Every prototype, its stage, and its experiment — one truth" />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 shrink-0">{tab("table", "Table")}{tab("board", "Board")}</div>
          <p className="text-[13px] text-muted-2 min-w-0 truncate">
            {view === "board"
              ? "The program lens — columns are ground truth; drag to reorder priority, or Experimentation → Handoff when you call it."
              : "Click a prototype to open it. Status and stage strip are derived — they can't lie."}
          </p>
          <div className="ml-auto shrink-0"><NewPrototype /></div>
        </div>
        {view === "board" ? <ProgramBoard cards={cards} archivedCount={archivedCount} /> : <PrototypeTable cards={cards} />}
      </div>
    </>
  );
}
