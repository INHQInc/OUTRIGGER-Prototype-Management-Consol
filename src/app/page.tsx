import Link from "next/link";
import { getActiveOrgId } from "@/lib/active-org";
import { getOrg } from "@/lib/orgs";
import { getAllSites } from "@/lib/sites";
import { getContentStore } from "@/lib/content/store";
import { listPromotions, currentByEnvironment } from "@/lib/promotions";
import { getGitConnectionStatus } from "@/lib/git/connection";
import { getExperimentationConfig } from "@/lib/experimentation";
import { listOrgRepos } from "@/lib/git/org-repos";
import { listAuditEvents } from "@/lib/audit";
import { PageHeader, EmptyState, Badge, TimeAgo } from "@/components/ui";
import { PrototypeCard } from "@/components/PrototypeCard";
import { SetupChecklist, type SetupStep } from "@/components/SetupChecklist";
import { NewPrototype } from "@/components/NewPrototype";
import { PROTOTYPE_STAGES, STAGE_LABEL, STAGE_TONE, normalizeStage, type PrototypeStage } from "@/lib/prototypes/types";
import type { Promotion } from "@/lib/promotions/types";

export const dynamic = "force-dynamic";

interface Attention { text: string; href: string; action: string }

/** Dashboard — the default landing: blockers, pipeline, what's live, activity. */
export default async function Dashboard() {
  const orgId = await getActiveOrgId();
  if (!orgId) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <EmptyState title="No customer selected." hint="Pick or create a customer at the top of the sidebar." />
        </div>
      </>
    );
  }

  const store = await getContentStore();
  const [org, sitesMap, gitStatus, expCfg, orgRepos, events] = await Promise.all([
    getOrg(orgId),
    getAllSites(),
    getGitConnectionStatus(orgId),
    getExperimentationConfig(orgId),
    listOrgRepos(orgId),
    listAuditEvents(orgId, 8),
  ]);
  const sites = Object.values(sitesMap);
  const siteKeys = new Set(Object.keys(sitesMap));
  const loaderMarked = Boolean(await store.getFlag(`setup:loader:${orgId}`));
  // Auto-verified the moment any of the customer's environments beacons in.
  const loaderSeenAt = (await Promise.all(Object.keys(sitesMap).map((k) => store.getFlag(`loader:seen:${k}`))))
    .filter(Boolean).sort().pop() ?? null;
  const loaderDone = loaderMarked || Boolean(loaderSeenAt);
  const protos = (await store.listPrototypes())
    .filter((p) => siteKeys.has(p.siteKey))
    .map((p) => ({ ...p, siteLabel: sitesMap[p.siteKey]?.label ?? p.siteKey }));
  const promosByProto = await Promise.all(protos.map((p) => listPromotions(p.key)));

  // ── Setup checklist (sequenced; owns the top of the page until complete) ──
  const firstSiteKey = Object.keys(sitesMap)[0];
  const steps: SetupStep[] = [
    { label: "Add the customer's website", done: sites.length > 0, href: "/sites", action: "Add a site" },
    { label: "Connect GitHub", done: Boolean(gitStatus.connected || gitStatus.envFallback), href: "/settings/repositories", action: "Connect" },
    { label: "Register the prototype repo", done: orgRepos.some((r) => r.roles.includes("prototypes")), href: "/settings/repositories", action: "Register" },
    { label: "Connect Optimizely & pick the default project", done: Boolean(expCfg?.optimizely?.apiToken && expCfg.optimizely.defaultProjectId), href: "/settings/experimentation", action: "Connect" },
    {
      label: "Install the loader tag on the environment",
      done: loaderDone,
      href: firstSiteKey ? `/sites/${firstSiteKey}/settings` : "/sites",
      action: "Get the tag",
      manualKey: "loader",
      disabled: sites.length === 0,
      hint: "One script tag in the CMS — inert without a review token. It self-verifies: open the site once after installing and this checks itself.",
    },
  ];
  const setupComplete = steps.every((st) => st.done);

  // ── Needs attention: OPERATIONAL alerts only (setup lives in the checklist) ──
  const attention: Attention[] = [];
  protos.forEach((p, i) => {
    const latest = promosByProto[i][0];
    if (latest?.status === "failed") attention.push({ text: `Promotion failed: ${p.name} → ${latest.environmentLabel}.`, href: `/prototypes/${p.key}`, action: "Open prototype" });
  });

  // ── Pipeline counts ──
  const counts = new Map<PrototypeStage, number>();
  for (const p of protos) counts.set(normalizeStage(p.status), (counts.get(normalizeStage(p.status)) ?? 0) + 1);

  // ── Active prototypes (in flight) ──
  const active = protos
    .filter((p) => ["draft", "review", "live"].includes(normalizeStage(p.status)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6);

  // ── Live on environments (active promotions across all prototypes) ──
  const liveByEnv = new Map<string, { label: string; kind: string; items: { name: string; key: string; promo: Promotion }[] }>();
  protos.forEach((p, i) => {
    for (const promo of Object.values(currentByEnvironment(promosByProto[i]))) {
      const entry = liveByEnv.get(promo.environmentId) ?? { label: promo.environmentLabel, kind: promo.environmentKind, items: [] };
      entry.items.push({ name: p.name, key: p.key, promo });
      liveByEnv.set(promo.environmentId, entry);
    }
  });
  const liveEnvs = [...liveByEnv.values()].sort((a, b) => (a.kind === "production" ? -1 : 0) - (b.kind === "production" ? -1 : 0));

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={org?.name ?? orgId}
        actions={sites.length > 0 ? <NewPrototype sites={sites.map((s) => ({ key: s.siteKey, label: s.label }))} /> : undefined}
      />
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
        {!setupComplete && <SetupChecklist steps={steps} />}

        {/* Needs attention */}
        {attention.length > 0 && (
          <div className="rounded-xl border border-warn/40 bg-[color-mix(in_srgb,var(--warn)_5%,transparent)] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-warn/30 text-[12px] font-semibold">⚠ Needs attention</div>
            {attention.map((a, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-warn/20 last:border-0">
                <span className="text-[13px]">{a.text}</span>
                <Link href={a.href} className="text-[12px] text-accent hover:text-accent-hover font-medium shrink-0">{a.action} →</Link>
              </div>
            ))}
          </div>
        )}

        {/* Pipeline counts */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {PROTOTYPE_STAGES.map((stage) => {
            const n = counts.get(stage) ?? 0;
            return (
              <Link key={stage} href="/prototypes" className={`flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 hover:border-border-strong transition-colors ${n === 0 ? "opacity-50" : ""}`}>
                <Badge tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</Badge>
                <span className="text-[16px] font-semibold tabular-nums">{n}</span>
              </Link>
            );
          })}
        </div>

        <div className="grid grid-cols-[1fr_340px] gap-6 items-start">
          {/* Active prototypes */}
          <section>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[12px] font-semibold">Active prototypes</span>
              <Link href="/prototypes" className="text-[12px] text-accent hover:text-accent-hover">View all →</Link>
            </div>
            {active.length === 0 ? (
              <EmptyState title="Nothing in flight." hint={sites.length ? "Create a prototype to get started." : "Add a website first, then create a prototype."} />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {active.map((p) => <PrototypeCard key={p.key} p={p} siteLabel={sites.length > 1 ? p.siteLabel : undefined} />)}
              </div>
            )}
          </section>

          {/* Right rail */}
          <div className="space-y-5">
            <section className="rounded-xl border border-border bg-surface overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border text-[12px] font-semibold">Live on environments</div>
              {liveEnvs.length === 0 ? (
                <div className="px-4 py-5 text-[12px] text-muted-2">Nothing promoted yet.</div>
              ) : (
                liveEnvs.map((env) => (
                  <div key={env.label} className="border-b border-border last:border-0">
                    <div className="px-4 pt-2.5 pb-1 flex items-center gap-2">
                      <span className="text-[12px] font-medium">{env.label}</span>
                      <Badge tone={env.kind === "production" ? "accent" : "neutral"}>{env.kind}</Badge>
                    </div>
                    {env.items.map(({ name, key, promo }) => (
                      <div key={promo.id} className="px-4 pb-2 flex items-center justify-between gap-2">
                        <Link href={`/prototypes/${key}`} className="text-[12px] text-muted hover:text-accent truncate">{name} <span className="text-muted-2">v{promo.versionNumber}</span></Link>
                        {promo.experimentUrl
                          ? <a href={promo.experimentUrl} target="_blank" rel="noreferrer" className="text-[11px] text-accent hover:text-accent-hover shrink-0">Opti ↗</a>
                          : <span className="text-[11px] text-muted-2 shrink-0">{promo.vehicle}</span>}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </section>

            <section className="rounded-xl border border-border bg-surface overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
                <span className="text-[12px] font-semibold">Recent activity</span>
                <Link href="/settings/activity" className="text-[11px] text-muted-2 hover:text-foreground">All →</Link>
              </div>
              {events.length === 0 ? (
                <div className="px-4 py-5 text-[12px] text-muted-2">No activity yet.</div>
              ) : (
                events.map((e) => (
                  <div key={e.id} className="px-4 py-2 border-b border-border last:border-0">
                    <div className="text-[12px] truncate"><span className="font-mono text-muted-2">{e.action}</span> · {e.target}</div>
                    <div className="text-[10px] text-muted-2"><TimeAgo iso={e.at} /> · {e.actor}</div>
                  </div>
                ))
              )}
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
