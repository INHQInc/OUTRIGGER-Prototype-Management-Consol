import { NextRequest, NextResponse } from "next/server";
import { getAllSites, addSite, updateSiteMode } from "@/lib/sites";
import type { SiteMode } from "@/lib/sites";

/** GET → all sites (built-in + user-added). */
export async function GET() {
  const sites = await getAllSites();
  return NextResponse.json({ sites: Object.values(sites) });
}

/** POST { origin, label?, assetHosts?, mode? } → add a website. */
export async function POST(req: NextRequest) {
  let body: { origin?: string; label?: string; assetHosts?: string[]; mode?: SiteMode };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.origin) {
    return NextResponse.json({ error: "origin is required" }, { status: 400 });
  }
  try {
    const site = await addSite({ origin: body.origin, label: body.label, assetHosts: body.assetHosts, mode: body.mode });
    return NextResponse.json({ site }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

/** PATCH { siteKey, mode } → change a user-added site's mode. */
export async function PATCH(req: NextRequest) {
  let body: { siteKey?: string; mode?: SiteMode };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.siteKey || (body.mode !== "clone" && body.mode !== "live")) {
    return NextResponse.json({ error: "siteKey and mode (clone|live) required" }, { status: 400 });
  }
  try {
    await updateSiteMode(body.siteKey, body.mode);
    return NextResponse.json({ ok: true, mode: body.mode });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
