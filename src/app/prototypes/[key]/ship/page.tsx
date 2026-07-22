import { notFound } from "next/navigation";
import { getContentStore } from "@/lib/content/store";
import { listArtifactVersions } from "@/lib/prototypes/versions";
import { listOrgEnvironments } from "@/lib/environments";
import { resolvePrototypeOrg } from "@/lib/prototypes/org";
import { listPromotions } from "@/lib/promotions";
import { SourcePanel } from "@/components/SourcePanel";
import { PromotePanel } from "@/components/PromotePanel";
import { OptimizelyBundle } from "@/components/OptimizelyBundle";
import { HandoffPanel } from "@/components/HandoffPanel";
import { injectionPasses } from "@/lib/prototypes/types";

export const dynamic = "force-dynamic";

/** Ship tab — the back half of the lifecycle: freeze a version → release it. */
export default async function PrototypeShip({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const p = await (await getContentStore()).getPrototype(key);
  if (!p) notFound();
  const orgId = await resolvePrototypeOrg(p);
  const store = await getContentStore();
  const [versions, environments, promotions, handoffFlag] = await Promise.all([
    listArtifactVersions(key),
    listOrgEnvironments(orgId),
    listPromotions(key),
    store.getFlag(`handoff:${key}`).catch(() => null),
  ]);
  let handoff: { prLink?: string; at: string; by?: string } | null = null;
  if (handoffFlag) { try { handoff = JSON.parse(handoffFlag); } catch { handoff = null; } }
  const unverifiedPages = p.targets.filter((t) => !injectionPasses(t)).map((t) => t.url);
  const injectionReady = p.targets.length > 0 && unverifiedPages.length === 0;
  return (
    <div className="space-y-4 max-w-2xl">
      {unverifiedPages.length > 0 && (
        <div className="rounded-xl border border-warn/40 bg-[color-mix(in_srgb,var(--warn)_5%,transparent)] px-4 py-3 text-[12px] text-foreground">
          {unverifiedPages.length} target page{unverifiedPages.length === 1 ? "" : "s"} not yet verified on real prep. You can still cut a version (it just freezes the code), but <b>Send to Optimizely</b> is blocked until every page is verified. <a href={`/prototypes/${key}/pages`} className="text-accent hover:text-accent-hover font-medium">Verify on Pages →</a>
        </div>
      )}
      <SourcePanel prototypeKey={key} versions={versions} />
      <OptimizelyBundle prototypeKey={key} name={p.name} metric={p.metrics.primary} targetUrls={p.targets.map((t) => t.url)} version={versions[0]?.version} variationJs={versions[0]?.variationJs} />
      <details className="rounded-xl border border-border bg-surface overflow-hidden">
        <summary className="px-4 py-2.5 text-[12px] text-muted-2 cursor-pointer hover:text-foreground">Or: send to Optimizely automatically via the API (advanced)</summary>
        <div className="p-4 border-t border-border">
          <PromotePanel prototypeKey={key} environments={environments} versions={versions} initialPromotions={promotions} canPromote injectionReady={injectionReady} unverifiedPages={unverifiedPages} />
        </div>
      </details>
      <HandoffPanel prototypeKey={key} repoFullName={p.repo?.fullName} latestVersion={versions[0]?.version} handoff={handoff} />
    </div>
  );
}
