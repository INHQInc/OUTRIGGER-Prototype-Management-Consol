import { NextRequest, NextResponse } from "next/server";
import { listOrgs, addOrg, renameOrg, deleteOrg, addMember } from "@/lib/orgs";
import { accessibleOrgIds, getActiveOrgId } from "@/lib/active-org";
import { currentUser } from "@/lib/auth/current";
import { getContentStore } from "@/lib/content/store";

/** GET → orgs the current user can access (+ site counts) and the active org id. */
export async function GET() {
  const ids = new Set(await accessibleOrgIds());
  const [orgs, sites, activeOrgId] = await Promise.all([
    listOrgs(),
    (await getContentStore()).listDynamicSites(),
    getActiveOrgId(),
  ]);
  const counts = new Map<string, number>();
  for (const s of sites) counts.set(s.orgId, (counts.get(s.orgId) ?? 0) + 1);
  const scoped = orgs.filter((o) => ids.has(o.id)).map((o) => ({ ...o, siteCount: counts.get(o.id) ?? 0 }));
  return NextResponse.json({ orgs: scoped, activeOrgId });
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

/** PATCH { id, name } → rename a customer (admin, accessible only). */
export async function PATCH(req: NextRequest) {
  const user = await currentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Only an operator admin can rename customers." }, { status: 403 });
  let body: { id?: string; name?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (!body.name?.trim()) return NextResponse.json({ error: "A name is required" }, { status: 400 });
  if (!(await accessibleOrgIds()).includes(body.id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    await renameOrg(body.id, body.name);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

/** DELETE ?org=<id> → cascade-delete a customer (its sites + all content). Admin only. */
export async function DELETE(req: NextRequest) {
  const user = await currentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Only an operator admin can delete customers." }, { status: 403 });
  const id = req.nextUrl.searchParams.get("org");
  if (!id) return NextResponse.json({ error: "org required" }, { status: 400 });
  if (!(await accessibleOrgIds()).includes(id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await deleteOrg(id);
  return NextResponse.json({ ok: true });
}
