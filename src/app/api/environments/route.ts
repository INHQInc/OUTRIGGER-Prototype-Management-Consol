import { NextRequest, NextResponse } from "next/server";
import { listOrgEnvironments, addOrgEnvironment, deleteOrgEnvironment, updateEnvironment, type EnvironmentKind } from "@/lib/environments";
import { getActiveOrgId } from "@/lib/active-org";
import { currentUser } from "@/lib/auth/current";

async function guard() {
  const [user, orgId] = await Promise.all([currentUser(), getActiveOrgId()]);
  if (!user) return { error: "Unauthorized", status: 401 as const };
  if (!orgId) return { error: "No active customer.", status: 400 as const };
  return { orgId };
}

/** GET → the active customer's environments. */
export async function GET() {
  const g = await guard();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  return NextResponse.json({ environments: await listOrgEnvironments(g.orgId) });
}

/** POST { url, label?, kind } → add an environment. */
export async function POST(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  let body: { url?: string; label?: string; kind?: EnvironmentKind };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.url?.trim()) return NextResponse.json({ error: "A URL is required" }, { status: 400 });
  const kind: EnvironmentKind = body.kind === "development" || body.kind === "production" ? body.kind : "staging";
  try {
    const environment = await addOrgEnvironment(g.orgId, { label: body.label, url: body.url, kind });
    return NextResponse.json({ environment }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

/** DELETE ?id=<envId> → remove an environment. */
export async function DELETE(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deleteOrgEnvironment(g.orgId, id);
  return NextResponse.json({ ok: true });
}

/** PATCH { id, label?, kind? } → edit an environment (fixes mislabeled kind). */
export async function PATCH(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  let body: { id?: string; label?: string; kind?: EnvironmentKind };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const envs = await listOrgEnvironments(g.orgId);
  if (!envs.some((e) => e.id === body.id)) return NextResponse.json({ error: "Unknown environment" }, { status: 404 });
  const patch: { label?: string; kind?: EnvironmentKind } = {};
  if (body.label !== undefined) patch.label = body.label;
  if (body.kind === "development" || body.kind === "staging" || body.kind === "production") patch.kind = body.kind;
  try {
    await updateEnvironment(body.id, patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
