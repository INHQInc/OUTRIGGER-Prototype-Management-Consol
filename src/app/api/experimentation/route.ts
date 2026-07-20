import { NextRequest, NextResponse } from "next/server";
import { getActiveOrgId } from "@/lib/active-org";
import { currentUser } from "@/lib/auth/current";
import {
  getExperimentationStatus,
  connectOptimizely,
  setDefaultProject,
  disconnectExperimentation,
} from "@/lib/experimentation";

/** Brand-level experimentation config lives on the active org; admins manage it. */
async function guard(): Promise<{ orgId: string } | { error: string; status: 400 | 403 }> {
  const [user, orgId] = await Promise.all([currentUser(), getActiveOrgId()]);
  if (!user || user.role !== "admin") return { error: "Only an admin can manage brand integrations.", status: 403 };
  if (!orgId) return { error: "No active brand.", status: 400 };
  return { orgId };
}

/** GET → connection status + projects for the active brand (never the token). */
export async function GET() {
  const orgId = await getActiveOrgId();
  if (!orgId) return NextResponse.json({ status: { connected: false, provider: "optimizely", projects: [] } });
  return NextResponse.json({ status: await getExperimentationStatus(orgId) });
}

/** POST { apiToken } → connect/re-key Optimizely (validates, then persists). */
export async function POST(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  let body: { apiToken?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.apiToken?.trim()) return NextResponse.json({ error: "An API token is required" }, { status: 400 });
  try {
    await connectOptimizely(g.orgId, body.apiToken);
    return NextResponse.json({ status: await getExperimentationStatus(g.orgId) }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

/** PATCH { defaultProjectId } → set the brand's default project. */
export async function PATCH(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  let body: { defaultProjectId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.defaultProjectId) return NextResponse.json({ error: "defaultProjectId required" }, { status: 400 });
  try {
    await setDefaultProject(g.orgId, body.defaultProjectId);
    return NextResponse.json({ status: await getExperimentationStatus(g.orgId) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

/** DELETE → disconnect the brand's experimentation platform. */
export async function DELETE() {
  const g = await guard();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  await disconnectExperimentation(g.orgId);
  return NextResponse.json({ ok: true });
}
