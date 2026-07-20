import Link from "next/link";
import { listPages } from "@/lib/registry";
import { listFeatures } from "@/lib/features/registry";
import { StatusSummary } from "@/components/PrototypeGroups";

export const dynamic = "force-dynamic";

function Stat({ n, label, href }: { n: number; label: string; href: string }) {
  return (
    <Link href={href} className="rounded-xl border border-border bg-surface p-5 hover:border-border-strong transition-colors">
      <div className="text-[24px] font-semibold tabular-nums">{n}</div>
      <div className="text-[12px] text-muted-2 mt-0.5">{label}</div>
    </Link>
  );
}

export default async function SiteOverview({ params }: { params: Promise<{ siteKey: string }> }) {
  const { siteKey } = await params;
  const [pages, allFeatures] = await Promise.all([listPages(siteKey), listFeatures()]);
  const features = allFeatures.filter((f) => f.targets[0]?.siteKey === siteKey);
  const versions = pages.reduce((s, p) => s + p.versionCount, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Stat n={pages.length} label="pages captured" href={`/sites/${siteKey}/pages`} />
        <Stat n={features.length} label="prototypes" href={`/sites/${siteKey}/prototypes`} />
        <Stat n={versions} label="snapshot versions" href={`/sites/${siteKey}/pages`} />
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="text-[13px] font-semibold mb-3">Prototypes by status</div>
        {features.length ? (
          <StatusSummary features={features} />
        ) : (
          <p className="text-[12px] text-muted-2">No prototypes yet on this site.</p>
        )}
      </div>
    </div>
  );
}
