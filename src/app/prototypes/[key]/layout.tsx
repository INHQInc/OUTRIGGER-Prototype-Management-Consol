import Link from "next/link";
import { notFound } from "next/navigation";
import { getContentStore } from "@/lib/content/store";
import { getSite } from "@/lib/sites";
import { canAccessOrg } from "@/lib/active-org";
import { Badge } from "@/components/ui";
import { PrototypeTabs } from "@/components/PrototypeTabs";
import { STAGE_TONE, STAGE_LABEL, normalizeStage } from "@/lib/prototypes/types";

export const dynamic = "force-dynamic";

export default async function PrototypeLayout(props: LayoutProps<"/prototypes/[key]">) {
  const { children } = props;
  const { key } = await props.params;
  const store = await getContentStore();
  const p = await store.getPrototype(key);
  if (!p) notFound();
  const site = await getSite(p.siteKey);
  // Tenant isolation via the owning site's org.
  if (site?.orgId && !(await canAccessOrg(site.orgId))) notFound();
  const stage = normalizeStage(p.status);

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="px-8 pt-5 pb-0">
        <div className="text-[11px] text-muted-2 mb-1">
          <Link href="/" className="hover:text-foreground">Prototypes</Link>
          <span className="mx-1.5">›</span>
          <span className="text-muted">{p.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-[18px] font-semibold tracking-tight">{p.name}</h1>
          <Badge tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</Badge>
        </div>
        {site && (
          <div className="text-[12px] text-muted-2 mt-0.5">
            on <Link href={`/sites/${site.siteKey}`} className="text-muted hover:text-accent">{site.label}</Link>
            {p.targets[0] && <span className="font-mono"> · {p.targets[0].url}</span>}
          </div>
        )}
        <div className="mt-4"><PrototypeTabs prototypeKey={key} /></div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">{children}</div>
    </div>
  );
}
