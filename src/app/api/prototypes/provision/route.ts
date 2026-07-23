import { NextRequest, NextResponse } from "next/server";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { provisionBranch } from "@/lib/prototypes/provision";
import { currentUser } from "@/lib/auth/current";

export const maxDuration = 300; // Firecrawl snapshots can be slow

/**
 * POST { key } → provision (or re-sync) the prototype's branch with `.opmc/**`
 * and the selected `.claude/skills/**`.
 *
 * The org API token IS allowed, so the Claude instance working in a branch can
 * re-sync itself the moment it detects drift instead of stopping to ask a human
 * to click a button. That's a smaller privilege than it sounds: provisioning
 * only MATERIALISES what the console already decided — it changes no canonical
 * data, and the same token can already PATCH the brief and cut versions. The
 * commit is compare-and-swap over `.opmc/**` + `.claude/skills/**` only, so it
 * can never touch src/ or dist/ or rewind a push.
 *
 * Claude should only call this when /api/prototypes/sync-status reports drift —
 * each run re-captures snapshots, so calling it every session is pure noise.
 */
export async function POST(req: NextRequest) {
  let body: { key?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const g = await guardPrototypeAccess(body.key ?? null, req.headers.get("authorization"));
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
