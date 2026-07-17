/**
 * CLI: capture a page snapshot.
 *   npx tsx scripts/capture.ts <siteKey> <url>
 *   e.g. npx tsx scripts/capture.ts outrigger https://www.outrigger.com/hawaii/oahu/outrigger-waikiki-beach-resort
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { capturePage, SITES } from "../src/lib/capture/capture";

// Load .env.local (no dotenv dep needed)
try {
  const env = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* no .env.local */ }

const [siteKey, url] = process.argv.slice(2);
if (!siteKey || !url || !(siteKey in SITES)) {
  console.error(`Usage: npx tsx scripts/capture.ts <${Object.keys(SITES).join("|")}> <url>`);
  process.exit(1);
}

capturePage(url, siteKey as keyof typeof SITES, { onProgress: (m) => console.log(`  ${m}`) })
  .then((meta) => {
    console.log("\n✔ Capture complete");
    console.log(`  page:    ${meta.pageSlug}`);
    console.log(`  version: ${meta.version}`);
    console.log(`  html:    ${(meta.htmlBytes / 1024).toFixed(0)} KB`);
    console.log(`  assets:  ${meta.assetCount} files, ${(meta.assetBytes / 1024 / 1024).toFixed(1)} MB`);
    console.log(`  removed: ${meta.report.removed.length} tracking artifacts`);
  })
  .catch((e) => {
    console.error("✘ Capture failed:", e.message);
    process.exit(1);
  });
