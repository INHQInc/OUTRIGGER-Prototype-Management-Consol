import { NextRequest, NextResponse } from "next/server";
import { getContentStore } from "@/lib/content/store";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { currentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";
import { BOARD_COLUMNS, type BoardColumn } from "@/lib/prototypes/board-model";

/**
 * POST /api/prototypes/hold  { key, column }  → park a card in an earlier column.
 *
 * The pipeline derives a card's column from the facts, and the facts cannot
 * tell "built" from "still being worked on" — a branch carrying a build looks
 * finished whether or not anyone is done with it. This is the one place a
 * human overrules that, and it only ever pulls a card BACKWARD: the board
 * clamps the stored value to the derived column, so a hold can never claim
 * progress. `column: null` releases it.
 *
 * Recorded in the audit log, because an override that nobody can see is how a
 * board starts lying.
 */
export async function POST(req: NextRequest) {
  let body: { key?: string; column?: string | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.key) return NextResponse.json({ error: "key required" }, { status: 400 });

  const g = await guardPrototypeAccess(body.key, req.headers.get("authorization"), { tokenAllowed: false });
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const column = body.column ?? null;
  if (column !== null && !BOARD_COLUMNS.some((c) => c.id === column)) {
    return NextResponse.json({ error: `column must be null or one of ${BOARD_COLUMNS.map((c) => c.id).join(", ")}` }, { status: 400 });
  }

  const store = await getContentStore();
  await store.setFlag(`hold:${body.key}`, column ?? "");

  const user = await currentUser();
  const actor = user?.name ?? user?.sub ?? "system";
  await audit(g.orgId, actor, "prototype.hold", g.proto.name,
    column ? `held at ${column}` : "hold released");

  return NextResponse.json({ ok: true, key: body.key, column: column as BoardColumn | null });
}
