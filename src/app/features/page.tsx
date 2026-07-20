import Link from "next/link";
import { listFeatures } from "@/lib/features/registry";
import { getAllSites } from "@/lib/sites";
import { PageHeader, Badge, EmptyState, LinkButton } from "@/components/ui";
import type { FeatureStatus, FeatureManifest } from "@/lib/features/types";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<FeatureStatus, "neutral" | "accent" | "warn" | "ok"> = {
  draft: "neutral",
  "demo-ready": "accent",
  experimenting: "warn",
  "handed-off": "ok",
};
const STATUS_ORDER: FeatureStatus[] = ["draft", "demo-ready", "experimenting", "handed-off"];

function pagePath(slug: string): string {
  return slug === "home" ? "/" : "/" + slug.replace(/__/g, "/");
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(it);
  }
  return m;
}

function FeatureCard({ f }: { f: FeatureManifest }) {
  return (
    <Link
      href={`/features/${f.key}`}
      className="rounded-xl border border-border bg-surface p-4 hover:border-border-strong transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold truncate">{f.name}</div>
          <div className="text-[11px] text-muted-2 mt-0.5 font-mono truncate">{f.key}</div>
        </div>
        <Badge tone={STATUS_TONE[f.status]}>{f.status}</Badge>
      </div>
      {f.description && <p className="text-[12px] text-muted mt-2.5 leading-relaxed line-clamp-2">{f.description}</p>}
      <div className="flex items-center gap-3 mt-3 text-[11px] text-muted-2">
        <span>{f.injections.length} injection{f.injections.length === 1 ? "" : "s"}</span>
        {f.liveUrls?.length ? <span>· {f.liveUrls.length} live URL{f.liveUrls.length === 1 ? "" : "s"}</span> : null}
      </div>
    </Link>
  );
}

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

  const bySite = groupBy(features, (f) => f.targets[0]?.siteKey ?? "_none");
  const statusCounts = STATUS_ORDER.map((s) => ({ s, n: features.filter((f) => f.status === s).length }));

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
            {/* Status summary */}
            <div className="flex items-center gap-2 flex-wrap">
              {statusCounts.map(({ s, n }) => (
                <span key={s} className="inline-flex items-center gap-1.5 text-[11px] text-muted-2">
                  <Badge tone={STATUS_TONE[s]}>{s}</Badge>
                  <span className="tabular-nums">{n}</span>
                </span>
              ))}
            </div>

            {/* Site → Page → prototypes */}
            {siteOrder.map((siteKey) => {
              const siteFeatures = bySite.get(siteKey) ?? [];
              const label = sites[siteKey]?.label ?? (siteKey === "_none" ? "Unassigned" : siteKey);
              const byPage = groupBy(siteFeatures, (f) => f.targets[0]?.slug ?? "_none");
              return (
                <section key={siteKey}>
                  <div className="flex items-center gap-2 mb-3">
                    <h2 className="text-[13px] font-semibold">{label}</h2>
                    <span className="text-[11px] text-muted-2">
                      {siteFeatures.length} prototype{siteFeatures.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="space-y-5">
                    {[...byPage.entries()].map(([slug, pageFeatures]) => (
                      <div key={slug}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[11px] font-mono text-muted-2">
                            {slug === "_none" ? "no target" : pagePath(slug)}
                          </span>
                          {slug !== "_none" && (
                            <Link href={`/pages/${siteKey}/${slug}`} className="text-[11px] text-accent hover:text-accent-hover">
                              open page →
                            </Link>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {pageFeatures.map((f) => <FeatureCard key={f.key} f={f} />)}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </>
        )}
      </div>
    </>
  );
}
