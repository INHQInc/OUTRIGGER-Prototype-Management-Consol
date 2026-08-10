import { buildReadoutModel } from "/Users/bryanhopkins/Projects/OUTRIGGER Prototypes/OUTRIGGER Prototype Managment Console/src/lib/prototypes/readout-model.ts";

const V = "v1", B = "v0", N = 9340;
const mk = (key, label, fr, br, fc, bc, p, ciLo, ciHi, test = "proportion", extra = {}) => ({
  key, label, kind: key.startsWith("composite") ? "composite" : "metric", test,
  cells: [
    { variationId: B, name: "Control", isBaseline: true, n: N, count: bc, rate: br },
    { variationId: V, name: "Variation #1", n: N, count: fc, rate: fr,
      lift: (fr - br) / br, liftCi: { lo: ciLo, hi: ciHi }, p },
  ],
  ...extra,
});

const stats = {
  computedAt: "2026-08-10T20:45:00Z",
  validity: { status: "ok", detail: "" },
  exploratory: [
    // swept row that is significant at raw alpha but does NOT clear FDR
    { key: "m3", label: "Offer engagement", variationId: V, variationName: "Variation #1", lift: 0.205, p: 0.041, q: 0.34, discovery: false },
  ],
  expectedFalsePositives: 0.6, flags: [],
  power: { baselineRate: 0.034, perArmN: N, observationDays: 10, daysToObserved: 18 },
  primaryKey: "m1", focusVariationId: V, baselineVariationId: B,
  metrics: [
    mk("m1", "Hero CTA Click", 0.015, 0.034, 136, 311, 0.0000001, -0.62, -0.49),
    mk("m2", "Bounce rate", 0.41, 0.39, 3800, 3650, 0.30, -0.02, 0.11),          // guardrail, rose = bad
    mk("m3", "Offer engagement", 0.016, 0.014, 154, 126, 0.041, 0.004, 0.41),     // raw-sig, fails FDR
    mk("composite:c1", "Total explorer actions", 1.183, 1.186, 11048, 10921, 0.9, -0.08, 0.07, "actions"),
    { key: "m4", label: "New overlay CTA", kind: "metric", test: "none", featureOnly: "variation",
      cells: [{ variationId: B, name: "Control", isBaseline: true, n: N, count: 0, rate: 0 },
              { variationId: V, name: "Variation #1", n: N, count: 500, rate: 0.054 }] },
  ],
};

const model = buildReadoutModel({
  prototypeName: "Home Page Hero No Offer",
  prototypeKey: "home-page-hero-no-offer",
  results: { fetchedAt: stats.computedAt, startTime: "2026-07-31T00:00:00Z", totalVisitors: N * 2,
    variations: [{ variationId: B, name: "Control", visitors: N }, { variationId: V, name: "Variation #1", visitors: N }], metrics: [] },
  stats,
  verdict: {
    state: "draft", verdict: "refuted", headline: "HYPOTHESIS REFUTED — Hero CTA Click moved -56.9% …",
    gates: [{ id: "direction", title: "Moved the way the experiment predicted (up)", pass: false, detail: "" }],
    guardrails: [{ compositeId: "m2", label: "Bounce rate", state: "at_risk", detail: "within 2% margin" }],
    discoveries: [], observedAt: stats.computedAt,
    preRegistration: { anchor: "cut", hypothesis: "We believe replacing the discount-led hero …", primaryMetric: "Hero CTA Click", guardrails: [], directionAssumed: true },
  },
  reading: { headline: "Swapping the offer for an invitation gutted the hero click it was aimed at", observations: [] },
  plan: { composites: [{ id: "c1", label: "Total explorer actions", role: "secondary", events: ["a", "b"] }], directions: {}, roles: { m2: "guardrail", m3: "supporting", "composite:c1": "supporting" } },
  decision: { key: "m1", label: "Hero CTA Click", source: "optimizely", directionDeclared: false },
  observed: [], roles: { m2: "guardrail", m3: "supporting", "composite:c1": "supporting" }, order: ["m1", "composite:c1", "m3", "m2", "m4"], hidden: [],
  experimentStatus: "running", now: Date.parse(stats.computedAt),
});

const row = (k) => { const m = model.byKey[k]; return `${m.label.padEnd(24)} role=${m.roleLabel.padEnd(11)} lift=${m.lift.text.padStart(7)} tone=${m.tone.padEnd(7)} conf=${m.confidence.padEnd(9)} sig=${String(m.significant).padEnd(5)} beyondLuck=${String(m.beyondLuck).padEnd(5)} unit=${m.rateUnit}`; };
console.log("STATUS     :", model.verdict.label, "|", model.verdict.term, "| next:", model.verdict.nextStep.label);
console.log("DAY        :", model.runtime.dayLabel, "| asOf", model.runtime.asOfDate);
console.log("VITALS     :", model.vitals.map(v => `${v.label}=${v.value}`).join("  "));
console.log("BIGGEST +/-:", model.biggestGain?.label ?? "none", "/", model.biggestCost?.label ?? "none");
console.log("NOTICES    :", model.notices.map(n => n.id).join(", "));
console.log("CAVEAT     :", model.verdict.directionCaveat ? "present" : "ABSENT");
console.log("---- rows ----");
for (const k of ["m1", "m2", "m3", "composite:c1", "m4"]) console.log(row(k));
