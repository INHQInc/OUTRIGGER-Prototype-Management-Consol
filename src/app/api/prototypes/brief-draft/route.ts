import { NextRequest, NextResponse } from "next/server";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { draftBrief } from "@/lib/ai/brief";

export const maxDuration = 60;

/** POST { key, text, answers? } → AI-drafted structured brief (session-only). */
export async function POST(req: NextRequest) {
  let body: { key?: string; text?: string; answers?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.text?.trim()) return NextResponse.json({ error: "Explain the experiment first — a couple of sentences is plenty." }, { status: 400 });
  // Session-only: this spends console-level API credit; agents PATCH briefs directly.
  const g = await guardPrototypeAccess(body.key ?? null, req.headers.get("authorization"), { tokenAllowed: false });
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  try {
    const draft = await draftBrief({ orgId: g.orgId, proto: g.proto, userText: body.text, answers: body.answers });
    return NextResponse.json({ draft });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
