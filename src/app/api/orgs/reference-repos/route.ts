import { NextRequest, NextResponse } from "next/server";
import { listReferenceRepos, setReferenceRepos, type ReferenceRepo } from "@/lib/git/reference-repos";
import { getActiveOrgId } from "@/lib/active-org";
import { currentUser } from "@/lib/auth/current";

/** Read-only production-source repos surfaced to Claude via `.opmc/context.json`. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = await getActiveOrgId();
  return NextResponse.json({ repos: await listReferenceRepos(orgId) });
}

export async function PUT(req: NextRequest) {
  const [user, orgId] = await Promise.all([currentUser(), getActiveOrgId()]);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Only an admin can manage reference repos." }, { status: 403 });
  if (!orgId) return NextResponse.json({ error: "No active customer." }, { status: 400 });
  let body: { repos?: ReferenceRepo[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  return NextResponse.json({ repos: await setReferenceRepos(orgId, body.repos ?? []) });
}
