import Link from "next/link";
import { notFound } from "next/navigation";
import { getSite } from "@/lib/sites";
import { getContentStore } from "@/lib/content/store";
import { listEnvironments } from "@/lib/environments";
import { listPromotions, currentByEnvironment } from "@/lib/promotions";
import { Badge, EmptyState } from "@/components/ui";
import type { PrototypeRecord } from "@/lib/prototypes/types";
import type { Promotion } from "@/lib/promotions/types";

export const dynamic = "force-dynamic";

export default async function SiteDeploys({ params }: { params: Promise<{ siteKey: string }> }) {
  const { siteKey } = await params;
  const site = await getSite(siteKey);
  if (!site) notFound();

  const store = await getContentStore();
  const [environments, prototypes] = await Promise.all([listEnvironments(siteKey), store.listPrototypes(siteKey)]);

  // What's currently live on each environment, across all the site's prototypes.
  const perEnv = new Map<string, { proto: PrototypeRecord; promo: Promotion }[]>();
  await Promise.all(
    prototypes.map(async (p) => {
      const current = currentByEnvironment(await listPromotions(p.key));
      for (const promo of Object.values(current)) {
        const list = perEnv.get(promo.environmentId) ?? [];
        list.push({ proto: p, promo });
        perEnv.set(promo.environmentId, list);
      }
    }),
  );

  if (environments.length === 0) {
    return <EmptyState title="No environments yet." hint="Add environments (staging/production) in Site settings." />;
  }

  return (
    <div className="space-y-5">
      <p className="text-[12px] text-muted-2">What&apos;s currently deployed on each environment for this site — the latest active promotion per prototype.</p>
      {environments.map((env) => {
        const items = perEnv.get(env.id) ?? [];
        return (
          <div key={env.id} className="rounded-xl border border-border bg-surface overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
              <span className="text-[13px] font-semibold">{env.label}</span>
              <Badge tone={env.kind === "production" ? "accent" : "neutral"}>{env.kind}</Badge>
              <a href={env.url} target="_blank" rel="noreferrer" className="text-[11px] font-mono text-muted-2 hover:text-accent ml-auto truncate">{env.url}</a>
            </div>
            {items.length === 0 ? (
              <div className="px-4 py-4 text-[12px] text-muted-2">Nothing deployed here.</div>
            ) : (
              items.map(({ proto, promo }) => (
                <div key={promo.id} className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border last:border-0">
                  <div className="min-w-0">
                    <Link href={`/sites/${siteKey}/prototypes/${proto.key}`} className="text-[13px] font-medium hover:text-accent">{proto.name}</Link>
                    <div className="text-[11px] text-muted-2">v{promo.versionNumber} · {promo.vehicle}{promo.promotedBy ? ` · ${promo.promotedBy}` : ""}</div>
                  </div>
                  {promo.experimentUrl && (
                    <a href={promo.experimentUrl} target="_blank" rel="noreferrer" className="text-[12px] text-accent hover:text-accent-hover shrink-0">Optimizely ↗</a>
                  )}
                </div>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}
