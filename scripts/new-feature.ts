/**
 * Scaffold a new prototype (feature) under features/<key>/.
 *
 *   npx tsx scripts/new-feature.ts <key> --page <slug> [options]
 *
 * Options:
 *   --site <siteKey>     Captured site to target (default: outrigger)
 *   --page <slug>        Captured page slug to overlay (REQUIRED)
 *   --name "<name>"      Human name (default: derived from key)
 *   --desc "<text>"      Description
 *   --selector "<css>"   Anchor for the HTML fragment (default: .hero)
 *   --mode <mode>        before | after | prepend | append | replace (default: after)
 *
 * Creates:
 *   features/<key>/feature.json          — manifest (css + html + js injections)
 *   features/<key>/overlay.css           — starter styles (namespaced)
 *   features/<key>/overlay.js            — starter behavior (guarded IIFE)
 *   features/<key>/fragments/<key>.html  — starter HTML fragment
 *
 * No tokens needed. Run `npm run dev` and open /features/<key> to preview.
 */
import { mkdir, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { featuresRoot } from "../src/lib/features/registry";
import { listPages, getPageVersions } from "../src/lib/registry";
import type { FeatureManifest } from "../src/lib/features/types";

function parseArgs(argv: string[]): { key?: string; opts: Record<string, string> } {
  const opts: Record<string, string> = {};
  let key: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) opts[a.slice(2)] = argv[++i] ?? "";
    else if (!key) key = a;
  }
  return { key, opts };
}

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

/** slug uses "__" for "/". home => "". */
function liveUrlFor(siteKey: string, slug: string): string {
  const host = siteKey === "hvc" ? "hawaiivacationcondos.outrigger.com" : "www.outrigger.com";
  const path = slug === "home" ? "" : "/" + slug.replace(/__/g, "/");
  return `https://${host}${path}`;
}

function titleCase(key: string): string {
  return key.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const FRAGMENT = (key: string, name: string) => `<!-- ${name} — prototype fragment.
     Namespaced under .opmc-${key} so nothing leaks into the page.
     Reuse the target page's own classes where you can; use tokens from
     features/_context/outrigger-design.md for net-new elements. -->
<section class="opmc-${key}" data-opmc="${key}">
  <div class="opmc-${key}__inner">
    <p class="opmc-${key}__eyebrow">Prototype</p>
    <h2 class="opmc-${key}__title">${name}</h2>
    <p class="opmc-${key}__body">Replace this with the real prototype content.</p>
    <a class="opmc-${key}__cta" href="#">Get started</a>
  </div>
</section>
`;

const CSS = (key: string) => `/* ${key} — scoped styles. Everything under .opmc-${key}.
   Brand tokens (Outrigger): see features/_context/outrigger-design.md */
.opmc-${key} {
  --oc-turquoise: #0b2f47;
  --oc-aqua: #3EB1C8;
  --oc-seafoam: #AFE5E1;
  --oc-coral: #ee675a;
  --oc-sand: #F1EFED;
  --oc-ink: #252525;

  box-sizing: border-box;
  padding: 48px 20px;
  background: var(--oc-sand);
  font-family: "Duplicate Sans", "Montserrat", system-ui, sans-serif;
  color: var(--oc-ink);
}
.opmc-${key} *, .opmc-${key} *::before, .opmc-${key} *::after { box-sizing: border-box; }
.opmc-${key}__inner { max-width: 1200px; margin: 0 auto; }
.opmc-${key}__eyebrow {
  font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--oc-turquoise); margin: 0 0 8px;
}
.opmc-${key}__title {
  font-family: "Duplicate Ionic", "Montserrat", Georgia, serif;
  font-size: clamp(28px, 4vw, 44px); line-height: 1.1; margin: 0 0 12px;
  color: var(--oc-turquoise);
}
.opmc-${key}__body { font-size: 18px; line-height: 1.5; margin: 0 0 24px; max-width: 60ch; }
.opmc-${key}__cta {
  display: inline-block; padding: 14px 28px; border-radius: 5px;
  background: var(--oc-turquoise); color: #fff; text-decoration: none;
  font-weight: 600; transition: background 0.2s ease;
}
.opmc-${key}__cta:hover { background: #06202f; }
`;

const JS = (key: string) => `/* ${key} — prototype behavior. Runs once, guarded, scoped to this overlay. */
(function () {
  var KEY = "${key}";
  if (window.__opmc && window.__opmc[KEY]) return;      // idempotent
  window.__opmc = window.__opmc || {};
  window.__opmc[KEY] = true;

  var root = document.querySelector('.opmc-' + KEY);
  if (!root) return;

  // Example: wire the CTA.
  var cta = root.querySelector('.opmc-' + KEY + '__cta');
  if (cta) cta.addEventListener('click', function (e) {
    e.preventDefault();
    console.log('[opmc:' + KEY + '] CTA clicked');
  });
})();
`;

(async () => {
  const { key, opts } = parseArgs(process.argv.slice(2));

  if (!key) {
    console.error('Usage: npx tsx scripts/new-feature.ts <key> --page <slug> [--site outrigger] [--name "..."] [--selector ".hero"] [--mode after]');
    process.exit(1);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(key)) {
    console.error(`Invalid key "${key}". Use lowercase letters, numbers, and hyphens (e.g. "trip-planner").`);
    process.exit(1);
  }

  const siteKey = opts.site || "outrigger";
  const slug = opts.page;
  const selector = opts.selector || ".hero";
  const mode = (opts.mode || "after") as FeatureManifest["injections"][number]["mode"];
  const name = opts.name || titleCase(key);

  if (!slug) {
    const pages = await listPages(siteKey).catch(() => []);
    console.error(`Missing --page <slug>. Captured pages for "${siteKey}":\n`);
    if (pages.length) console.error(pages.map((p) => "  " + p.slug).join("\n"));
    else console.error(`  (none — capture some first with scripts/capture.ts, or check --site)`);
    process.exit(1);
  }

  const dir = join(featuresRoot(), key);
  if (await exists(dir)) {
    console.error(`Feature "${key}" already exists at ${dir}. Choose another key.`);
    process.exit(1);
  }

  // Soft-validate the target page is captured (warn, don't block).
  const versions = await getPageVersions(siteKey, slug).catch(() => []);
  if (!versions.length) {
    console.warn(`⚠  No captured version found for ${siteKey}/${slug}. Scaffolding anyway — capture it before previewing.`);
  }

  const now = new Date().toISOString();
  const manifest: FeatureManifest = {
    key,
    name,
    description: opts.desc || `Prototype: ${name}.`,
    status: "draft",
    targets: [{ siteKey, slug, version: "latest" }],
    injections: [
      { type: "css", file: "overlay.css" },
      { type: "html", selector, mode, fragment: `${key}.html` },
      { type: "js", file: "overlay.js" },
    ],
    liveUrls: [liveUrlFor(siteKey, slug)],
    createdAt: now,
    updatedAt: now,
  };

  await mkdir(join(dir, "fragments"), { recursive: true });
  await writeFile(join(dir, "feature.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  await writeFile(join(dir, "overlay.css"), CSS(key), "utf8");
  await writeFile(join(dir, "overlay.js"), JS(key), "utf8");
  await writeFile(join(dir, "fragments", `${key}.html`), FRAGMENT(key, name), "utf8");

  console.log(`\n✔ Scaffolded prototype "${key}"`);
  console.log(`  dir:      features/${key}/`);
  console.log(`  target:   ${siteKey}/${slug}  (anchor ${selector}, ${mode})`);
  console.log(`  liveUrl:  ${manifest.liveUrls![0]}`);
  console.log(`\nNext:`);
  console.log(`  1. npm run dev`);
  console.log(`  2. open  http://localhost:3000/features/${key}   (edit + live preview)`);
  console.log(`  3. build: edit fragments/${key}.html, overlay.css, overlay.js`);
  if (!versions.length) console.log(`  ⚠ capture the target page first — it isn't in snapshots yet.`);
})().catch((e) => { console.error("✘ Scaffold failed:", e instanceof Error ? e.message : String(e)); process.exit(1); });
