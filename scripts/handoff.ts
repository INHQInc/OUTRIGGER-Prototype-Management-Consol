/**
 * Preview the handoff package for a feature (mapping only — no source dump).
 *   npx tsx scripts/handoff.ts <feature-key>
 */
import { readManifest } from "../src/lib/features/registry";
import { buildHandoff } from "../src/lib/handoff/handoff";
import { repoAvailable } from "../src/lib/handoff/resolve";

const key = process.argv[2];
if (!key) { console.error("Usage: npx tsx scripts/handoff.ts <feature-key>"); process.exit(1); }

(async () => {
  if (!(await repoAvailable())) {
    console.error("Outrigger repo clone not found at ~/Projects/Outrigger_Website — resolution will be low-confidence.");
  }
  const m = await readManifest(key);
  if (!m) { console.error(`Feature not found: ${key}`); process.exit(1); }
  const pkg = await buildHandoff(m);

  console.log(`\n=== Handoff: ${pkg.featureName} (${pkg.featureKey}) ===`);
  console.log(`summary: ${pkg.summary}`);
  console.log(`primary owning block: ${pkg.primaryBlock ?? "(unresolved)"}`);
  console.log(`\n--- pieces (${pkg.pieces.length}) ---`);
  for (const p of pkg.pieces) {
    console.log(`  [${p.kind}] (${p.confidence}) → ${p.targetFile ?? "(dev decides)"}`);
    console.log(`     ${p.placement}`);
    if (p.note) console.log(`     note: ${p.note}`);
  }
  console.log(`\n--- anchor resolution ---`);
  for (const a of pkg.resolution.anchors) {
    console.log(`  ${a.selector} [${a.confidence}] → ${a.candidates.map((c) => c.block).join(", ") || "(none)"}`);
  }
})();
