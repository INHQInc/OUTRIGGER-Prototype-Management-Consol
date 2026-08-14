import { getActiveOrgId } from "@/lib/active-org";
import { PageHeader, EmptyState } from "@/components/ui";
import { ProgramBoard } from "@/components/ProgramBoard";
import { PrototypeTable } from "@/components/PrototypeTable";
import { buildBoard } from "@/lib/prototypes/board";
import { NewPrototype } from "@/components/NewPrototype";
import { TabRow } from "@/components/TabRow";

export const dynamic = "force-dynamic";

/**
 * The customer-wide prototype view. The BOARD is the front door — it answers
 * what is moving, what is stuck, what is waiting on you. The TABLE is the
 * lookup behind it (?view=table): Optimizely's Optimizations grammar, so an
 * Opti user reads it with zero onboarding when they already know what they
 * came for.
 */
export default async function PrototypesBoard({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  // BOARD IS THE ROOM, TABLE IS THE INDEX. The board answers the question the
  // program actually asks — what is moving, what is stuck, what is waiting on
  // me — and the table answers "what exists", which is a lookup you only want
  // once you already know what you are looking for. The default should be the
  // question you arrive with (user, 08-14: "i want the board to be default").
  const view = (await searchParams).view === "table" ? "table" : "board";
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
      <PageHeader title="Prototypes" subtitle="Every prototype, its stage, and its experiment — one truth" />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {/* The SAME TabRow the workspace uses for its rooms. It was a pair of
            pills here and an underlined row there — one gesture, two grammars,
            which is a thing to learn before you can use either. */}
        <div className="flex items-end gap-4 mb-4 border-b border-border">
          <TabRow className="shrink-0" active={view} items={[
            { id: "board", label: "Board", href: "/prototypes" },
            { id: "table", label: "Table", href: "/prototypes?view=table" },
          ]} />
          <p className="text-[13px] text-muted-2 min-w-0 truncate pb-2.5">
            {view === "board"
              ? "The program lens — columns are ground truth; drag to reorder priority, or Experimentation → Handoff when you call it."
              : "Click a prototype to open it. Status and stage strip are derived — they can't lie."}
          </p>
          <div className="ml-auto shrink-0 pb-2"><NewPrototype /></div>
        </div>
        {view === "board" ? <ProgramBoard cards={cards} archivedCount={archivedCount} /> : <PrototypeTable cards={cards} />}
      </div>
    </>
  );
}
