import Link from "next/link";
import { notFound } from "next/navigation";
import { getContentStore } from "@/lib/content/store";
import { canAccessOrg } from "@/lib/active-org";
import { resolvePrototypeOrg } from "@/lib/prototypes/org";
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
          <Link href={`/prototypes/${key}/settings`} className="text-[12px] text-muted-2 hover:text-foreground ml-auto">Settings</Link>
        </div>

      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">{children}</div>
    </div>
  );
}
