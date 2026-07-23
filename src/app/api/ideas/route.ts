import { NextRequest, NextResponse } from "next/server";
import { getActiveOrgId } from "@/lib/active-org";
import { currentUser } from "@/lib/auth/current";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { addIdea, listIdeas, setIdeaStatus, deleteIdea } from "@/lib/ideas/ideas";

/**
 * POST — submit an idea. Called by the Claude instance building a prototype,
 * authenticated with the org's API token (same Bearer the skill already holds
 * for cutting versions), scoped to the prototype it's working on.
 *
 * A human in the console can also post one without a prototypeKey.
 */
export async function POST(req: NextRequest) {
  let body: { prototypeKey?: string; title?: string; body?: string; category?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });

  let orgId: string | null = null;
  let source: "claude" | "human" = "human";

  if (body.prototypeKey) {
    const g = await guardPrototypeAccess(body.prototypeKey, req.headers.get("authorization"));
    if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
    orgId = g.orgId;
    source = g.viaToken ? "claude" : "human";
  } else {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    orgId = await getActiveOrgId();
  }
  if (!orgId) return NextResponse.json({ error: "No owning customer." }, { status: 400 });

  try {
    const idea = await addIdea({
      orgId,
      prototypeKey: body.prototypeKey,
      title: body.title,
      body: body.body ?? "",
      category: body.category,
      source,
    });
    return NextResponse.json({ idea }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ideas: await listIdeas(await getActiveOrgId()) });
}

export async function PATCH(req: NextRequest) {
  const [user, orgId] = await Promise.all([currentUser(), getActiveOrgId()]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!orgId) return NextResponse.json({ error: "No active customer." }, { status: 400 });
  let body: { id?: string; status?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.id || !body.status) return NextResponse.json({ error: "id and status required" }, { status: 400 });
  try {
    return NextResponse.json({ ideas: await setIdeaStatus(orgId, body.id, body.status) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const [user, orgId] = await Promise.all([currentUser(), getActiveOrgId()]);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Only an admin can delete ideas." }, { status: 403 });
  if (!orgId) return NextResponse.json({ error: "No active customer." }, { status: 400 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  return NextResponse.json({ ideas: await deleteIdea(orgId, id) });
}
