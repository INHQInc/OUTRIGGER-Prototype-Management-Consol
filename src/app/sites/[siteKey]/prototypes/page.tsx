import { getContentStore } from "@/lib/content/store";
import { listFeatures } from "@/lib/features/registry";
import { PagePrototypeGroups } from "@/components/PrototypeGroups";
import { NewPrototype } from "@/components/NewPrototype";
import { PrototypeCard } from "@/components/PrototypeCard";
import { EmptyState } from "@/components/ui";
import { PROTOTYPE_STAGES, STAGE_LABEL, normalizeStage } from "@/lib/prototypes/types";

export const dynamic = "force-dynamic";

export default async function SitePrototypes({ params }: { params: Promise<{ siteKey: string }> }) {
  const { siteKey } = await params;
  const store = await getContentStore();
  const [protos, features] = await Promise.all([store.listPrototypes(siteKey), listFeatures()]);
  const siteFeatures = features.filter((f) => f.targets[0]?.siteKey === siteKey);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-[12px] text-muted-2">{protos.length} prototype{protos.length === 1 ? "" : "s"} on this site</div>
        <NewPrototype siteKey={siteKey} defaultSource="live" />
      </div>

      {protos.length === 0 && siteFeatures.length === 0 ? (
        <EmptyState title="No prototypes yet." hint="Click “New prototype” to define one — target page, hypothesis, and overlay code." />
      ) : (
        <>
          {protos.length > 0 && (
            <div className="space-y-6">
              {PROTOTYPE_STAGES.map((stage) => {
                const items = protos.filter((p) => normalizeStage(p.status) === stage);
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

          {siteFeatures.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2 mb-2">Code overlays (legacy)</div>
              <PagePrototypeGroups siteKey={siteKey} features={siteFeatures} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
