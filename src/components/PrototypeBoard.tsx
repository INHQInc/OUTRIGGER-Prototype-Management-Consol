"use client";

import { PrototypeCard } from "./PrototypeCard";
import { NewPrototype } from "./NewPrototype";
import { EmptyState } from "@/components/ui";
import { PROTOTYPE_STAGES, STAGE_LABEL, normalizeStage, type PrototypeRecord } from "@/lib/prototypes/types";

/** Customer-wide prototype board — grouped by lifecycle stage. */
export function PrototypeBoard({ prototypes }: { prototypes: PrototypeRecord[] }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <NewPrototype />
      </div>

      {prototypes.length === 0 ? (
        <EmptyState title="No prototypes yet." hint="Create one — then build it in the repo with Claude and review it live." />
      ) : (
        <div className="space-y-6">
          {PROTOTYPE_STAGES.map((stage) => {
            const items = prototypes.filter((p) => normalizeStage(p.status) === stage);
            if (!items.length) return null;
            return (
              <section key={stage}>
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="text-[12px] font-semibold">{STAGE_LABEL[stage]}</span>
                  <span className="text-[11px] text-muted-2 tabular-nums">{items.length}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {items.map((p) => <PrototypeCard key={p.key} p={p} />)}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
