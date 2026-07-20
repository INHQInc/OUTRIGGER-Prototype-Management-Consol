import { NextRequest, NextResponse } from "next/server";
import { capturePage } from "@/lib/capture/capture";
import { getAllSites } from "@/lib/sites";

export const maxDuration = 300;

/** POST { siteKey, urls: string[] } → captures each page, returns per-url result. */
export async function POST(req: NextRequest) {
  let body: { siteKey?: string; urls?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { siteKey, urls } = body;
  const sites = await getAllSites();
  if (!siteKey || !(siteKey in sites)) {
    return NextResponse.json({ error: `Unknown siteKey. Use one of: ${Object.keys(sites).join(", ")}` }, { status: 400 });
  }
  if (!Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json({ error: "urls[] required" }, { status: 400 });
  }

  const results = [];
  for (const url of urls) {
    try {
      const meta = await capturePage(url, siteKey);
      results.push({
        url,
        ok: true,
        slug: meta.pageSlug,
        version: meta.version,
        assetCount: meta.assetCount,
        removedCount: meta.report.removed.length,
      });
    } catch (e) {
      results.push({ url, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ results });
}
