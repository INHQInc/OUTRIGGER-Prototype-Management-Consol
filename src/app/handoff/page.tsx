import Link from "next/link";
import { listFeatures } from "@/lib/features/registry";
import { repoAvailable } from "@/lib/handoff/resolve";
import { PageHeader, Badge, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HandoffPage() {
  const [features, repo] = await Promise.all([listFeatures(), repoAvailable()]);

  return (
    <>
      <PageHeader
        title="Handoff"
        subtitle="Map a prototype's HTML/CSS/JS onto Outrigger's Optimizely CMS source"
        actions={repo ? <Badge tone="ok">source connected</Badge> : <Badge tone="danger">source not found</Badge>}
      />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {!repo && (
          <div className="mb-4 rounded-lg border border-danger/40 bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] px-4 py-3 text-[12px] text-muted">
            Read-only source clone not found at <span className="font-mono">~/Projects/Outrigger_Website</span> — resolution will be low-confidence.
          </div>
        )}
        {features.length === 0 ? (
          <EmptyState title="No features to hand off yet." hint="Build a prototype under Features first." />
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {features.map((f) => (
              <Link key={f.key} href={`/handoff/${f.key}`} className="rounded-xl border border-border bg-surface p-5 hover:border-border-strong transition-colors">
                <div className="text-[14px] font-semibold">{f.name}</div>
                <div className="text-[12px] text-muted-2 mt-0.5 font-mono">{f.key}</div>
                <p className="text-[12px] text-muted mt-3 leading-relaxed line-clamp-2">{f.description}</p>
                <div className="text-[12px] text-accent hover:text-accent-hover font-medium mt-3">Open compare →</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
