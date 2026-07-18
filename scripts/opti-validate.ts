/** Validate the Optimizely token against the configured project (read-only). */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getProject, listExperiments } from "../src/lib/optimizely/api";

try {
  const env = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* no .env.local */ }

(async () => {
  try {
    const p = await getProject();
    console.log(`AUTH OK → project: ${p.name} | id: ${p.id} | platform: ${p.platform} | status: ${p.status}`);
    const exps = await listExperiments();
    console.log(`experiments in project: ${exps.length}`);
  } catch (e) {
    console.error("FAILED:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
})();
