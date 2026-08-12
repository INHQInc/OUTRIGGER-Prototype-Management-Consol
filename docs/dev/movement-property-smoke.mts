/**
 * THE MOVEMENT RULES, OVER RANDOM EXPERIMENTS — not over three fixtures.
 *
 *     npx tsx docs/dev/movement-property-smoke.mts
 *
 * Example-based tests cannot show that a rule is general; they only show it
 * survives the examples someone thought of, and a rule fitted to those examples
 * passes them by construction. So this generates hundreds of differently-shaped
 * runs — one metric or twelve, guardrails or none, adoption rows, absent lifts,
 * exact zeroes, undeclared directions, every combination of which movements
 * nominate which metric including all four naming the same one — and asserts
 * the INVARIANTS hold for every one.
 *
 * THE INVARIANTS, each learned from a defect:
 *   1. No metric appears under two movements. (The same figure printed twice
 *      in a row of four and the reader counted two findings.)
 *   2. No movement is blank while any row could still supply a figure.
 *      (Fixing 1 by blanking removed the number instead of the repeat.)
 *   3. A guardrail appears only under "what it cost". (Substituting freely put
 *      a bounce-rate guardrail under "against the prediction", stating a fact
 *      nobody claimed.)
 *   4. Nothing is invented: every metric shown is a real row of that run.
 *
 * Deterministic: a fixed seed, so a failure is reproducible and CI cannot
 * flake. Print the seed of any failing case and paste it into a fixture.
 */
import { buildReadoutModel } from "../../src/lib/prototypes/readout-model.ts";

// A small LCG — Math.random() would make failures unreproducible.
let seed = Number(process.argv[2] ?? 20260812);
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

const V = "v1", B = "v0", N = 12000;

interface Shape { keys: string[]; guardrails: string[]; adoption: string[]; decisionKey: string | null }

function generate(): { input: Parameters<typeof buildReadoutModel>[0]; shape: Shape } {
  const count = int(1, 12);
  const keys = Array.from({ length: count }, (_, i) => `m${i + 1}`);
  const guardrails = keys.filter(() => rnd() < 0.2);
  const adoption = keys.filter((k) => !guardrails.includes(k) && rnd() < 0.15);
  const decisionKey = rnd() < 0.85 ? keys[0] : null;

  const metrics = keys.map((key) => {
    const isAdoption = adoption.includes(key);
    // Every awkward case a real run produces: an absent lift, an exact zero,
    // a huge move, a one-arm surface with no comparison.
    const lift = isAdoption ? undefined : pick([undefined, 0, 0.0001, -0.02, 0.35, -0.56, 2.4]);
    const rate = 0.01 + rnd() * 0.4;
    return {
      key, label: `Metric ${key}`, kind: "metric", test: "proportion",
      ...(isAdoption ? { featureOnly: "variation" } : {}),
      cells: [
        { variationId: B, name: "Control", n: N, count: 100, rate: isAdoption ? 0 : rate, isBaseline: true },
        {
          variationId: V, name: "Variation #1", n: N, count: 120, rate,
          ...(lift === undefined ? {} : { lift }),
          ...(rnd() < 0.5 ? { p: rnd() } : {}),
          ...(rnd() < 0.5 ? { liftCi: { lo: -0.1, hi: 0.3 } } : {}),
        },
      ],
    };
  });

  // Movements nominate keys — sometimes the same one four times, sometimes
  // a key that does not exist, sometimes none at all.
  const nominate = () => pick([...keys, ...keys, "does-not-exist", undefined as unknown as string]);
  const section = (t: string) => (rnd() < 0.9 ? { text: t, measureKey: nominate() } : undefined);

  return {
    shape: { keys, guardrails, adoption, decisionKey },
    input: {
      prototypeName: "Generated", prototypeKey: "gen",
      results: {
        fetchedAt: "2026-08-12T13:00:00Z", startTime: "2026-08-01T00:00:00Z", totalVisitors: N,
        variations: [{ variationId: B, name: "Control", visitors: N }, { variationId: V, name: "Variation #1", visitors: N }],
        metrics: [],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stats: {
        computedAt: "2026-08-12T13:00:00Z", validity: { status: "ok", detail: "" },
        exploratory: [], expectedFalsePositives: 0, flags: [],
        power: { baselineRate: 0.05, perArmN: N, observationDays: int(1, 30) },
        primaryKey: decisionKey ?? undefined, focusVariationId: V, baselineVariationId: B,
        metrics,
      } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      verdict: {
        state: "draft", verdict: pick(["keep_running", "confirmed", "refuted", "underpowered", "not_adjudicable"]),
        headline: "", gates: [],
        guardrails: guardrails.map((g) => ({ compositeId: g, label: `Metric ${g}`, state: pick(["pass", "at_risk", "breach"]), detail: "" })),
        discoveries: [], observedAt: "2026-08-12T13:00:00Z",
        preRegistration: { anchor: "cut", hypothesis: "A hypothesis.", primaryMetric: "Metric m1", guardrails: [], predictedDirection: pick(["increase", "decrease"]) },
      } as any,
      reading: {
        headline: "A headline",
        read: {
          effect: section("What the change did."),
          shift: section("Where the behaviour went."),
          cost: section("What it cost."),
          prediction: section("Against the prediction."),
        },
        observations: [],
      },
      plan: { composites: [], roles: Object.fromEntries(guardrails.map((g) => [g, "guardrail"])), directions: {} },
      decision: decisionKey ? { key: decisionKey, label: `Metric ${decisionKey}`, source: "console", directionDeclared: rnd() < 0.5 } : null,
      observed: [], roles: Object.fromEntries(guardrails.map((g) => [g, "guardrail"])),
      order: keys, hidden: [],
      experimentStatus: "running", now: Date.parse("2026-08-12T13:00:00Z"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
}

const RUNS = 400;
let failures = 0;
const report = (n: number, s: number, msg: string) => {
  failures++;
  if (failures <= 12) console.log(`  ✗ run ${n} (seed ${s}): ${msg}`);
};

for (let n = 0; n < RUNS; n++) {
  const before = seed;
  const { input } = generate();
  const model = buildReadoutModel(input);
  const mvs = model.story.movements;
  const rowsWithFigure = model.all.filter((m) => !m.hidden && !m.headline.absent);
  const known = new Set(model.all.map((m) => m.key));

  // 1. distinct
  const used = mvs.map((m) => m.metric?.key).filter(Boolean) as string[];
  if (new Set(used).size !== used.length) report(n, before, `a metric appears twice — ${used.join(", ")}`);

  // 2. never blank while a figure is available and unclaimed — except the one
  //    legitimate case: everything left is a guardrail, and only "what it
  //    cost" may show one. A blank then is the honest answer.
  const claimedKeys = new Set(used);
  const spare = rowsWithFigure.filter((m) => !claimedKeys.has(m.key));
  for (const mv of mvs.filter((m) => !m.metric)) {
    const usable = mv.id === "cost" ? spare : spare.filter((m) => !m.guardrail);
    if (usable.length) report(n, before, `"${mv.id}" blank with ${usable.length} usable row(s) unclaimed`);
  }

  // 3. a guardrail only under "what it cost"
  for (const mv of mvs) {
    if (mv.metric?.guardrail && mv.id !== "cost") report(n, before, `guardrail under "${mv.id}"`);
  }

  // 4. nothing invented, and no figure that is an em dash
  for (const mv of mvs) {
    if (mv.metric && !known.has(mv.metric.key)) report(n, before, `unknown metric ${mv.metric.key}`);
    if (mv.metric?.headline.absent) report(n, before, `"${mv.id}" shows a metric with no printable figure`);
  }
}

console.log(failures
  ? `\n${failures} FAILURE(S) across ${RUNS} generated experiments`
  : `\nall four invariants held across ${RUNS} generated experiments (1–12 metrics, guardrails, adoption rows, absent and zero lifts, duplicate and missing nominations)`);
process.exit(failures ? 1 : 0);
