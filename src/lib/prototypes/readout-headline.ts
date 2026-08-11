/**
 * THE HEADLINE — the one sentence a leader reads, and often the only one.
 *
 * WHAT THIS REPLACES. The computed headline used to be five branches over the
 * decision metric's Katz interval, in `templateStory()`:
 *
 *     : !sig ? "Nothing separates the two versions yet"
 *
 * A readout went out with that sentence sitting directly above a table showing
 * two supporting metrics up nineteen and fifteen percent. It was not bland, it
 * was FALSE — because it reasoned from one metric and stated a conclusion about
 * the experiment, on a test (`liftCi.lo * liftCi.hi > 0`) the verdict engine
 * never uses.
 *
 * FOUR RULES, and every line here obeys them:
 *
 *  1. THE ACTION COMES FROM THE VERDICT, never re-derived from metrics. That
 *     is what makes verdict supremacy structural instead of a check we
 *     remember to run. The metrics then fill exactly one evidence slot inside
 *     the action the verdict already chose.
 *  2. NO CLAIM WITHOUT THE EVIDENCE CLASS THAT LICENSES IT. Every row is
 *     classified once (§CLASSIFY) and a class that asserts nothing — QUIET —
 *     can never lead. `beyondLuck`, never `settled`: the FDR-corrected test
 *     the engine actually ran.
 *  3. VALENCE IS NEVER IN THE VERB. "rose" and "fell" are the only places a
 *     lift's sign is read, and they state a movement, not a judgement. Whether
 *     a movement is good comes from `favourable`, which requires a DECLARED
 *     direction — so an undeclared metric can move without being called a win
 *     or a loss. This is why MOVEMENT exists as a class apart from GAIN/LOSS.
 *  4. NO MAGNITUDE. "far more", "clearly", "nearly a quarter" are digit-free
 *     numbers and they were wrong as often as they were right. The table
 *     carries size; this sentence carries direction and relation.
 *
 * "We cannot tell yet" is never a terminal sentence. There is almost always a
 * smaller true thing — which stage moved, what has not followed, what is not
 * yet cleared, what would settle it. Only a genuinely empty run bottoms out on
 * a constant, and those constants are asserted at module load so the fallback
 * can never itself be rejected by the validator.
 */
import type { MetricView, ReadoutModel } from "./readout-model";

export type EvidenceClass =
  | "ADOPTION"
  | "NOT_COMPUTING"
  | "HARM_PROVEN"
  | "HARM_SUSPECT"
  | "UNPROVEN_SAFE"
  | "SAFE_PROVEN"
  | "GAIN"
  | "LOSS"
  | "MOVEMENT"
  | "QUIET";

/** What a sentence ASSERTS, independent of how it is worded. The matrix in
 *  §GATE rejects a candidate whose claims the verdict forbids — so a rung
 *  being reachable is not the same as its sentence being allowed. */
export type Claim =
  | "DECISION_WON" | "DECISION_LOST" | "DECISION_QUIET"
  | "MOVEMENT" | "NO_MOVEMENT" | "HARM" | "SAFE"
  | "ADOPTION" | "NO_TEST" | "SAMPLE" | "NO_TRUST";

export type HeadlineAction =
  | "nothing-to-read" | "fix-the-setup" | "fix-the-definition"
  | "stop" | "kill-or-redesign" | "ship" | "wait-or-decide";

export interface HeadlineTrace {
  action: HeadlineAction;
  rung: string;
  claims: Claim[];
  evidenceKeys: string[];
}

const CAP = 80;

/** Claims a verdict state forbids. `confirmed` may not be told the decision
 *  metric lost; an unadjudicated run may not be told it won OR lost; an
 *  invalid run may assert nothing at all except that it cannot be trusted. */
const FORBIDDEN: Record<string, Claim[]> = {
  confirmed: ["DECISION_LOST", "DECISION_QUIET"],
  refuted: ["DECISION_WON", "DECISION_QUIET"],
  keep_running: ["DECISION_WON", "DECISION_LOST"],
  underpowered: ["DECISION_WON", "DECISION_LOST"],
  not_adjudicable: ["DECISION_WON", "DECISION_LOST", "DECISION_QUIET"],
  guardrail_breach: ["DECISION_WON"],
  invalid: ["DECISION_WON", "DECISION_LOST", "DECISION_QUIET", "MOVEMENT", "NO_MOVEMENT", "HARM", "SAFE", "ADOPTION", "NO_TEST", "SAMPLE"],
};

const STOPWORDS = new Set(["the", "a", "an", "is", "it", "and", "or", "to", "of", "in", "on", "for", "so", "not", "has", "have", "was", "were", "this", "that", "yet", "no", "nothing", "at", "with", "but"]);

const tokens = (s: string) =>
  new Set(s.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOPWORDS.has(w)));

const jaccard = (a: string, b: string) => {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  A.forEach((w) => { if (B.has(w)) hit++; });
  return hit / (A.size + B.size - hit);
};

/** Trim a label to something that can sit in a sentence. Never mid-word. */
const shorten = (label: string, max = 38) => {
  const bare = label.replace(/\s*\([^)]*\)\s*$/, "").replace(/^(Global|Total|Visit Page)\s*:\s*/i, "").trim();
  if (bare.length <= max) return bare;
  const cut = bare.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > 12 ? cut.slice(0, sp) : cut).trim();
};

const ACTION_NOUNS = /\s+(opens|clicks|views|taps|impressions|engagement|sign-ups|submits|starts)$/i;

/** A label safe to print: short enough, and carrying NO DIGIT — the headline
 *  validator rejects any digit, and a metric named "Top 5 Destinations" would
 *  otherwise take the whole sentence down with it. Strips a trailing action
 *  noun first, and only then falls back to a role-generic phrase. */
function labelSafe(m: MetricView, generic: string, max = 38): string {
  let t = shorten(m.label, max);
  if (/\d/.test(t)) {
    const stripped = t.replace(ACTION_NOUNS, "");
    t = /\d/.test(stripped) ? generic : stripped;
  }
  return t || generic;
}

const genericFor = (m: MetricView) =>
  m.isDecision ? "the outcome" : m.role === "guardrail" ? "a guardrail" : "another step";

// ── CLASSIFY ────────────────────────────────────────────────────────────────

/** Exactly one class per row. Reads `beyondLuck` (the FDR-corrected claim a
 *  surface is allowed to print), never `settled`, and never a bare lift sign. */
export function classify(m: MetricView): EvidenceClass {
  if (m.featureOnly !== null && !m.headline.absent) return "ADOPTION";
  if (m.lift.absent && m.featureOnly === null) return "NOT_COMPUTING";
  if (m.guardrail === "breach") return "HARM_PROVEN";
  if (m.guardrail === "at_risk") return m.guardrailReason === "harm" ? "HARM_SUSPECT" : "UNPROVEN_SAFE";
  if (m.guardrail === "pass") return "SAFE_PROVEN";
  if (m.beyondLuck && !m.guardrail) {
    // WITHOUT A DECLARED DIRECTION THERE IS NO VALENCE. `favourable` defaults
    // to increase-is-good, so calling this a GAIN or a LOSS would print an
    // assumption as a finding — the same defect that reported a correct
    // prediction as REFUTED.
    if (!m.directionDeclared) return "MOVEMENT";
    return m.favourable === true ? "GAIN" : m.favourable === false ? "LOSS" : "MOVEMENT";
  }
  return "QUIET";
}

// ── RENDER HELPERS ──────────────────────────────────────────────────────────

const moveWord = (m: MetricView) => ((m.lift.raw ?? 0) >= 0 ? "rose" : "fell");

/** Metric labels are usually plural noun phrases — "Room detail opens",
 *  "Booking engine arrivals" — and a fixed singular verb put "arrivals has not
 *  followed" in the largest sentence on the page. Judged on the last word, and
 *  when in doubt it picks singular, which is wrong less often. */
const isPlural = (label: string) => {
  const last = label.trim().split(/\s+/).pop()?.toLowerCase() ?? "";
  return /s$/.test(last) && !/(ss|us|is|as|ics|ness|status)$/.test(last);
};

const agrees = (label: string, singular: string, plural: string) => (isPlural(label) ? plural : singular);

const quietPhrase = (label: string, state: string) =>
  state === "confirmed" || state === "refuted" || state === "guardrail_breach"
    ? agrees(label, "has not moved", "have not moved")
    : agrees(label, "has not followed", "have not followed");

// ── THE DERIVATION ──────────────────────────────────────────────────────────

interface Candidate { text: string; rung: string; claims: Claim[]; keys: string[] }

export function deriveHeadline(model: ReadoutModel): { text: string; trace: HeadlineTrace } | null {
  if (model.empty) return null;

  const v = model.verdict;
  const state = v?.state ?? "keep_running";
  const rank = (a: MetricView, z: MetricView) => {
    const sup = (m: MetricView) => (model.supporting.some((s) => s.key === m.key) ? 0 : 1);
    if (sup(a) !== sup(z)) return sup(a) - sup(z);
    const mag = Math.abs(z.lift.raw ?? 0) - Math.abs(a.lift.raw ?? 0);
    if (mag) return mag;
    return a.key < z.key ? -1 : 1;
  };

  // `model.all`, not `model.supporting` — an unadjudicable run collapses the
  // supporting set to the decision row alone, and the movement that explains
  // the run is then invisible. Supporting membership is restored as the first
  // tie-break above rather than as a filter.
  const of = (c: EvidenceClass) => model.all.filter((m) => classify(m) === c && !m.hidden).sort(rank);
  // biggestGain/biggestCost are DELIBERATELY not used: they are picked by
  // magnitude with no beyond-luck test, so they can nominate a row this
  // sentence is not allowed to make a claim about.
  const gains = of("GAIN").filter((m) => !m.isDecision);
  const costs = of("LOSS").filter((m) => !m.isDecision);
  const movements = of("MOVEMENT").filter((m) => !m.isDecision);
  const adoption = of("ADOPTION");
  const breaches = of("HARM_PROVEN");
  const suspects = of("HARM_SUSPECT");
  const unproven = of("UNPROVEN_SAFE");

  const decision = model.decision;
  const stall =
    decision && classify(decision) === "QUIET"
      ? decision
      : model.all.find((m) => classify(m) === "QUIET" && !m.guardrail && !m.featureOnly && !m.hidden) ?? null;

  const N = (m: MetricView, max = 38) => labelSafe(m, genericFor(m), max);
  /** The quiet verb, agreeing with the label it follows. */
  const QW = (label: string) => quietPhrase(label, state);

  // ── the ACTION, from the verdict alone ──
  const action: HeadlineAction =
    state === "invalid" || model.stats?.focusFallback ? "fix-the-setup"
    : state === "not_adjudicable" ? "fix-the-definition"
    : state === "guardrail_breach" ? "stop"
    : state === "refuted" ? "kill-or-redesign"
    : state === "confirmed" ? "ship"
    : "wait-or-decide";

  const C = (text: string, rung: string, claims: Claim[], keys: string[] = []): Candidate => ({ text, rung, claims, keys });
  const ladder: Candidate[] = [];

  if (action === "fix-the-setup") {
    ladder.push(C(
      model.stats?.focusFallback && state !== "invalid"
        ? "These are a different version's numbers, so nothing can be read"
        : "The two groups are not comparable, so nothing below can be read",
      "SETUP", ["NO_TRUST"]));
  } else if (action === "fix-the-definition") {
    const failed = v?.gates.find((g) => g.pass === false)?.id;
    const mover = movements[0] ?? gains[0] ?? costs[0];
    // THE MOVEMENT OUTRANKS THE GATE REASON. Which gate failed is already said
    // by the verdict's next-step line inches away; that a metric moved anyway
    // is not said anywhere else.
    if (mover) {
      ladder.push(C(`${N(mover, 34)} ${moveWord(mover)}, and nothing was agreed to judge it by`, "DEF_MOVED", ["MOVEMENT", "NO_TEST"], [mover.key]));
      ladder.push(C("Something moved, and nothing was agreed to judge it by", "DEF_MOVED_PLAIN", ["MOVEMENT", "NO_TEST"]));
    }
    if (failed === "mapping") ladder.push(C("Nothing was written down as the measure of success here", "DEF_MAPPING", ["NO_TEST"]));
    else if (failed === "prereg") ladder.push(C("The brief never says what this run was meant to change", "DEF_PREREG", ["NO_TEST"]));
    else if (decision?.featureOnly) ladder.push(C("The chosen measure only exists in one version, so nothing compares", "DEF_ONE_ARM", ["NO_TEST"]));
    else if (decision?.misnamed) ladder.push(C("The chosen measure names an event nobody is reporting", "DEF_MISNAMED", ["NO_TEST"]));
    ladder.push(C("Nothing was agreed in advance to judge this run by", "DEF_TERMINAL", ["NO_TEST"]));
  } else if (action === "stop") {
    const b = breaches[0];
    if (b) ladder.push(C(`A declared limit has moved: ${N(b, 44)}`, "BREACH", ["HARM"], [b.key]));
    ladder.push(C("A limit the team set in advance has been crossed", "STOP_TERMINAL", ["HARM"]));
  } else if (action === "ship") {
    if (v?.directionCaveat) ladder.push(C("No winning direction was declared, so this call may be inverted", "INVERTED", ["NO_TRUST"]));
    if (breaches[0]) ladder.push(C(`It worked, and a declared limit moved with it: ${N(breaches[0], 30)}`, "SHIP_BREACH", ["HARM"], [breaches[0].key]));
    if (suspects[0]) ladder.push(C(`Shipping this also ships an unresolved risk to ${N(suspects[0], 30)}`, "SHIP_SUSPECT", ["HARM"], [suspects[0].key]));
    if (model.stats?.novelty?.decayed) ladder.push(C("The gain is fading, so do not plan on all of it", "DECAYING", ["MOVEMENT"]));
    if (costs[0]) ladder.push(C(`It arrived at the cost of ${N(costs[0], 44)}`, "WON_AND_COST", ["MOVEMENT"], [costs[0].key]));
    if (!model.hypothesis.frozen && model.hypothesis.text) ladder.push(C("It worked, but nothing was written down before the traffic", "UNFROZEN", ["NO_TRUST"]));
    const lead = gains[0] ?? movements[0];
    if (lead && decision) ladder.push(C(`${N(decision, 30)} ${moveWord(decision)}, and ${N(lead, 28).toLowerCase()} ${moveWord(lead)}`, "MECHANISM", ["MOVEMENT"], [decision.key, lead.key]));
    ladder.push(C("It carried all the way through, and nothing gave way", "SHIP_TERMINAL", ["SAFE"]));
  } else if (action === "kill-or-redesign") {
    if (v?.directionCaveat) ladder.push(C("No winning direction was declared, so this call may be inverted", "INVERTED", ["NO_TRUST"]));
    if (gains[0]) ladder.push(C(`${N(gains[0], 32)} ${moveWord(gains[0])}, and the outcome went the other way`, "SALVAGE", ["MOVEMENT"], [gains[0].key]));
    if (costs[0]) ladder.push(C(`${N(costs[0], 40)} ${moveWord(costs[0])}, and nothing came back for it`, "KILL_COST", ["MOVEMENT"], [costs[0].key]));
    ladder.push(C("The idea as built is costing something rather than adding it", "KILL_TERMINAL", []));
  } else {
    // wait-or-decide
    if (breaches[0]) ladder.push(C(`A declared limit has moved: ${N(breaches[0], 44)}`, "W_BREACH", ["HARM"], [breaches[0].key]));
    if (gains[0] && costs[0]) ladder.push(C(`${N(gains[0], 28)} ${moveWord(gains[0])}, and ${N(costs[0], 26).toLowerCase()} ${moveWord(costs[0])} with it`, "BOTH_WAYS", ["MOVEMENT"], [gains[0].key, costs[0].key]));
    if (!gains[0] && costs[0]) ladder.push(C(`${N(costs[0], 38)} ${moveWord(costs[0])}, and nothing has come back for it`, "COST_ONLY", ["MOVEMENT"], [costs[0].key]));
    if (gains[0]) {
      const g = gains[0];
      if (stall) ladder.push(C(`${N(g, 30)} ${moveWord(g)}, and ${N(stall, 26).toLowerCase()} ${QW(stall.label)}`, "LEAK", ["MOVEMENT", "DECISION_QUIET"], [g.key, stall.key]));
      ladder.push(C(`${N(g, 40)} ${moveWord(g)}, and the outcome has not followed`, "LEAK_PLAIN", ["MOVEMENT", "DECISION_QUIET"], [g.key]));
      ladder.push(C(`Something upstream ${moveWord(g)}, and the outcome has not followed`, "LEAK_GENERIC", ["MOVEMENT", "DECISION_QUIET"], [g.key]));
    }
    if (adoption[0]) {
      const a = adoption[0];
      if (stall) ladder.push(C(`The new ${N(a, 26).toLowerCase()} is used; ${N(stall, 24).toLowerCase()} ${QW(stall.label)}`, "REACH", ["ADOPTION", "DECISION_QUIET"], [a.key, stall.key]));
      ladder.push(C(`The new ${N(a, 40).toLowerCase()} is being used, and the outcome has not followed`, "REACH_PLAIN", ["ADOPTION", "DECISION_QUIET"], [a.key]));
      ladder.push(C(`The new ${N(a, 44).toLowerCase()} is being used`, "REACH_BARE", ["ADOPTION"], [a.key]));
    }
    if (suspects[0]) ladder.push(C(`${N(suspects[0], 34)} may be slipping, and nothing has answered`, "SUSPECT", ["HARM"], [suspects[0].key]));
    if (movements[0]) ladder.push(C(`${N(movements[0], 34)} ${moveWord(movements[0])}, and the outcome has not followed`, "MOVED_NO_VERDICT", ["MOVEMENT", "DECISION_QUIET"], [movements[0].key]));
    if (unproven[0]) ladder.push(C(`${N(unproven[0], 30)} is not yet proven safe, and nothing has answered`, "UNPROVEN", [], [unproven[0].key]));

    // Nothing is established. Say WHICH kind of nothing — the old code had one
    // sentence for all of these and it was the least informative of the three.
    const runtimeGateFailed = v?.gates.some((g) => g.id === "runtime" && g.pass === false);
    const days = model.stats?.power?.daysToObserved;
    if (runtimeGateFailed) {
      ladder.push(C(
        model.guardrailsUnjudged
          ? "The week is unfinished, so nothing has been judged — not even the guardrail"
          : "The week is unfinished, so nothing has been judged yet",
        "NOT_JUDGED_YET", ["SAMPLE"]));
    }
    if (days !== undefined && days > 90) ladder.push(C("An effect this small will not surface at this traffic", "REDESIGN", ["SAMPLE"]));
    if (days !== undefined) ladder.push(C("Only more traffic separates the two versions now", "WAIT", ["SAMPLE"]));
    ladder.push(C("Nothing has answered yet, and the guardrails are holding", "W_TERMINAL", ["SAFE"]));
    ladder.push(C("Nothing has answered yet", "W_TERMINAL_BARE", ["SAMPLE"]));
  }

  // ── GATE. Three tests, in order; a failure drops to the next rung. ──
  const forbidden = new Set(FORBIDDEN[state] ?? []);
  const said = [v?.label, v?.answer].filter(Boolean) as string[];
  const exemptFromTripwire = new Set(["UNFROZEN", "SHIP_BREACH"]);

  for (const cand of ladder) {
    if (cand.text.length > CAP) continue;
    if (/\d/.test(cand.text)) continue;
    if (cand.claims.some((c) => forbidden.has(c))) continue;
    // SAY IT ONCE. The verdict renders inches away; a headline that paraphrases
    // it has spent the largest sentence on the reader's second-least-surprising
    // fact. Post-verdict rungs presuppose the verdict rather than restate it.
    if (!exemptFromTripwire.has(cand.rung) && said.some((s) => jaccard(cand.text, s) >= 0.6)) continue;
    return { text: cand.text, trace: { action, rung: cand.rung, claims: cand.claims, evidenceKeys: cand.keys } };
  }

  // Unreachable in practice: every ladder ends in a constant that passes all
  // three gates by construction. Kept because "unreachable" has been wrong.
  return { text: "The run is still being read", trace: { action, rung: "FLOOR", claims: [], evidenceKeys: [] } };
}

// ── CONTRADICTION TESTS FOR THE ANALYST'S HEADLINE ──────────────────────────

/** Claims a free-text headline ASSERTS, by lexicon. Deliberately narrow: this
 *  gates truth, never style. A sentence whose claims cannot be read stays. */
export function claimsOf(text: string): Set<Claim> {
  const out = new Set<Claim>();
  const t = text.toLowerCase();
  if (/\b(work(ed|s)|wins?|won|ahead|beat(s|ing)?|improv\w*|lifted|paid off)\b/.test(t)) out.add("DECISION_WON");
  if (/\b(behind|los(t|ing)|hurt|damag\w*|backfired|cost(ing)?)\b/.test(t)) out.add("DECISION_LOST");
  if (/\bnothing\b[^.]*\b(separat\w*|mov\w*|chang\w*|differ\w*|happen\w*)\b/.test(t) ||
      /\bno\b\s+\b(difference|change|movement|effect)\b/.test(t)) out.add("NO_MOVEMENT");
  if (/\bguardrails?\b[^.]*\b(hold\w*|clear|fine|safe|intact)\b/.test(t)) out.add("SAFE");
  return out;
}

/** Why the analyst's headline must not be printed, or null to print it.
 *
 *  ONLY CONTRADICTION. Not tone, not register, not length below the cap, not
 *  preference — the analyst will usually out-write the floor and should. What
 *  it may not do is deny what the numbers beside it establish. */
export function headlineContradiction(text: string, model: ReadoutModel): string | null {
  const claims = claimsOf(text);
  const state = model.verdict?.state;
  const forbidden = new Set(FORBIDDEN[state ?? ""] ?? []);

  for (const c of claims) if (forbidden.has(c)) return `claims ${c} under a ${state} verdict`;

  const moved = model.all.filter((m) => !m.hidden && ["GAIN", "LOSS", "MOVEMENT", "ADOPTION"].includes(classify(m)));
  // THE ONE THAT MATTERS. This is the exact sentence that shipped: "Nothing
  // separates the two versions yet" above two settled movers.
  if (moved.length && claims.has("NO_MOVEMENT")) {
    return `denies movement while ${moved.length} row(s) moved beyond luck`;
  }

  const harmed = model.all.filter((m) => ["HARM_PROVEN", "HARM_SUSPECT"].includes(classify(m)));
  if (harmed.length && claims.has("SAFE")) return "calls the guardrails clear while one is breached or at risk";

  return null;
}
