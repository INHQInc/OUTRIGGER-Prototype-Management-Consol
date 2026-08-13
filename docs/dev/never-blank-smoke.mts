/**
 * VALIDATION MUST NEVER SUBTRACT CONTENT WITHOUT A REPLACEMENT.
 *
 *     npx tsx docs/dev/never-blank-smoke.mts
 *
 * THE PATTERN THIS EXISTS TO STOP. Every prose failure tonight was answered by
 * adding a rejection rule, and every rejection removed something with nothing
 * behind it:
 *
 *   scaffolding in the prose  → reject markup  → three of four sections gone
 *   a key where prose goes    → reject keys    → the section gone
 *   a headline 85 chars long  → reject at 80   → NO HEADLINE AT ALL
 *
 * Each fix was locally right and made the readout worse, because a refused
 * field renders as nothing and nothing is indistinguishable from "there was
 * nothing to say". So the rule is now a test: whatever the analyst returns —
 * including returning garbage, or nothing — the model must still produce a
 * headline. The floor is what makes rejection safe.
 */
import { buildReadoutModel } from "../../src/lib/prototypes/readout-model.ts";
import { HEADLINE_MAX } from "../../src/lib/ai/results.ts";
import type { Reading } from "../../src/lib/prototypes/notebook.ts";

const V = "v1", B = "v0", N = 14000;
const metric = (key: string, label: string, lift: number, p: number) => ({
  key, label, kind: "metric", test: "proportion",
  cells: [
    { variationId: B, name: "Control", n: N, count: 300, rate: 0.04, isBaseline: true },
    { variationId: V, name: "Variation #1", n: N, count: 360, rate: 0.04 * (1 + lift), lift, p, liftCi: { lo: lift - 0.05, hi: lift + 0.05 } },
  ],
});
const stats = {
  computedAt: "2026-08-13T23:00:00Z", validity: { status: "ok", detail: "" },
  exploratory: [], expectedFalsePositives: 0, flags: [],
  power: { baselineRate: 0.04, perArmN: N, observationDays: 9 },
  primaryKey: "m1", focusVariationId: V, baselineVariationId: B,
  metrics: [metric("m1", "Hero CTA Click", -0.56, 1e-30), metric("m2", "See all offers click", 0.27, 0.2)],
};
const results = {
  fetchedAt: stats.computedAt, startTime: "2026-08-01T00:00:00Z", totalVisitors: N,
  variations: [{ variationId: B, name: "Control", visitors: N }, { variationId: V, name: "Variation #1", visitors: N }],
  metrics: [],
};

const build = (reading: Reading | null) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildReadoutModel({
    prototypeName: "Hero", prototypeKey: "hero", results, stats,
    verdict: {
      state: "draft", verdict: "keep_running", headline: "", gates: [], guardrails: [], discoveries: [],
      observedAt: stats.computedAt,
      preRegistration: { anchor: "cut", hypothesis: "Fewer hero clicks.", primaryMetric: "Hero CTA Click", guardrails: [], predictedDirection: "decrease" },
    },
    reading,
    plan: { composites: [], roles: {}, directions: { m1: "decrease" } },
    decision: { key: "m1", label: "Hero CTA Click", source: "console", direction: "decrease", directionDeclared: true },
    observed: [], roles: {}, order: ["m1", "m2"], hidden: [],
    experimentStatus: "running", now: Date.parse(stats.computedAt),
  } as any);

const base = { generatedAt: stats.computedAt, basisKey: "x", riskNotes: [] };

// Everything the generator can hand over when the model misbehaves. In each
// case the reader must still get a headline.
const CASES: [string, Reading | null][] = [
  ["no reading at all", null],
  ["a reading with nothing in it", { ...base } as Reading],
  ["headline rejected, nothing else", { ...base, headlineComputed: true } as Reading],
  ["headline rejected, lede survived", { ...base, headlineComputed: true, lede: "The click fell as intended." } as Reading],
  ["every section rejected", { ...base, headlineComputed: true, sectionsMissing: true, rejectedReasons: ["section: contains markup"] } as Reading],
  ["a lede the template wrote", { ...base, ledeComputed: true, lede: "Hero CTA Click is behind by more than luck explains." } as Reading],
  ["a headline that contradicts the numbers", { ...base, headline: "Nothing separates the two versions yet" } as Reading],
  ["an empty-string headline", { ...base, headline: "" } as Reading],
  ["a whitespace headline", { ...base, headline: "   " } as Reading],
];

let fails = 0;
for (const [label, reading] of CASES) {
  const model = build(reading);
  const h = model.story.headline;
  const ok = typeof h === "string" && h.trim().length > 0;
  if (!ok) { fails++; console.log(`  ✗ ${label} → NO HEADLINE`); continue; }
  if (h.length > HEADLINE_MAX) { fails++; console.log(`  ✗ ${label} → ${h.length} chars, over the ${HEADLINE_MAX} cap`); continue; }
  console.log(`  ✓ ${label.padEnd(42)} "${h}"`);
}

// The floor itself must always exist, whatever the reading did.
if (!build(null).headlineFloor.trim()) { fails++; console.log("  ✗ headlineFloor is empty with no reading"); }

console.log(fails
  ? `\n${fails} FAILURE(S) — a refused field left the reader with nothing`
  : `\nevery case still produced a headline (cap ${HEADLINE_MAX})`);
process.exit(fails ? 1 : 0);
