import { NextRequest, NextResponse } from "next/server";
import { getAllSites, addSite } from "@/lib/sites";

/** GET → all sites (built-in + user-added). */
export async function GET() {
  const sites = await getAllSites();
  return NextResponse.json({ sites: Object.values(sites) });
}

/** POST { origin, label?, assetHosts? } → add a website. */
export async function POST(req: NextRequest) {
  let body: { origin?: string; label?: string; assetHosts?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.origin) {
    return NextResponse.json({ error: "origin is required" }, { status: 400 });
  }
  try {
    const site = await addSite({ origin: body.origin, label: body.label, assetHosts: body.assetHosts });
    return NextResponse.json({ site }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
