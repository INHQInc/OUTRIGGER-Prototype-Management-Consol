/**
 * WHAT TO TEST NEXT — asserted against a REAL concluded run.
 *
 *     npx tsx docs/dev/next-test-smoke.mts
 *
 * The fixture is Home Page Hero No Offer exactly as it stood at 17 days:
 * 10,791/arm, the primary settled at −56.4%, four flat scroll metrics, six
 * exploration metrics up a few percent each, and a booking-engine step that
 * fell while completions rose. Every figure below was read off the console's
 * own numbers tab, so a rule that passes here passes on a run that happened.
 *
 * THE FOUR CLAIMS, each of which a human got wrong first:
 *
 *  1. Booking Complete is the most attractive number in the set (+19.7%) and
 *     is DISQUALIFIED as a next primary — at a 1.08% baseline it needs ~8
 *     weeks. If this assertion ever flips, the module is recommending a test
 *     that cannot finish.
 *  2. Flat scroll depth is a RULE-OUT, not an unknown. Its interval is tight
 *     around zero, so "add more content down the page" is a direction removed.
 *     Booking Complete's interval is ALSO centred near zero — and wide — so it
 *     must NOT appear as a rule-out. Same p-value story, opposite meaning.
 *  3. The 221 actions the hero gave up reappear across the other measures.
 *     Coverage near 1 is the finding; eight individually-insignificant rows
 *     are not.
 *  4. Booking-engine visits fell while completions rose, so the composed rate
 *     moved ~+28%. It must be surfaced, and it must NOT be marked confirmed.
 */
import { deriveNextTest, TARGET_REL } from "../../src/lib/prototypes/next-test.ts";
import type { MetricView } from "../../src/lib/prototypes/readout-model.ts";

const N = 10791;
const fig = (raw: number | undefined) => ({ text: String(raw ?? "—"), raw, absent: raw === undefined });

/** One row of the real readout. Rates are per-visitor; counts are Optimizely's. */
function row(
  key: string, label: string,
  baseCount: number, focusCount: number,
  lift: number, ciLo: number, ciHi: number,
  opts: { decision?: boolean; guardrail?: boolean; role?: string } = {},
): MetricView {
  const baseRate = baseCount / N, focusRate = focusCount / N;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
    key, label, kind: "metric",
    role: (opts.role ?? "supporting") as any,
    roleLabel: "", isDecision: Boolean(opts.decision),
    headline: fig(lift), lift: fig(lift),
    ci: { lo: ciLo, hi: ciHi, text: "", sentence: "", span: ciHi - ciLo, excludesZero: ciLo > 0 || ciHi < 0 },
    p: fig(undefined),
    focusRate: fig(focusRate), baseRate: fig(baseRate),
    focusCount: fig(focusCount), baseCount: fig(baseCount), focusN: fig(N),
    tone: "neutral", confidence: "settled", settled: false, significant: false,
    beyondLuck: false, testsDisagree: false, favourable: null,
    direction: "increase", directionDeclared: false,
    guardrail: opts.guardrail ? "pass" : null, guardrailReason: null, featureOnly: null,
    settledWord: "", hidden: false,
  } as any as MetricView;
}

// ── the run, as it stood ────────────────────────────────────────────────────
const ALL: MetricView[] = [
  row("hero-cta", "Hero CTA Click", 396, 175, -0.564, -0.635, -0.480, { decision: true }),

  row("scroll-25", "Scroll Depth 25%", 4241, 4336, 0.008, -0.024, 0.042),
  row("scroll-50", "Scroll Depth 50%", 3714, 3790, 0.006, -0.030, 0.044),
  row("scroll-75", "Scroll Depth 75%", 3328, 3382, 0.002, -0.037, 0.043),
  row("scroll-100", "Scroll Depth 100%", 2429, 2436, -0.011, -0.059, 0.039),

  row("dest-tab", "Destination Exploration Tab Click", 661, 731, 0.091, -0.015, 0.207),
  row("dest-dd", "Destination Drop Down Item Click", 297, 333, 0.106, -0.052, 0.290),
  row("offer-cta", "Offer CTA Click", 150, 167, 0.098, -0.118, 0.366),
  row("see-offers", "See all offers click", 14, 19, 0.338, -0.329, 1.668),
  row("story", "Story Clicked", 50, 45, -0.113, -0.406, 0.326),
  row("giftcard", "Gift Card Clicked", 20, 20, -0.014, -0.469, 0.832),
  row("nav", "Navigation Clicked", 1168, 1235, 0.043, -0.033, 0.124),
  row("prop-title", "Property Title Clicked", 393, 428, 0.074, -0.061, 0.228),
  row("prop-learn", "Property Learn More Click", 132, 121, -0.096, -0.293, 0.155),
  row("prop-book", "Property Book Now CTA Click", 225, 235, 0.030, -0.140, 0.234),
  row("dest-highlights", "Home: Destination Highlights Button Click", 151, 145, -0.053, -0.245, 0.187),

  row("booking-complete", "Booking Complete", 117, 142, 0.197, -0.062, 0.526),
  row("be-rooms", "Visit Page: Booking Engine: Rooms & Rates", 436, 414, -0.064, -0.179, 0.068),
];

const nt = deriveNextTest(ALL, { perArmN: N, observationDays: 17 });

let fails = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) { console.log(`  ✓ ${label}`); return; }
  fails++; console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`);
};
const pct = (x?: number) => (x === undefined ? "—" : `${(x * 100).toFixed(1)}%`);

console.log(`Traffic: ${nt.traffic.perArmN}/arm over ${nt.traffic.days}d = ${nt.traffic.perArmPerDay.toFixed(0)}/arm/day\n`);

console.log("1 · The next primary is the step that leaked — and it can resolve");
ok("recommends Rooms & Rates", nt.primary?.key === "be-rooms", `got ${nt.primary?.key ?? "nothing"}`);
ok("and it resolves inside a sane window",
   (nt.primary?.resolvability.days ?? 999) <= 28,
   `needs ${nt.primary?.resolvability.days} days`);
console.log(`      → ${nt.primary?.label}: baseline ${pct(nt.primary?.baselineRate)}, ` +
            `${Math.round(TARGET_REL * 100)}% resolves in ~${nt.primary?.resolvability.days}d ` +
            `(needs ${nt.primary?.resolvability.needPerArm}/arm)`);

console.log("\n2 · The most attractive number is disqualified, with the reason");
const bc = [...nt.excluded, ...nt.alternatives, nt.primary].filter(Boolean)
  .find((c) => c!.key === "booking-complete");
ok("Booking Complete is not the primary", nt.primary?.key !== "booking-complete");
ok("it is excluded outright", nt.excluded.some((c) => c.key === "booking-complete"),
   `excluded: ${nt.excluded.map((c) => c.key).join(", ") || "none"}`);
ok("and the reason names the cost in days", Boolean(bc?.ineligible?.includes("days")), bc?.ineligible);
console.log(`      → ${bc?.ineligible}`);

console.log("\n3 · A tight null is a rule-out; a wide one is not");
const ruled = new Set(nt.ruleOuts.map((r) => r.key));
ok("all four scroll depths are ruled out",
   ["scroll-25", "scroll-50", "scroll-75", "scroll-100"].every((k) => ruled.has(k)),
   `ruled out: ${[...ruled].join(", ")}`);
ok("Booking Complete is NOT ruled out (wide interval, merely unresolved)", !ruled.has("booking-complete"));
ok("neither is the leak we want to test", !ruled.has("be-rooms"));
for (const r of nt.ruleOuts) console.log(`      → ${r.label}: an effect larger than ±${pct(r.bound)} is ruled out`);

console.log("\n4 · The actions transferred rather than vanished");
ok("a transfer was found", nt.transfer !== null);
ok("it accounts for the 221 the hero gave up", nt.transfer?.lost === -221, `lost ${nt.transfer?.lost}`);
ok("coverage is near one", Math.abs((nt.transfer?.coverage ?? 0) - 1) < 0.25,
   `coverage ${nt.transfer?.coverage.toFixed(2)}`);
ok("and no proven-null depth metric is inside the sum",
   !nt.transfer?.contributors.some((c) => c.key.startsWith("scroll")),
   `contributors: ${nt.transfer?.contributors.map((c) => c.key).join(", ")}`);
console.log(`      → lost ${nt.transfer?.lost}, net ${nt.transfer?.net! > 0 ? "+" : ""}${nt.transfer?.net} ` +
            `across ${nt.transfer?.contributors.length} measures (coverage ${nt.transfer?.coverage.toFixed(2)})`);

console.log("\n5 · The funnel pair is surfaced and NOT claimed as fact");
const pair = nt.funnelPairs.find((p) => p.upKey === "be-rooms" && p.downKey === "booking-complete");
ok("booking-engine → completions is surfaced", Boolean(pair),
   `pairs: ${nt.funnelPairs.map((p) => `${p.upKey}→${p.downKey}`).join(", ") || "none"}`);
ok("the composed rate moved by roughly +28%", Math.abs((pair?.deltaRel ?? 0) - 0.28) < 0.03,
   `got ${pct(pair?.deltaRel)}`);
ok("and nothing is marked confirmed", nt.funnelPairs.every((p) => p.confirmed === false));
if (pair) console.log(`      → ${pct(pair.baseRatio)} → ${pct(pair.focusRatio)} (${pct(pair.deltaRel)}), unconfirmed`);

console.log("\n6 · What must not fall back");
const carried = nt.guardrails.filter((g) => g.why === "gained").map((g) => g.key);
ok("the exploration gains are carried forward as guardrails",
   carried.includes("dest-tab") || carried.includes("dest-dd"),
   `carried: ${carried.join(", ")}`);
for (const g of nt.guardrails.slice(0, 6)) console.log(`      → ${g.label} (${g.why}, ${pct(g.lift)})`);

console.log(fails
  ? `\n${fails} FAILURE(S) — the recommendation would have misled on a real run`
  : `\nall assertions held against the real Home Page Hero run`);
process.exit(fails ? 1 : 0);
