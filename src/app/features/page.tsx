import Link from "next/link";
import { listFeatures } from "@/lib/features/registry";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import type { FeatureStatus } from "@/lib/features/types";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<FeatureStatus, "neutral" | "accent" | "warn" | "ok"> = {
  draft: "neutral",
  "demo-ready": "accent",
  experimenting: "warn",
  "handed-off": "ok",
};

export default async function FeaturesPage() {
  const features = await listFeatures();

  return (
    <>
      <PageHeader title="Features" subtitle="Overlay prototypes built on captured pages" />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {features.length === 0 ? (
          <EmptyState title="No features yet." hint="Features live in features/<key>/ as overlay files (manifest + css/js/fragments)." />
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {features.map((f) => (
              <Link
                key={f.key}
                href={`/features/${f.key}`}
                className="rounded-xl border border-border bg-surface p-5 hover:border-border-strong transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[14px] font-semibold">{f.name}</div>
                    <div className="text-[12px] text-muted-2 mt-0.5 font-mono">{f.key}</div>
                  </div>
                  <Badge tone={STATUS_TONE[f.status]}>{f.status}</Badge>
                </div>
                {f.description && (
                  <p className="text-[12px] text-muted mt-3 leading-relaxed line-clamp-2">{f.description}</p>
                )}
                <div className="flex items-center gap-4 mt-4 text-[11px] text-muted-2">
                  <span>{f.injections.length} injection{f.injections.length === 1 ? "" : "s"}</span>
                  <span>{f.targets.length} target{f.targets.length === 1 ? "" : "s"}</span>
                  {f.liveUrls?.length ? <span>{f.liveUrls.length} live URL{f.liveUrls.length === 1 ? "" : "s"}</span> : null}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
