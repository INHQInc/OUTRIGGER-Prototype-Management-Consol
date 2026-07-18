/**
 * Bundle a feature's prototype and deploy it to Vercel (protected, noindex).
 *   npx tsx scripts/deploy.ts <feature-key>
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readManifest } from "../src/lib/features/registry";
import { buildBundle } from "../src/lib/deploy/bundle";

const execFileAsync = promisify(execFile);

try {
  const env = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* no .env.local */ }

const key = process.argv[2];
if (!key) { console.error("Usage: npx tsx scripts/deploy.ts <feature-key>"); process.exit(1); }
const token = process.env.VERCEL_TOKEN;
if (!token) { console.error("VERCEL_TOKEN not set"); process.exit(1); }

(async () => {
  const m = await readManifest(key);
  if (!m) { console.error(`Feature not found: ${key}`); process.exit(1); }

  console.log("Baking bundle…");
  const bundle = await buildBundle(m);
  console.log(`  ${bundle.assetCount} assets, page ${bundle.page}`);
  console.log(`  bundle: ${bundle.dir}`);

  console.log("Deploying to Vercel…");
  const { stdout, stderr } = await execFileAsync(
    "npx",
    ["--yes", "vercel", "deploy", bundle.dir, "--prod", "--yes", "--token", token, "--name", `opmc-${key}`],
    { maxBuffer: 8 * 1024 * 1024, cwd: bundle.dir }
  );
  const url = (stdout.trim().split("\n").reverse().find((l) => l.startsWith("https://")) ?? stdout.trim());
  console.log("\n✔ Deployed");
  console.log(`  URL:      ${url}`);
  console.log(`  Login:    user "preview" / password "${bundle.password}"`);
  if (stderr && !url.startsWith("https://")) console.log("  stderr:", stderr.slice(-400));
})().catch((e) => { console.error("✘ Deploy failed:", e.message?.slice(-600) ?? e); process.exit(1); });
