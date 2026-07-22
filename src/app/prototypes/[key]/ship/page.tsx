import { notFound } from "next/navigation";
import { getContentStore } from "@/lib/content/store";
import { listArtifactVersions } from "@/lib/prototypes/versions";
import { listOrgEnvironments } from "@/lib/environments";
import { resolvePrototypeOrg } from "@/lib/prototypes/org";
import { listPromotions } from "@/lib/promotions";
import { SourcePanel } from "@/components/SourcePanel";
import { PromotePanel } from "@/components/PromotePanel";

export const dynamic = "force-dynamic";

/** Ship tab — the back half of the lifecycle: freeze a version → release it. */
export default async function PrototypeShip({ params }: { params: Promise<{ key: string }> }) {
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
    <div className="space-y-4 max-w-2xl">
      <SourcePanel prototypeKey={key} versions={versions} />
      <PromotePanel prototypeKey={key} environments={environments} versions={versions} initialPromotions={promotions} canPromote />
      <div className="rounded-xl border border-border bg-surface px-4 py-3 text-[12px] text-muted-2">
        <span className="font-semibold text-muted">Handoff to source</span> — generate a PR that integrates the winning prototype into the site&apos;s production code. Coming soon.
      </div>
    </div>
  );
}
