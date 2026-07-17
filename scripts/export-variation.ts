/**
 * Emit an Optimizely Web variation for a feature.
 *   npx tsx scripts/export-variation.ts <feature-key>
 */
import { readManifest } from "../src/lib/features/registry";
import { buildVariationExport } from "../src/lib/optimizely/export";

const key = process.argv[2];
if (!key) {
  console.error("Usage: npx tsx scripts/export-variation.ts <feature-key>");
  process.exit(1);
}

(async () => {
  const manifest = await readManifest(key);
  if (!manifest) { console.error(`Feature not found: ${key}`); process.exit(1); }
  const exp = await buildVariationExport(manifest);

  console.log(`\n=== Variation export: ${exp.featureName} (${exp.featureKey}) ===`);
  console.log(`variation JS: ${exp.bytes} bytes | css: ${Buffer.byteLength(exp.css)} bytes`);
  console.log(`live URLs: ${exp.liveUrls.join(", ") || "(none)"}`);
  console.log(`\n--- lint (${exp.lint.length}) ---`);
  for (const f of exp.lint) console.log(`  [${f.level}] ${f.message}${f.selector ? ` (${f.selector})` : ""}`);
  console.log(`\n--- variation.js ---\n`);
  console.log(exp.variationJs);
})();
