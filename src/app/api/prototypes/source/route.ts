import { NextRequest, NextResponse } from "next/server";
import { resolveRepoSource } from "@/lib/prototypes/source";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { detectNamespace, artifactProblem } from "@/lib/prototypes/served";

/**
 * GET ?key=<prototypeKey> → the prototype's repo-source status (repo, branch,
 * artifact path, whether the built variation is present at HEAD). Never returns
 * the variation body — just the status the workspace needs.
 */
export async function GET(req: NextRequest) {
  const g = await guardPrototypeAccess(req.nextUrl.searchParams.get("key"), req.headers.get("authorization"));
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  try {
    const src = await resolveRepoSource(g.proto.key);
    // Strip the variation body — status only.
    const { variationJs, ...status } = src;
    void variationJs;
    // Namespace tells us whether the artifact actually belongs to THIS prototype
    // — a fresh branch inherits `starter`'s stale build until its first commit.
    const namespace = detectNamespace(src.variationJs);
    return NextResponse.json({
      source: {
        ...status,
        bytes: src.variationJs ? Buffer.byteLength(src.variationJs, "utf8") : 0,
        namespace: namespace ?? null,
        expectedNamespace: `opmc-${g.proto.key}`,
        artifactProblem: artifactProblem(src.variationJs),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
