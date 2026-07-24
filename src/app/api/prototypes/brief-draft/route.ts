import { NextRequest, NextResponse } from "next/server";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { draftBrief, refineBrief, type BriefDraft, type BriefSection } from "@/lib/ai/brief";
import { referenceKind, type BriefReference } from "@/lib/prototypes/types";
import { currentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";

/** Sanitize inbound references the same way the brief PATCH does. */
function cleanRefs(raw: { url?: string; label?: string }[] | undefined): BriefReference[] {
  return (raw ?? [])
    .map((r) => ({ url: (r?.url ?? "").trim(), label: r?.label?.trim() || undefined }))
    .filter((r) => /^https?:\/\//i.test(r.url))
    .slice(0, 20)
    .map((r) => ({ ...r, kind: referenceKind(r.url) }));
}

export const maxDuration = 60;

const SECTIONS: BriefSection[] = ["change", "where", "doneLooksLike", "hypothesis", "metrics"];

/**
 * POST { key, text, answers? }                          → AI-drafted brief
 * POST { key, refine: { section, correction, current } } → revise one section
 * Session-only: this spends console-level API credit; agents PATCH directly.
 * A refinement is logged (brief.correction) as a feedback signal for tuning.
 */
export async function POST(req: NextRequest) {
  let body: { key?: string; text?: string; answers?: string; references?: { url?: string; label?: string }[]; refine?: { section?: string; correction?: string; current?: BriefDraft; references?: { url?: string; label?: string }[] } };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const g = await guardPrototypeAccess(body.key ?? null, req.headers.get("authorization"), { tokenAllowed: false });
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  try {
    if (body.refine) {
      const { section, correction, current } = body.refine;
      if (!section || !SECTIONS.includes(section as BriefSection)) return NextResponse.json({ error: "Unknown brief section." }, { status: 400 });
      if (!correction?.trim()) return NextResponse.json({ error: "Say what's off about this section." }, { status: 400 });
      if (!current) return NextResponse.json({ error: "No current brief to refine." }, { status: 400 });
      const draft = await refineBrief({ orgId: g.orgId, proto: g.proto, current, section: section as BriefSection, correction, references: cleanRefs(body.refine.references) });
      const user = await currentUser();
      await audit(g.orgId, user?.name ?? user?.sub ?? "user", "brief.correction", g.proto.name, `${section}: ${correction.trim().slice(0, 200)}`);
      return NextResponse.json({ draft });
    }

    if (!body.text?.trim()) return NextResponse.json({ error: "Explain the experiment first — a couple of sentences is plenty." }, { status: 400 });
    const draft = await draftBrief({ orgId: g.orgId, proto: g.proto, userText: body.text, answers: body.answers, references: cleanRefs(body.references) });
    return NextResponse.json({ draft });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
