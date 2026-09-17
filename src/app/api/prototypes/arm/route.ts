import { NextRequest, NextResponse } from "next/server";
import { getContentStore } from "@/lib/content/store";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { currentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";

/**
 * POST /api/prototypes/arm  { key, groupId, groupName? }  → join an A/B/n test.
 * `groupId: null` leaves it.
 *
 * The group is a DECLARATION, not a derivation: it exists while the arms are
 * still being built, long before an Optimizely experiment does. Binding later
 * realises it — and because nothing stops two arms binding to different
 * experiments, the group is what makes that mistake visible.
 */
export async function POST(req: NextRequest) {
  let body: { key?: string; groupId?: string | null; groupName?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.key) return NextResponse.json({ error: "key required" }, { status: 400 });

  const g = await guardPrototypeAccess(body.key, req.headers.get("authorization"), { tokenAllowed: false });
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const raw = body.groupId?.trim() || null;
  if (raw && !/^[a-z0-9][a-z0-9-]{1,60}$/.test(raw)) {
    return NextResponse.json({ error: "groupId must be lowercase letters, digits and hyphens." }, { status: 400 });
  }

  const user = await currentUser().catch(() => null);
  const actor = user?.name ?? user?.sub ?? "system";
  const store = await getContentStore();
  const arm = raw
    ? { groupId: raw, ...(body.groupName?.trim() ? { groupName: body.groupName.trim() } : {}), addedAt: new Date().toISOString(), addedBy: actor }
    : undefined;

  await store.putPrototype({ ...g.proto, arm, updatedAt: new Date().toISOString() });
  await audit(g.orgId, actor, "prototype.arm", g.proto.name,
    raw ? `joined test group "${raw}"` : "left its test group").catch(() => null);

  return NextResponse.json({ ok: true, key: body.key, arm: arm ?? null });
}
