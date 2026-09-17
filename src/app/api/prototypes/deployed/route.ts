import { NextRequest, NextResponse } from "next/server";
import { getContentStore } from "@/lib/content/store";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { currentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";

/**
 * POST /api/prototypes/deployed  { key, deployed }  → the winner is live.
 *
 * HANDOFF IS A DECISION; DEPLOYED IS A FACT ABOUT PRODUCTION. Handoff means we
 * picked a winner and handed it to the dev team. Whether that team has shipped
 * it is not something this console can see — it happens in another repo, on
 * another release train, often weeks later. So this is a human claim, stored
 * with the date it was made, and it is honest precisely because it does not
 * pretend to be an observation.
 *
 * `deployed: false` clears it — the claim was premature or the release rolled
 * back. Both directions are audited: a shipped-to-production claim nobody can
 * trace is worse than no claim.
 */
export async function POST(req: NextRequest) {
  let body: { key?: string; deployed?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.key) return NextResponse.json({ error: "key required" }, { status: 400 });

  const g = await guardPrototypeAccess(body.key, req.headers.get("authorization"), { tokenAllowed: false });
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const on = body.deployed !== false;
  const at = on ? new Date().toISOString() : "";
  const store = await getContentStore();
  await store.setFlag(`deployed:${body.key}`, at);

  const user = await currentUser().catch(() => null);
  await audit(g.orgId, user?.name ?? user?.sub ?? "system", "prototype.deployed", g.proto.name,
    on ? `marked live in production at ${at}` : "deployment claim cleared").catch(() => null);

  return NextResponse.json({ ok: true, key: body.key, deployedAt: at || null });
}
