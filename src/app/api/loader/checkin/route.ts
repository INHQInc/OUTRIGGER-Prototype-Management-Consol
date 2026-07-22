import { NextRequest, NextResponse } from "next/server";
import { getContentStore } from "@/lib/content/store";

/**
 * Claude check-in — the opmc-prototype skill pings this once on orient (after
 * it reads .opmc/ from the tree), so the console knows Claude has actually
 * started on a prototype. Public (under /api/loader), fail-silent, keyed by
 * prototype key — no token needed (mirrors the loader heartbeat).
 */
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Cache-Control": "no-store" };
export function OPTIONS() { return new NextResponse(null, { status: 204, headers: CORS }); }
export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || !/^[a-zA-Z0-9_-]{1,128}$/.test(key)) return new NextResponse(null, { status: 204, headers: CORS });
  try { await (await getContentStore()).setFlag(`claude:seen:${key}`, new Date().toISOString()); } catch { /* best-effort */ }
  return new NextResponse(null, { status: 204, headers: CORS });
}
