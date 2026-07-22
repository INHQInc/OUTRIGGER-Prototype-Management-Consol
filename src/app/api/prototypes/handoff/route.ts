import { NextRequest, NextResponse } from "next/server";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { getContentStore } from "@/lib/content/store";
import { currentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";

/** POST { key, prLink? } → record the handoff (hosted record) + mark shipped.
 *  Session-only; the integration itself is computed locally by Claude. */
export async function POST(req: NextRequest) {
  let body: { key?: string; prLink?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const g = await guardPrototypeAccess(body.key ?? null, req.headers.get("authorization"), { tokenAllowed: false });
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const store = await getContentStore();
  const user = await currentUser();
  const by = user?.name ?? user?.sub ?? "system";
  const now = new Date().toISOString();
  const prLink = (body.prLink ?? "").trim() || undefined;

  await store.setFlag(`handoff:${g.proto.key}`, JSON.stringify({ prLink, at: now, by }));
  await store.putPrototype({ ...g.proto, status: "shipped", updatedAt: now });
  await audit(g.orgId, by, "prototype.handoff", g.proto.name, prLink ?? "shipped (no PR link)");
  return NextResponse.json({ ok: true });
}
