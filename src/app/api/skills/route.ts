import { NextRequest, NextResponse } from "next/server";
import { getActiveOrgId } from "@/lib/active-org";
import { currentUser } from "@/lib/auth/current";
import { getGitClientForOrg } from "@/lib/git/connection";
import { defaultOrgRepo } from "@/lib/git/org-repos";
import { deleteSkill, getSkill, listAllSkills, listGlobalSkills, parseFrontmatter, slugify, type Skill, upsertSkill } from "@/lib/skills/skills";
import { ensureSkillsSeeded } from "@/lib/skills/seed";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = await getActiveOrgId();
  await ensureSkillsSeeded(orgId);
  return NextResponse.json({ skills: await listAllSkills(orgId) });
}

export async function POST(req: NextRequest) {
  const [user, orgId] = await Promise.all([currentUser(), getActiveOrgId()]);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Only an admin can manage skills." }, { status: 403 });
  let body: Partial<Skill>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const name = (body.name ?? "").trim();
  const md = (body.body ?? "").trim();
  if (!name) return NextResponse.json({ error: "A skill name is required." }, { status: 400 });
  if (!md) return NextResponse.json({ error: "The skill body can't be empty." }, { status: 400 });
  const scope = (body.scope ?? "global") as Skill["scope"];
  if (scope !== "global" && !orgId) return NextResponse.json({ error: "No active customer for a brand/prototype skill." }, { status: 400 });
  if (scope === "prototype" && !body.prototypeKey) return NextResponse.json({ error: "A prototype-scoped skill needs a prototype." }, { status: 400 });

  // Keep the frontmatter description and the stored description in step — the
  // frontmatter is what Claude actually reads when deciding to load the skill.
  const fm = parseFrontmatter(md);
  const description = (body.description ?? fm.description ?? "").trim();

  // MERGE ONTO THE STORED ROW, do not rebuild it. The editor posts five fields
  // and `upsertSkill` replaces the record wholesale, so every field it does not
  // send is silently dropped. `delivery` is the one that bites today: it is
  // written in exactly one place (`seed.ts`), `enabledSkillsForPrototype` reads
  // `(s.delivery ?? "branch")`, and `seedBuiltins` skips forked rows forever —
  // so editing one of the three CONSOLE skills reclassified it as a BRANCH
  // skill and shipped the console's analyst prompt onto every prototype branch,
  // which that skill's own description says never happens. It is silent,
  // because the console keeps working: both readers fetch by id and never look
  // at `delivery`. Merging rather than reconstructing also protects the next
  // field somebody adds. An edit changes what a skill SAYS, never where it goes.
  const id = body.id || slugify(name);
  const existing = await getSkill(orgId, id);

  const skill = await upsertSkill({
    ...existing,
    id,
    name,
    scope,
    orgId: scope === "global" ? undefined : orgId ?? undefined,
    prototypeKey: scope === "prototype" ? body.prototypeKey : undefined,
    description,
    body: md,
    builtIn: false, // a user-saved skill is user-owned — this "forks" a built-in
  });
  return NextResponse.json({ skill, skills: await listAllSkills(orgId) });
}

export async function DELETE(req: NextRequest) {
  const [user, orgId] = await Promise.all([currentUser(), getActiveOrgId()]);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Only an admin can manage skills." }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deleteSkill(orgId, id);
  return NextResponse.json({ skills: await listAllSkills(orgId) });
}
