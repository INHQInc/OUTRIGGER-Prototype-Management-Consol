import { NextRequest, NextResponse } from "next/server";
import { getActiveOrgId } from "@/lib/active-org";
import { currentUser } from "@/lib/auth/current";
import { getGitClientForOrg } from "@/lib/git/connection";
import { defaultOrgRepo } from "@/lib/git/org-repos";
import {
  listAllSkills, upsertSkill, deleteSkill, listGlobalSkills,
  parseFrontmatter, slugify, type Skill,
} from "@/lib/skills/skills";

/**
 * Seed the library from the `starter` branch the first time it's opened, so it
 * isn't empty on day one — the opmc-prototype skill already exists there and is
 * the canonical generic one.
 */
async function seedFromStarter(orgId: string): Promise<void> {
  if ((await listGlobalSkills()).length) return;
  const repo = await defaultOrgRepo(orgId, "prototypes");
  const client = await getGitClientForOrg(orgId);
  if (!repo || !client) return;
  const [owner, name] = repo.fullName.split("/");
  if (!owner || !name) return;
  const md = await client.readFileAtRef(owner, name, ".claude/skills/opmc-prototype/SKILL.md", "starter").catch(() => null);
  if (!md) return;
  const fm = parseFrontmatter(md);
  await upsertSkill({
    id: "opmc-prototype",
    name: fm.name ?? "opmc-prototype",
    scope: "global",
    description: fm.description ?? "The core build loop for an OPMC prototype.",
    body: md,
    builtIn: true,
  });
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = await getActiveOrgId();
  if (orgId) await seedFromStarter(orgId).catch(() => { /* seeding is best-effort */ });
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

  const skill = await upsertSkill({
    id: body.id || slugify(name),
    name,
    scope,
    orgId: scope === "global" ? undefined : orgId ?? undefined,
    prototypeKey: scope === "prototype" ? body.prototypeKey : undefined,
    description,
    body: md,
    builtIn: body.builtIn,
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
