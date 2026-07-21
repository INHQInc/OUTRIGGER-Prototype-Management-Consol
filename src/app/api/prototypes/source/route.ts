import { NextRequest, NextResponse } from "next/server";
import { resolveRepoSource } from "@/lib/prototypes/source";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";

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
    return NextResponse.json({ source: { ...status, bytes: src.variationJs ? src.variationJs.length : 0 } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
