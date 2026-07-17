import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";

/**
 * Serve a captured page version.
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
  const pageDir = join(process.cwd(), "snapshots", siteKey, "pages", slug);
  try {
    let v = version;
    if (version === "latest") {
      const versions = (await readdir(pageDir)).sort();
      if (!versions.length) return new NextResponse("No versions", { status: 404 });
      v = versions[versions.length - 1];
    }
    const html = await readFile(join(pageDir, v, "index.html"), "utf8");
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
