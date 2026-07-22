import { NextRequest, NextResponse } from "next/server";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { provisionBranch } from "@/lib/prototypes/provision";
import { currentUser } from "@/lib/auth/current";

export const maxDuration = 300; // Firecrawl snapshots can be slow

/** POST { key } → provision (or re-sync) the prototype's branch with .opmc/**.
 *  Session-only (writes to git via the org's connection) — the read-scoped API
 *  token can't trigger it. */
export async function POST(req: NextRequest) {
  let body: { key?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const g = await guardPrototypeAccess(body.key ?? null, req.headers.get("authorization"), { tokenAllowed: false });
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const consoleUrl = `https://${req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "outrigger-prototype-management-cons.vercel.app"}`;
  const user = await currentUser();
  try {
    const result = await provisionBranch(g.proto.key, consoleUrl, user?.name ?? user?.sub);
    return NextResponse.json({ result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Provisioning failed" }, { status: 400 });
  }
}
