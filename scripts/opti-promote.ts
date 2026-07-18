/**
 * Promote a feature to a PAUSED Optimizely draft experiment.
 *   npx tsx scripts/opti-promote.ts <feature-key>
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readManifest } from "../src/lib/features/registry";
import { promoteFeature } from "../src/lib/optimizely/promote";

try {
  const env = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* no .env.local */ }

const key = process.argv[2];
if (!key) { console.error("Usage: npx tsx scripts/opti-promote.ts <feature-key>"); process.exit(1); }

(async () => {
  const m = await readManifest(key);
  if (!m) { console.error(`Feature not found: ${key}`); process.exit(1); }
  try {
    const r = await promoteFeature(m);
    console.log(`\n✔ Created PAUSED draft experiment`);
    console.log(`  experiment id: ${r.experimentId}  (status: ${r.status})`);
    console.log(`  page id:       ${r.pageId}`);
    console.log(`  variations:    ${r.variations.map((v) => `${v.name} [${v.variation_id}]`).join(", ")}`);
    console.log(`  open in Optimizely: ${r.appUrl}`);
  } catch (e) {
    console.error("✘ Promote failed:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
})();
