import { NextRequest, NextResponse } from "next/server";
import { trackedEventsFor } from "@/lib/prototypes/tracked-events";

/**
 * The tracked-events overlay's data for one prototype
 * (lib/prototypes/tracked-events).
 *
 * The loader calls this ONLY when a page's address carries ?opmc_metrics=1,
 * never on a normal page load. Never cached: the overlay is a checking tool,
 * so a selector edited or a build pushed in Optimizely must show on the next
 * reload. A five-minute cache showed the build Optimizely held before a push
 * (Bryan, 24 Sep). The cost is one experiment read plus one read per metric,
 * only while someone has the overlay open.
 */
const HEADERS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Cache-Control": "no-store" };

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: HEADERS });
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || !/^[a-zA-Z0-9_-]+$/.test(key)) {
    return NextResponse.json({ error: "key required" }, { status: 400, headers: HEADERS });
  }
  try {
    const r = await trackedEventsFor(key);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status, headers: HEADERS });
    return NextResponse.json(r.data, { headers: HEADERS });
  } catch {
    // Optimizely down or the token revoked.
    return NextResponse.json({ error: "Couldn't read the experiment from Optimizely." }, { status: 502, headers: HEADERS });
  }
}
