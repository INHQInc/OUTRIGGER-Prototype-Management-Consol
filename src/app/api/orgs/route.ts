import { NextRequest, NextResponse } from "next/server";
import { listOrgs, addOrg, deleteOrg, addMember } from "@/lib/orgs";
import { accessibleOrgIds, getActiveOrgId } from "@/lib/active-org";
import { currentUser } from "@/lib/auth/current";

/** GET → orgs the current user can access + the active org id. */
export async function GET() {
  const ids = new Set(await accessibleOrgIds());
  const orgs = (await listOrgs()).filter((o) => ids.has(o.id));
  return NextResponse.json({ orgs, activeOrgId: await getActiveOrgId() });
}

/** POST { name } → create an org (operator/admin only); creator becomes an admin member. */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Only an operator admin can create orgs." }, { status: 403 });
  }
  let body: { name?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.name?.trim()) return NextResponse.json({ error: "Org name is required" }, { status: 400 });

  const org = await addOrg(body.name);
  await addMember(org.id, user.sub, "admin");
  return NextResponse.json({ org }, { status: 201 });
}

/** DELETE ?org=<id> → cascade-delete an org (its sites + content). */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("org");
  if (!id) return NextResponse.json({ error: "org required" }, { status: 400 });
  if (!(await accessibleOrgIds()).includes(id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await deleteOrg(id);
  return NextResponse.json({ ok: true });
}
