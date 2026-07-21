import { NextRequest, NextResponse } from "next/server";
import { getContentStore } from "@/lib/content/store";
import { listArtifactVersions, cutArtifactVersion, cutArtifactVersionFromRepo } from "@/lib/prototypes/versions";
import { getSite } from "@/lib/sites";
import { canAccessOrg } from "@/lib/active-org";
import { currentUser } from "@/lib/auth/current";

/** Resolve a prototype + tenant-guard via its site's org. */
async function guardPrototype(prototypeKey: string | null) {
  if (!prototypeKey) return { error: "prototype key required", status: 400 as const };
  const proto = await (await getContentStore()).getPrototype(prototypeKey);
  if (!proto) return { error: "Unknown prototype", status: 404 as const };
  const site = await getSite(proto.siteKey);
  if (site?.orgId && !(await canAccessOrg(site.orgId))) return { error: "Forbidden", status: 403 as const };
  return { prototypeKey, siteKey: proto.siteKey };
}

/** GET ?key=<prototypeKey> → the prototype's immutable versions (newest first). */
export async function GET(req: NextRequest) {
  const g = await guardPrototype(req.nextUrl.searchParams.get("key"));
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  return NextResponse.json({ versions: await listArtifactVersions(g.prototypeKey) });
}

/**
 * POST → cut an immutable version.
 *   { prototypeKey, fromRepo: true, notes? }        → pull the built variation from the branch (primary)
 *   { prototypeKey, gitSha, gitRef?, notes? }        → pin a SHA manually (fallback, no code pulled)
 */
export async function POST(req: NextRequest) {
  let body: { prototypeKey?: string; fromRepo?: boolean; gitSha?: string; gitRef?: string; notes?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const g = await guardPrototype(body.prototypeKey ?? null);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const user = await currentUser();
  const createdBy = user?.name ?? user?.sub;
  try {
    if (body.fromRepo) {
      const version = await cutArtifactVersionFromRepo(g.prototypeKey, g.siteKey, { notes: body.notes, createdBy });
      return NextResponse.json({ version }, { status: 201 });
    }
    if (!body.gitSha?.trim()) return NextResponse.json({ error: "A git commit SHA is required" }, { status: 400 });
    const version = await cutArtifactVersion(g.prototypeKey, g.siteKey, {
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
