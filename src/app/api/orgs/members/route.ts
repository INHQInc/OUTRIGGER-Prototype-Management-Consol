import { NextRequest, NextResponse } from "next/server";
import { listMembers, addMember, removeMember } from "@/lib/orgs";
import { getActiveOrgId } from "@/lib/active-org";
import { currentUser } from "@/lib/auth/current";

/** GET → members of the active org. */
export async function GET() {
  const orgId = await getActiveOrgId();
  if (!orgId) return NextResponse.json({ members: [] });
  return NextResponse.json({ members: await listMembers(orgId), orgId });
}

async function guard() {
  const user = await currentUser();
  const orgId = await getActiveOrgId();
  if (!user || user.role !== "admin") return { error: "Only an admin can manage members.", status: 403 as const };
  if (!orgId) return { error: "No active org.", status: 400 as const };
  return { orgId };
}

/** POST { email, role } → add/update a member of the active org (admin only). */
export async function POST(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  let body: { email?: string; role?: "admin" | "member" };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.email?.trim() || !body.email.includes("@")) return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  await addMember(g.orgId, body.email, body.role === "admin" ? "admin" : "member");
  return NextResponse.json({ ok: true }, { status: 201 });
}

/** DELETE ?email=<email> → remove a member from the active org (admin only). */
export async function DELETE(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });
  await removeMember(g.orgId, email);
  return NextResponse.json({ ok: true });
}
