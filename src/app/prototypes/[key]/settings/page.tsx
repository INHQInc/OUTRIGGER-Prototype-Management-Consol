import { notFound } from "next/navigation";
import { getContentStore } from "@/lib/content/store";
import { resolvePrototypeOrg } from "@/lib/prototypes/org";
import { resolvePrototypeRepo } from "@/lib/prototypes/repo";
import { resolveSkillsForPrototype } from "@/lib/skills/skills";
import { ensureSkillsSeeded } from "@/lib/skills/seed";
import { DetailsEditor } from "@/components/DetailsEditor";
import { RepoBranchSettings } from "@/components/RepoBranchSettings";
import { LocalFolders } from "@/components/LocalFolders";
import { SkillSelector } from "@/components/SkillSelector";
import { DeletePrototype } from "@/components/DeletePrototype";

export const dynamic = "force-dynamic";

/**
 * Prototype Settings — everything you configure ONCE, off the day-to-day flow:
 * the experiment definition, source control (repo/branch + local folders), the
 * agent's skills, and housekeeping. The tab row is only the lifecycle stages.
 */
export default async function PrototypeSettings({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const store = await getContentStore();
  const p = await store.getPrototype(key);
  if (!p) notFound();
  const orgId = await resolvePrototypeOrg(p);
  const repo = await resolvePrototypeRepo(p, orgId);
  await ensureSkillsSeeded(orgId);
  const skillRows = await resolveSkillsForPrototype(orgId, key).catch(() => []);

  return (
    <div className="space-y-8 max-w-3xl">
      <section className="space-y-3">
        <div>
          <h2 className="text-[15px] font-semibold">Experiment definition</h2>
          <p className="text-[13px] text-muted-2">Hypothesis, metrics, owner — the record you judge results against.</p>
        </div>
        <DetailsEditor p={p} />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-[15px] font-semibold">Source control</h2>
          <p className="text-[13px] text-muted-2">Which repo + branch this prototype builds in, and where it lives on your machine. Touched once.</p>
        </div>
        <RepoBranchSettings prototypeKey={key} initialRepo={repo ?? null} />
        <LocalFolders prototypeKey={key} repoFullName={repo?.fullName} />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-[15px] font-semibold">Skills</h2>
          <p className="text-[13px] text-muted-2">What the agent wakes up knowing for this prototype. Changes reach the branch on the next re-sync (Build).</p>
        </div>
        <SkillSelector prototypeKey={key} initial={skillRows} />
      </section>

      <DeletePrototype prototypeKey={key} name={p.name} />
    </div>
  );
}
