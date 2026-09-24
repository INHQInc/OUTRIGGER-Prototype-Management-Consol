import { NextRequest, NextResponse } from "next/server";
import { trackedResultsFor } from "@/lib/prototypes/tracked-events";

/**
 * Results for the tracked-events overlay: each event's reading, worded like
 * the Evidence board (lib/prototypes/tracked-events → resultReadings).
 *
 * The loader calls this ONLY when a page's address carries ?opmc_analytics=1.
 * Not gated, by Bryan's decision (24 Sep 2026): anyone with the flag and the
 * prototype's key can read the results. Never cached, so the numbers are the
 * ones Optimizely has now.
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
    const r = await trackedResultsFor(key);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status, headers: HEADERS });
    return NextResponse.json(r.data, { headers: HEADERS });
  } catch {
    return NextResponse.json({ error: "Couldn't read the results from Optimizely." }, { status: 502, headers: HEADERS });
  }
}
