import { NextRequest, NextResponse } from "next/server";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { getContentStore } from "@/lib/content/store";
import { currentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";

/**
 * POST { key, skip: true } → leave guided setup for the working model without
 * the base being set (power-user escape hatch). Audited — skipping the
 * guardrails is a choice someone should be able to see later.
 */
export async function POST(req: NextRequest) {
  let body: { key?: string; skip?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const g = await guardPrototypeAccess(body.key ?? null, req.headers.get("authorization"), { tokenAllowed: false });
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  if (!body.skip) return NextResponse.json({ error: "Nothing to do — pass skip." }, { status: 400 });
  const user = await currentUser();
  const actor = user?.name ?? user?.sub ?? "user";
  await (await getContentStore()).setFlag(`setupskip:${g.proto.key}`, new Date().toISOString());
  await audit(g.orgId, actor, "setup.skipped", g.proto.name, "guided setup skipped — straight to the working model");
  return NextResponse.json({ ok: true });
}
