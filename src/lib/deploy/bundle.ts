import { readFile, writeFile, mkdir, copyFile, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import type { FeatureManifest } from "../features/types";
import { buildVariationExport } from "../optimizely/export";
import { snapshotsRoot, getPageVersions } from "../registry";

/**
 * Bake a self-contained, protected static prototype: the target page snapshot
 * with the feature's overlay applied (variant), plus only the assets it uses.
 * Adds Basic-Auth edge middleware + noindex so it's safe to share externally.
 */
export interface Bundle {
  dir: string;
  password: string;
  page: string;
  assetCount: number;
}

const ASSET_RE = /\/snap-assets\/([a-z0-9-]+)\/([a-f0-9]{40}\.[a-z0-9]{2,5})/g;

async function collectAssets(html: string, siteKey: string, assetsDir: string, outAssetsDir: string): Promise<number> {
  const queue = new Set<string>();
  for (const m of html.matchAll(ASSET_RE)) queue.add(m[2]);
  const done = new Set<string>();
  let count = 0;
  while (queue.size) {
    const file = [...queue][0];
    queue.delete(file);
    if (done.has(file)) continue;
    done.add(file);
    const src = join(assetsDir, file);
    try {
      await copyFile(src, join(outAssetsDir, file));
      count++;
      // If it's CSS, scan for nested /snap-assets refs
      if (file.endsWith(".css")) {
        const css = await readFile(src, "utf8");
        for (const m of css.matchAll(ASSET_RE)) if (!done.has(m[2])) queue.add(m[2]);
      }
    } catch { /* missing asset — skip */ }
  }
  return count;
}

function middlewareJs(password: string): string {
  return `export const config = { matcher: "/((?!favicon.ico).*)" };
export default function middleware(request) {
  const auth = request.headers.get("authorization") || "";
  const expected = "Basic " + btoa("preview:${password}");
  if (auth === expected) return;
  return new Response("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Outrigger Prototype"',
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Type": "text/plain",
    },
  });
}
`;
}

export async function buildBundle(feature: FeatureManifest): Promise<Bundle> {
  const target = feature.targets[0];
  if (!target) throw new Error("Feature has no target page.");
  const versions = await getPageVersions(target.siteKey, target.slug);
  const version = target.version === "latest" ? versions[0]?.version : target.version;
  if (!version) throw new Error("No captured version for the target page.");

  const pageDir = join(snapshotsRoot(), target.siteKey, "pages", target.slug, version);
  const assetsDir = join(snapshotsRoot(), target.siteKey, "assets");
  let html = await readFile(join(pageDir, "index.html"), "utf8");

  // Bake the variant overlay into the page
  const exp = await buildVariationExport(feature);
  const script = `\n<script data-opmc-deploy="${feature.key}">\n${exp.variationJs}\n</script>\n`;
  html = html.includes("</body>") ? html.replace("</body>", `${script}</body>`) : html + script;

  // Output bundle dir
  const dir = join(tmpdir(), `opmc-deploy-${feature.key}-${randomBytes(4).toString("hex")}`);
  const outAssets = join(dir, "snap-assets", target.siteKey);
  await rm(dir, { recursive: true, force: true });
  await mkdir(outAssets, { recursive: true });

  const assetCount = await collectAssets(html, target.siteKey, assetsDir, outAssets);
  await writeFile(join(dir, "index.html"), html, "utf8");

  const password = randomBytes(9).toString("base64url");
  await writeFile(join(dir, "middleware.js"), middlewareJs(password), "utf8");
  await writeFile(join(dir, "robots.txt"), "User-agent: *\nDisallow: /\n", "utf8");
  await writeFile(
    join(dir, "vercel.json"),
    JSON.stringify({ headers: [{ source: "/(.*)", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }] }, null, 2),
    "utf8"
  );

  return { dir, password, page: `/${target.slug.replace(/__/g, "/")}`, assetCount };
}

/** List asset files in a bundle (debug). */
export async function bundleAssetList(dir: string, siteKey: string): Promise<string[]> {
  try { return await readdir(join(dir, "snap-assets", siteKey)); } catch { return []; }
}
