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
import { DescriptionEditor } from "@/components/DescriptionEditor";
import { TargetPages } from "@/components/TargetPages";
import { RepoBranchSettings } from "@/components/RepoBranchSettings";
import { InitScript } from "@/components/InitScript";
import { SkillSelector } from "@/components/SkillSelector";
import { SourcePanel } from "@/components/SourcePanel";
import { OptimizelyBundle } from "@/components/OptimizelyBundle";
import { ShipPanel } from "@/components/ShipPanel";
import { lastPush } from "@/lib/prototypes/ship";
import { getExperimentationConfig } from "@/lib/experimentation";

export const dynamic = "force-dynamic";

function Section({ n, title, desc, children }: { n: number; title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline gap-2.5">
        <span className="w-5 h-5 rounded-full bg-accent/15 text-accent border border-accent/40 flex items-center justify-center text-[11px] font-bold shrink-0">{n}</span>
        <div>
          <h2 className="text-[13px] font-semibold">{title}</h2>
          <p className="text-[11px] text-muted-2">{desc}</p>
        </div>
      </div>
      <div className="pl-[30px]">{children}</div>
    </section>
  );
}

/** The prototype workspace — the three jobs that matter: build against prep,
 *  get the Claude init prompt, create the Optimizely bundle. */
export default async function PrototypeWorkspace({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const store = await getContentStore();
  const p = await store.getPrototype(key);
  if (!p) notFound();
  const orgId = await resolvePrototypeOrg(p);
  const repo = await resolvePrototypeRepo(p, orgId); // heal a stale/invalid repo → the registered default

  const [hdrs, source, provisionFlag, environments, versions, push, expCfg] = await Promise.all([
    headers(),
    resolveRepoSource(key).catch(() => null),
    store.getFlag(`provision:${key}`).catch(() => null),
    listOrgEnvironments(orgId),
    listArtifactVersions(key),
    lastPush(key).catch(() => null),
    getExperimentationConfig(orgId ?? "").catch(() => null),
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

  return (
    <div className="space-y-6 max-w-2xl">
      <DescriptionEditor prototypeKey={key} brief={p.brief} />

      <Section n={1} title="Test Site" desc="The page(s) this runs on, and the injection script to add to the site.">
        <TargetPages prototypeKey={key} initialTargets={p.targets} environments={envs} consoleUrl={consoleUrl} />
      </Section>

      <Section n={2} title="Repo & branch" desc="Where this prototype's code lives — change the repo or pick/create a branch.">
        <RepoBranchSettings prototypeKey={key} initialRepo={repo ?? null} />
      </Section>

      <Section n={3} title="Build with Claude" desc="Get the init prompt, run it, build against the test pages.">
        <div className="space-y-3">
          <SkillSelector prototypeKey={key} initial={skillRows} />
          <InitScript prototypeKey={key} repo={repo} provisioned={Boolean(provisionFlag)} previewUrl={p.targets[0]?.url} buildStatus={buildStatus} />
        </div>
      </Section>

      <Section n={4} title="Ship" desc="Cut a version, then push it into the Optimizely experiment by API.">
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
          <details className="group">
            <summary className="text-[11px] text-muted-2 cursor-pointer hover:text-foreground">Manual bundle (fallback — copy/paste instead of the API push)</summary>
            <div className="mt-2">
              <OptimizelyBundle prototypeKey={key} name={p.name} metric={p.metrics.primary} targetUrls={p.targets.map((t) => t.url)} version={versions[0]?.version} variationJs={versions[0]?.variationJs} />
            </div>
          </details>
        </div>
      </Section>
    </div>
  );
}
