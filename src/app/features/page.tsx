import Link from "next/link";
import { listFeatures } from "@/lib/features/registry";
import { getAllSites } from "@/lib/sites";
import { PageHeader, EmptyState, LinkButton } from "@/components/ui";
import { PagePrototypeGroups, StatusSummary } from "@/components/PrototypeGroups";
import type { FeatureManifest } from "@/lib/features/types";

export const dynamic = "force-dynamic";

export default async function FeaturesPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const { site: siteFilter } = await searchParams;
  const [all, sites] = await Promise.all([listFeatures(), getAllSites()]);
  const features = siteFilter ? all.filter((f) => f.targets[0]?.siteKey === siteFilter) : all;

  // Site display order: registry order first, then any orphan siteKeys present on features.
  const present = new Set(features.map((f) => f.targets[0]?.siteKey ?? "_none"));
  const siteOrder = [
    ...Object.keys(sites).filter((k) => present.has(k)),
    ...[...present].filter((k) => !(k in sites)),
  ];

  const bySite = new Map<string, FeatureManifest[]>();
  for (const f of features) {
    const sk = f.targets[0]?.siteKey ?? "_none";
    if (!bySite.has(sk)) bySite.set(sk, []);
    bySite.get(sk)!.push(f);
  }

  const filteredLabel = siteFilter ? sites[siteFilter]?.label ?? siteFilter : null;

  return (
    <>
      <PageHeader
        title={filteredLabel ? `Prototypes · ${filteredLabel}` : "Prototypes"}
        subtitle="Overlay prototypes built on captured pages, grouped by site and page"
        actions={siteFilter ? <LinkButton href="/features">All sites</LinkButton> : undefined}
      />

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8">
        {features.length === 0 ? (
          <EmptyState
            title={filteredLabel ? `No prototypes for ${filteredLabel} yet.` : "No prototypes yet."}
            hint="Scaffold one with scripts/new-feature.ts, or use the sidebar to add a page then build against it."
          />
        ) : (
          <>
            <StatusSummary features={features} />

            {siteOrder.map((siteKey) => {
              const siteFeatures = bySite.get(siteKey) ?? [];
              const known = siteKey in sites;
              const label = known ? sites[siteKey].label : siteKey === "_none" ? "Unassigned" : siteKey;
              return (
                <section key={siteKey}>
                  <div className="flex items-center gap-2 mb-3">
                    {known ? (
                      <Link href={`/sites/${siteKey}`} className="text-[13px] font-semibold hover:text-accent">{label}</Link>
                    ) : (
                      <h2 className="text-[13px] font-semibold">{label}</h2>
                    )}
                    <span className="text-[11px] text-muted-2">
                      {siteFeatures.length} prototype{siteFeatures.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <PagePrototypeGroups siteKey={siteKey} features={siteFeatures} />
                </section>
              );
            })}
          </>
        )}
      </div>
    </>
  );
}
