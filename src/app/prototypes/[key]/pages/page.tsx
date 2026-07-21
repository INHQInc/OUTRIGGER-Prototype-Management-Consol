import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getContentStore } from "@/lib/content/store";
import { resolvePrototypeOrg } from "@/lib/prototypes/org";
import { listOrgEnvironments, envLoaderSeenAt } from "@/lib/environments";
import { TargetPages } from "@/components/TargetPages";

export const dynamic = "force-dynamic";

/** Pages tab — the URLs this prototype injects on + the loader tag/instructions. */
export default async function PrototypePages({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const p = await (await getContentStore()).getPrototype(key);
  if (!p) notFound();
  const orgId = await resolvePrototypeOrg(p);
  const [environments, hdrs] = await Promise.all([listOrgEnvironments(orgId), headers()]);
  const consoleUrl = `https://${hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "outrigger-prototype-management-cons.vercel.app"}`;
  const envs = await Promise.all(environments.map(async (e) => ({
    id: e.id, label: e.label, kind: e.kind, url: e.url,
    loaderKey: e.siteKey ?? e.id,
    heartbeatAt: await envLoaderSeenAt(e),
  })));

  return <TargetPages prototypeKey={key} initialTargets={p.targets} environments={envs} consoleUrl={consoleUrl} />;
}
