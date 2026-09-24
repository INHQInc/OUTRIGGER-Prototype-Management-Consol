import { NextRequest, NextResponse } from "next/server";
import { trackedEventsFor } from "@/lib/prototypes/tracked-events";

/**
 * The tracked-events overlay's data for one prototype
 * (lib/prototypes/tracked-events).
 *
 * The loader calls this ONLY when a page's address carries ?opmc_metrics=1,
 * never on a normal page load. The answer is CDN-cached, so a burst of reloads
 * or a shared link reads Optimizely at most once per five minutes per
 * prototype.
 */
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };
const cached = (seconds: number) => ({ ...CORS, "Cache-Control": `public, s-maxage=${seconds}, stale-while-revalidate=${seconds * 2}` });

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { ...CORS, "Cache-Control": "no-store" } });
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || !/^[a-zA-Z0-9_-]+$/.test(key)) {
    return NextResponse.json({ error: "key required" }, { status: 400, headers: cached(60) });
  }
  try {
    const r = await trackedEventsFor(key);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status, headers: cached(30) });
    return NextResponse.json(r.data, { headers: cached(300) });
  } catch {
    // Optimizely down or the token revoked: cache briefly, so it retries soon.
    return NextResponse.json({ error: "Couldn't read the experiment from Optimizely." }, { status: 502, headers: cached(30) });
  }
}
