import Link from "next/link";
import { notFound } from "next/navigation";
import { getContentStore } from "@/lib/content/store";
import { canAccessOrg } from "@/lib/active-org";
import { resolvePrototypeOrg } from "@/lib/prototypes/org";
import { PrototypeTabs } from "@/components/PrototypeTabs";
import { StageSelect } from "@/components/StageSelect";
import { normalizeStage } from "@/lib/prototypes/types";

export const dynamic = "force-dynamic";

export default async function PrototypeLayout(props: LayoutProps<"/prototypes/[key]">) {
  const { children } = props;
  const { key } = await props.params;
  const store = await getContentStore();
  const p = await store.getPrototype(key);
  if (!p) notFound();
  // Tenant isolation via the owning customer.
  const orgId = await resolvePrototypeOrg(p);
  if (!orgId || !(await canAccessOrg(orgId))) notFound();
  const stage = normalizeStage(p.status);

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="px-8 pt-5 pb-0">
        <div className="text-[11px] text-muted-2 mb-1">
          <Link href="/prototypes" className="hover:text-foreground">Prototypes</Link>
          <span className="mx-1.5">›</span>
          <span className="text-muted">{p.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-[18px] font-semibold tracking-tight">{p.name}</h1>
          <StageSelect prototypeKey={key} initialStage={stage} />
        </div>
        {p.targets[0] && (
          <div className="text-[12px] text-muted-2 mt-0.5">
            targets <a href={p.targets[0].url} target="_blank" rel="noreferrer" className="font-mono text-muted hover:text-accent">{p.targets[0].url}</a>
            {p.targets.length > 1 && <span> +{p.targets.length - 1}</span>}
          </div>
        )}
        <div className="mt-4"><PrototypeTabs prototypeKey={key} /></div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">{children}</div>
    </div>
  );
}
