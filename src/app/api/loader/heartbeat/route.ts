import { NextRequest, NextResponse } from "next/server";
import { getContentStore } from "@/lib/content/store";

/**
 * Loader heartbeat — the loader script beacons here once per browser session
 * from the customer's environment, proving the tag is installed and executing.
 * Public (under /api/loader) + CORS-open: it's called from customer pages.
 * Stores `loader:seen:<siteKey>` = ISO timestamp (read by the setup checklist
 * and site settings).
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  const site = req.nextUrl.searchParams.get("site");
  if (!site || !/^[a-zA-Z0-9_-]{1,64}$/.test(site)) {
    return new NextResponse(null, { status: 204, headers: CORS });
  }
  try {
    await (await getContentStore()).setFlag(`loader:seen:${site}`, new Date().toISOString());
  } catch { /* best-effort — never break the customer's page */ }
  return new NextResponse(null, { status: 204, headers: CORS });
}
