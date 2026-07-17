import { NextRequest, NextResponse } from "next/server";
import { capturePage, SITES } from "@/lib/capture/capture";

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
  if (!siteKey || !(siteKey in SITES)) {
    return NextResponse.json({ error: `Unknown siteKey. Use one of: ${Object.keys(SITES).join(", ")}` }, { status: 400 });
  }
  if (!Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json({ error: "urls[] required" }, { status: 400 });
  }

  const results = [];
  for (const url of urls) {
    try {
      const meta = await capturePage(url, siteKey as keyof typeof SITES);
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
