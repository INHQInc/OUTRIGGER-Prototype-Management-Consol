import { notFound } from "next/navigation";
import { getContentStore } from "@/lib/content/store";
import { listArtifactVersions } from "@/lib/prototypes/versions";
import { listOrgEnvironments } from "@/lib/environments";
import { resolvePrototypeOrg } from "@/lib/prototypes/org";
import { listPromotions } from "@/lib/promotions";
import { SourcePanel } from "@/components/SourcePanel";
import { PreviewPanel } from "@/components/PreviewPanel";
import { PromotePanel } from "@/components/PromotePanel";

export const dynamic = "force-dynamic";

/** First target's path, for building the preview URL (patterns collapsed). */
function toPath(url?: string): string {
  if (!url) return "/";
  try { return new URL(url).pathname.replace(/\/\*+$/, "") || "/"; }
  catch { return url.replace(/\*+$/, "") || "/"; }
}

/**
 * The loop, three cards: Build (repo status + versions) → Review (token link)
 * → Experiment (send to Optimizely). One next action at a time.
 */
export default async function PrototypePipeline({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const store = await getContentStore();
  const p = await store.getPrototype(key);
  if (!p) notFound();
  const orgId = await resolvePrototypeOrg(p);
  const [versions, environments, promotions] = await Promise.all([
    listArtifactVersions(key),
    listOrgEnvironments(orgId),
    listPromotions(key),
  ]);

  return (
    <div className="space-y-4 max-w-2xl">
      <SourcePanel prototypeKey={key} versions={versions} />
      <PreviewPanel prototypeKey={key} environments={environments} previewPath={toPath(p.targets[0]?.url)} />
      <PromotePanel prototypeKey={key} environments={environments} versions={versions} initialPromotions={promotions} canPromote />
    </div>
  );
}
