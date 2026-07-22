import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getContentStore } from "@/lib/content/store";
import { resolvePrototypeOrg } from "@/lib/prototypes/org";
import { getPrototypeSetup } from "@/lib/prototypes/setup";
import { resolveRepoSource } from "@/lib/prototypes/source";
import { listOrgEnvironments, envLoaderSeenAt } from "@/lib/environments";
import { listPromotions } from "@/lib/promotions";
import { PrototypeSetup } from "@/components/PrototypeSetup";

export const dynamic = "force-dynamic";

/** Overview tab — the checklist ladder to local dev + status across the three
 *  modes (Local Dev / Live Page / Experiment). Brief lives on its own tab. */
export default async function PrototypeOverviewPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const store = await getContentStore();
  const p = await store.getPrototype(key);
  if (!p) notFound();
  const orgId = await resolvePrototypeOrg(p);

  const [setup, hdrs, source, provisionFlag, environments, promotions] = await Promise.all([
    getPrototypeSetup(p, orgId),
    headers(),
    resolveRepoSource(key).catch(() => null),
    store.getFlag(`provision:${key}`).catch(() => null),
    listOrgEnvironments(orgId),
    listPromotions(key),
  ]);
  const consoleUrl = `https://${hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "outrigger-prototype-management-cons.vercel.app"}`;

  // Live Page status: do this prototype's target pages sit on an environment with a verified loader?
  const seen = new Map(await Promise.all(environments.map(async (e) => [e.id, await envLoaderSeenAt(e)] as const)));
  const targetOrigins = new Set(p.targets.map((t) => { try { return new URL(t.url).origin; } catch { return ""; } }).filter(Boolean));
  const loaderVerified = environments.some((e) => {
    try { return targetOrigins.has(new URL(e.url).origin) && Boolean(seen.get(e.id)); } catch { return false; }
  });

  // Experiment status: any active promotion (paused Optimizely draft).
  const activePromo = promotions.find((pr) => pr.status === "active");

  return (
    <PrototypeSetup
      prototypeKey={key}
      repo={setup.repo}
      hasBrief={Boolean(p.brief.change?.trim())}
      hasPages={p.targets.length > 0}
      consoleUrl={consoleUrl}
      previewUrl={p.targets[0]?.url}
      buildStatus={{ found: source ? source.found : null, headSha: source?.headSha, bytes: source?.variationJs ? Buffer.byteLength(source.variationJs, "utf8") : undefined, branchExists: source?.branchExists }}
      provisioned={Boolean(provisionFlag)}
      liveStatus={{ targetCount: p.targets.length, loaderVerified }}
      expStatus={{ active: Boolean(activePromo), experimentUrl: activePromo?.experimentUrl }}
    />
  );
}
