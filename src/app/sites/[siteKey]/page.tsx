import Link from "next/link";
import { listPages } from "@/lib/registry";
import { getContentStore } from "@/lib/content/store";
import { Badge } from "@/components/ui";
import { PROTOTYPE_STAGES, STAGE_LABEL, STAGE_TONE, normalizeStage } from "@/lib/prototypes/types";

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
  const store = await getContentStore();
  const [pages, prototypes] = await Promise.all([listPages(siteKey), store.listPrototypes(siteKey)]);
  const versions = pages.reduce((s, p) => s + p.versionCount, 0);
  const byStage = PROTOTYPE_STAGES
    .map((stage) => ({ stage, n: prototypes.filter((p) => normalizeStage(p.status) === stage).length }))
    .filter((x) => x.n > 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Stat n={prototypes.length} label="prototypes" href={`/sites/${siteKey}/prototypes`} />
        <Stat n={pages.length} label="pages captured" href={`/sites/${siteKey}/pages`} />
        <Stat n={versions} label="snapshot versions" href={`/sites/${siteKey}/pages`} />
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="text-[13px] font-semibold mb-3">Prototypes by stage</div>
        {byStage.length ? (
          <div className="flex flex-wrap items-center gap-3">
            {byStage.map(({ stage, n }) => (
              <span key={stage} className="flex items-center gap-1.5">
                <Badge tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</Badge>
                <span className="text-[12px] text-muted-2 tabular-nums">{n}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-muted-2">No prototypes yet on this site.</p>
        )}
      </div>
    </div>
  );
}
