import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getContentStore } from "@/lib/content/store";
import { resolvePrototypeOrg } from "@/lib/prototypes/org";
import { resolveRepoSource } from "@/lib/prototypes/source";
import { listArtifactVersions } from "@/lib/prototypes/versions";
import { listOrgEnvironments, envLoaderSeenAt } from "@/lib/environments";
import { DescriptionEditor } from "@/components/DescriptionEditor";
import { TargetPages } from "@/components/TargetPages";
import { RepoBranchSettings } from "@/components/RepoBranchSettings";
import { InitScript } from "@/components/InitScript";
import { SourcePanel } from "@/components/SourcePanel";
import { OptimizelyBundle } from "@/components/OptimizelyBundle";

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

  const [hdrs, source, provisionFlag, environments, versions] = await Promise.all([
    headers(),
    resolveRepoSource(key).catch(() => null),
    store.getFlag(`provision:${key}`).catch(() => null),
    listOrgEnvironments(orgId),
    listArtifactVersions(key),
  ]);
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
        <RepoBranchSettings prototypeKey={key} initialRepo={p.repo ?? null} />
      </Section>

      <Section n={3} title="Build with Claude" desc="Get the init prompt, run it, build against the test pages.">
        <InitScript prototypeKey={key} repo={p.repo} provisioned={Boolean(provisionFlag)} previewUrl={p.targets[0]?.url} buildStatus={buildStatus} />
      </Section>

      <Section n={4} title="Optimizely bundle" desc="Cut a version, then paste the bundle into a Web Experiment.">
        <div className="space-y-3">
          <SourcePanel prototypeKey={key} versions={versions} />
          <OptimizelyBundle prototypeKey={key} name={p.name} metric={p.metrics.primary} targetUrls={p.targets.map((t) => t.url)} version={versions[0]?.version} variationJs={versions[0]?.variationJs} />
        </div>
      </Section>
    </div>
  );
}
