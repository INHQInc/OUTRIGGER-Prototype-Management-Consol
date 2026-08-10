import { renderReadoutEmail } from "/Users/bryanhopkins/Projects/OUTRIGGER Prototypes/OUTRIGGER Prototype Managment Console/src/lib/email/readout.ts";
import { buildReadoutModel } from "/Users/bryanhopkins/Projects/OUTRIGGER Prototypes/OUTRIGGER Prototype Managment Console/src/lib/prototypes/readout-model.ts";
import { writeFileSync } from "node:fs";

const V = "v1", B = "v0";
// `p` is NOT decoration in this fixture. The model settles a claim on the test
// the verdict adjudicates on (p < alpha, FDR-corrected q for supporting rows),
// not on whether the CI excludes zero — so a fixture without p-values silently
// exercises the degraded path and proves nothing. These are the values the
// counts below actually produce.
const mk = (key, label, fr, br, fc, bc, n, p, settled) => ({
  key, label, kind: key.startsWith("composite") ? "composite" : "metric", test: "proportion",
  cells: [
    { variationId: B, name: "Control", isBaseline: true, n, count: bc, rate: br },
    { variationId: V, name: "Variation #1", n, count: fc, rate: fr, p,
      lift: (fr - br) / br,
      liftCi: settled ? { lo: 0.02, hi: 0.09 } : { lo: -0.03, hi: 0.06 } },
  ],
});
const N = 14730;
const stats = {
  computedAt: "2026-08-10T20:45:00Z",
  validity: { status: "ok", detail: "" },
  // Benjamini-Hochberg over the five rows above: only the two browse
  // composites survive the correction.
  exploratory: [
    { key: "composite:c2", label: "Total Room Detail Views", variationId: V, variationName: "Variation #1", lift: 0.357, p: 1e-40, q: 5e-40, discovery: true },
    { key: "composite:c1", label: "Total Room Check Availability CTA Clicks", variationId: V, variationName: "Variation #1", lift: 0.320, p: 1e-30, q: 2.5e-30, discovery: true },
    { key: "m2", label: "Global: Booking Widget Form Submit", variationId: V, variationName: "Variation #1", lift: -0.020, p: 0.32, q: 0.533, discovery: false },
    { key: "m3", label: "Booking Complete", variationId: V, variationName: "Variation #1", lift: 0.057, p: 0.66, q: 0.79, discovery: false },
    { key: "m1", label: "Visit Page: Booking Engine: Rooms & Rates", variationId: V, variationName: "Variation #1", lift: 0.013, p: 0.79, q: 0.79, discovery: false },
  ],
  expectedFalsePositives: 0.3, flags: [],
  power: { baselineRate: 0.057, perArmN: N, observationDays: 7, daysToObserved: 18 },
  primaryKey: "m1", focusVariationId: V, baselineVariationId: B,
  metrics: [
    mk("m1", "Visit Page: Booking Engine: Rooms & Rates", 0.058, 0.057, 860, 849, N, 0.79, false),
    mk("composite:c1", "Total Room Check Availability CTA Clicks", 0.227, 0.172, 3339, 2540, N, 1e-30, true),
    mk("composite:c2", "Total Room Detail Views", 0.350, 0.258, 5155, 3800, N, 1e-40, true),
    mk("m2", "Global: Booking Widget Form Submit", 0.249, 0.254, 3660, 3735, N, 0.32, false),
    mk("m3", "Booking Complete", 0.009, 0.008, 129, 122, N, 0.66, false),
  ],
};
const results = { fetchedAt: stats.computedAt, startTime: "2026-08-03T00:00:00Z", totalVisitors: N,
  variations: [{ variationId: B, name: "Control", visitors: N }, { variationId: V, name: "Variation #1", visitors: N }], metrics: [] };

const args = {
  prototypeName: "Room Detail Overlay",
  prototypeKey: "room-detail-overlay",
  url: "https://outrigger-prototype-management-cons.vercel.app/prototypes/room-detail-overlay?tab=analytics",
  results,
  stats,
  verdict: {
    state: "draft", verdict: "refuted",
    headline: "Room overlay wins the browse and the click, then stalls before booking",
    gates: [{ id: "direction", title: "Moved the way the experiment predicted (up)", pass: false, detail: "" }],
    guardrails: [{ compositeId: "g1", label: "Bounce", state: "pass", detail: "" }],
    discoveries: [], observedAt: stats.computedAt,
    preRegistration: { anchor: "cut", hypothesis: "We believe opening room details in an in-page modal overlay instead of navigating to a separate PDP for all visitors browsing the rooms & suites listing page will cause more visitors to reach the booking engine.", primaryMetric: "Visit Page: Booking Engine: Rooms & Rates", guardrails: [], predictedDirection: "increase", directionAssumed: true },
  },
  reading: {
    executive: "Guests are engaging with rooms far more than before — they open room detail and reach for availability at a markedly higher rate than the old page-by-page journey. That interest is not yet arriving at the booking engine, so none of it has turned into bookings. Nothing here supports shipping or killing it today; the question is whether the browse gain is worth funding more traffic to settle.",
    headline: "Room overlay wins the browse and the click, then stalls before booking",
    read: {
      effect: { text: "The overlay made guests reach for availability far more and open room detail content far more often than the old page-by-page journey — a clear, settled lift in early booking intent that the modal is genuinely creating, not borrowing.", measureKey: "m1" },
      shift: { text: "The extra intent travels through the room-detail exploration and the check-availability reach, but it stalls before the booking engine: arrivals there are essentially unchanged.", measureKey: "composite:c2" },
      cost: { text: "The booking-widget submit softened slightly rather than rising with the upstream surge — a sign the gain looks less like brand-new demand carried all the way through.", measureKey: "m2" },
      prediction: { text: "The brief said the overlay would send more visitors to the booking engine. The upstream half is settled and strong. The half that matters, more arrivals at the engine, is not.", measureKey: "m1" },
    },
    observations: [
      { measureKey: "m1", note: "Arrivals at the booking engine are the decision step; they barely moved while browsing surged, so the overlay's interest isn't reaching the point that matters yet." },
      { measureKey: "composite:c1", note: "Guests reach for availability far more once the overlay puts it in front of them - the demand was there, the old layout was burying it." },
      { measureKey: "composite:c2", note: "Guests open far more room detail content in the overlay - browsing is clearly richer, yet that deeper look isn't translating into booking-engine trips." },
      { measureKey: "m2", note: "Booking-widget starts eased slightly rather than rising - a hint the upstream gain is intent moving around early, not fresh demand." },
      { measureKey: "m3", note: "Finished bookings nudged up in direction but sit well inside luck's range - real money hasn't confirmed the browse gain either way." },
    ],
  },
  map: { composites: [{ id: "c1", label: "Total Room Check Availability CTA Clicks", role: "secondary" }, { id: "c2", label: "Total Room Detail Views", role: "secondary" }],
    roles: { "composite:c1": "supporting", "composite:c2": "supporting", m2: "guardrail", m3: "supporting" } },
  supporting: ["m1", "composite:c1", "composite:c2", "m2", "m3"],
};

// The renderer is now a SKIN: it gets the model, and the model is built from
// exactly what the server path passes it (docs/READOUT-MODEL.md).
const model = buildReadoutModel({
  prototypeName: args.prototypeName,
  prototypeKey: args.prototypeKey,
  results, stats, verdict: args.verdict, reading: args.reading,
  plan: args.map,
  decision: { key: "m1", label: "Visit Page: Booking Engine: Rooms & Rates", source: "console", directionDeclared: false },
  observed: [], roles: args.map.roles, order: args.supporting, hidden: [],
  experimentStatus: null, now: Date.parse(stats.computedAt),
});

const out = renderReadoutEmail({ ...args, model });
writeFileSync(process.argv[2], out.html);
console.log("SUBJECT:", out.subject);
console.log("---- TEXT ----\n" + out.text);
