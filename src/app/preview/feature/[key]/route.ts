import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { readManifest } from "@/lib/features/registry";
import { buildVariationExport } from "@/lib/optimizely/export";
import { snapshotsRoot } from "@/lib/registry";

/**
 * Serve a captured page with a feature overlaid — the QA harness.
 *   /preview/feature/<key>?variant=1   → clone + overlay (variant)
 *   /preview/feature/<key>             → clone as-is (control)
 *   optional &target=<index> to pick among the feature's targets.
 *
 * The overlay is the exact same variation JS we export to Optimizely, so what
 * you QA here is what ships as the experiment variation.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) return new NextResponse("Not found", { status: 404 });

  const manifest = await readManifest(key);
  if (!manifest || !manifest.targets.length) return new NextResponse("No target", { status: 404 });

  const idx = Number(req.nextUrl.searchParams.get("target") ?? "0") || 0;
  const target = manifest.targets[idx] ?? manifest.targets[0];
  const variant = req.nextUrl.searchParams.get("variant") === "1";

  const pageDir = join(snapshotsRoot(), target.siteKey, "pages", target.slug);
  let version = target.version;
  try {
    if (version === "latest") {
      const versions = (await readdir(pageDir)).sort();
      if (!versions.length) return new NextResponse("No versions", { status: 404 });
      version = versions[versions.length - 1];
    }
    let html = await readFile(join(pageDir, version, "index.html"), "utf8");

    if (variant) {
      const exp = await buildVariationExport(manifest);
      const script = `\n<script data-opmc-preview="${key}">\n${exp.variationJs}\n</script>\n`;
      html = html.includes("</body>") ? html.replace("</body>", `${script}</body>`) : html + script;
    }

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
