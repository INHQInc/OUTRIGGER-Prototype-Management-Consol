import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getContentStore } from "@/lib/content/store";
import { resolvePrototypeOrg } from "@/lib/prototypes/org";
import { resolvePrototypeRepo } from "@/lib/prototypes/repo";
import { resolveSkillsForPrototype } from "@/lib/skills/skills";
import { ensureSkillsSeeded } from "@/lib/skills/seed";
import { resolveRepoSource } from "@/lib/prototypes/source";
import { listArtifactVersions } from "@/lib/prototypes/versions";
import { listOrgEnvironments, envLoaderSeenAt } from "@/lib/environments";
import { lastPush } from "@/lib/prototypes/ship";
import { getExperimentationConfig, getOptimizelyClientForOrg } from "@/lib/experimentation";
import { listAuditEvents } from "@/lib/audit";
import { derivePipeline, type PipelineStep } from "@/lib/prototypes/pipeline";
import { PipelineHeader } from "@/components/PipelineHeader";
import { PrototypeOverview, type ActivityItem } from "@/components/PrototypeOverview";
import { BriefComposer } from "@/components/BriefComposer";
import { TargetPages } from "@/components/TargetPages";
import { RepoBranchSettings } from "@/components/RepoBranchSettings";
import { InitScript } from "@/components/InitScript";
import { SkillSelector } from "@/components/SkillSelector";
import { SourcePanel } from "@/components/SourcePanel";
import { OptimizelyBundle } from "@/components/OptimizelyBundle";
import { ShipPanel } from "@/components/ShipPanel";
import { HandoffPanel } from "@/components/HandoffPanel";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "brief", label: "Brief", step: "brief" },
  { id: "build", label: "Build", step: "build" },
  { id: "pages", label: "Pages", step: "review" },
  { id: "experiment", label: "Experiment", step: "launch" },
  { id: "handoff", label: "Handoff", step: "shipped" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const DOT: Record<PipelineStep["state"], string> = {
  done: "bg-ok",
  current: "bg-accent",
  todo: "bg-border-strong",
  blocked: "bg-danger",
};

/**
 * The prototype workspace — a living thing, not a list of steps.
 * Status lives ONCE, in the pipeline header. Below it: rooms. Each room owns
 * one part of the prototype (the brief, the build, the pages, the experiment,
 * the handoff); every status element deep-links into the room that fixes it.
 */
export default async function PrototypeWorkspace({ params, searchParams }: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { key } = await params;
  const rawTab = (await searchParams).tab;
  const tab: TabId = (TABS.some((t) => t.id === rawTab) ? rawTab : "overview") as TabId;

  const store = await getContentStore();
  const p = await store.getPrototype(key);
  if (!p) notFound();
  const orgId = await resolvePrototypeOrg(p);
  const repo = await resolvePrototypeRepo(p, orgId);

  const [hdrs, source, provisionFlag, environments, versions, push, expCfg, claudeSeen, handoffRaw, auditEvents] = await Promise.all([
    headers(),
    resolveRepoSource(key).catch(() => null),
    store.getFlag(`provision:${key}`).catch(() => null),
    listOrgEnvironments(orgId),
    listArtifactVersions(key),
    lastPush(key).catch(() => null),
    getExperimentationConfig(orgId ?? "").catch(() => null),
    store.getFlag(`claude:seen:${key}`).catch(() => null),
    store.getFlag(`handoff:${key}`).catch(() => null),
    orgId ? listAuditEvents(orgId, 200).catch(() => []) : Promise.resolve([]),
  ]);
  await ensureSkillsSeeded(orgId);
  const skillRows = await resolveSkillsForPrototype(orgId, key).catch(() => []);

  const consoleUrl = `https://${hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "outrigger-prototype-management-cons.vercel.app"}`;
  const envs = await Promise.all(environments.map(async (e) => ({
    id: e.id, label: e.label, kind: e.kind, url: e.url, loaderKey: e.siteKey ?? e.id, heartbeatAt: await envLoaderSeenAt(e),
  })));
  const buildStatus = {
    found: source ? source.found : null,
    headSha: source?.headSha,
    bytes: source?.variationJs ? Buffer.byteLength(source.variationJs, "utf8") : undefined,
    branchExists: source?.branchExists,
  };

  let experimentStatus: string | null = null;
  if (p.experiment?.experimentId && orgId) {
    try {
      const client = await getOptimizelyClientForOrg(orgId);
      if (client) experimentStatus = (await client.getExperiment(p.experiment.experimentId)).status;
    } catch { /* unreachable → no lock, no status */ }
  }

  const pipeline = derivePipeline({
    proto: p, provisionFlagRaw: provisionFlag, source, versions,
    lastPush: push, claudeSeenAt: claudeSeen, experimentStatus,
  });

  // ── The heartbeat: audit events for THIS prototype + system flags ──
  const activity: ActivityItem[] = [];
  for (const e of auditEvents) {
    if (e.target === p.name || (e.detail ?? "").includes(key)) {
      activity.push({ at: e.at, text: `${labelForAction(e.action)}${e.detail ? ` — ${e.detail}` : ""}`, who: e.actor });
    }
  }
  if (claudeSeen) activity.push({ at: claudeSeen, text: "Claude checked in on the branch" });
  for (const v of versions) activity.push({ at: v.createdAt, text: `v${v.version} cut${v.certification ? (v.certification.passed ? " · certified ✓" : " · certification FAILED") : ""}`, who: v.createdBy });
  if (push) activity.push({ at: push.at, text: `v${push.version} pushed to Optimizely${push.verified ? " · read-back verified ✓" : " · VERIFY FAILED"}` });
  activity.sort((a, b) => b.at.localeCompare(a.at));
  const feed = activity.slice(0, 12);

  const handoff = handoffRaw ? (() => { try { return JSON.parse(handoffRaw); } catch { return null; } })() : null;
  const stepFor = (id?: string) => (id ? pipeline.steps.find((s) => s.id === id) : undefined);

  return (
    <div className="space-y-4 max-w-5xl">
      <PipelineHeader pipeline={pipeline} />

      {/* Rooms — nouns, not steps. The dot on each tab is that room's status. */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {TABS.map((t) => {
          const st = stepFor("step" in t ? t.step : undefined);
          const active = tab === t.id;
          return (
            <Link key={t.id} href={t.id === "overview" ? `/prototypes/${key}` : `/prototypes/${key}?tab=${t.id}`}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-[14px] font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                active ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground"}`}>
              {st && <span className={`w-2 h-2 rounded-full ${DOT[st.state]}`} />}
              {t.label}
            </Link>
          );
        })}
      </div>

      {tab === "overview" && (
        <PrototypeOverview proto={p} pipeline={pipeline} versions={versions} push={push} activity={feed} />
      )}

      {tab === "brief" && (
        <div className="max-w-3xl space-y-3">
          <p className="text-[14px] text-muted-2">What are we building, and how do we know it worked? The brief is the gate — it becomes Claude&apos;s instructions and the experiment&apos;s description.</p>
          <BriefComposer prototypeKey={key} initialBrief={p.brief} initialHypothesis={p.hypothesis} initialMetrics={p.metrics} />
        </div>
      )}

      {tab === "build" && (
        <div className="max-w-3xl space-y-3">
          <p className="text-[14px] text-muted-2">The agent&apos;s room: where the code lives, what Claude wakes up knowing, and the command that starts it. Claude builds in the repo; the console pulls the result.</p>
          <details className={`group rounded-xl border ${repo?.fullName && source?.branchExists ? "border-border bg-surface/40" : "border-warn/40"}`} open={!(repo?.fullName && source?.branchExists)}>
            <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none list-none">
              <span className="text-[14px]">⚙</span>
              <span className="text-[14px] font-semibold">Source control</span>
              <span className="text-[13px] text-muted-2 font-mono truncate">{repo?.fullName ? `${repo.fullName}@${repo.branch}` : "pick the repo + branch"}</span>
              <span className="ml-auto text-[12.5px] text-muted-2 group-open:hidden">open</span>
            </summary>
            <div className="px-4 pb-4"><RepoBranchSettings prototypeKey={key} initialRepo={repo ?? null} /></div>
          </details>
          <SkillSelector prototypeKey={key} initial={skillRows} />
          <InitScript prototypeKey={key} repo={repo} provisioned={Boolean(provisionFlag)} previewUrl={p.targets[0]?.url} buildStatus={buildStatus} briefDone={Boolean(p.brief.change?.trim())} />
        </div>
      )}

      {tab === "pages" && (
        <div className="max-w-3xl space-y-3">
          <p className="text-[14px] text-muted-2">The page(s) this prototype runs on. Install the tag once per site, then verify each page actually injects — review happens on the real environment.</p>
          <TargetPages prototypeKey={key} initialTargets={p.targets} environments={envs} consoleUrl={consoleUrl} />
        </div>
      )}

      {tab === "experiment" && (
        <div className="max-w-3xl space-y-3">
          <p className="text-[14px] text-muted-2">The A/B test, end to end: <b>1</b> cut an immutable version (certification runs automatically) · <b>2</b> bind the experiment once · <b>3</b> push — the API replaces the variation code and verifies the read-back · <b>4</b> start it in Optimizely. A running experiment locks everything.</p>
          <SourcePanel prototypeKey={key} versions={versions} compact />
          <ShipPanel
            prototypeKey={key}
            latestVersion={versions[0] ? { version: versions[0].version, gitSha: versions[0].gitSha, hasCode: Boolean(versions[0].variationJs) } : undefined}
            certification={versions[0]?.certification ?? null}
            initialBinding={p.experiment ?? null}
            initialLastPush={push}
            optiProjectId={expCfg?.optimizely?.defaultProjectId ?? null}
          />
          <details className="group/manual">
            <summary className="text-[13px] text-muted-2 cursor-pointer hover:text-foreground">Manual bundle (fallback — copy/paste instead of the API push)</summary>
            <div className="mt-2">
              <OptimizelyBundle prototypeKey={key} name={p.name} metric={p.metrics.primary} targetUrls={p.targets.map((t) => t.url)} version={versions[0]?.version} variationJs={versions[0]?.variationJs} />
            </div>
          </details>
        </div>
      )}

      {tab === "handoff" && (
        <div className="max-w-3xl space-y-3">
          <p className="text-[14px] text-muted-2">When the experiment wins, the code graduates: the winning variation is handed to the dev team to become real production code — a reviewed change in the site&apos;s own repo, not client-side JavaScript forever.</p>
          <HandoffPanel prototypeKey={key} repoFullName={repo?.fullName} latestVersion={versions[0]?.version} handoff={handoff} />
        </div>
      )}
    </div>
  );
}

function labelForAction(action: string): string {
  const map: Record<string, string> = {
    "prototype.provision": "Branch provisioned",
    "prototype.resync": "Branch re-synced",
    "prototype.update": "Prototype updated",
    "prototype.create": "Prototype created",
    "version.cut": "Version cut",
    "experiment.push": "Pushed to Optimizely",
    "experiment.bind": "Experiment bound",
  };
  return map[action] ?? action;
}
