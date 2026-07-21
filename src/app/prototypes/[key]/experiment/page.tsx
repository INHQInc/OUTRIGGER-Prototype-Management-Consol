import { notFound } from "next/navigation";
import { getContentStore } from "@/lib/content/store";
import { listArtifactVersions } from "@/lib/prototypes/versions";
import { listOrgEnvironments } from "@/lib/environments";
import { resolvePrototypeOrg } from "@/lib/prototypes/org";
import { listPromotions } from "@/lib/promotions";
import { PromotePanel } from "@/components/PromotePanel";

export const dynamic = "force-dynamic";

/** Experiment tab — promote the frozen version into a paused Optimizely draft. */
export default async function PrototypeExperiment({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const p = await (await getContentStore()).getPrototype(key);
  if (!p) notFound();
  const orgId = await resolvePrototypeOrg(p);
  const [versions, environments, promotions] = await Promise.all([
    listArtifactVersions(key),
    listOrgEnvironments(orgId),
    listPromotions(key),
  ]);
  return (
    <div className="max-w-2xl">
      <PromotePanel prototypeKey={key} environments={environments} versions={versions} initialPromotions={promotions} canPromote />
    </div>
  );
}
