import { redirect } from "next/navigation";
import { getActiveOrgId } from "@/lib/active-org";
import { listOrgEnvironments } from "@/lib/environments";
import { getActiveSite } from "@/lib/site/active-site";
import { PageHeader } from "@/components/ui";
import { PrototypeWizard } from "@/components/PrototypeWizard";

export const dynamic = "force-dynamic";

/** New-prototype wizard — captures the critical-path inputs Claude needs. */
export default async function NewPrototypePage() {
  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/prototypes");
  const { site } = await getActiveSite(orgId);
  if (!site) redirect("/prototypes"); // shows "No site yet" with Add a site
  const envUrls = (await listOrgEnvironments(orgId)).filter((e) => e.siteId === site.id).map((e) => e.url);
  return (
    <>
      <PageHeader title="New prototype" subtitle={`On ${site.name} — name it and pick the page(s); you'll write the brief next, on the workspace`} />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <PrototypeWizard envUrls={envUrls} siteId={site.id} />
      </div>
    </>
  );
}
