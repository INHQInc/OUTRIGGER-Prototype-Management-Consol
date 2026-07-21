import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getContentStore } from "@/lib/content/store";
import { resolvePrototypeOrg } from "@/lib/prototypes/org";
import { getPrototypeSetup } from "@/lib/prototypes/setup";
import { resolveRepoSource } from "@/lib/prototypes/source";
import { PrototypeSetup } from "@/components/PrototypeSetup";

export const dynamic = "force-dynamic";

/** Setup tab (default) — the prototype's own readiness checklist, build brief,
 *  and the generated local-build commands once it's wired. */
export default async function PrototypeSetupPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const store = await getContentStore();
  const p = await store.getPrototype(key);
  if (!p) notFound();
  const orgId = await resolvePrototypeOrg(p);

  const [setup, hdrs, source] = await Promise.all([
    getPrototypeSetup(p, orgId),
    headers(),
    resolveRepoSource(key).catch(() => null),
  ]);
  const consoleUrl = `https://${hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "outrigger-prototype-management-cons.vercel.app"}`;

  return (
    <PrototypeSetup
      prototypeKey={key}
      steps={setup.steps}
      ready={setup.ready}
      repo={setup.repo}
      brief={p.brief}
      consoleUrl={consoleUrl}
      buildStatus={{ found: source ? source.found : null, headSha: source?.headSha, bytes: source?.variationJs ? Buffer.byteLength(source.variationJs, "utf8") : undefined, branchExists: source?.branchExists }}
    />
  );
}
