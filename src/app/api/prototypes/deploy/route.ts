import { NextRequest, NextResponse } from "next/server";
import { getContentStore } from "@/lib/content/store";
import { deployOverlayToGit } from "@/lib/prototypes/deploy";
import { getSite } from "@/lib/sites";
import { canAccessOrg } from "@/lib/active-org";
import { currentUser } from "@/lib/auth/current";

/** POST { prototypeKey } → commit the overlay to the feature repo + auto-cut a version. */
export async function POST(req: NextRequest) {
  let body: { prototypeKey?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.prototypeKey) return NextResponse.json({ error: "prototypeKey required" }, { status: 400 });
  const proto = await (await getContentStore()).getPrototype(body.prototypeKey);
  if (!proto) return NextResponse.json({ error: "Unknown prototype" }, { status: 404 });
  const site = await getSite(proto.siteKey);
  if (site?.orgId && !(await canAccessOrg(site.orgId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const user = await currentUser();
  try {
    const deploy = await deployOverlayToGit(body.prototypeKey, user?.name ?? user?.sub);
    return NextResponse.json({ deploy }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
