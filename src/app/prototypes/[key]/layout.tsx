import { notFound } from "next/navigation";
import { getContentStore } from "@/lib/content/store";
import { canAccessOrg } from "@/lib/active-org";
import { resolvePrototypeOrg } from "@/lib/prototypes/org";

export const dynamic = "force-dynamic";

/**
 * Tenant guard only. Identity (breadcrumb, name, stage) lives in the page's
 * command rail — the layout stays out of the way so the rail can run full
 * height, flush against the app sidebar.
 */
export default async function PrototypeLayout(props: LayoutProps<"/prototypes/[key]">) {
  const { children } = props;
  const { key } = await props.params;
  const p = await (await getContentStore()).getPrototype(key);
  if (!p) notFound();
  const orgId = await resolvePrototypeOrg(p);
  if (!orgId || !(await canAccessOrg(orgId))) notFound();
  // h-dvh + overflow-hidden BOUND the height chain — without this, the page's
  // three overflow-y-auto columns never engage (the document scrolls instead
  // and the rail scrolls away with it, defeating the persistent-rail design).
  return <div className="h-dvh min-w-0 flex flex-col overflow-hidden">{children}</div>;
}
