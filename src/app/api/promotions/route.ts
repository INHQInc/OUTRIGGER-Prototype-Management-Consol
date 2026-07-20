import { NextRequest, NextResponse } from "next/server";
import { getContentStore } from "@/lib/content/store";
import { listPromotions, promote } from "@/lib/promotions";
import type { PromotionVehicle } from "@/lib/promotions/types";
import { getSite } from "@/lib/sites";
import { canAccessOrg } from "@/lib/active-org";
import { currentUser } from "@/lib/auth/current";

async function guardPrototype(prototypeKey: string | null) {
  if (!prototypeKey) return { error: "prototype key required", status: 400 as const };
  const proto = await (await getContentStore()).getPrototype(prototypeKey);
  if (!proto) return { error: "Unknown prototype", status: 404 as const };
  const site = await getSite(proto.siteKey);
  if (site?.orgId && !(await canAccessOrg(site.orgId))) return { error: "Forbidden", status: 403 as const };
  return { prototypeKey };
}

/** GET ?key=<prototypeKey> → promotion history (newest first). */
export async function GET(req: NextRequest) {
  const g = await guardPrototype(req.nextUrl.searchParams.get("key"));
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  return NextResponse.json({ promotions: await listPromotions(g.prototypeKey) });
}

/** POST { prototypeKey, versionId, environmentId, vehicle? } → promote a version. */
export async function POST(req: NextRequest) {
  let body: { prototypeKey?: string; versionId?: string; environmentId?: string; vehicle?: PromotionVehicle };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const g = await guardPrototype(body.prototypeKey ?? null);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  if (!body.versionId) return NextResponse.json({ error: "versionId required" }, { status: 400 });
  if (!body.environmentId) return NextResponse.json({ error: "environmentId required" }, { status: 400 });
  const user = await currentUser();
  try {
    const promotion = await promote({
      prototypeKey: g.prototypeKey,
      versionId: body.versionId,
      environmentId: body.environmentId,
      vehicle: body.vehicle,
      actor: user?.name ?? user?.sub,
    });
    return NextResponse.json({ promotion }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
