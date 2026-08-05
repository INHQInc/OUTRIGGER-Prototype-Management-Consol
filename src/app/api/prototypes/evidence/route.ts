/**
 * The evidence board: screenshots of each arm, annotated with the tracked
 * elements. Marks store a MEASURE KEY, never a number — the readout resolves
 * the live value, so an annotation can't drift from the data it points at.
 *
 * GET  ?key=            -> board
 * POST { key, addShot } -> store a screenshot (data URL, downsized client-side)
 * POST { key, setShot } -> label / rebind a shot to a variation
 * POST { key, dropShot }-> remove a shot (and its marks)
 * POST { key, mark }    -> add or update one mark
 * POST { key, dropMark }-> remove a mark
 * POST { key, caption } -> the board's one-line framing
 */

import { NextRequest, NextResponse } from "next/server";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { audit } from "@/lib/audit";
import { currentUser } from "@/lib/auth/current";
import {
  getEvidenceBoard, mutateEvidenceBoard, putEvidenceImage,
  type EvidenceMark, type EvidenceShot,
} from "@/lib/prototypes/evidence";

export const maxDuration = 30;

const id = (p: string) => `${p}${Math.random().toString(36).slice(2, 9)}`;
const clampPct = (v: unknown, fallback = 0) => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.min(100, Math.max(0, n));
};

export async function GET(req: NextRequest) {
  const g = await guardPrototypeAccess(req.nextUrl.searchParams.get("key"), req.headers.get("authorization"), { tokenAllowed: false });
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  return NextResponse.json({ board: await getEvidenceBoard(g.proto.key) });
}

export async function POST(req: NextRequest) {
  let body: {
    key?: string;
    addShot?: { dataUrl?: string; label?: string; variationId?: string; width?: number; height?: number };
    setShot?: { id?: string; label?: string; variationId?: string };
    dropShot?: string;
    mark?: Partial<EvidenceMark> & { id?: string; shotId?: string; measureKey?: string };
    dropMark?: string;
    caption?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request body." }, { status: 400 });
  }

  const g = await guardPrototypeAccess(body.key ?? null, req.headers.get("authorization"), { tokenAllowed: false });
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const user = await currentUser();
  const actor = user?.name ?? user?.sub ?? "user";

  try {
    if (body.addShot?.dataUrl) {
      const stored = await putEvidenceImage({ siteKey: g.proto.siteKey, dataUrl: body.addShot.dataUrl });
      const shot: EvidenceShot = {
        id: id("s_"),
        variationId: String(body.addShot.variationId ?? "").slice(0, 64),
        label: String(body.addShot.label ?? "Screenshot").slice(0, 80),
        asset: stored.asset,
        contentType: stored.contentType,
        width: typeof body.addShot.width === "number" ? body.addShot.width : undefined,
        height: typeof body.addShot.height === "number" ? body.addShot.height : undefined,
        addedAt: new Date().toISOString(),
      };
      const board = await mutateEvidenceBoard(g.proto.key, actor, (cur) => ({
        ...cur, shots: [...cur.shots, shot].slice(-8),
      }));
      await audit(g.orgId, actor, "evidence.shot-added", g.proto.name, `${shot.label} (${Math.round(stored.bytes / 1024)}KB)`);
      return NextResponse.json({ board, shotId: shot.id });
    }

    if (body.setShot?.id) {
      const board = await mutateEvidenceBoard(g.proto.key, actor, (cur) => ({
        ...cur,
        shots: cur.shots.map((s) => s.id !== body.setShot!.id ? s : {
          ...s,
          label: body.setShot!.label !== undefined ? String(body.setShot!.label).slice(0, 80) : s.label,
          variationId: body.setShot!.variationId !== undefined ? String(body.setShot!.variationId).slice(0, 64) : s.variationId,
        }),
      }));
      return NextResponse.json({ board });
    }

    if (body.dropShot) {
      const board = await mutateEvidenceBoard(g.proto.key, actor, (cur) => ({
        ...cur,
        shots: cur.shots.filter((s) => s.id !== body.dropShot),
        marks: cur.marks.filter((m) => m.shotId !== body.dropShot),
      }));
      await audit(g.orgId, actor, "evidence.shot-removed", g.proto.name, String(body.dropShot));
      return NextResponse.json({ board });
    }

    if (body.mark) {
      const inc = body.mark;
      const board = await mutateEvidenceBoard(g.proto.key, actor, (cur) => {
        const existing = inc.id ? cur.marks.find((m) => m.id === inc.id) : undefined;
        if (!existing && (!inc.shotId || !inc.measureKey)) return null;
        const next: EvidenceMark = {
          id: existing?.id ?? id("m_"),
          shotId: existing?.shotId ?? String(inc.shotId),
          measureKey: inc.measureKey !== undefined ? String(inc.measureKey).slice(0, 220) : existing!.measureKey,
          x: clampPct(inc.x, existing?.x ?? 0),
          y: clampPct(inc.y, existing?.y ?? 0),
          w: Math.max(0.5, clampPct(inc.w, existing?.w ?? 10)),
          h: Math.max(0.5, clampPct(inc.h, existing?.h ?? 6)),
          tone: (inc.tone ?? existing?.tone) || undefined,
          note: inc.note !== undefined ? String(inc.note).slice(0, 240) : existing?.note,
        };
        return {
          ...cur,
          marks: existing ? cur.marks.map((m) => (m.id === next.id ? next : m)) : [...cur.marks, next].slice(-60),
        };
      });
      return NextResponse.json({ board });
    }

    if (body.dropMark) {
      const board = await mutateEvidenceBoard(g.proto.key, actor, (cur) => ({
        ...cur, marks: cur.marks.filter((m) => m.id !== body.dropMark),
      }));
      return NextResponse.json({ board });
    }

    if (body.caption !== undefined) {
      const caption = String(body.caption).slice(0, 240);
      const board = await mutateEvidenceBoard(g.proto.key, actor, (cur) => ({ ...cur, caption: caption || undefined }));
      return NextResponse.json({ board });
    }

    return NextResponse.json({ error: "Nothing to do." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "That didn't work." }, { status: 400 });
  }
}
