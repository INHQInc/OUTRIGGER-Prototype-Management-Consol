import { NextRequest, NextResponse } from "next/server";
import { listArtifactVersions, cutArtifactVersion, cutArtifactVersionFromRepo } from "@/lib/prototypes/versions";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { currentUser } from "@/lib/auth/current";

/** GET ?key=<prototypeKey> → the prototype's immutable versions (newest first). */
export async function GET(req: NextRequest) {
  const g = await guardPrototypeAccess(req.nextUrl.searchParams.get("key"), req.headers.get("authorization"));
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  return NextResponse.json({ versions: await listArtifactVersions(g.proto.key) });
}

/**
 * POST → cut an immutable version.
 *   { prototypeKey, fromRepo: true, notes? }        → pull the built variation from the branch (primary)
 *   { prototypeKey, gitSha, gitRef?, notes? }        → pin a SHA manually (fallback, no code pulled)
 */
export async function POST(req: NextRequest) {
  let body: { prototypeKey?: string; fromRepo?: boolean; gitSha?: string; gitRef?: string; notes?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const g = await guardPrototypeAccess(body.prototypeKey ?? null, req.headers.get("authorization"));
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const user = await currentUser();
  const createdBy = user?.name ?? user?.sub ?? (g.viaToken ? "api-token" : undefined);
  try {
    if (body.fromRepo) {
      const version = await cutArtifactVersionFromRepo(g.proto.key, g.proto.siteKey, { notes: body.notes, createdBy });
      return NextResponse.json({ version }, { status: 201 });
    }
    if (!body.gitSha?.trim()) return NextResponse.json({ error: "A git commit SHA is required" }, { status: 400 });
    const version = await cutArtifactVersion(g.proto.key, g.proto.siteKey, {
      gitSha: body.gitSha,
      gitRef: body.gitRef,
      notes: body.notes,
      createdBy,
    });
    return NextResponse.json({ version }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
