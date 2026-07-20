/**
 * Validate the GitHub connection: confirms GITHUB_TOKEN can reach a repo and
 * has push permission (needed to create prototype branches + open PRs).
 *   npx tsx scripts/git-validate.ts <owner/repo | github-url>
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getGitClient, parseRepoUrl, prototypeBranch } from "../src/lib/git/provider";

try {
  const env = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* no .env.local */ }

const arg = process.argv[2];
if (!arg) { console.error("Usage: npx tsx scripts/git-validate.ts <owner/repo | github-url>"); process.exit(1); }

const client = getGitClient();
if (!client) { console.error("GITHUB_TOKEN is not set (.env.local or env)."); process.exit(1); }

const ref = parseRepoUrl(arg);
if (!ref) { console.error(`Could not parse a repo from "${arg}". Use owner/repo or a github.com URL.`); process.exit(1); }

(async () => {
  try {
    const info = await client.getRepo(ref.owner, ref.repo);
    console.log(`\n✔ Connected to ${info.owner}/${info.repo}`);
    console.log(`  default branch: ${info.defaultBranch}`);
    console.log(`  visibility:     ${info.private ? "private" : "public"}`);
    console.log(`  push access:    ${info.permissions?.push ? "yes" : "NO — token needs Contents + Pull-requests write"}`);
    console.log(`  prototype branch would be: ${prototypeBranch("<key>")} (off ${info.defaultBranch})`);
    if (!info.permissions?.push) process.exit(2);
  } catch (e) {
    console.error("✘ Git validate failed:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
})();
