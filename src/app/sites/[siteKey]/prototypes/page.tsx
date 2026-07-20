import { listFeatures } from "@/lib/features/registry";
import { PagePrototypeGroups, StatusSummary } from "@/components/PrototypeGroups";

export const dynamic = "force-dynamic";

export default async function SitePrototypes({ params }: { params: Promise<{ siteKey: string }> }) {
  const { siteKey } = await params;
  const all = await listFeatures();
  const features = all.filter((f) => f.targets[0]?.siteKey === siteKey);

  return (
    <div className="space-y-5">
      {features.length > 0 && <StatusSummary features={features} />}
      <PagePrototypeGroups siteKey={siteKey} features={features} />
    </div>
  );
}
