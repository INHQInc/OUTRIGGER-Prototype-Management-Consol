import { NextRequest, NextResponse } from "next/server";
import { getContentStore } from "@/lib/content/store";
import { resolveRepoSource } from "@/lib/prototypes/source";
import { getSite } from "@/lib/sites";
import { canAccessOrg } from "@/lib/active-org";

/**
 * GET ?key=<prototypeKey> → the prototype's repo-source status (repo, branch,
 * artifact path, whether the built variation is present at HEAD). Never returns
 * the variation body — just the status the workspace needs.
 */
export async function GET(req: NextRequest) {
  const prototypeKey = req.nextUrl.searchParams.get("key");
  if (!prototypeKey) return NextResponse.json({ error: "prototype key required" }, { status: 400 });
  const proto = await (await getContentStore()).getPrototype(prototypeKey);
  if (!proto) return NextResponse.json({ error: "Unknown prototype" }, { status: 404 });
  const site = await getSite(proto.siteKey);
  if (site?.orgId && !(await canAccessOrg(site.orgId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const src = await resolveRepoSource(prototypeKey);
    // Strip the variation body — status only.
    const { variationJs, ...status } = src;
    void variationJs;
    return NextResponse.json({ source: { ...status, bytes: src.variationJs ? src.variationJs.length : 0 } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
