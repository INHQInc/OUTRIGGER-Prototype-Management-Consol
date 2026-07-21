"use client";

import { useState, type ReactNode } from "react";
import { PrototypeCard } from "./PrototypeCard";
import { NewPrototype } from "./NewPrototype";
import { EmptyState } from "@/components/ui";
import { PROTOTYPE_STAGES, STAGE_LABEL, normalizeStage, type PrototypeRecord } from "@/lib/prototypes/types";

type Row = PrototypeRecord & { siteLabel: string };

/**
 * Brand-wide prototype board — the home / primary workspace. Grouped by
 * lifecycle stage, filterable by site. This is where the operator lives.
 */
export function PrototypeBoard({ prototypes, sites }: { prototypes: Row[]; sites: { key: string; label: string }[] }) {
  const [site, setSite] = useState<string>("all");
  const filtered = site === "all" ? prototypes : prototypes.filter((p) => p.siteKey === site);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Chip active={site === "all"} onClick={() => setSite("all")}>All sites</Chip>
          {sites.map((s) => (
            <Chip key={s.key} active={site === s.key} onClick={() => setSite(s.key)}>{s.label}</Chip>
          ))}
        </div>
        {sites.length > 0 && <NewPrototype sites={sites} defaultSite={site === "all" ? undefined : site} />}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No prototypes yet."
          hint={sites.length ? "Create one — then build it in the repo with Claude and review it live." : "Add a website first (Configuration → Sites)."}
        />
      ) : (
        <div className="space-y-6">
          {PROTOTYPE_STAGES.map((stage) => {
            const items = filtered.filter((p) => normalizeStage(p.status) === stage);
            if (!items.length) return null;
            return (
              <section key={stage}>
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="text-[12px] font-semibold">{STAGE_LABEL[stage]}</span>
                  <span className="text-[11px] text-muted-2 tabular-nums">{items.length}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {items.map((p) => <PrototypeCard key={p.key} p={p} siteLabel={site === "all" ? p.siteLabel : undefined} />)}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-lg text-[12px] border transition-colors ${active ? "border-accent text-accent bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]" : "border-border text-muted hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}
