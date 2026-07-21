import { NextRequest, NextResponse } from "next/server";
import { readManifest } from "@/lib/features/registry";
import { buildVariationExport } from "@/lib/optimizely/export";
import { getPrototypeOverlay, buildOverlayVariation } from "@/lib/prototypes/overlay";

/**
 * Overlay payload for the loader. The loader script (served at
 * /loader/<siteKey>) fetches this cross-origin from the live site and runs the
 * returned JS, which injects the prototype's CSS + HTML at its anchor — the
 * exact same self-contained variation code we ship to Optimizely.
 *
 * CORS is open (*) because it runs on the customer's own live pages. Returns
 * { js: null } when the key has no built overlay (nothing injects).
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || !/^[a-zA-Z0-9_-]+$/.test(key)) {
    return NextResponse.json({ error: "key required" }, { status: 400, headers: CORS });
  }
  // Prefer the store-based prototype overlay (authored in the console).
  const overlay = await getPrototypeOverlay(key);
  if (overlay) {
    const built = buildOverlayVariation(key, overlay);
    if (!built.isEmpty) return NextResponse.json({ js: built.variationJs, name: key }, { headers: CORS });
  }

  // Fall back to a legacy file-based feature overlay.
  const manifest = await readManifest(key);
  if (!manifest) {
    // No built overlay for this key yet (e.g. a metadata-only prototype).
    return NextResponse.json({ js: null }, { status: 200, headers: CORS });
  }
  const exp = await buildVariationExport(manifest);
  return NextResponse.json({ js: exp.variationJs, name: manifest.name }, { headers: CORS });
}
