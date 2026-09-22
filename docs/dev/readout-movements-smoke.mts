/**
 * THE FOUR MOVEMENTS AND THEIR FIGURES — asserted, because the page cannot
 * show its own contradiction.
 *
 *     npx tsx docs/dev/readout-movements-smoke.mts
 *
 * A readout prints a movement's sentences with a metric's live value bolted
 * above them. When the ANALYST chose that pairing it could choose one that
 * contradicted its own prose, and did: a staging run printed "a settled gain
 * in engagement rather than noise" under a decision metric reading -4.1% and
 * flagged too early. Two runs of identical data also disagreed about which
 * column the decision metric belonged in.
 *
 * Neither failure could break a build, raise an error or fail a type check —
 * the prose was valid, the key was in the enum, the number rendered. Only an
 * assertion catches it, which is why this file exists.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { movementMeasures } from "../../src/lib/ai/results";
import type { ExperimentResults } from "../../src/lib/prototypes/results";
import type { StatsReport } from "../../src/lib/prototypes/stats";

let failures = 0;
const ok = (label: string, cond: boolean, detail?: string) => {
  if (cond) return console.log(`  ok   ${label}`);
  failures++;
  console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
};

const FOCUS = 2, BASE = 1;
const metric = (key: string, label: string, lift: number, featureOnly = false) => ({
  key, label, featureOnly,
  cells: [{ variationId: BASE, lift: 0 }, { variationId: FOCUS, lift }],
});

/** The staging run that exposed this, to the number. */
const stats = {
  primaryKey: "booking-engine",
  focusVariationId: FOCUS,
  baselineVariationId: BASE,
  metrics: [
    metric("booking-engine", "Visit Page: Booking Engine: Rooms", -0.041),
    metric("room-detail", "Total Room Detail Views", 0.344),
    metric("check-avail", "Total Room Check Availability CTA", 0.255),
    metric("widget", "Global: Booking Widget Form Submit", -0.021),
  ],
} as unknown as StatsReport;
const results = { variations: [] } as unknown as ExperimentResults;
const supporting = ["booking-engine", "room-detail", "check-avail", "widget"];

console.log("\n1. the assignment is the console's, and it is the same every time");
const m = movementMeasures({ results, stats, supporting });
ok("prediction is the decision metric — the brief's claim is adjudicated there", m.prediction === "booking-engine", String(m.prediction));
ok("effect is the biggest rise — the surface the change touched", m.effect === "room-detail", String(m.effect));
ok("shift is the next rise along the path", m.shift === "check-avail", String(m.shift));
ok("cost is the fall", m.cost === "widget", String(m.cost));

console.log("\n2. no metric appears in two movements");
// "One fact, one home." A number met twice under different headings makes a
// reader check whether they misread the first one.
const used = [m.effect, m.shift, m.cost, m.prediction].filter(Boolean) as string[];
ok("four distinct metrics", new Set(used).size === used.length, used.join(", "));

console.log("\n3. it is deterministic — the same input cannot produce two layouts");
const again = movementMeasures({ results, stats, supporting });
ok("identical on a second call", JSON.stringify(again) === JSON.stringify(m));
const reordered = movementMeasures({ results, stats, supporting: [...supporting].reverse() });
ok("input order does not change the answer", JSON.stringify(reordered) === JSON.stringify(m), JSON.stringify(reordered));

console.log("\n4. a one-armed metric can never evidence a movement");
// It has no comparison, so there is no movement to show.
const oneArmed = {
  ...stats,
  metrics: [...(stats as unknown as { metrics: unknown[] }).metrics, metric("feature-only", "Feature Only", 0.9, true)],
} as unknown as StatsReport;
const m2 = movementMeasures({ results, stats: oneArmed, supporting: [...supporting, "feature-only"] });
ok("the one-armed metric is not assigned anywhere", ![m2.effect, m2.shift, m2.cost, m2.prediction].includes("feature-only"));

console.log("\n5. nothing to name is left empty, not filled with something wrong");
const thin = { primaryKey: "booking-engine", focusVariationId: FOCUS, baselineVariationId: BASE,
  metrics: [metric("booking-engine", "Visit Page: Booking Engine: Rooms", -0.041)] } as unknown as StatsReport;
const m3 = movementMeasures({ results, stats: thin, supporting: ["booking-engine"] });
ok("the decision metric still lands in prediction", m3.prediction === "booking-engine");
ok("slots with no honest metric are undefined", m3.effect === undefined && m3.shift === undefined && m3.cost === undefined,
   JSON.stringify(m3));

console.log("\n6. the model's choice cannot reach the page");
const src = readFileSync(join(process.cwd(), "src/lib/ai/results.ts"), "utf8");
ok(
  "generateReading assigns the figure from `movements`",
  /const assigned = movements\[k\]/.test(src) && /sect\.measureKey = assigned/.test(src),
  "the assignment must overwrite, or a wrong key renders",
);
// THE REGRESSION THAT SHIPPED. The old code only filled a MISSING measure, so
// a present-but-wrong one was never touched.
ok(
  "...unconditionally, not only when the analyst left it blank",
  !/if\s*\(\s*sect\s*&&\s*!sect\.measureKey/.test(src),
  "a `!sect.measureKey` guard re-creates the bug: a wrong key is present, so it is kept",
);
ok("the prompt tells the analyst which metric each movement is about", /movementBlock/.test(src));
ok("a disagreement is logged rather than swallowed", /analyst named .*console assigned/.test(src));

console.log(failures === 0 ? "\nEvery movement shows the figure its words are about.\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
