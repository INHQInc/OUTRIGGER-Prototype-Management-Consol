import { getActiveOrgId } from "@/lib/active-org";
import { currentUser } from "@/lib/auth/current";
import { listAllSkills } from "@/lib/skills/skills";
import { ensureSkillsSeeded } from "@/lib/skills/seed";
import { PageHeader } from "@/components/ui";
import { SkillLibrary } from "@/components/SkillLibrary";

export const dynamic = "force-dynamic";

export default async function SkillsPage() {
  const [orgId, user] = await Promise.all([getActiveOrgId(), currentUser()]);
  await ensureSkillsSeeded(orgId);
  const skills = await listAllSkills(orgId).catch(() => []);
  return (
    <>
      <PageHeader title="Skills" subtitle="The instructions Claude loads when it opens a prototype" />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <SkillLibrary initial={skills} canManage={user?.role === "admin"} />
      </div>
    </>
  );
}
