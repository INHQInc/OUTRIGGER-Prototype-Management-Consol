import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getContentStore } from "@/lib/content/store";
import { resolvePrototypeOrg } from "@/lib/prototypes/org";
import { getPrototypeSetup } from "@/lib/prototypes/setup";
import { resolveRepoSource } from "@/lib/prototypes/source";
import { listPromotions } from "@/lib/promotions";
import { injectionPasses } from "@/lib/prototypes/types";
import { PrototypeSetup } from "@/components/PrototypeSetup";

export const dynamic = "force-dynamic";

function agoShort(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Overview tab — the checklist ladder to local dev + status across the three
 *  modes (Local Dev / Live Page / Experiment). Brief lives on its own tab. */
export default async function PrototypeOverviewPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const store = await getContentStore();
  const p = await store.getPrototype(key);
  if (!p) notFound();
  const orgId = await resolvePrototypeOrg(p);

  const [setup, hdrs, source, provisionFlag, promotions, claudeSeen] = await Promise.all([
    getPrototypeSetup(p, orgId),
    headers(),
    resolveRepoSource(key).catch(() => null),
    store.getFlag(`provision:${key}`).catch(() => null),
    listPromotions(key),
    store.getFlag(`claude:seen:${key}`).catch(() => null),
  ]);
  const consoleUrl = `https://${hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "outrigger-prototype-management-cons.vercel.app"}`;

  // Live Page status: how many target pages have a PASSING injection verification (persisted).
  const verifiedPages = p.targets.filter(injectionPasses).length;
  const loaderVerified = p.targets.length > 0 && verifiedPages === p.targets.length;

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
      claudeStatus={{ seen: Boolean(claudeSeen), text: claudeSeen ? `Engaged · ${agoShort(claudeSeen)}` : "Not started" }}
    />
  );
}
