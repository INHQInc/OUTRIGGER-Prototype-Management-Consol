/**
 * Deploy a prototype to its feature repo: bake the bundle + commit it to
 * prototype/<key> (one commit, off the base branch).
 *   npx tsx scripts/git-deploy.ts <feature-key>
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deployPrototypeToGit } from "../src/lib/git/deploy";

try {
  const env = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* no .env.local */ }

const key = process.argv[2];
if (!key) { console.error("Usage: npx tsx scripts/git-deploy.ts <feature-key>"); process.exit(1); }

(async () => {
  try {
    console.log(`Baking + committing "${key}"…`);
    const r = await deployPrototypeToGit(key);
    console.log(`\n✔ Committed to ${r.repo}`);
    console.log(`  branch:  ${r.branch}`);
    console.log(`  files:   ${r.fileCount}`);
    console.log(`  commit:  ${r.commitUrl}`);
    console.log(`  preview password (Basic-Auth "preview"): ${r.password}`);
    console.log(`\n  If the repo is connected to Vercel, a preview deployment is building for this branch.`);
  } catch (e) {
    console.error("✘ Git deploy failed:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
})();
