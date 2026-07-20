import { NextRequest, NextResponse } from "next/server";
import { getContentStore } from "@/lib/content/store";

/**
 * Serve a captured page version from the content store.
 *   /snap/<siteKey>/<slug>/<version>   (version = "latest" resolves newest)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ siteKey: string; slug: string; version: string }> }
) {
  const { siteKey, slug, version } = await params;
  if (![siteKey, slug, version].every((s) => /^[a-zA-Z0-9_.-]+$/.test(s))) {
    return new NextResponse("Not found", { status: 404 });
  }
  const store = await getContentStore();

  let v = version;
  if (version === "latest") {
    const versions = await store.listVersions(siteKey, slug);
    if (!versions.length) return new NextResponse("No versions", { status: 404 });
    v = versions[versions.length - 1];
  }

  const html = await store.getHtml(siteKey, slug, v);
  if (html === null) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
