import { NextRequest, NextResponse } from "next/server";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { getContentStore } from "@/lib/content/store";
import { pushToOptimizely, lastPush } from "@/lib/prototypes/ship";
import { currentUser } from "@/lib/auth/current";

/** GET ?key= → the binding + last push state for the Ship panel. */
export async function GET(req: NextRequest) {
  const g = await guardPrototypeAccess(req.nextUrl.searchParams.get("key"), req.headers.get("authorization"));
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  return NextResponse.json({ experiment: g.proto.experiment ?? null, lastPush: await lastPush(g.proto.key) });
}

/**
 * POST { key, bind?: { experimentId, variationId, experimentName?, variationName? }, push?: true, override?: true }
 * Bind and/or push in one call. Binding + push are token-allowed (the skill can
 * ship after a cut); the certification gate still applies to everyone.
 */
export async function POST(req: NextRequest) {
  let body: { key?: string; bind?: { experimentId?: string; variationId?: string; experimentName?: string; variationName?: string }; push?: boolean; override?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const g = await guardPrototypeAccess(body.key ?? null, req.headers.get("authorization"));
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const user = await currentUser();
  const actor = g.viaToken ? "claude (api)" : user?.name ?? user?.sub ?? "user";

  try {
    if (body.bind) {
      const { experimentId, variationId } = body.bind;
      if (!experimentId || !variationId) return NextResponse.json({ error: "bind needs experimentId and variationId" }, { status: 400 });
      const store = await getContentStore();
      const proto = await store.getPrototype(g.proto.key);
      if (!proto) return NextResponse.json({ error: "Unknown prototype" }, { status: 404 });
      proto.experiment = {
        experimentId: String(experimentId),
        variationId: String(variationId),
        experimentName: body.bind.experimentName,
        variationName: body.bind.variationName,
        boundAt: new Date().toISOString(),
        boundBy: actor,
      };
      proto.updatedAt = new Date().toISOString();
      await store.putPrototype(proto);
    }
    if (body.push) {
      const result = await pushToOptimizely(g.proto.key, { override: body.override, actor });
      return NextResponse.json({ result, experiment: (await getContentStore().then((s) => s.getPrototype(g.proto.key)))?.experiment ?? null });
    }
    return NextResponse.json({ ok: true, experiment: (await getContentStore().then((s) => s.getPrototype(g.proto.key)))?.experiment ?? null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
