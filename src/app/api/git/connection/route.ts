import { NextRequest, NextResponse } from "next/server";
import { connectGitHub, disconnectGitHub, getGitConnectionStatus } from "@/lib/git/connection";
import { getActiveOrgId } from "@/lib/active-org";
import { currentUser } from "@/lib/auth/current";

async function adminGuard() {
  const [user, orgId] = await Promise.all([currentUser(), getActiveOrgId()]);
  if (!user || user.role !== "admin") return { error: "Only an admin can manage the GitHub connection.", status: 403 as const };
  if (!orgId) return { error: "No active customer.", status: 400 as const };
  return { orgId, actor: user.name ?? user.sub };
}

/** GET → connection status for the active customer (never the token). */
export async function GET() {
  const orgId = await getActiveOrgId();
  if (!orgId) return NextResponse.json({ status: { connected: false, envFallback: false } });
  return NextResponse.json({ status: await getGitConnectionStatus(orgId) });
}

/** POST { token } → connect/re-key the customer's GitHub (validated via /user). */
export async function POST(req: NextRequest) {
  const g = await adminGuard();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  let body: { token?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.token?.trim()) return NextResponse.json({ error: "A token is required" }, { status: 400 });
  try {
    await connectGitHub(g.orgId, body.token, g.actor);
    return NextResponse.json({ status: await getGitConnectionStatus(g.orgId) }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

/** DELETE → disconnect the customer's GitHub (falls back to the console default, if any). */
export async function DELETE() {
  const g = await adminGuard();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  await disconnectGitHub(g.orgId, g.actor);
  return NextResponse.json({ status: await getGitConnectionStatus(g.orgId) });
}
