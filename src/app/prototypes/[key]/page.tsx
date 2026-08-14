import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { after } from "next/server";
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
import { isBriefComplete, normalizeStage, injectionPasses, isExternalBuild } from "@/lib/prototypes/types";
import { deriveSetup } from "@/lib/prototypes/setup";
import { SetupRefresh, SkipSetup } from "@/components/SetupControls";
import { resolveSkillsForPrototype } from "@/lib/skills/skills";
import { ensureSkillsSeeded } from "@/lib/skills/seed";
import { listRecommendations } from "@/lib/ideas/ideas";
import { getBriefDrift, briefFingerprint } from "@/lib/prototypes/brief-drift-state";
import { getBriefAuditMarker, briefAuditNeeded, runBriefAudit, auditTargetCode, codeHashOf } from "@/lib/prototypes/brief-audit";
import { readIntegrationPackage } from "@/lib/prototypes/package";
import { PackagePanel } from "@/components/PackagePanel";
import { AnalyticsView } from "@/components/AnalyticsView";
import { getMetricMap } from "@/lib/prototypes/results";
import { getCoverage, coverageGate, coverageStale, coverageReviewed, testCasesStale, testCasesRun } from "@/lib/prototypes/coverage";
import { getVerdict, adjudicationPending } from "@/lib/prototypes/verdict";
import { deriveFlow } from "@/lib/prototypes/flow";
import { FlowQueue } from "@/components/FlowQueue";
import { CoveragePanel } from "@/components/CoveragePanel";
import { TestCasesPanel } from "@/components/TestCasesPanel";
import { currentUser } from "@/lib/auth/current";
import { TimeAgo } from "@/components/ui";
import { TabRow } from "@/components/TabRow";
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
// The after()-scheduled self-audit is an LLM call and runs within this
// function's lifetime budget — same reason every LLM route here sets this.
export const maxDuration = 60;

interface ActivityItem { at: string; text: string; who?: string }

/**
 * THE IA IS THE STAGE MODEL — first-principles restructure (07-30): the
 * human's job is five decisions (say what to build → get the agent going →
 * judge it on the real page → run the experiment → hand it off), and the
 * console has exactly ONE canonical model for that: Brief · Build · Review ·
 * Experiment · Handoff. So those ARE the rooms — five places plus Settings,
 * no group headers, no subsystem-shaped nav. The old fourteen surfaces live
 * on as SECTIONS inside their stage (progressive disclosure), each row's dot
 * aggregates the worst of its sections, and the NEXT card conducts. A
 * first-time user reads the rail and understands the product: it's the
 * lifecycle.
 */
const STAGES = [
  { id: "brief", label: "Brief", step: "brief" },
  { id: "build", label: "Build", step: "build" },
  { id: "review", label: "Review", step: "review" },
  { id: "experiment", label: "Experiment", step: "experiment" },
  // Analytics is a LENS over the experiment stage, not a gate — its own
  // room (measurement plan + results + verdict) because the Experiment
  // room outgrew one scroll; no dot (the Experiment row carries status).
  { id: "analytics", label: "Analytics", step: "experiment" },
  { id: "handoff", label: "Handoff", step: "handoff" },
] as const;
type TabId = (typeof STAGES)[number]["id"] | "settings";
const ALL_TABS: string[] = [...STAGES.map((s) => s.id), "settings"];

/** Every historical room id living in links/bookmarks → its stage. */
const TAB_ALIASES: Record<string, TabId> = {
  agent: "build", skills: "build", recs: "build", recommendations: "build",
  pages: "review", coverage: "review", tests: "review",
  versions: "experiment", optimizely: "experiment", results: "analytics", measurement: "analytics",
  explorer: "handoff", package: "handoff", ship: "handoff",
  repo: "settings", details: "settings", history: "settings", source: "settings",
};

export default async function PrototypeWorkspace({ params, searchParams }: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ tab?: string; step?: string }>;
}) {
  const { key } = await params;
  const sp = await searchParams;
  const rawTab = sp.tab ?? "";
  const rawStep = Number(sp.step ?? "");

  const store = await getContentStore();
  const p = await store.getPrototype(key);
  if (!p) notFound();
  const orgId = await resolvePrototypeOrg(p);
  const repo = await resolvePrototypeRepo(p, orgId);

  const [hdrs, source, provisionFlag, environments, versions, push, expCfg, claudeSeen, handoffRaw, auditEvents, recommendations, user, setupDoneFlag, setupSkipFlag, firstBuildFlag, integrationPackage] = await Promise.all([
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
    store.getFlag(`setupdone:${key}`).catch(() => null),
    store.getFlag(`setupskip:${key}`).catch(() => null),
    store.getFlag(`firstbuild:${key}`).catch(() => null),
    // In the batch so it costs no serial latency; unused in setup mode (one
    // parallel 404 per view there — bounded by the gated setup poll).
    readIntegrationPackage(p, orgId).catch(() => ({ found: false as const, state: "unreadable" as const })),
  ]);
  const briefDrift = await getBriefDrift(key, p).catch(() => null);
  const coverage = await getCoverage(key).catch(() => null);
  const verdict = await getVerdict(key).catch(() => null);
  const metricMap = await getMetricMap(key).catch(() => null);
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

  // SELF-AWARE: if the console can see a build it has never judged against
  // the current brief, audit it after this response ships — the rail turns
  // red by itself; nobody has to remember to click Check drift. Marker-deduped
  // (one LLM call per code×brief pair, keyed by CODE CONTENT so console
  // re-sync commits never invalidate a verdict) and locked against stampedes.
  // auditTargetCode is the runner's OWN resolution rule — page and runner
  // must agree on the key or this trigger re-queues forever.
  const briefAudit = await getBriefAuditMarker(key).catch(() => null);
  const auditTarget = auditTargetCode(source, versions[0]);
  const auditNeeded = briefAuditNeeded(briefAudit, auditTarget.codeHash, briefFingerprint(p));
  if (!isExternalBuild(p) && !briefDrift && auditNeeded) {
    after(() => runBriefAudit(p, { actor: "console (auto-audit)" }).catch(() => {}));
  }

  // SET UP, THEN OPERATE: until the base is set (brief → branch/agent →
  // first build → pages verified — a genuinely linear dependency chain) the
  // workspace is a guided single-column flow. Once set, the flip to the
  // command-rail working model is ONE-WAY (flag), so later regressions never
  // bounce an operating prototype back into setup.
  // "First build" LATCHES via a flag: a transient GitHub failure makes
  // buildStatus.found null for one render, and a completed step regressing
  // mid-poll (unmounting whatever the user is typing in) is worse than a
  // momentarily stale tick. First-build is genuinely one-way anyway.
  const buildFound = buildStatus.found === true || Boolean(firstBuildFlag);
  if (buildStatus.found === true && !firstBuildFlag) {
    after(async () => { await (await getContentStore()).setFlag(`firstbuild:${key}`, new Date().toISOString()).catch(() => {}); });
  }
  const setup = deriveSetup({
    briefComplete: isBriefComplete(p.brief, p.metrics),
    briefDrifted: Boolean(briefDrift),
    provisioned: Boolean(provisionFlag),
    agentStarted: Boolean(claudeSeen),
    buildFound,
    pages: p.targets.length,
    pagesPassing: p.targets.filter(injectionPasses).length,
  });
  // Evidence of OPERATION also counts as base-set — a prototype with a cut,
  // a push, a bound experiment, or an advanced stage predates this flow (or
  // was driven by API) and must never regress into setup.
  const external = isExternalBuild(p);
  const operated = versions.length > 0 || Boolean(push) || Boolean(p.experiment) || normalizeStage(p.status) !== "draft";
  // Externally-built prototypes have no branch/agent/build steps — the
  // guided setup doesn't apply; the brief + bind flow is the onboarding.
  const setupMode = !external && !setupDoneFlag && !setupSkipFlag && !setup.complete && !operated;
  if ((setup.complete || operated) && !setupDoneFlag) {
    after(async () => { await (await getContentStore()).setFlag(`setupdone:${key}`, new Date().toISOString()).catch(() => {}); });
  }

  let experimentStatus: string | null = null;
  if (p.experiment?.experimentId && orgId) {
    try {
      const client = await getOptimizelyClientForOrg(orgId);
      if (client) experimentStatus = (await client.getExperiment(p.experiment.experimentId)).status;
    } catch { /* unreachable → no lock, no status */ }
  }

  // QA escalates the Review stage INSIDE the pipeline (alerts) — the same
  // inputs the board/table pass, so every status surface agrees by
  // construction (the StageStrip's "can never disagree" invariant holds).
  const qaStaleNow = coverageStale(coverage, buildStatus.headSha, auditTarget.codeHash)
    || testCasesStale(coverage, buildStatus.headSha, auditTarget.codeHash);
  const adjPending = adjudicationPending(verdict, experimentStatus);
  const pipeline = derivePipeline({
    proto: p, provisionFlagRaw: provisionFlag, source, versions,
    lastPush: push, claudeSeenAt: claudeSeen, experimentStatus,
    briefDrifted: Boolean(briefDrift),
    qaFailing: coverageGate(coverage) === "failing",
    qaStale: qaStaleNow,
    adjudicationPending: adjPending,
  });

  const latest = versions[0];
  // Cut-staleness is keyed to CODE CONTENT, not branch SHA — a re-sync
  // commits .opmc/** and moves HEAD without touching dist/variation.js, and
  // must never manufacture a phantom "the build moved, cut again".
  const needsCut = !latest?.variationJs
    || Boolean(auditTarget.codeHash && codeHashOf(latest.variationJs) !== auditTarget.codeHash)
    || latest.certification?.passed === false;
  // Pipeline anchors ARE stage ids now — the IA collapsed onto the model.
  const anchorTab = (anchor: string): TabId => (ALL_TABS.includes(anchor) ? (anchor as TabId) : "brief");

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

  // Severity per STAGE row — the stage's own step severity, ESCALATED by
  // section problems: a failing QA check must red the Review row; a failed
  // cert must red Experiment. Sections escalate only on attention/critical —
  // an untouched optional section (no package yet) must never demote a DONE
  // stage back to "not started".
  const RANK: Record<StepSeverity, number> = { critical: 3, attention: 2, pending: 1, good: 0, na: -1 };
  const dotFor = (stage: { id: string; step: string }): StepSeverity | null => {
    if (stage.id === "analytics") return null; // a lens, not a gate — Experiment's dot carries the status
    const st = pipeline.steps.find((s) => s.id === stage.step);
    const base = st ? stepSeverity(st, pipeline.alerts) : null;
    // QA and cert already escalate INSIDE the pipeline (anchored alerts), so
    // this is pure shared derivation — identical to the table strip and the
    // board. One workspace-only exception: an invalid/unreadable integration
    // package raises Handoff to attention (the table doesn't pay the GitHub
    // read per row; problems still surface here, in the room, and the queue).
    if (!external && stage.id === "handoff" && base !== "critical"
      && (integrationPackage.state === "invalid" || integrationPackage.state === "unreadable")) return "attention";
    return base;
  };

  const chip = chipClasses(pipeline);

  // THE CONDUCTOR: the iteration loop as an ordered, executable queue —
  // derived from the same ground truth as the dots, replacing the single
  // CTA + gate line (the queue's first item IS the gate, with its why).
  const flow = deriveFlow({
    briefComplete: isBriefComplete(p.brief, p.metrics),
    briefDrifted: Boolean(briefDrift),
    auditPending: !briefDrift && auditNeeded,
    provisioned: Boolean(provisionFlag),
    synced: pipeline.truth.synced,
    buildFound,
    hasCutWithCode: Boolean(latest?.variationJs),
    pages: p.targets.length,
    pagesPassing: p.targets.filter(injectionPasses).length,
    hasScenarios: Boolean(coverage?.scenarios.length),
    scenariosStale: coverageStale(coverage, buildStatus.headSha, auditTarget.codeHash),
    scenariosReviewed: coverage ? coverageReviewed(coverage) : false,
    qaFailing: coverageGate(coverage) === "failing",
    hasTestCases: Boolean(coverage?.testCases?.length),
    testsStale: testCasesStale(coverage, buildStatus.headSha, auditTarget.codeHash),
    testsRun: coverage ? testCasesRun(coverage) : false,
    latestVersion: latest?.version,
    needsCut,
    certFailed: latest?.certification?.passed === false,
    bound: Boolean(p.experiment),
    // verified is NON-NEGOTIABLE: a read-back MISMATCH is persisted before
    // the throw — without it the queue would green-light starting traffic
    // on code known not to byte-match what Optimizely stored.
    pushCurrent: Boolean(push && latest && push.verified && push.version === latest.version && push.gitSha === latest.gitSha),
    experimentRunning: experimentStatus === "running",
    measurementPlanned: Boolean(metricMap?.confirmed),
    externalBuild: external,
    adjudicationPending: adjPending,
    shipped: normalizeStage(p.status) === "shipped",
  });

  // ── SETUP MODE: the guided linear flow until the base is set ──
  if (setupMode) {
    // ANY step opens via ?step=N — the numbering and auto-advance carry the
    // linearity; hard locks made honest mistakes unfixable (a typo'd page
    // URL is a step-4 input CONSUMED by step-2 provisioning).
    const openIdx = Number.isInteger(rawStep) && rawStep >= 1 && rawStep <= setup.steps.length
      ? rawStep - 1 : setup.activeIndex;
    // Poll only while a step is waiting on EXTERNAL truth (agent check-in,
    // first build) — the other steps are human work and don't need refreshes.
    const waiting = openIdx === setup.activeIndex && (setup.activeIndex === 1 || setup.activeIndex === 2);

    const stepBody = (id: string) => {
      if (id === "brief") return (
        <BriefComposer prototypeKey={key} initialBrief={p.brief} initialHypothesis={p.hypothesis} initialMetrics={p.metrics} buildAvailable={Boolean(buildStatus.found) || versions.some((v) => Boolean(v.variationJs))} initialDrift={briefDrift ? { report: briefDrift.report, builtSha: briefDrift.builtSha } : null} initialAudit={briefAudit ? { inSync: briefAudit.inSync, builtSha: briefAudit.builtSha, checkedAt: briefAudit.checkedAt, checkedBy: briefAudit.checkedBy, current: !briefAuditNeeded(briefAudit, auditTarget.codeHash, briefFingerprint(p)) } : null} />
      );
      if (id === "agent") return (
        <InitScript prototypeKey={key} repo={repo} provisioned={Boolean(provisionFlag)} previewUrl={p.targets[0]?.url} buildStatus={buildStatus} briefDone={isBriefComplete(p.brief, p.metrics)} claudeSeenAt={claudeSeen} inSync={pipeline.truth.synced} />
      );
      if (id === "build") return (
        <div className="rounded-xl border border-border bg-surface px-4 py-4">
          {buildStatus.found ? (
            <p className="text-[14px] text-ok font-semibold">✓ Built — {buildStatus.bytes?.toLocaleString()} bytes at <span className="font-mono font-normal">{buildStatus.headSha?.slice(0, 7)}</span></p>
          ) : (
            <div className="space-y-2">
              <p className="text-[14px] text-foreground flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-warn animate-pulse shrink-0" />
                Waiting for the first build — this ticks the moment <span className="font-mono text-[13px]">dist/variation.js</span> lands on the branch.
              </p>
              <p className="text-[13px] text-muted-2 max-w-[70ch]">Nothing to click here: Claude builds in your terminal and pushes. This page checks by itself every few seconds. If the agent isn&apos;t building yet, reopen step 2.</p>
            </div>
          )}
        </div>
      );
      return <TargetPages prototypeKey={key} initialTargets={p.targets} environments={envs} consoleUrl={consoleUrl} />;
    };

    return (
      <div className="flex-1 min-h-0 overflow-y-auto">
        <SetupRefresh enabled={waiting} />
        <div className="max-w-3xl mx-auto px-6 py-8">
          <Link href="/prototypes" className="text-[12.5px] text-muted-2 hover:text-foreground">← Prototypes</Link>
          <div className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-2">Web experiment prototype · Setup</div>
          <h1 className="text-[22px] font-bold tracking-tight mt-0.5">{p.name}</h1>
          <p className="text-[13.5px] text-muted-2 mt-1.5 max-w-[70ch]">
            Four steps, in order — each unlocks the next, and ground-truth steps tick themselves.
            The full workspace opens when the base is set.
          </p>

          <div className="mt-6 space-y-2.5">
            {setup.steps.map((s, i) => {
              const isOpen = i === openIdx;
              const ahead = !s.done && i > setup.activeIndex; // visual cue only — every step opens
              return (
                <div key={s.id} className={`rounded-xl border overflow-hidden border-border bg-surface ${isOpen ? "border-border-strong" : ahead ? "opacity-60" : ""}`}>
                  <div className="px-4 py-3 flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[12.5px] font-bold ${s.done ? "bg-ok text-accent-fg" : isOpen ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted-2"}`}>
                      {s.done ? "✓" : s.n}
                    </span>
                    <span className={`text-[15px] font-semibold ${ahead && !isOpen ? "text-muted-2" : ""}`}>{s.label}</span>
                    <span className="ml-auto text-[12.5px] text-muted-2 min-w-0 truncate">
                      {s.done && !isOpen ? s.summary : ""}
                    </span>
                    {!isOpen && (
                      <Link href={`?step=${s.n}`} className="text-[12.5px] text-accent hover:text-accent-hover font-medium shrink-0">open</Link>
                    )}
                    {isOpen && i !== setup.activeIndex && (
                      <Link href="?" className="text-[12.5px] text-muted-2 hover:text-foreground shrink-0">close</Link>
                    )}
                  </div>
                  {isOpen && (
                    <div className="px-4 pb-4 border-t border-border/60 pt-4">
                      {s.blockedNote && (
                        <p className="text-[13.5px] text-warn mb-3 max-w-[70ch]">⚠ {s.blockedNote}</p>
                      )}
                      {!s.done && <p className="text-[13.5px] text-muted-2 mb-3 max-w-[70ch]">{s.sub}</p>}
                      {stepBody(s.id)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <span className="text-[12.5px] text-muted-2">Step {Math.min(setup.activeIndex + 1, setup.steps.length)} of {setup.steps.length}</span>
            <SkipSetup prototypeKey={key} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">

      {/* ── THE WORKSPACE HEADER ──
          The rooms were a VERTICAL rail here. They are a tab row now, so the
          app has exactly one vertical nav — the global sidebar, which no longer
          has to disappear to keep that count at one. You can move between
          prototypes without leaving the one you are in.

          "← Prototypes" is gone with it: the sidebar is the exit, and a link
          back to a place already in view is dead weight (principles §1). */}
      <header className="shrink-0 border-b border-border bg-surface px-6 pt-4">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-[18px] font-bold tracking-tight min-w-0 truncate" title={p.name}>{p.name}</h1>
          <span className={`shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${chip.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${chip.dot} ${pipeline.stage.live ? "animate-pulse" : ""}`} />
            {pipeline.stage.blocked ? `Blocked · ${pipeline.stage.label}` : pipeline.stage.live ? `${pipeline.stage.label} · LIVE` : pipeline.stage.label}
          </span>
        </div>

        {/* THE ROOMS — the same `TabRow` the index uses for Table/Board. Each
            tab keeps the dot it had in the rail: one `derivePipeline`
            derivation, so the tabs, the table strip and the board can never
            disagree. Settings trails, so it never reads as a sixth stage. */}
        <TabRow
          className="mt-3"
          active={tab}
          items={[
            ...STAGES.map((stage) => ({
              id: stage.id,
              label: stage.label,
              href: `?tab=${stage.id}`,
              severity: dotFor(stage),
              badge: stage.id === "build" ? openRecs : undefined,
            })),
            { id: "settings", label: "Settings", href: "?tab=settings", trailing: true },
          ]}
        />
      </header>

      {/* The conductor sat in the rail; it belongs under the header now, where
          it has the width to say what it was cramped into abbreviating. */}
      <div className="shrink-0 px-6 pt-4">
        <FlowQueue prototypeKey={key} actions={flow} />
      </div>

      {/* ── CONTENT ── */}
      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
        {tab === "brief" && (
          <Room title="Brief" sub="What are we building, and how do we know it worked? The brief is the gate — it becomes the agent's instructions and the experiment's description.">
            <BriefComposer prototypeKey={key} initialBrief={p.brief} initialHypothesis={p.hypothesis} initialMetrics={p.metrics} buildAvailable={Boolean(buildStatus.found) || versions.some((v) => Boolean(v.variationJs))} initialDrift={briefDrift ? { report: briefDrift.report, builtSha: briefDrift.builtSha } : null} initialAudit={briefAudit ? { inSync: briefAudit.inSync, builtSha: briefAudit.builtSha, checkedAt: briefAudit.checkedAt, checkedBy: briefAudit.checkedBy, current: !briefAuditNeeded(briefAudit, auditTarget.codeHash, briefFingerprint(p)) } : null} />
          </Room>
        )}

        {tab === "build" && external && <NaRoom title="Build" toggleHint />}
        {tab === "build" && !external && (
          <Room title="Build" sub="Get the agent building: prepare the branch, start Claude, keep it in sync. The agent builds in the repo; the console pulls the result.">
            <InitScript prototypeKey={key} repo={repo} provisioned={Boolean(provisionFlag)} previewUrl={p.targets[0]?.url} buildStatus={buildStatus} briefDone={isBriefComplete(p.brief, p.metrics)} claudeSeenAt={claudeSeen} inSync={pipeline.truth.synced} />
            <Section id="skills" title="Skills" sub="What the agent wakes up knowing for this prototype. Changes reach the branch on the next re-sync.">
              <SkillSelector prototypeKey={key} initial={skillRows} />
            </Section>
            <Section id="recommendations" title="Recommendations" sub="Friction the agent hit building this prototype — sent back instead of lost. Act on them or decline.">
              <Recommendations prototypeKey={key} initial={recommendations} canManage={Boolean(user)} />
            </Section>
          </Room>
        )}

        {tab === "review" && external && <NaRoom title="Review" />}
        {tab === "review" && !external && (
          <Room title="Review" sub="Is it right? Verify it injects on the real page(s), then walk the QA — scenarios per device, and the test cases your agent runs and reports back. Review happens on the real environment, not a mockup.">
            <TargetPages prototypeKey={key} initialTargets={p.targets} environments={envs} consoleUrl={consoleUrl} />
            <Section id="scenarios" title="QA scenarios" sub="Use cases with checkable tests per device, derived from the brief AND the built code. Gaps are scenarios the build doesn't handle.">
              <CoveragePanel prototypeKey={key} initial={coverage} currentSha={buildStatus.headSha} currentCodeHash={auditTarget.codeHash} buildAvailable={Boolean(buildStatus.found) || versions.some((v) => Boolean(v.variationJs))} />
            </Section>
            <Section id="tests" title="Test cases" sub="Step-scripts with an expected result per step. Your agent runs them on the review URL (🤖); humans walk the same scripts (👤). Failures gate the push and auto-file recommendations.">
              <TestCasesPanel prototypeKey={key} initial={coverage} currentSha={buildStatus.headSha} currentCodeHash={auditTarget.codeHash} buildAvailable={Boolean(buildStatus.found) || versions.some((v) => Boolean(v.variationJs))} />
            </Section>
          </Room>
        )}

        {tab === "experiment" && (
          <Room title="Experiment" sub={external ? "Built in Optimizely: attach this prototype to its Optimizely experiment — everything else lives in Analytics." : "The release: freeze an immutable cut (certification runs at cut), bind the Optimizely experiment, push by API (read-back verified), start it in Optimizely. Running locks everything. Measurement and results live in Analytics."}>
            {!external && <SourcePanel prototypeKey={key} versions={versions} compact />}
            <Section id="ship" title={external ? "Bind the experiment" : "Ship to Optimizely"} sub={external ? "Pick the experiment built in Optimizely — measurement, results, and the verdict read from it." : "Bind or create the experiment, then push the frozen cut. Starting traffic stays a human act."}>
              <ShipPanel
                prototypeKey={key}
                versions={versions.map((v) => ({ version: v.version, gitSha: v.gitSha, hasCode: Boolean(v.variationJs), certification: v.certification ?? null }))}
                initialBinding={p.experiment ?? null}
                initialLastPush={push}
                optiProjectId={expCfg?.optimizely?.defaultProjectId ?? null}
                targetCount={p.targets.length}
                prototypeName={p.name}
                external={external}
              />
              {!external && <div className="mt-3">
                <OptimizelyBundle prototypeKey={key} name={p.name} metric={p.metrics.primary} targetUrls={p.targets.map((t) => t.url)} version={versions[0]?.version} variationJs={versions[0]?.variationJs} />
              </div>}
            </Section>
          </Room>
        )}

        {tab === "analytics" && (
          <Room title="Analytics" sub="" wide>
            <AnalyticsView
              prototypeKey={key}
              bound={Boolean(p.experiment)}
              running={experimentStatus === "running"}
              experimentName={p.experiment?.experimentName}
              experimentId={p.experiment?.experimentId}
              variationName={p.experiment?.variationName}
              boundAt={p.experiment?.boundAt}
              experimentStatus={experimentStatus ?? undefined}
            />
          </Room>
        )}

        {tab === "handoff" && external && <NaRoom title="Handoff" />}
        {tab === "handoff" && !external && (
          <Room title="Handoff" sub="What the dev team receives: the winning code frozen at its exact SHA, the native CMS integration package, and the ship record." wide>
            <HandoffExplorer prototypeKey={key} versions={versions.map((v) => ({ version: v.version, gitSha: v.gitSha, createdAt: v.createdAt, certPassed: v.certification ? v.certification.passed : null }))} />
            <Section id="package" title="Integration package" sub="The one-shot production handoff: the winner rebuilt NATIVELY for the site's CMS — Razor views, SCSS, JS, C# backend/API, diffs, and an integration guide. Staged entirely in the prototype repo; their team applies it on their terms.">
              <PackagePanel prototypeKey={key} initial={integrationPackage} skillEnabled={skillRows.some((r) => r.skill.id === "opmc-integration-package" && r.enabled)} />
            </Section>
            <Section id="record" title="Ship record" sub="When the experiment wins, the winner graduates into the site's production code — a reviewed PR, not client-side JavaScript forever.">
              {verdict?.state === "stamped" && (
                <div className={`mb-4 rounded-lg border px-3.5 py-2.5 text-[13px] ${verdict.verdict === "confirmed" ? "border-ok/40" : verdict.verdict === "refuted" || verdict.verdict === "invalid" ? "border-danger/40" : "border-border"}`}>
                  <span className={`font-bold uppercase text-[11px] tracking-wide mr-2 ${verdict.verdict === "confirmed" ? "text-ok" : verdict.verdict === "refuted" || verdict.verdict === "invalid" ? "text-danger" : "text-warn"}`}>Verdict: {verdict.verdict.replace(/_/g, " ")}</span>
                  <span className="text-muted">{verdict.headline}</span>
                  <span className="text-muted-2"> — stamped by {verdict.stampedBy} on {verdict.stampedAt?.slice(0, 10)}{verdict.preRegistration ? (verdict.preRegistration.anchor === "cut" ? `, adjudicated against v${verdict.preRegistration.version}'s pre-registered brief` : ", adjudicated against the brief frozen with the measurement plan") : ""}. The integration package below carries the WHY, not just the what.</span>
                </div>
              )}
              <HandoffPanel prototypeKey={key} repoFullName={repo?.fullName} latestVersion={versions[0]?.version} handoff={handoff} />
            </Section>
          </Room>
        )}

        {tab === "settings" && (
          <Room title="Settings" sub="Configuration and the record — none of this is workflow.">
            <RepoBranchSettings prototypeKey={key} initialRepo={repo ?? null} />
            <Section id="details" title="Details" sub="The experiment definition and housekeeping.">
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
            </Section>
            <Section id="history" title="History" sub="Everything that happened to this prototype — audited, append-only.">
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
            </Section>
          </Room>
        )}
      </main>

    </div>
  );
}

/** One room: title + one-line purpose + content, at a comfortable measure. */
/** A stage that doesn't exist for this prototype — externally built. */
function NaRoom({ title, toggleHint }: { title: string; toggleHint?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-5 py-6 max-w-2xl">
      <div className="text-[15px] font-semibold text-muted-2">{title} — not applicable</div>
      <p className="text-[13.5px] text-muted-2 mt-1.5 leading-relaxed">
        This prototype is <span className="font-medium text-muted">built externally in Optimizely&apos;s editor</span> — the console provides the brief and the experiment analytics (bind, measurement plan, results, verdict); the repo pipeline stages don&apos;t exist for it.
        {toggleHint && <> If that changes, flip <Link href="?tab=settings#details" className="text-accent hover:text-accent-hover font-medium">Built externally</Link> off in Settings → Details and the full pipeline lights up.</>}
      </p>
    </div>
  );
}

function Room({ title, sub, wide = false, children }: { title: string; sub: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={wide ? "" : "max-w-4xl"}>
      <h2 className="text-[16px] font-semibold tracking-tight">{title}</h2>
      {sub ? <p className="text-[13px] text-muted-2 mt-0.5 mb-4 max-w-[80ch]">{sub}</p> : <div className="mb-3" />}
      {children}
    </div>
  );
}

/** A section WITHIN a stage room — the old sub-rooms, one card grammar. */
function Section({ id, title, sub, children }: { id: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-8 pt-6 border-t border-border/60">
      <h3 className="text-[14.5px] font-semibold tracking-tight">{title}</h3>
      <p className="text-[12.5px] text-muted-2 mt-0.5 mb-3 max-w-[80ch]">{sub}</p>
      {children}
    </section>
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
    "optimizely.push": "Pushed to Optimizely",
    "experiment.bind": "Experiment bound",
    "experiment.create": "Experiment created in Optimizely",
    "brief.correction": "Brief refined",
    "brief.drift-check": "Brief ↔ build drift checked",
    "brief.drift-dismissed": "Brief drift dismissed — brief confirmed accurate",
    "coverage.generated": "QA spec generated",
    "coverage.reviewed": "QA review completed",
    "coverage.tests-generated": "Test cases generated",
    "coverage.tests-run": "Test cases run by the agent",
    "coverage.tests-complete": "Every core test case run",
  };
  return map[action] ?? action;
}
