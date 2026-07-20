import Link from "next/link";
import { listFeatures } from "@/lib/features/registry";
import { getContentStore } from "@/lib/content/store";
import { getSite } from "@/lib/sites";
import { PagePrototypeGroups, STATUS_TONE } from "@/components/PrototypeGroups";
import { NewPrototype } from "@/components/NewPrototype";
import { Badge, EmptyState } from "@/components/ui";
import type { PrototypeRecord } from "@/lib/prototypes/types";

export const dynamic = "force-dynamic";

function ProtoCard({ siteKey, p }: { siteKey: string; p: PrototypeRecord }) {
  return (
    <Link href={`/sites/${siteKey}/prototypes/${p.key}`} className="rounded-xl border border-border bg-surface p-4 hover:border-border-strong transition-colors block">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold truncate">{p.name}</div>
          {p.targets[0] && <div className="text-[11px] text-muted-2 mt-0.5 font-mono truncate">{p.targets[0].url} · {p.targets[0].source}</div>}
        </div>
        <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
      </div>
      {p.hypothesis.outcome && (
        <p className="text-[12px] text-muted mt-2.5 leading-relaxed line-clamp-2">
          {p.hypothesis.change ? `${p.hypothesis.change} → ` : ""}{p.hypothesis.outcome}
        </p>
      )}
      <div className="flex items-center gap-3 mt-3 text-[11px] text-muted-2">
        {p.metrics.primary && <span>metric: {p.metrics.primary}</span>}
        {p.owner && <span>· {p.owner}</span>}
      </div>
    </Link>
  );
}

export default async function SitePrototypes({ params }: { params: Promise<{ siteKey: string }> }) {
  const { siteKey } = await params;
  const store = await getContentStore();
  const [protos, features, site] = await Promise.all([store.listPrototypes(siteKey), listFeatures(), getSite(siteKey)]);
  const siteFeatures = features.filter((f) => f.targets[0]?.siteKey === siteKey);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-[12px] text-muted-2">
          {protos.length} prototype{protos.length === 1 ? "" : "s"} · {site?.mode === "live" ? "live site" : "clone site"}
        </div>
        <NewPrototype siteKey={siteKey} defaultSource={site?.mode ?? "clone"} />
      </div>

      {protos.length === 0 && siteFeatures.length === 0 ? (
        <EmptyState title="No prototypes yet." hint="Click “New prototype” to define one — brief, hypothesis, and target." />
      ) : (
        <>
          {protos.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {protos.map((p) => <ProtoCard key={p.key} siteKey={siteKey} p={p} />)}
            </div>
          )}

          {siteFeatures.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2 mb-2">Code overlays</div>
              <PagePrototypeGroups siteKey={siteKey} features={siteFeatures} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
