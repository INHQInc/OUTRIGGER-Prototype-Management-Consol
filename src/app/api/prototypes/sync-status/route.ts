import { NextRequest, NextResponse } from "next/server";
import { getContentStore } from "@/lib/content/store";
import { resolvePrototypeOrg } from "@/lib/prototypes/org";
import { contentHashOf } from "@/lib/prototypes/provision";
import { enabledSkillsForPrototype } from "@/lib/skills/skills";
import { ensureSkillsSeeded } from "@/lib/skills/seed";

/**
 * GET /api/prototypes/sync-status?key=<key> → what the branch SHOULD contain.
 *
 * The console is canonical; a branch's `.opmc/**` and `.claude/skills/**` are a
 * materialised copy that goes stale the moment the brief is edited or the skill
 * selection changes — silently, because nothing tells the instance working in
 * that branch. So it must ask, every session.
 *
 * Tokenless, same rationale as /api/loader/status: orienting must work before
 * any credential exists. Returns only what the branch already carries in plain
 * text — a content hash, skill ids, and timestamps.
 *
 * Claude compares this against `.opmc/context.json` → contentHash and
 * `.opmc/skills.json` → managed[]. Any difference means: tell the user to
 * Re-sync, then `git pull`, before building.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || !/^[a-zA-Z0-9_-]+$/.test(key)) {
    return NextResponse.json({ error: "key required" }, { status: 400, headers: CORS });
  }
  const proto = await (await getContentStore()).getPrototype(key);
  if (!proto) return NextResponse.json({ error: "Unknown prototype" }, { status: 404, headers: CORS });

  const orgId = await resolvePrototypeOrg(proto);
  await ensureSkillsSeeded(orgId);
  const skills = await enabledSkillsForPrototype(orgId, key).catch(() => []);

  // Last provision, so we can say when the branch was last written.
  let provisionedAt: string | null = null;
  try {
    const raw = await (await getContentStore()).getFlag(`provision:${key}`);
    if (raw) provisionedAt = (JSON.parse(raw) as { provisionedAt?: string }).provisionedAt ?? null;
  } catch { /* never provisioned */ }

  return NextResponse.json({
    key,
    // Compare with .opmc/context.json → contentHash
    contentHash: contentHashOf(proto),
    // Compare with .opmc/skills.json → managed[]
    skills: skills.map((s) => s.id).sort(),
    stage: proto.status,
    provisionedAt,
    targets: proto.targets.map((t) => t.url),
    hint: "Compare contentHash with .opmc/context.json and skills with .opmc/skills.json. If either differs, ask the user to Re-sync the prototype in the console, then git pull.",
  }, { headers: CORS });
}
