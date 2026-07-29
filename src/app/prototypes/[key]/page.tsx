import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getContentStore } from "@/lib/content/store";
import { resolvePrototypeOrg } from "@/lib/prototypes/org";
import { resolvePrototypeRepo } from "@/lib/prototypes/repo";
import { resolveRepoSource } from "@/lib/prototypes/source";
import { listArtifactVersions } from "@/lib/prototypes/versions";
import { listOrgEnvironments, envLoaderSeenAt } from "@/lib/environments";
import { lastPush } from "@/lib/prototypes/ship";
import { getExperimentationConfig, getOptimizelyClientForOrg } from "@/lib/experimentation";
import { listAuditEvents } from "@/lib/audit";
import { derivePipeline, stepSeverity, type Pipeline } from "@/lib/prototypes/pipeline";
import { type StepSeverity } from "@/lib/prototypes/severity";
import { isBriefComplete, normalizeStage } from "@/lib/prototypes/types";
import { resolveSkillsForPrototype } from "@/lib/skills/skills";
import { ensureSkillsSeeded } from "@/lib/skills/seed";
import { listRecommendations } from "@/lib/ideas/ideas";
import { currentUser } from "@/lib/auth/current";
import { SEVERITY_DOT, TimeAgo } from "@/components/ui";
import { StageStrip } from "@/components/StageStrip";
import { StageSelect } from "@/components/StageSelect";
import { BriefComposer } from "@/components/BriefComposer";
import { TargetPages } from "@/components/TargetPages";
import { InitScript } from "@/components/InitScript";
import { SkillSelector } from "@/components/SkillSelector";
import { SourcePanel } from "@/components/SourcePanel";
import { OptimizelyBundle } from "@/components/OptimizelyBundle";
import { ShipPanel } from "@/components/ShipPanel";
import { HandoffPanel } from "@/components/HandoffPanel";
import { HandoffExplorer } from "@/components/HandoffExplorer";
import { Recommendations } from "@/components/Recommendations";
import { RepoBranchSettings } from "@/components/RepoBranchSettings";
import { DetailsEditor } from "@/components/DetailsEditor";
import { DeletePrototype } from "@/components/DeletePrototype";

export const dynamic = "force-dynamic";

interface ActivityItem { at: string; text: string; who?: string }

/**
 * The command rail — Optimizely's experiment-detail anatomy with our ground
 * truth: identity + stage chip + stage strip + the one CTA + gate line at the
 * top, then grouped sections where every lifecycle row carries its live
 * severity dot. The rail IS the checklist, visible from every screen; there is
 * no Overview page.
 */
const GROUPS = [
  { label: "Plan", items: [{ id: "brief", label: "Brief", step: "brief" }] },
  { label: "Build", items: [{ id: "agent", label: "Agent", step: "build" }, { id: "skills", label: "Skills" }, { id: "recs", label: "Recommendations" }] },
  { label: "Target", items: [{ id: "pages", label: "Pages", step: "review" }] },
  { label: "Experiment", items: [{ id: "versions", label: "Versions" }, { id: "optimizely", label: "Optimizely", step: "experiment" }] },
  { label: "Handoff", items: [{ id: "explorer", label: "Code explorer" }, { id: "ship", label: "Ship record", step: "handoff" }] },
  { label: "Settings", items: [{ id: "repo", label: "Repo & branch" }, { id: "details", label: "Details" }, { id: "history", label: "History" }] },
] as const;
type TabId = (typeof GROUPS)[number]["items"][number]["id"];
const ALL_TABS: string[] = GROUPS.flatMap((g) => g.items.map((i) => i.id));

/** Old room ids living in links/bookmarks → their new rail rows. */
const TAB_ALIASES: Record<string, TabId> = {
  build: "agent", review: "pages", experiment: "optimizely", handoff: "explorer",
  source: "repo", pages: "pages", recommendations: "recs", settings: "details",
};
/** Pipeline anchors (canonical stage ids) → the rail row that does the work. */
const ANCHOR_TO_TAB: Record<string, TabId> = {
  brief: "brief", build: "agent", review: "pages", experiment: "optimizely", handoff: "explorer",
};

export default async function PrototypeWorkspace({ params, searchParams }: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { key } = await params;
  const rawTab = (await searchParams).tab ?? "";

  const store = await getContentStore();
  const p = await store.getPrototype(key);
  if (!p) notFound();
  const orgId = await resolvePrototypeOrg(p);
  const repo = await resolvePrototypeRepo(p, orgId);

  const [hdrs, source, provisionFlag, environments, versions, push, expCfg, claudeSeen, handoffRaw, auditEvents, recommendations, user] = await Promise.all([
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
    listRecommendations(orgId, key).catch(() => []),
    currentUser().catch(() => null),
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

  // The "experiment" anchor covers TWO rooms now: cutting lives on Versions,
  // binding/pushing on Optimizely. Route cut-shaped states to the room that
  // can actually perform them.
  const latest = versions[0];
  const needsCut = !latest?.variationJs
    || Boolean(source?.headSha && latest.gitSha !== source.headSha)
    || latest.certification?.passed === false;
  const anchorTab = (anchor: string): TabId =>
    anchor === "experiment" && needsCut ? "versions" : (ANCHOR_TO_TAB[anchor] ?? "brief");

  // Resolve the tab: explicit → alias → DEFAULT = wherever the next action is.
  const aliased = TAB_ALIASES[rawTab] ?? rawTab;
  const tab: TabId = (ALL_TABS.includes(aliased) ? aliased : anchorTab(pipeline.primaryAction.anchor)) as TabId;

  // ── Activity: audit events for THIS prototype + system flags ──
  const activity: ActivityItem[] = [];
  for (const e of auditEvents) {
    if (e.target === p.name || (e.detail ?? "").includes(key)) {
      activity.push({ at: e.at, text: `${labelForAction(e.action)}${e.detail ? ` — ${e.detail}` : ""}`, who: e.actor });
    }
  }
  if (claudeSeen) activity.push({ at: claudeSeen, text: "The agent checked in on the branch" });
  for (const v of versions) activity.push({ at: v.createdAt, text: `v${v.version} cut${v.certification ? (v.certification.passed ? " · certified ✓" : " · certification FAILED") : ""}`, who: v.createdBy });
  if (push) activity.push({ at: push.at, text: `v${push.version} pushed to Optimizely${push.verified ? " · read-back verified ✓" : " · VERIFY FAILED"}` });
  activity.sort((a, b) => b.at.localeCompare(a.at));

  const handoff = handoffRaw ? (() => { try { return JSON.parse(handoffRaw); } catch { return null; } })() : null;
  const openRecs = recommendations.filter((r) => r.status === "new" || r.status === "planned").length;

  // Severity per rail row — step-mapped rows use the shared derivation; Versions
  // derives from the latest cut's certification.
  const dotFor = (item: { id: string; step?: string }): StepSeverity | null => {
    if (item.step) {
      const st = pipeline.steps.find((s) => s.id === item.step);
      return st ? stepSeverity(st, pipeline.alerts) : null;
    }
    if (item.id === "versions") {
      const latest = versions[0];
      if (!latest) return "pending";
      return latest.certification ? (latest.certification.passed ? "good" : "critical") : "attention";
    }
    return null;
  };

  const chip = chipClasses(pipeline);
  const ctaTab = anchorTab(pipeline.primaryAction.anchor);
  const gate = pipeline.stage.blocked ? pipeline.stage.status : pipeline.alerts[0]?.text ?? null;

  return (
    <div className="flex-1 min-h-0 grid grid-cols-[16.5rem_minmax(0,1fr)] xl:grid-cols-[16.5rem_minmax(0,1fr)_17.5rem]">

      {/* ── THE COMMAND RAIL ── */}
      <aside className="overflow-y-auto border-r border-border bg-surface px-3.5 py-4">
        <Link href="/prototypes" className="text-[12.5px] text-muted-2 hover:text-foreground">← Prototypes</Link>
        <div className="mt-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-2">Web experiment prototype</div>
        <h1 className="text-[17px] font-bold tracking-tight mt-0.5">{p.name}</h1>
        {p.brief.change?.trim() && <p className="text-[12.5px] text-muted-2 leading-snug mt-1 line-clamp-2">{p.brief.change}</p>}

        {/* Status block — chip · strip · the one CTA · the gate line */}
        <div className="mt-3.5 rounded-xl border border-border bg-background p-3">
          <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-[12.5px] font-semibold ${chip.cls}`}>
            <span className={`w-2 h-2 rounded-full ${chip.dot} ${pipeline.stage.live ? "animate-pulse" : ""}`} />
            {pipeline.stage.blocked ? `Blocked at ${pipeline.stage.label}` : pipeline.stage.live ? `${pipeline.stage.label} · LIVE 🔒` : pipeline.stage.label}
          </span>
          <StageStrip pipeline={pipeline} labels className="mt-2.5" />
          {ctaTab !== tab && (
            <Link href={`?tab=${ctaTab}`} className="block w-full text-center mt-3 rounded-lg bg-accent text-accent-fg text-[13.5px] font-semibold py-2 hover:bg-accent-hover transition-colors">
              {pipeline.primaryAction.label}
            </Link>
          )}
          {gate && <div className="mt-2.5 text-[12px] leading-snug text-warn">⚠ {gate}</div>}
        </div>

        {/* Grouped sections — every lifecycle row carries its live severity dot */}
        {GROUPS.map((g) => (
          <div key={g.label} className="mt-4">
            <div className="px-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-2">{g.label}</div>
            <div className="mt-1 space-y-0.5">
              {g.items.map((item) => {
                const sev = dotFor(item);
                const active = tab === item.id;
                return (
                  <Link key={item.id} href={`?tab=${item.id}`}
                    className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-[13.5px] transition-colors ${
                      active ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-foreground font-semibold" : "text-muted hover:text-foreground hover:bg-surface-2/60 font-medium"}`}>
                    {sev && <span className={`w-2 h-2 rounded-full shrink-0 ${SEVERITY_DOT[sev]}`} />}
                    <span className="truncate">{item.label}</span>
                    {item.id === "recs" && openRecs > 0 && (
                      <span className="ml-auto text-[11px] font-semibold px-1.5 py-0.5 rounded-full text-warn bg-[color-mix(in_srgb,var(--warn)_12%,transparent)]">{openRecs}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </aside>

      {/* ── CONTENT ── */}
      <main className="overflow-y-auto px-6 py-5">
        {tab === "brief" && (
          <Room title="Brief" sub="What are we building, and how do we know it worked? The brief is the gate — it becomes the agent's instructions and the experiment's description.">
            <BriefComposer prototypeKey={key} initialBrief={p.brief} initialHypothesis={p.hypothesis} initialMetrics={p.metrics} buildAvailable={Boolean(buildStatus.found) || versions.some((v) => Boolean(v.variationJs))} />
          </Room>
        )}

        {tab === "agent" && (
          <Room title="Agent" sub="The develop loop: prepare the branch, start the agent, keep it in sync. The agent builds in the repo; the console pulls the result.">
            <InitScript prototypeKey={key} repo={repo} provisioned={Boolean(provisionFlag)} previewUrl={p.targets[0]?.url} buildStatus={buildStatus} briefDone={isBriefComplete(p.brief, p.metrics)} claudeSeenAt={claudeSeen} inSync={pipeline.truth.synced} />
          </Room>
        )}

        {tab === "skills" && (
          <Room title="Skills" sub="What the agent wakes up knowing for this prototype. Changes reach the branch on the next re-sync (Agent).">
            <SkillSelector prototypeKey={key} initial={skillRows} />
          </Room>
        )}

        {tab === "recs" && (
          <Room title="Recommendations" sub="Friction the agent hit building this prototype — sent back instead of lost. Act on them or decline.">
            <Recommendations prototypeKey={key} initial={recommendations} canManage={Boolean(user)} />
          </Room>
        )}

        {tab === "pages" && (
          <Room title="Pages" sub="The page(s) this prototype runs on. Verify each page actually injects — review happens on the real environment, not a mockup.">
            <TargetPages prototypeKey={key} initialTargets={p.targets} environments={envs} consoleUrl={consoleUrl} />
          </Room>
        )}

        {tab === "versions" && (
          <Room title="Versions" sub="Immutable, SHA-pinned cuts of the built variation. Certification runs at cut; the frozen cut is what ships.">
            <SourcePanel prototypeKey={key} versions={versions} compact />
          </Room>
        )}

        {tab === "optimizely" && (
          <Room title="Optimizely" sub="Bind or create the experiment, push the cut version by API (read-back verified), then start it in Optimizely. A running experiment locks everything.">
            <ShipPanel
              prototypeKey={key}
              versions={versions.map((v) => ({ version: v.version, gitSha: v.gitSha, hasCode: Boolean(v.variationJs), certification: v.certification ?? null }))}
              initialBinding={p.experiment ?? null}
              initialLastPush={push}
              optiProjectId={expCfg?.optimizely?.defaultProjectId ?? null}
              targetCount={p.targets.length}
              prototypeName={p.name}
            />
            <details className="group/manual mt-3">
              <summary className="text-[13px] text-muted-2 cursor-pointer hover:text-foreground">Manual bundle (fallback — copy/paste instead of the API push)</summary>
              <div className="mt-2">
                <OptimizelyBundle prototypeKey={key} name={p.name} metric={p.metrics.primary} targetUrls={p.targets.map((t) => t.url)} version={versions[0]?.version} variationJs={versions[0]?.variationJs} />
              </div>
            </details>
          </Room>
        )}

        {tab === "explorer" && (
          <Room title="Code explorer" sub="The winning version, frozen at its exact git SHA — byte-for-byte what ran. This is what the dev team receives." wide>
            <HandoffExplorer prototypeKey={key} versions={versions.map((v) => ({ version: v.version, gitSha: v.gitSha, createdAt: v.createdAt, certPassed: v.certification ? v.certification.passed : null }))} />
          </Room>
        )}

        {tab === "ship" && (
          <Room title="Ship record" sub="When the experiment wins, the winner graduates into the site's production code — a reviewed PR, not client-side JavaScript forever.">
            <HandoffPanel prototypeKey={key} repoFullName={repo?.fullName} latestVersion={versions[0]?.version} handoff={handoff} />
          </Room>
        )}

        {tab === "repo" && (
          <Room title="Repo & branch" sub="Which registered repo + branch this prototype builds in. Touched once.">
            <RepoBranchSettings prototypeKey={key} initialRepo={repo ?? null} />
          </Room>
        )}

        {tab === "details" && (
          <Room title="Details" sub="The experiment definition and housekeeping.">
            <div className="space-y-5">
              <DetailsEditor p={p} />
              <div className="rounded-xl border border-border bg-surface px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[14px] font-semibold">Lifecycle stage</div>
                  <div className="text-[13px] text-muted-2">Manual override — normally the stage derives itself. Use for archiving.</div>
                </div>
                <StageSelect prototypeKey={key} initialStage={normalizeStage(p.status)} />
              </div>
              <DeletePrototype prototypeKey={key} name={p.name} />
            </div>
          </Room>
        )}

        {tab === "history" && (
          <Room title="History" sub="Everything that happened to this prototype — audited, append-only.">
            <div className="rounded-xl border border-border bg-surface px-4 py-3 space-y-3">
              {activity.length === 0 ? <p className="text-[14px] text-muted-2">Nothing yet.</p> : activity.slice(0, 30).map((a, i) => (
                <div key={i} className="flex gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-border-strong mt-2 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[14px] leading-snug">{a.text}</div>
                    <div className="text-[12.5px] text-muted-2"><TimeAgo iso={a.at} />{a.who ? ` · ${a.who}` : ""}</div>
                  </div>
                </div>
              ))}
            </div>
          </Room>
        )}
      </main>

      {/* ── META (xl+) ── */}
      <aside className="hidden xl:block overflow-y-auto border-l border-border bg-surface px-4 py-5">
        <div className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-2 mb-2.5">Activity</div>
        {activity.length === 0 ? (
          <p className="text-[13px] text-muted-2">Activity appears as the work happens.</p>
        ) : (
          <div className="space-y-2.5">
            {activity.slice(0, 8).map((a, i) => (
              <div key={i} className="flex gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-border-strong mt-[7px] shrink-0" />
                <div className="min-w-0">
                  <div className="text-[12.5px] leading-snug">{a.text}</div>
                  <div className="text-[11.5px] text-muted-2"><TimeAgo iso={a.at} /></div>
                </div>
              </div>
            ))}
            <Link href="?tab=history" className="block text-[12.5px] text-accent hover:text-accent-hover font-medium">Full history →</Link>
          </div>
        )}
        <div className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-2 mt-6 mb-2">Recommendations</div>
        {openRecs === 0 ? (
          <p className="text-[13px] text-muted-2">None open — the agent raises them as it builds.</p>
        ) : (
          <Link href="?tab=recs" className="text-[13px] text-warn hover:opacity-80 font-medium">{openRecs} open — review →</Link>
        )}
      </aside>
    </div>
  );
}

/** One room: title + one-line purpose + content, at a comfortable measure. */
function Room({ title, sub, wide = false, children }: { title: string; sub: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={wide ? "" : "max-w-4xl"}>
      <h2 className="text-[16px] font-semibold tracking-tight">{title}</h2>
      <p className="text-[13px] text-muted-2 mt-0.5 mb-4 max-w-[80ch]">{sub}</p>
      {children}
    </div>
  );
}

function chipClasses(pipeline: Pipeline): { cls: string; dot: string } {
  if (pipeline.stage.blocked) return { cls: "border-danger/40 text-danger bg-[color-mix(in_srgb,var(--danger)_6%,transparent)]", dot: "bg-danger" };
  if (pipeline.stage.live || pipeline.stage.id === "handoff") return { cls: "border-ok/40 text-ok bg-[color-mix(in_srgb,var(--ok)_7%,transparent)]", dot: "bg-ok" };
  return { cls: "border-warn/40 text-warn bg-[color-mix(in_srgb,var(--warn)_7%,transparent)]", dot: "bg-warn" };
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
    "experiment.create": "Experiment created in Optimizely",
    "brief.correction": "Brief refined",
  };
  return map[action] ?? action;
}
