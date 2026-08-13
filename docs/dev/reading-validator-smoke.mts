/**
 * WHAT THE ANALYST IS ALLOWED TO SAY, and what happens to malformed output.
 *
 *     npx tsx docs/dev/reading-validator-smoke.mts
 *
 * This exercises the REAL exported functions, not copies of their regexes — an
 * earlier version of this check re-implemented them and therefore tested
 * nothing.
 *
 * The history it guards: a reading shipped with `<parameter name="text">` in
 * the visible prose. Rejecting markup outright then turned that into three of
 * four sections MISSING with a "partial structure" badge. Both are failures and
 * the quiet one is worse, so the rule is RECOVER, then reject only what is not
 * prose at all.
 */
import { unwrapScaffolding, scaffoldedMeasure, normaliseProse, rejectReason } from "../../src/lib/ai/results.ts";

let fails = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log(`  ✗ ${label}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
  else console.log(`  ✓ ${label}`);
};

const PROSE = "Swapping the on-sale hero for experience-led copy did exactly what it was meant to.";

console.log("Recovering prose from tool scaffolding");
check("the exact string that shipped", normaliseProse(`<parameter name="text">${PROSE}`), PROSE);
check("wrapped both ends", normaliseProse(`<parameter name="text">${PROSE}</parameter>`), PROSE);
check("text and measure together", normaliseProse(`<parameter name="text">${PROSE}</parameter><parameter name="measure">m1</parameter>`), PROSE);
check("single-quoted attribute", normaliseProse(`<parameter name='text'>${PROSE}</parameter>`), PROSE);
check("a bare <text> wrapper", normaliseProse(`<text>${PROSE}</text>`), PROSE);
check("a code fence", normaliseProse("```\n" + PROSE + "\n```"), PROSE);
check("clean prose is untouched", normaliseProse(PROSE), PROSE);

console.log("\nThe measure comes back too, so the figure survives");
check("from the scaffolding", scaffoldedMeasure(`<parameter name="text">${PROSE}</parameter><parameter name="measure">composite:c1</parameter>`), "composite:c1");
check("nothing to find", scaffoldedMeasure(PROSE), "");
check("not a string", scaffoldedMeasure({ text: PROSE }), "");

console.log("\nStill refused — these are not sentences");
check("markup soup strips to nothing", rejectReason("<div><span></span></div>", 420), "empty");
check("a tag around a fragment", rejectReason("<b>Rooms</b>", 420), "too short to be a sentence");
check("empty", rejectReason("", 420), "empty");
check("a bare fragment", rejectReason("Rooms", 420), "too short to be a sentence");
// The model sometimes fills `text` with the key meant for `measure`. A key is
// long enough and digit-free enough to pass every other rule, so
// "composite:opti-primary" rendered as the analyst's sentence.
check("a composite key as the text", rejectReason("composite:opti-primary", 420), "the text is a metric key, not a sentence");
check("a metric key as the text", rejectReason("metric:Booking Complete", 420), "the text is a metric key, not a sentence");
check("prose merely NAMING a key is fine", rejectReason("The composite: booking completions rose across the week.", 420), null);
check("over the cap", rejectReason("x".repeat(500), 420), "over 420 chars (500)");
check("a digit", rejectReason("The click fell 56% below control.", 420), "contains a digit");
check("statistics vocabulary", rejectReason("The result is statistically significant.", 420), "statistics vocabulary");

console.log("\nAnd real prose passes");
check("plain", rejectReason(PROSE, 420), null);
check("scaffolded prose now passes", rejectReason(`<parameter name="text">${PROSE}</parameter>`, 420), null);
check("em dashes and middots survive", rejectReason("Guests reach the explorer — tabs and dropdown — a little more.", 420), null);

console.log("\nUnwrap never invents");
check("empty in, empty out", unwrapScaffolding(""), "");
check("whitespace collapses", unwrapScaffolding("  a   b  "), "a b");

console.log(fails ? `\n${fails} FAILURE(S)` : "\nall reading-validator assertions passed");
process.exit(fails ? 1 : 0);
