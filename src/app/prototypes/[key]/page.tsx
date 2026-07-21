import { notFound } from "next/navigation";
import { getContentStore } from "@/lib/content/store";
import { listArtifactVersions } from "@/lib/prototypes/versions";
import { listEnvironments } from "@/lib/environments";
import { listPromotions } from "@/lib/promotions";
import { ArtifactVersions } from "@/components/ArtifactVersions";
import { SourcePanel } from "@/components/SourcePanel";
import { PreviewPanel } from "@/components/PreviewPanel";
import { PromotePanel } from "@/components/PromotePanel";
import { PipelineHeader } from "@/components/PipelineHeader";
import { normalizeStage } from "@/lib/prototypes/types";

export const dynamic = "force-dynamic";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-2 px-1 pt-1">{children}</div>;
}

/** First target's path, for building the preview URL (patterns collapsed). */
function toPath(url?: string): string {
  if (!url) return "/";
  try { return new URL(url).pathname.replace(/\/\*+$/, "") || "/"; }
  catch { return url.replace(/\*+$/, "") || "/"; }
}

/** Pipeline tab — the work: Build → Review → Promote. (Access guarded in the layout.) */
export default async function PrototypePipeline({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const store = await getContentStore();
  const p = await store.getPrototype(key);
  if (!p) notFound();
  const [versions, environments, promotions] = await Promise.all([
    listArtifactVersions(key),
    listEnvironments(p.siteKey),
    listPromotions(key),
  ]);

  return (
    <div className="space-y-5 max-w-2xl">
      <PipelineHeader prototypeKey={key} initialStage={normalizeStage(p.status)} />

      <section className="space-y-2.5">
        <SectionLabel>Build</SectionLabel>
        <SourcePanel prototypeKey={key} />
        <ArtifactVersions versions={versions} />
      </section>

      <section className="space-y-2.5">
        <SectionLabel>Review</SectionLabel>
        <PreviewPanel prototypeKey={key} environments={environments} previewPath={toPath(p.targets[0]?.url)} />
      </section>

      <section className="space-y-2.5">
        <SectionLabel>Promote</SectionLabel>
        <PromotePanel prototypeKey={key} environments={environments} versions={versions} initialPromotions={promotions} canPromote />
      </section>
    </div>
  );
}
