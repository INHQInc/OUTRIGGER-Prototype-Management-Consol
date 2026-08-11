/**
 * THE HEADLINE, across the states that matter. Run it after any change to
 * readout-headline.ts:
 *
 *     npx tsx docs/dev/headline-smoke.mts
 *
 * Asserts the properties, not the wording — wording is meant to be edited. The
 * assertions are the things that must never regress: the headline may not deny
 * movement that happened, may not contradict the verdict, must carry no digit,
 * must fit 80 characters, and must differ between states.
 */
import { buildReadoutModel } from "../../src/lib/prototypes/readout-model.ts";
import { headlineContradiction } from "../../src/lib/prototypes/readout-headline.ts";

const V = "v1", B = "v0", N = 14730;
const cell = (id: string, name: string, n: number, count: number, rate: number, extra: object = {}) =>
  ({ variationId: id, name, n, count, rate, ...extra });

const mk = (key: string, label: string, fr: number, br: number, fc: number, bc: number, p?: number, ci?: { lo: number; hi: number }, featureOnly?: string) => ({
  key, label, kind: key.startsWith("composite") ? "composite" : "metric", test: "proportion",
  ...(featureOnly ? { featureOnly } : {}),
  cells: [
    cell(B, "Control", N, bc, br, { isBaseline: true }),
    cell(V, "Variation #1", N, fc, fr, { lift: (fr - br) / br, ...(p !== undefined ? { p } : {}), ...(ci ? { liftCi: ci } : {}) }),
  ],
});

const baseStats = (metrics: unknown[], extra: object = {}) => ({
  computedAt: "2026-08-10T20:45:00Z",
  validity: { status: "ok", detail: "" },
  exploratory: [], expectedFalsePositives: 0, flags: [],
  power: { baselineRate: 0.057, perArmN: N, observationDays: 11, daysToObserved: 18 },
  primaryKey: "m1", focusVariationId: V, baselineVariationId: B,
  metrics, ...extra,
});

const results = {
  fetchedAt: "2026-08-10T20:45:00Z", startTime: "2026-07-31T00:00:00Z", totalVisitors: N,
  variations: [{ variationId: B, name: "Control", visitors: N }, { variationId: V, name: "Variation #1", visitors: N }],
  metrics: [],
};

const verdictOf = (verdict: string, gates: unknown[] = [], guardrails: unknown[] = [], extra: object = {}) => ({
  state: "draft", verdict, headline: "", gates, guardrails, discoveries: [],
  observedAt: "2026-08-10T20:45:00Z",
  preRegistration: { anchor: "cut", hypothesis: "We believe the overlay will send more visitors to the booking engine.", primaryMetric: "Booking engine arrivals", guardrails: [], predictedDirection: "increase" },
  ...extra,
});

type Case = { id: string; why: string; input: Parameters<typeof buildReadoutModel>[0] };

const decisionOf = (label: string) => ({ key: "m1", label, source: "console" as const, directionDeclared: true, direction: "increase" as const });

const CASES: Case[] = [
  {
    id: "F1 flat decision, two settled movers",
    why: "THE SHIPPED BUG. Must not say nothing separates the versions.",
    input: {
      prototypeName: "Room Detail Overlay", prototypeKey: "rdo", results,
      stats: baseStats([
        mk("m1", "Booking engine arrivals", 0.058, 0.057, 860, 849, 0.79, { lo: -0.03, hi: 0.06 }),
        mk("composite:c1", "Room detail opens", 0.227, 0.172, 3339, 2540, 1e-30, { lo: 0.2, hi: 0.4 }),
        mk("composite:c2", "Check availability clicks", 0.350, 0.258, 5155, 3800, 1e-40, { lo: 0.25, hi: 0.45 }),
      ], {
        exploratory: [
          { key: "composite:c1", label: "Room detail opens", variationId: V, variationName: "Variation #1", p: 1e-30, q: 1e-30, discovery: true },
          { key: "composite:c2", label: "Check availability clicks", variationId: V, variationName: "Variation #1", p: 1e-40, q: 1e-40, discovery: true },
        ],
      }),
      verdict: verdictOf("keep_running"), reading: null,
      plan: { composites: [{ id: "c1", label: "Room detail opens", role: "secondary", direction: "increase", events: ["a", "b"] }, { id: "c2", label: "Check availability clicks", role: "secondary", direction: "increase", events: ["c"] }], roles: { "composite:c1": "supporting", "composite:c2": "supporting" }, directions: { "composite:c1": "increase", "composite:c2": "increase" } },
      decision: decisionOf("Booking engine arrivals"),
      observed: [], roles: { "composite:c1": "supporting", "composite:c2": "supporting" },
      order: ["composite:c1", "composite:c2", "m1"], hidden: [],
      experimentStatus: "running", now: Date.parse("2026-08-10T20:45:00Z"),
    },
  },
  {
    id: "F2 genuinely nothing, day 2",
    why: "The one case where 'nothing' is true — must still name WHICH nothing.",
    input: {
      prototypeName: "Hero Copy Test", prototypeKey: "hct", results,
      stats: baseStats([mk("m1", "Booking engine arrivals", 0.0571, 0.057, 300, 299, 0.95, { lo: -0.2, hi: 0.2 })],
        { power: { baselineRate: 0.057, perArmN: 900, observationDays: 2, daysToObserved: 40 } }),
      verdict: verdictOf("underpowered", [{ id: "runtime", title: "Ran long enough", pass: false, detail: "" }]),
      reading: null, plan: null, decision: decisionOf("Booking engine arrivals"),
      observed: [], roles: {}, order: [], hidden: [],
      experimentStatus: "running", now: Date.parse("2026-08-10T20:45:00Z"),
    },
  },
  {
    id: "F3 confirmed, guardrail at risk",
    why: "May not say the guardrails are clear; may not restate 'It worked'.",
    input: {
      prototypeName: "Rate Calendar", prototypeKey: "rc", results,
      stats: baseStats([
        mk("m1", "Booking engine arrivals", 0.070, 0.057, 1030, 849, 0.0001, { lo: 0.1, hi: 0.35 }),
        mk("composite:g1", "Voyager Club sign-ups", 0.041, 0.048, 604, 707, 0.2, { lo: -0.25, hi: 0.05 }),
      ]),
      verdict: verdictOf("confirmed", [], [{ compositeId: "g1", label: "Voyager Club sign-ups", state: "at_risk", detail: "" }]),
      reading: null,
      plan: { composites: [{ id: "g1", label: "Voyager Club sign-ups", role: "guardrail", direction: "increase", events: ["s"] }], roles: { "composite:g1": "guardrail" }, directions: {} },
      decision: decisionOf("Booking engine arrivals"),
      observed: [], roles: { "composite:g1": "guardrail" }, order: [], hidden: [],
      experimentStatus: "running", now: Date.parse("2026-08-10T20:45:00Z"),
    },
  },
  {
    id: "F5 one-arm adoption only",
    why: "Adoption is a rate with no counterfactual — must not read as a win.",
    input: {
      prototypeName: "Pay At Check-in", prototypeKey: "paci", results,
      stats: baseStats([
        mk("m1", "Booking engine arrivals", 0.0575, 0.057, 850, 849, 0.9, { lo: -0.1, hi: 0.12 }),
        mk("m2", "Pay at check-in overlay", 0.121, 0, 1780, 0, undefined, undefined, "variation"),
      ]),
      verdict: verdictOf("keep_running"), reading: null, plan: null,
      decision: decisionOf("Booking engine arrivals"),
      observed: [], roles: {}, order: ["m1", "m2"], hidden: [],
      experimentStatus: "running", now: Date.parse("2026-08-10T20:45:00Z"),
    },
  },
  {
    id: "F6 not adjudicable, something moved",
    why: "No decision claim allowed at all, but the movement is still real.",
    input: {
      prototypeName: "Signature Experiences", prototypeKey: "se", results,
      stats: baseStats([
        mk("composite:c3", "Signature Experiences carousel", 0.31, 0.236, 4560, 3470, 1e-20, { lo: 0.2, hi: 0.42 }),
      ], {
        primaryKey: undefined,
        exploratory: [{ key: "composite:c3", label: "Signature Experiences carousel", variationId: V, variationName: "Variation #1", p: 1e-20, q: 1e-20, discovery: true }],
      }),
      verdict: verdictOf("not_adjudicable", [{ id: "mapping", title: "A decision metric exists", pass: false, detail: "" }]),
      reading: null,
      plan: { composites: [{ id: "c3", label: "Signature Experiences carousel", role: "secondary", events: ["x"] }], roles: {}, directions: {} },
      decision: null,
      observed: [], roles: {}, order: [], hidden: [],
      experimentStatus: "running", now: Date.parse("2026-08-10T20:45:00Z"),
    },
  },
];

let failures = 0;
const fail = (id: string, msg: string) => { failures++; console.log(`   ✗ ${msg}`); void id; };

const seen = new Map<string, string>();

for (const c of CASES) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = buildReadoutModel(c.input as any);
  const h = model.headlineFloor;
  const t = model.headlineTrace;
  console.log(`\n${c.id}`);
  console.log(`   ${c.why}`);
  console.log(`   → "${h}"`);
  console.log(`     [${t?.action} · ${t?.rung} · ${t?.claims.join(",") || "no claims"}] ${h.length} chars`);

  if (!h) fail(c.id, "empty headline");
  if (h.length > 80) fail(c.id, `over 80 chars (${h.length})`);
  if (/\d/.test(h)) fail(c.id, "contains a digit");
  const clash = headlineContradiction(h, model);
  if (clash) fail(c.id, `the floor contradicts its own model: ${clash}`);
  if (seen.has(h)) fail(c.id, `identical to "${seen.get(h)}"`);
  seen.set(h, c.id);
}

// The specific regression: the old sentence, on the case that produced it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const f1 = buildReadoutModel(CASES[0].input as any);
if (/nothing separates/i.test(f1.headlineFloor)) fail("F1", "STILL says nothing separates the two versions");
if (headlineContradiction("Nothing separates the two versions yet", f1) === null) {
  fail("F1", "the contradiction test does NOT catch the sentence that shipped");
} else {
  console.log(`\n✓ contradiction test rejects the old sentence: ${headlineContradiction("Nothing separates the two versions yet", f1)}`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nall headline assertions passed");
process.exit(failures ? 1 : 0);
