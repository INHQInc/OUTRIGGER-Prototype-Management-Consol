import Link from "next/link";
import { Badge, EmptyState } from "@/components/ui";
import type { FeatureStatus, FeatureManifest } from "@/lib/features/types";

export const STATUS_TONE: Record<FeatureStatus, "neutral" | "accent" | "warn" | "ok"> = {
  draft: "neutral",
  "demo-ready": "accent",
  experimenting: "warn",
  "handed-off": "ok",
};
export const STATUS_ORDER: FeatureStatus[] = ["draft", "demo-ready", "experimenting", "handed-off"];

export function pagePath(slug: string): string {
  return slug === "home" ? "/" : "/" + slug.replace(/__/g, "/");
}

export function groupByPage(features: FeatureManifest[]): Map<string, FeatureManifest[]> {
  const m = new Map<string, FeatureManifest[]>();
  for (const f of features) {
    const k = f.targets[0]?.slug ?? "_none";
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(f);
  }
  return m;
}

export function StatusSummary({ features }: { features: FeatureManifest[] }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {STATUS_ORDER.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5 text-[11px] text-muted-2">
          <Badge tone={STATUS_TONE[s]}>{s}</Badge>
          <span className="tabular-nums">{features.filter((f) => f.status === s).length}</span>
        </span>
      ))}
    </div>
  );
}

export function FeatureCard({ f }: { f: FeatureManifest }) {
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

/** One site's prototypes, grouped by their target page. */
export function PagePrototypeGroups({ siteKey, features }: { siteKey: string; features: FeatureManifest[] }) {
  if (features.length === 0) {
    return <EmptyState title="No prototypes on this site yet." hint="Scaffold one with scripts/new-feature.ts against a captured page." />;
  }
  const byPage = groupByPage(features);
  return (
    <div className="space-y-5">
      {[...byPage.entries()].map(([slug, pageFeatures]) => (
        <div key={slug}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-mono text-muted-2">{slug === "_none" ? "no target" : pagePath(slug)}</span>
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
  );
}
