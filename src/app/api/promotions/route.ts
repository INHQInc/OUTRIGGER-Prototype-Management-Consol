import { NextRequest, NextResponse } from "next/server";
import { listPromotions, promote } from "@/lib/promotions";
import type { PromotionVehicle } from "@/lib/promotions/types";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { currentUser } from "@/lib/auth/current";

/** GET ?key=<prototypeKey> → promotion history (newest first). */
export async function GET(req: NextRequest) {
  const g = await guardPrototypeAccess(req.nextUrl.searchParams.get("key"), req.headers.get("authorization"));
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  return NextResponse.json({ promotions: await listPromotions(g.proto.key) });
}

/** POST { prototypeKey, versionId, environmentId, vehicle? } → promote a version. */
export async function POST(req: NextRequest) {
  let body: { prototypeKey?: string; versionId?: string; environmentId?: string; vehicle?: PromotionVehicle };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const g = await guardPrototypeAccess(body.prototypeKey ?? null, req.headers.get("authorization"));
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  if (!body.versionId) return NextResponse.json({ error: "versionId required" }, { status: 400 });
  if (!body.environmentId) return NextResponse.json({ error: "environmentId required" }, { status: 400 });
  const user = await currentUser();
  try {
    const promotion = await promote({
      prototypeKey: g.proto.key,
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
