import { NextRequest, NextResponse } from "next/server";
import { getContentStore } from "@/lib/content/store";
import { getPrototypeOverlay, savePrototypeOverlay, buildOverlayVariation } from "@/lib/prototypes/overlay";
import type { OverlayBlock } from "@/lib/prototypes/types";
import { getSite } from "@/lib/sites";
import { canAccessOrg } from "@/lib/active-org";

async function guard(prototypeKey: string | null) {
  if (!prototypeKey) return { error: "prototype key required", status: 400 as const };
  const proto = await (await getContentStore()).getPrototype(prototypeKey);
  if (!proto) return { error: "Unknown prototype", status: 404 as const };
  const site = await getSite(proto.siteKey);
  if (site?.orgId && !(await canAccessOrg(site.orgId))) return { error: "Forbidden", status: 403 as const };
  return { prototypeKey, siteKey: proto.siteKey };
}

/** GET ?key=<prototypeKey> → the overlay + its compiled variation lint. */
export async function GET(req: NextRequest) {
  const g = await guard(req.nextUrl.searchParams.get("key"));
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const overlay = await getPrototypeOverlay(g.prototypeKey);
  const built = buildOverlayVariation(g.prototypeKey, overlay);
  return NextResponse.json({ overlay, lint: built.lint, bytes: built.bytes, isEmpty: built.isEmpty });
}

/** POST { prototypeKey, css?, js?, blocks? } → save the overlay. */
export async function POST(req: NextRequest) {
  let body: { prototypeKey?: string; css?: string; js?: string; blocks?: OverlayBlock[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const g = await guard(body.prototypeKey ?? null);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const overlay = await savePrototypeOverlay(g.prototypeKey, g.siteKey, { css: body.css, js: body.js, blocks: body.blocks });
  const built = buildOverlayVariation(g.prototypeKey, overlay);
  return NextResponse.json({ overlay, lint: built.lint, bytes: built.bytes, isEmpty: built.isEmpty }, { status: 201 });
}
