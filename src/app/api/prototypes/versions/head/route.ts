import { NextRequest, NextResponse } from "next/server";
import { getContentStore } from "@/lib/content/store";
import { resolvePrototypeHead } from "@/lib/prototypes/versions";
import { getSite } from "@/lib/sites";
import { canAccessOrg } from "@/lib/active-org";

/**
 * GET ?key=<prototypeKey> → the current HEAD commit of the prototype's feature
 * branch (falls back to base), so the UI can auto-pin a version without a
 * manually-pasted SHA.
 */
export async function GET(req: NextRequest) {
  const prototypeKey = req.nextUrl.searchParams.get("key");
  if (!prototypeKey) return NextResponse.json({ error: "prototype key required" }, { status: 400 });
  const proto = await (await getContentStore()).getPrototype(prototypeKey);
  if (!proto) return NextResponse.json({ error: "Unknown prototype" }, { status: 404 });
  const site = await getSite(proto.siteKey);
  if (site?.orgId && !(await canAccessOrg(site.orgId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json({ head: await resolvePrototypeHead(prototypeKey) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
