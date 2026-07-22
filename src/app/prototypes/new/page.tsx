import { redirect } from "next/navigation";
import { getActiveOrgId } from "@/lib/active-org";
import { listActiveOrgEnvironments } from "@/lib/environments";
import { PageHeader } from "@/components/ui";
import { PrototypeWizard } from "@/components/PrototypeWizard";

export const dynamic = "force-dynamic";

/** New-prototype wizard — captures the critical-path inputs Claude needs. */
export default async function NewPrototypePage() {
  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/prototypes");
  const envUrls = (await listActiveOrgEnvironments()).map((e) => e.url);
  return (
    <>
      <PageHeader title="New prototype" subtitle="Capture what Claude needs to start building" />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <PrototypeWizard envUrls={envUrls} />
      </div>
    </>
  );
}
