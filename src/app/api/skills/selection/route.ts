import { NextRequest, NextResponse } from "next/server";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { resolveSkillsForPrototype, setSkillSelection } from "@/lib/skills/skills";

/** GET ?key= → which skills apply to this prototype and whether each is on. */
export async function GET(req: NextRequest) {
  const g = await guardPrototypeAccess(req.nextUrl.searchParams.get("key"), req.headers.get("authorization"));
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  return NextResponse.json({ skills: await resolveSkillsForPrototype(g.orgId, g.proto.key) });
}

/** PUT { key, enabledIds } — session only; a read-scoped API token must not reconfigure. */
export async function PUT(req: NextRequest) {
  let body: { key?: string; enabledIds?: string[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const g = await guardPrototypeAccess(body.key ?? null, req.headers.get("authorization"), { tokenAllowed: false });
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  await setSkillSelection(g.proto.key, body.enabledIds ?? []);
  return NextResponse.json({ skills: await resolveSkillsForPrototype(g.orgId, g.proto.key) });
}
