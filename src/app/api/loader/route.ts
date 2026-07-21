import { NextRequest, NextResponse } from "next/server";
import { readManifest } from "@/lib/features/registry";
import { buildVariationExport } from "@/lib/optimizely/export";
import { resolveRepoSource } from "@/lib/prototypes/source";
import { listArtifactVersions } from "@/lib/prototypes/versions";

/**
 * Variation payload for the loader. The loader script (served at
 * /loader/<siteKey>) fetches this cross-origin from the live site and runs the
 * returned JS, which is the self-contained variation built in the prototype's
 * repo — the same code shipped to Optimizely.
 *
 * Source order: the repo branch HEAD (live preview, briefly cached) → the latest
 * cut version's frozen code → a legacy feature overlay. { js: null } when a
 * prototype has no built variation yet.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
};

// Small in-memory cache so a shared preview link doesn't hammer the GitHub API.
const CACHE_TTL_MS = 20_000;
const repoCache = new Map<string, { js: string | null; at: number }>();

async function repoVariation(key: string): Promise<string | null> {
  const hit = repoCache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.js;
  let js: string | null = null;
  try {
    const src = await resolveRepoSource(key);
    js = src.found ? src.variationJs ?? null : null;
  } catch {
    js = null; // no binding / token / branch — fall through to other sources
  }
  repoCache.set(key, { js, at: now });
  return js;
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || !/^[a-zA-Z0-9_-]+$/.test(key)) {
    return NextResponse.json({ error: "key required" }, { status: 400, headers: CORS });
  }

  // 1) Live from the prototype's repo branch (current build).
  const fromRepo = await repoVariation(key);
  if (fromRepo) return NextResponse.json({ js: fromRepo, name: key }, { headers: CORS });

  // 2) The latest cut version's frozen code (repo unreachable / not built at HEAD).
  const versions = await listArtifactVersions(key);
  if (versions[0]?.variationJs) return NextResponse.json({ js: versions[0].variationJs, name: key }, { headers: CORS });

  // 3) Legacy file-based feature overlay.
  const manifest = await readManifest(key);
  if (!manifest) return NextResponse.json({ js: null }, { status: 200, headers: CORS });
  const exp = await buildVariationExport(manifest);
  return NextResponse.json({ js: exp.variationJs, name: manifest.name }, { headers: CORS });
}
