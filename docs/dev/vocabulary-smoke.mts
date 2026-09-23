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
 * `requireTaxonomy` is that it refuses, per field, rather than degrading. A helpful
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
 * One customer's words, hardcoded.
 *
 * EXCLUDED ON PURPOSE, each for a measured reason:
 *  - "room"  — the console's own UI calls its screens rooms ("rooms, not
 *    steps"), so matching it flags 106 correct references. A first pass at this
 *    grep reported 147 problems where there were 44.
 *  - "stay"  — 18 hits, almost all "stays the same" and "stay in sync".
 *  - "booking" — 14 hits, genuinely mixed: some are the hardcoded assumption,
 *    others name Outrigger's conversion surface in a place where that is the
 *    data. Needs reading one at a time, so it is tracked in the plan rather
 *    than guessed at here.
 *
 * "hospitality" was missed by the first version of this list, which is how
 * FALLBACK_SYSTEM — "the experiment analyst for a hospitality A/B testing
 * program" — sat unflagged while the ratchet reported green.
 */
const HOSPITALITY = /\b(guests?|hotels?|resorts?|hospitality|lodging|accommodations?|travell?ers?)\b/gi;

/**
 * THE BUDGET — how many hardcoded references each file is still allowed.
 *
 * IT IS EMPTY, AND THAT IS THE GOAL STATE (22 Sep 2026, from 48). Leave it
 * empty: a file with a hit and no budget fails as "no budget", which is a
 * louder failure than passing under an allowance. Do not add an entry to make
 * a new hit pass — resolve the word from the customer's profile instead, or
 * reword a COMMENT, which nothing reads at runtime.
 *
 * Every number here is a debt, not a target. Lower them as the prompts move to
 * `taxonomyPrompt()`; never raise one. A file at zero should be deleted from
 * this list so that re-introducing a word fails as "not allowed any".
 */
const BUDGET: Record<string, number> = {
};

/**
 * NOT A BUDGET — a file that names industries because naming them is its job.
 *
 * `lib/site/industries.ts` is the catalogue a person picks their site's industry
 * from ("Hospitality", "Retail", …), so it cannot avoid the word. It is not one
 * customer's words, nothing reads it to write a prompt or a page, and the
 * industry never supplies an answer — it only picks which setup questions are
 * asked. Exempted by exact path, so every other file, including anything that
 * imports the catalogue, is still counted.
 */
const CATALOGUE = new Set(["lib/site/industries.ts"]);

/** Where prose that reaches a customer is generated or derived. */
/**
 * EVERYTHING, not four directories. The scan covered `lib/ai`, `lib/skills`,
 * `lib/prototypes` and `lib/email`, so a customer's noun in a React component
 * was invisible to it \u2014 and five of them were there, in placeholders and
 * helper text a customer reads directly.
 */
const SCANNED = ["lib", "components", "app"];

/**
 * COUNT THE PROSE, NOT THE COMMENTARY.
 *
 * The count used to be per line, so a comment EXPLAINING a removed word counted
 * as the word. That is not pedantry: it forced three separate rewordings today
 * of comments whose whole job was to record why "guests" had to go, and the
 * brand module's own documentation \u2014 "a hotel's profile says guests; a clinic's
 * says patients" \u2014 is the clearest statement of the rule anywhere in the repo.
 * A rule that deletes its own rationale is a rule nobody can maintain.
 *
 * What ships to a customer or a model is in strings. What a maintainer reads is
 * in comments. Only the first is a leak.
 */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    // Trailing comments too — the tracker blocklist annotates its entries
    // inline. Requiring whitespace before `//` and no quote after it leaves a
    // URL inside a string alone, which is the only thing that looks similar.
    .map((l) => l.replace(/\s+\/\/[^"'`]*$/, ""))
    .join("\n");
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

const files: string[] = [];
for (const d of SCANNED) files.push(...(await walk(join(SRC, d)).catch(() => [])));

const counts = new Map<string, number>();
for (const f of files) {
  if (CATALOGUE.has(relative(SRC, f))) continue;
  const text = codeOnly(await readFile(f, "utf8"));
  const n = (text.match(HOSPITALITY) ?? []).length;
  if (n > 0) counts.set(relative(SRC, f), n);
}

console.log("\n1. no file exceeds its budget of hardcoded vocabulary");
// THE SCAN ITSELF HAS TO HAVE HAPPENED. With every budget gone the two loops
// below iterate over nothing, so a broken walk would print an empty section
// and exit 0 — the shape of a passing suite that checks nothing.
ok(`${files.length} files scanned`, files.length > 200, "the walk found almost nothing \u2014 the scan is broken, not the code");
if (counts.size === 0) console.log("  ok   the whole tree is clean \u2014 no budgets left");
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
if (!Object.keys(BUDGET).length) console.log("  ok   there are no budgets \u2014 a re-introduction now fails as \"no budget\"");
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
ok("there is no second, degrading resolver to fall into", !/taxonomyFor\s*\(/.test(profile), "taxonomyFor was deleted 22 Sep 2026: two resolvers meant one was the wrong one to call, and the wrong one was the easy one");

console.log("\n4. the vocabulary is actually injected, in BOTH branches");
// The seam shipped once with no callers at all and nothing failed, which is how
// it stayed unwired for a day. These assertions are what make that impossible
// to repeat: they check the wiring exists, not that the module compiles.
const results = await readFile(join(SRC, "lib/ai/results.ts"), "utf8");

const aStart = results.indexOf("export async function analystSkill");
ok("analystSkill exists", aStart !== -1);
const aRest = results.slice(aStart + 1);
const aEnd = aRest.indexOf("\nconst ");
const analyst = aEnd === -1 ? aRest : aRest.slice(0, aEnd);

ok("analystSkill resolves the customer's vocabulary", /requireTaxonomy\s*\(/.test(analyst), "no requireTaxonomy call — the prompts are still hardcoded");
ok("...through taxonomyPrompt, not a hand-rolled sentence", /taxonomyPrompt\s*\(/.test(analyst));
ok("...and not via any degrading resolver", !/taxonomyFor\s*\(/.test(analyst), "the strict resolver is the only one; a degrading path must not come back");

// THE PLACEMENT ASSERTION, and the one most worth having. analystSkill has a
// try/catch whose job is to fall back to FALLBACK_SYSTEM when the SKILL store
// is down. A requireTaxonomy call moved inside it would be swallowed by that
// catch and the readout would ship in generic words — no error, no log. The
// resolve must happen BEFORE the try opens.
const resolveAt = analyst.search(/requireTaxonomy\s*\(/);
const tryAt = analyst.indexOf("try {");
ok(
  "the vocabulary resolves BEFORE the try, so the skill-store catch cannot swallow it",
  resolveAt !== -1 && tryAt !== -1 && resolveAt < tryAt,
  "requireTaxonomy sits inside analystSkill's try/catch — a store blip would silently produce generic prose",
);

// Both exits. The fallback is the path taken when seeding has ALREADY failed,
// which is exactly when a missing vocabulary would go unnoticed.
const returns = analyst.match(/return\s*\{\s*system:[^\n]*/g) ?? [];
ok("analystSkill has both return branches", returns.length === 2, `found ${returns.length}`);
ok("every return carries the vocabulary", returns.length === 2 && returns.every((r) => /vocabulary/.test(r)), returns.join(" | "));

console.log("\n5. refusing reaches the customer as words, not a stack trace");
{
  // EVERY surface that can hit the gate, not just the first one. The refusal
  // lived inline in the results route while brief-draft and measurement
  // answered every error with `400 ${e.message}` — so widening the gate to the
  // brief author and the measurement planner would have shipped a bare 400 on
  // two routes at once. Add a route here when it starts resolving a customer.
  const ROUTES = [
    ["app/api/prototypes/results/route.ts", "readout"],
    ["app/api/prototypes/brief-draft/route.ts", "brief"],
    ["app/api/prototypes/measurement/route.ts", "measurement plan"],
  ] as const;
  for (const [rel, what] of ROUTES) {
    const route = await readFile(join(SRC, rel), "utf8");
    ok(`${rel.split("/").at(-2)} handles the refusal`, route.includes(`taxonomyRefusal(e, "${what}")`),
      "an undescribed customer would get a bare 400 reading like a malformed request");
  }

  const refusal = await readFile(join(SRC, "lib/brand/refusal.ts"), "utf8");
  ok("...with its own status, not the generic 400", /status:\s*409/.test(refusal));
  // NOT instanceof. The alias and the relative specifier for the same file can
  // be two module instances with two class identities, so an instanceof in the
  // catch silently returns false and the handler never runs. Measured:
  // modA === modB is false under tsx. The guard tests `name`, which survives.
  ok("...via the guard, never instanceof across the module boundary",
    !/instanceof\s+TaxonomyUnavailable/.test(refusal),
    "instanceof fails when the thrower and catcher imported different instances of profile.ts");
  ok("the guard is exported for callers to use", /export function isTaxonomyUnavailable/.test(profile));
  // A half-described customer is the likelier case once onboarding exists, and
  // a two-branch ternary answered it with "that's a bug in the console".
  ok("all three reasons get their own answer", /"no-profile"/.test(refusal) && /"incomplete"/.test(refusal),
    "`incomplete` falling into the no-org branch tells the one person who can fix it to report a bug");
}

console.log("\n6. a resolved word must actually resolve");
// THE RATCHET REWARDED THIS BUG. Converting observation.ts, a line came out as
//   parts.push("... one ${t.visitorNoun} acting several times ...")
// — DOUBLE quotes. Valid TypeScript, so tsc was silent. The word "guest" was
// gone, so the count went to zero and section 1 went green. The model was
// being handed the literal characters ${t.visitorNoun}.
//
// Counting the ABSENCE of a hardcoded word is not the same as checking the
// PRESENCE of a working substitution, and only the first was ever asserted.
// Two independent readers found it; no test did.
const TAXONOMY_INTERP = /\$\{\s*(t|tax|taxonomy)\s*[.?]/;
/** Blank out template literals, where ${...} is the whole point. */
function withoutTemplates(src: string): string {
  return src.replace(/`(?:\\.|[^`\\])*`/gs, (m) => " ".repeat(m.length));
}
const deadInterpolations: string[] = [];
for (const f of files) {
  const text = withoutTemplates(await readFile(f, "utf8"));
  text.split("\n").forEach((line, i) => {
    // a quoted string on this line that carries a taxonomy interpolation
    for (const m of line.matchAll(/"[^"]*"|'[^']*'/g)) {
      if (TAXONOMY_INTERP.test(m[0])) deadInterpolations.push(`${relative(SRC, f)}:${i + 1}  ${m[0].slice(0, 90)}`);
    }
  });
}
ok(
  "no taxonomy interpolation sits in a quoted string",
  deadInterpolations.length === 0,
  deadInterpolations.join(" | ") + " — these print the literal ${...} to the model; use a backtick template",
);

console.log("\n7. a templated skill body must actually BE resolved");
// Skill bodies are the agent's own instructions and they are stored ONCE,
// globally, for every customer — so they carry `{{visitorNoun}}`-style
// placeholders that are substituted at DELIVERY. Two ways that goes wrong:
// a placeholder nobody resolves (literal braces reach the model), and a
// placeholder nobody defined (a typo, same outcome).
{
  const { VOCAB_KEYS, resolveVocabulary } = await import("../../src/lib/brand/profile");
  const known = new Set<string>(VOCAB_KEYS);
  const PH = /\{\{\s*([A-Za-z]+)\s*\}\}/g;

  const builtins = await readFile(join(SRC, "lib/skills/builtins.ts"), "utf8");
  const used = [...builtins.matchAll(PH)].map((m) => m[1]);
  const unknown = [...new Set(used.filter((k) => !known.has(k)))];
  ok(`every placeholder in builtins.ts is a known key (${new Set(used).size} used)`,
    unknown.length === 0, `unknown: ${unknown.join(", ")} — a typo ships literal braces to the agent`);
  ok("builtins.ts uses the placeholders at all", used.length > 0,
    "at zero on the ratchet with no placeholders, the words were deleted rather than resolved");

  // EVERY reader of a skill body that feeds a model must resolve it. This is
  // the assertion that would have caught `brief.ts` and `measurement.ts`,
  // which read `skill.body` straight for months while `analystSkill()` was
  // documented as "THE ONE SEAM the customer's vocabulary enters through".
  const raw: string[] = [];
  for (const f of files) {
    const rel = relative(SRC, f);
    // THE RULE IS "not to a MODEL", so three readers are legitimate and named
    // rather than pattern-matched: `skills.ts` is where the resolving reader
    // lives; `seed.ts` reads a body to STORE it, and storing it unresolved is
    // the design (one row serves every customer); the skills route reads the
    // frontmatter to keep the stored description in step. A component that
    // renders a body in a `<pre>` is showing a human a template, which is what
    // it is — so `components/` is out of scope for this check, not for the
    // count above.
    if (rel === "lib/skills/skills.ts" || rel === "lib/skills/seed.ts") continue;
    if (rel === "app/api/skills/route.ts" || rel.startsWith("components/")) continue;
    const text = await readFile(f, "utf8");
    text.split("\n").forEach((line, i) => {
      if (!/\bparseFrontmatter\(|\bsk\.body\b|\bskill\.body\b/.test(line)) return;
      if (/resolveVocabulary|resolvedSystem|prev\.body|\.body === md/.test(line)) return;
      raw.push(`${rel}:${i + 1}  ${line.trim().slice(0, 90)}`);
    });
  }
  ok("no delivery point hands a raw skill body to a model", raw.length === 0,
    raw.join(" | ") + " — use resolvedSystem() or resolveVocabulary()");

  // ── GRAMMAR THE SUBSTITUTION CANNOT FIX ───────────────────────────────
  // A placeholder resolves to one word. It cannot pick the article in front of
  // it, and it cannot spell a possessive for a name that already ends in s. So
  // the sentence has to be written not to need either. Both of these shipped
  // and were caught by reading the resolved output for a second customer.
  const NEWLINES = /\s*\n\s*/g; // the first "a admin" spanned a line break
  // SCOPE IT TO THE PROSE, which is exactly the template literals. A first
  // version dropped "lines that look like comments" (`^\s*\*`) and so skipped
  // 12 markdown-bold lines of real skill body — `**Only re-sync when…**` looks
  // like a JSDoc continuation. Taking only the backtick strings gets every
  // line a model reads and no line it does not, without guessing.
  // Block comments go FIRST. A JSDoc explaining this rule quotes the broken
  // forms inside backticks, and an unbalanced backtick in a comment pairs up
  // with a real template literal and drags the comment in as "prose" — which
  // is how this guard first failed on its own documentation.
  const onlyTemplates = (src: string) =>
    // `codeOnly` first, for the same reason it exists above: a JSDoc
    // explaining this rule quotes the broken forms inside backticks, and an
    // unbalanced backtick in a comment pairs with a real template literal and
    // drags the comment in as "prose".
    (codeOnly(src).match(/`(?:\\.|[^`\\])*`/gs) ?? []).join("\n").replace(NEWLINES, " ");
  const PROMPTS: [string, string][] = [
    ["lib/skills/builtins.ts", onlyTemplates(builtins)],
    ["lib/ai/results.ts", onlyTemplates(await readFile(join(SRC, "lib/ai/results.ts"), "utf8"))],
  ];

  // A placeholder resolves to one word. It cannot pick the article in front of
  // it, and it cannot spell a possessive for a name that already ends in s, so
  // the sentence has to be written not to need either. Both shipped, and both
  // were caught by rendering the output for a SECOND customer and reading it.
  const ARTICLE = /\b[Aa]n?\s+(?:\{\{\s*\w+|\$\{\s*(?:t|v)\.(?:visitorNoun|offeringNoun)\b)/;
  const POSSESSIVE = /(?:\}\}|\$\{\s*customer\s*\})['\u2019]s\b/;
  // PROVE THE GUARD STILL BITES. Both regexes have now been rewritten twice to
  // stop them matching this file's own comments, and a guard that passes
  // because it can no longer see anything is worse than no guard.
  ok("the article rule catches the form it is for",
    ARTICLE.test("counts twice \u2014 a {{visitorNoun}} clicking both CTAs") &&
    ARTICLE.test("so a ${t.visitorNoun} converting twice"));
  ok("the possessive rule catches the form it is for",
    POSSESSIVE.test("the analyst for {{customer}}\u2019s programme") &&
    POSSESSIVE.test("for ${customer}'s team"));
  ok("and neither fires on the corrected forms",
    !ARTICLE.test("one {{visitorNoun}} clicking both CTAs") &&
    !POSSESSIVE.test("senior leaders at ${customer}"));
  // The prose actually reached the guard \u2014 an empty extraction passes silently.
  ok("the extraction found real prose to check",
    PROMPTS.every(([, t]) => t.length > 2000), PROMPTS.map(([n, t]) => `${n}:${t.length}`).join(" "));

  for (const [name, text] of PROMPTS) {
    const a = text.match(ARTICLE);
    ok(`${name}: no article in front of a substitution`, !a,
      `${a?.[0]} \u2014 reads "a admin" for about half of all customers; use a plural or "one"`);
    const q = text.match(POSSESSIVE);
    ok(`${name}: no possessive on a substituted name`, !q,
      `${q?.[0]} \u2014 renders "Acme Logistics\u2019s"; put the name after a preposition`);
  }

  // The substitution itself, and what it does with a key nobody defined.
  const v = { customer: "Acme Freight", taxonomy: { visitorNoun: "shipper", visitorNounPlural: "shippers",
    offeringNoun: "lane", offeringNounPlural: "lanes", primaryAction: "book a lane",
    conversionSurface: "quote form", entityKinds: ["lane", "carrier"] } };
  const out = resolveVocabulary("{{customer}} · {{visitorNounPlural}} · {{entityKinds}} · {{nonsense}}", v);
  ok("it substitutes the customer and their nouns", out.startsWith("Acme Freight · shippers · lane, carrier"));
  ok("an unknown placeholder is LEFT VISIBLE, not dropped", out.endsWith("{{nonsense}}"),
    "dropping it deletes a word from an instruction silently; leaving it is readable by whoever hits it");
}

console.log(failures === 0 ? "\nVocabulary is ratcheted. Lower a budget whenever a prompt moves to taxonomyPrompt().\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
