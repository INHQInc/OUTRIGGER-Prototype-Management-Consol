/**
 * VOCABULARY — no prompt may hardcode one customer's words.
 *
 *     npx tsx docs/dev/vocabulary-smoke.mts
 *
 * WHY THIS TEST EXISTS, AND WHY IT IS A RATCHET.
 *
 * Prism is vertical-neutral: it is for any website in the world, and the
 * profile learns a vertical rather than the product assuming one. But the
 * prompts were written for a hotel group, so "guest" and "hotel executive" are
 * still spelled out in the files that generate customer-facing prose. The
 * invariant this test ultimately enforces — no hospitality vocabulary in prompt
 * code — is therefore FALSE right now.
 *
 * A test that is permanently red is a test everyone learns to ignore, so this
 * is a ratchet instead of an assertion. Every file with hardcoded vocabulary
 * carries an explicit budget below. The suite fails if a count goes UP, if a
 * new file appears, or if a budget is set higher than reality. It goes green
 * for good when every budget reaches zero, and the budget list doubles as the
 * work list.
 *
 * THIS IS THE SAME CLASS OF BUG as `code-write`: something true of the design,
 * written in a header, and never asserted anywhere. Three of those surfaced in
 * one day — code-write declared but unenforced, the ownership guard set but
 * unarmed, and brand.ts shadowing brand/. Each was correct-looking config with
 * no mechanism proving it. A ratchet is the cheapest such mechanism.
 *
 * It also pins the two-resolver split, because the whole point of
 * `requireTaxonomy` is that it refuses where `taxonomyFor` degrades. A helpful
 * future edit that wraps it in a try/catch would restore the silent-neutral
 * failure this was built to remove, and nothing else would notice.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath, not .pathname — this repo lives under a directory with spaces.
const SRC = fileURLToPath(new URL("../../src", import.meta.url));
let failures = 0;

function ok(label: string, cond: boolean, detail?: string) {
  if (cond) return console.log(`  ok   ${label}`);
  failures++;
  console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
}

/**
 * One customer's words, hardcoded. Deliberately NOT including "room": the
 * console's own UI calls its screens rooms ("rooms, not steps"), so matching it
 * would flag 106 references that are correct. A first pass at this grep
 * reported 147 problems where there were 44.
 */
const HOSPITALITY = /\b(guests?|hotels?|resorts?)\b/gi;

/**
 * THE BUDGET — how many hardcoded references each file is still allowed.
 *
 * Every number here is a debt, not a target. Lower them as the prompts move to
 * `taxonomyPrompt()`; never raise one. A file at zero should be deleted from
 * this list so that re-introducing a word fails as "not allowed any".
 */
const BUDGET: Record<string, number> = {
  "lib/ai/results.ts": 18,
  "lib/ai/observation.ts": 14,
  "lib/skills/builtins.ts": 6,
  "lib/ai/next-test.ts": 2,
  "lib/prototypes/results.ts": 2,
  "lib/prototypes/stats.ts": 2,
  "lib/prototypes/verdict.ts": 1,
};

/** Where prose that reaches a customer is generated or derived. */
const SCANNED = ["lib/ai", "lib/skills", "lib/prototypes", "lib/email"];

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (/\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

const files: string[] = [];
for (const d of SCANNED) files.push(...(await walk(join(SRC, d)).catch(() => [])));

const counts = new Map<string, number>();
for (const f of files) {
  const text = await readFile(f, "utf8");
  const n = (text.match(HOSPITALITY) ?? []).length;
  if (n > 0) counts.set(relative(SRC, f), n);
}

console.log("\n1. no file exceeds its budget of hardcoded vocabulary");
for (const [file, n] of [...counts].sort()) {
  const allowed = BUDGET[file];
  if (allowed === undefined) {
    failures++;
    console.error(`  FAIL ${file} — ${n} hardcoded reference(s), and this file has no budget. Use taxonomyPrompt() rather than naming one customer's words.`);
  } else {
    ok(`${file} ${n}/${allowed}`, n <= allowed, `${n} found, budget ${allowed} — a budget may only go down`);
  }
}

console.log("\n2. every budget is still needed, and none is padded");
for (const [file, allowed] of Object.entries(BUDGET)) {
  const n = counts.get(file) ?? 0;
  if (n === 0) {
    failures++;
    console.error(`  FAIL ${file} — budget of ${allowed} but the file is clean. Delete the entry so a re-introduction fails.`);
  } else {
    ok(`${file} budget is tight (${n} of ${allowed})`, n === allowed, `budget ${allowed} but only ${n} present — lower it to ${n}`);
  }
}

console.log("\n3. the strict resolver still refuses, and is not quietly total");
const profile = await readFile(join(SRC, "lib/brand/profile.ts"), "utf8");
ok("requireTaxonomy is exported", /export async function requireTaxonomy/.test(profile));
ok("TaxonomyUnavailable is exported", /export class TaxonomyUnavailable/.test(profile));

// The failure this guards: someone wraps the strict path in a try/catch and it
// silently becomes taxonomyFor again — bland, confident, customer-facing prose.
const start = profile.indexOf("export async function requireTaxonomy");
// Stop at the next top-level export, or the catch in earnedDigest below counts
// as one of requireTaxonomy's and this assertion fails for the wrong reason.
const rest = profile.slice(start + 1);
const end = rest.indexOf("\nexport ");
const body = end === -1 ? rest : rest.slice(0, end);
ok("requireTaxonomy has no catch that would swallow a store failure", !/\bcatch\s*[({]/.test(body), "a catch inside requireTaxonomy re-creates the silent-neutral bug");
ok("requireTaxonomy is not implemented on top of taxonomyFor", !/taxonomyFor\s*\(/.test(body), "taxonomyFor swallows store errors; the strict path must not inherit that");

console.log(failures === 0 ? "\nVocabulary is ratcheted. Lower a budget whenever a prompt moves to taxonomyPrompt().\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
