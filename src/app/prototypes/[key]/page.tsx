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
import { derivePipeline, type PipelineStep } from "@/lib/prototypes/pipeline";
import { PipelineHeader } from "@/components/PipelineHeader";
import { DescriptionEditor } from "@/components/DescriptionEditor";
import { TargetPages } from "@/components/TargetPages";
import { RepoBranchSettings } from "@/components/RepoBranchSettings";
import { InitScript } from "@/components/InitScript";
import { SkillSelector } from "@/components/SkillSelector";
import { SourcePanel } from "@/components/SourcePanel";
import { OptimizelyBundle } from "@/components/OptimizelyBundle";
import { ShipPanel } from "@/components/ShipPanel";

export const dynamic = "force-dynamic";

const DOT: Record<PipelineStep["state"], string> = {
  done: "bg-ok border-ok",
  current: "bg-accent border-accent",
  todo: "bg-transparent border-border-strong",
  blocked: "bg-danger border-danger",
};

/**
 * A pipeline step's card. The CURRENT (or blocked) step is open; done and
 * future steps collapse to their one-line status — the page reads as "you are
 * here," not as a wall of forms.
 */
function StepCard({ step, hint, children }: { step: PipelineStep; hint?: string; children: React.ReactNode }) {
  const open = step.state === "current" || step.state === "blocked";
  return (
    <details id={step.anchor} open={open} className="group rounded-xl border border-border bg-surface/40 scroll-mt-4 open:bg-transparent">
      <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none list-none rounded-xl hover:bg-surface-2/30">
        <span className={`w-3 h-3 rounded-full border-2 shrink-0 ${DOT[step.state]}`} />
        <span className={`text-[13px] font-semibold ${step.state === "todo" ? "text-muted" : ""}`}>{step.title}</span>
        <span className={`text-[11px] ${step.state === "blocked" ? "text-danger" : "text-muted-2"}`}>{step.status}</span>
        <span className="ml-auto text-[10px] text-muted-2 group-open:hidden">open</span>
      </summary>
      <div className="px-4 pb-4 pt-1 space-y-3">
        {hint && <p className="text-[11px] text-muted-2">{hint}</p>}
        {children}
      </div>
    </details>
  );
}

/** The prototype workspace — a pipeline with one "you are here," not a form pile. */
export default async function PrototypeWorkspace({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const store = await getContentStore();
  const p = await store.getPrototype(key);
  if (!p) notFound();
  const orgId = await resolvePrototypeOrg(p);
  const repo = await resolvePrototypeRepo(p, orgId); // heal a stale/invalid repo → the registered default

  const [hdrs, source, provisionFlag, environments, versions, push, expCfg, claudeSeen] = await Promise.all([
    headers(),
    resolveRepoSource(key).catch(() => null),
    store.getFlag(`provision:${key}`).catch(() => null),
    listOrgEnvironments(orgId),
    listArtifactVersions(key),
    lastPush(key).catch(() => null),
    getExperimentationConfig(orgId ?? "").catch(() => null),
    store.getFlag(`claude:seen:${key}`).catch(() => null),
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

  // Live experiment status — the workspace and the board must agree.
  let experimentStatus: string | null = null;
  if (p.experiment?.experimentId && orgId) {
    try {
      const client = await getOptimizelyClientForOrg(orgId);
      if (client) experimentStatus = (await client.getExperiment(p.experiment.experimentId)).status;
    } catch { /* unreachable → no lock, no status */ }
  }

  const pipeline = derivePipeline({
    proto: p,
    provisionFlagRaw: provisionFlag,
    source,
    versions,
    lastPush: push,
    claudeSeenAt: claudeSeen,
    experimentStatus,
  });
  const step = (id: PipelineStep["id"]) => pipeline.steps.find((s) => s.id === id)!;

  // One-time setup: collapsed to a single quiet line once the repo is real.
  const setupComplete = Boolean(repo?.fullName && source?.branchExists);

  return (
    <div className="space-y-4 max-w-3xl">
      <PipelineHeader pipeline={pipeline} />

      {/* Setup — prominent until complete, then a quiet drawer */}
      <details id="setup" open={!setupComplete} className={`group rounded-xl border scroll-mt-4 ${setupComplete ? "border-border bg-surface/40" : "border-warn/40 bg-[color-mix(in_srgb,var(--warn)_4%,transparent)]"}`}>
        <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none list-none">
          <span className="text-[13px]">⚙</span>
          <span className="text-[13px] font-semibold">Setup</span>
          <span className="text-[11px] text-muted-2 font-mono truncate">
            {setupComplete ? `✓ ${repo?.fullName}@${repo?.branch}` : "pick the repo + branch this prototype builds in"}
          </span>
          <span className="ml-auto text-[10px] text-muted-2 group-open:hidden">open</span>
        </summary>
        <div className="px-4 pb-4"><RepoBranchSettings prototypeKey={key} initialRepo={repo ?? null} /></div>
      </details>

      <StepCard step={step("brief")} hint="What are we building, and how do we know it worked? A sentence starts it — the agent interviews if it's thin.">
        <DescriptionEditor prototypeKey={key} brief={p.brief} />
      </StepCard>

      <StepCard step={step("build")} hint="Pick what Claude wakes up knowing, then run the init script. Claude builds in the repo; the console pulls the result.">
        <div className="space-y-3">
          <SkillSelector prototypeKey={key} initial={skillRows} />
          <InitScript prototypeKey={key} repo={repo} provisioned={Boolean(provisionFlag)} previewUrl={p.targets[0]?.url} buildStatus={buildStatus} />
        </div>
      </StepCard>

      <StepCard step={step("review")} hint="The page(s) it runs on — install the tag once per site, then verify each page actually injects.">
        <TargetPages prototypeKey={key} initialTargets={p.targets} environments={envs} consoleUrl={consoleUrl} />
      </StepCard>

      <StepCard step={step("launch")} hint="Cut an immutable version (certification runs automatically), bind the experiment once, then push — the API replaces the variation code and read-back verifies it.">
        <div className="space-y-3">
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
            <summary className="text-[11px] text-muted-2 cursor-pointer hover:text-foreground">Manual bundle (fallback — copy/paste instead of the API push)</summary>
            <div className="mt-2">
              <OptimizelyBundle prototypeKey={key} name={p.name} metric={p.metrics.primary} targetUrls={p.targets.map((t) => t.url)} version={versions[0]?.version} variationJs={versions[0]?.variationJs} />
            </div>
          </details>
        </div>
      </StepCard>
    </div>
  );
}
