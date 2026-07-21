import { NextRequest, NextResponse } from "next/server";
import { listOrgRepos, addOrgRepo, setDefaultOrgRepo, removeOrgRepo } from "@/lib/git/org-repos";
import { getActiveOrgId } from "@/lib/active-org";
import { currentUser } from "@/lib/auth/current";

/** GET → the active brand's repo registry (any member). */
export async function GET() {
  const orgId = await getActiveOrgId();
  if (!orgId) return NextResponse.json({ repos: [] });
  return NextResponse.json({ repos: await listOrgRepos(orgId) });
}

async function adminGuard() {
  const [user, orgId] = await Promise.all([currentUser(), getActiveOrgId()]);
  if (!user || user.role !== "admin") return { error: "Only an admin can manage the brand's repositories.", status: 403 as const };
  if (!orgId) return { error: "No active brand.", status: 400 as const };
  return { orgId };
}

/** POST { repo, baseBranch?, artifactPath?, isDefault? } → register a repo; { setDefault: id } → flag default. */
export async function POST(req: NextRequest) {
  const g = await adminGuard();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  let body: { repo?: string; baseBranch?: string; artifactPath?: string; isDefault?: boolean; setDefault?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  try {
    if (body.setDefault) {
      await setDefaultOrgRepo(g.orgId, body.setDefault);
      return NextResponse.json({ repos: await listOrgRepos(g.orgId) });
    }
    if (!body.repo?.trim()) return NextResponse.json({ error: "A repo is required" }, { status: 400 });
    await addOrgRepo(g.orgId, { repo: body.repo, baseBranch: body.baseBranch, artifactPath: body.artifactPath, isDefault: body.isDefault });
    return NextResponse.json({ repos: await listOrgRepos(g.orgId) }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

/** DELETE ?id=<repoId> → remove a repo from the registry. */
export async function DELETE(req: NextRequest) {
  const g = await adminGuard();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await removeOrgRepo(g.orgId, id);
  return NextResponse.json({ repos: await listOrgRepos(g.orgId) });
}
