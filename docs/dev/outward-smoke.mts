/**
 * OUTWARD EFFECTS — every declared effect is actually enforced somewhere.
 *
 *     npx tsx docs/dev/outward-smoke.mts
 *
 * WHY THIS TEST EXISTS. `code-write` was declared in `OutwardEffect`, listed in
 * PERMITTED under both `live` and `code`, and documented in the module header as
 * one of the three dangerous surfaces — and nothing ever called
 * `assertOutwardAllowed("code-write")`. Optimizely and email were guarded; the
 * GitHub client was not. So a second deployment could still create
 * `prototype/<key>` and commit into the repo the operational deployment uses,
 * which is precisely what that header says the guard is for.
 *
 * A type union cannot tell you an arm is unused at a CALL site, so the check has
 * to be structural: for each effect in the union, at least one non-test file
 * under src/ must assert it. This is the test that would have caught the gap.
 *
 * It also pins the permission matrix, because the failure mode there is silent:
 * `unset` must grant NOTHING. A typo that made the default permissive would send
 * a customer a duplicate readout before anyone noticed.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath, not .pathname — this repo lives under a directory with
// spaces in it, and .pathname hands back %20.
const ROOT = fileURLToPath(new URL("../../src", import.meta.url));
let failures = 0;

function ok(label: string, cond: boolean, detail?: string) {
  if (cond) return console.log(`  ok   ${label}`);
  failures++;
  console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (/\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

const files = await walk(ROOT);
const sources = await Promise.all(
  files
    .filter((f) => !f.endsWith(join("lib", "deploy", "outward.ts")))
    .map(async (f) => ({ f, text: await readFile(f, "utf8") })),
);

console.log("\n1. every declared effect is enforced at a call site");
// Read the union from the module itself so adding an arm cannot skip the check.
const outward = await readFile(join(ROOT, "lib", "deploy", "outward.ts"), "utf8");
const union = outward.match(/export type OutwardEffect =([^;]+);/)?.[1] ?? "";
const effects = [...union.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
ok("found the effect union", effects.length === 3, effects.join(", "));

for (const effect of effects) {
  const hits = sources.filter((s) => s.text.includes(`assertOutwardAllowed("${effect}")`) || s.text.includes(`outwardAllowed("${effect}")`));
  ok(
    `"${effect}" is asserted somewhere`,
    hits.length > 0,
    hits.length ? "" : "declared in OutwardEffect but never checked — the surface is unguarded",
  );
  if (hits.length) console.log(`       ${hits.map((h) => h.f.slice(ROOT.length + 1)).join(", ")}`);
}

console.log("\n2. the guard sits at a choke point, not on individual methods");
const gh = sources.find((s) => s.f.endsWith(join("lib", "git", "github.ts")));
ok("github.ts guards inside gh()", !!gh && /private async gh<T>[\s\S]{0,700}assertOutwardAllowed\("code-write"\)/.test(gh.text));
const opti = sources.find((s) => s.f.endsWith(join("lib", "optimizely", "api.ts")));
ok("optimizely api.ts guards inside req()", !!opti && /private async req<T>[\s\S]{0,700}assertOutwardAllowed\("experiment-write"\)/.test(opti.text));

console.log("\n3. the permission matrix — unset grants nothing");
const permitted = outward.match(/const PERMITTED[^=]+=\s*\{([\s\S]*?)\};/)?.[1] ?? "";
ok("live permits all three", effects.every((e) => new RegExp(`live:[^\\]]*"${e}"`).test(permitted)));
ok("code permits only code-write", /code:\s*\["code-write"\]/.test(permitted));
ok("no default arm that could grant on unset", !/default|\?\?\s*\[[^\]]+\]/.test(outward.split("PERMITTED")[2] ?? ""));

console.log(failures === 0 ? "\nEvery outward effect is guarded.\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
