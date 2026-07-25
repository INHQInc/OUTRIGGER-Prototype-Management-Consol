import { NextRequest, NextResponse } from "next/server";
import { getActiveOrgId } from "@/lib/active-org";
import { currentUser } from "@/lib/auth/current";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { addIdea, listBacklog, listRecommendations, setIdeaStatus, deleteIdea } from "@/lib/ideas/ideas";

/** The scoped view the caller is looking at — recommendations for a prototype, else the backlog. */
async function scopedList(orgId: string | null, prototypeKey: string | null) {
  return prototypeKey ? listRecommendations(orgId, prototypeKey) : listBacklog(orgId);
}

/**
 * POST — submit a backlog item or a recommendation. A prototype-scoped
 * submission (agent via the org API token, or a human) is a RECOMMENDATION
 * about that prototype's build. A submission with no prototypeKey is a
 * BACKLOG item — a thing to build.
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

/** GET → the backlog; GET ?prototypeKey= → that prototype's recommendations. */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = await getActiveOrgId();
  const ideas = await scopedList(orgId, req.nextUrl.searchParams.get("prototypeKey"));
  return NextResponse.json({ ideas });
}

export async function PATCH(req: NextRequest) {
  const [user, orgId] = await Promise.all([currentUser(), getActiveOrgId()]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!orgId) return NextResponse.json({ error: "No active customer." }, { status: 400 });
  let body: { id?: string; status?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.id || !body.status) return NextResponse.json({ error: "id and status required" }, { status: 400 });
  try {
    await setIdeaStatus(orgId, body.id, body.status);
    // Return the SAME scoped view the caller renders — else the other kind leaks in.
    return NextResponse.json({ ideas: await scopedList(orgId, req.nextUrl.searchParams.get("prototypeKey")) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const [user, orgId] = await Promise.all([currentUser(), getActiveOrgId()]);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Only an admin can delete these." }, { status: 403 });
  if (!orgId) return NextResponse.json({ error: "No active customer." }, { status: 400 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deleteIdea(orgId, id);
  return NextResponse.json({ ideas: await scopedList(orgId, req.nextUrl.searchParams.get("prototypeKey")) });
}
