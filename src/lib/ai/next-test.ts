import Anthropic from "@anthropic-ai/sdk";
import { normaliseProse, rejectReason } from "./results";
import type { NextTest } from "../prototypes/next-test";

/**
 * THE PROSE HALF of "what to test next".
 *
 * `deriveNextTest` already decided the primary metric, the guardrails, the
 * duration and what is ruled out. Nothing here may revisit any of that. The
 * model gets ONE job — say, in a sentence a person would say, what change we
 * are proposing and why this run points at it — and it is handed the figures
 * rather than asked to produce them.
 *
 * WHY THE HYPOTHESIS MAY NOT CONTAIN A DIGIT. Every number in this feature is
 * computed and rendered beside the prose. A model that also writes numbers
 * gives you two sources for one fact, and the day they disagree the reader has
 * no way to tell which is real. `rejectReason` — the same validator the reading
 * uses, imported rather than re-implemented — refuses digits, statistics
 * vocabulary and markup. The numbers stay where they were computed.
 *
 * WHAT IS NOT ENFORCED, deliberately: the prose is not bound to the metric
 * vocabulary. Detecting "this sentence named a measure we do not have" from
 * free text is guesswork, and a guard that mostly produces false positives
 * refuses good drafts — the exact way this codebase has broken readouts before
 * (docs/dev/never-blank-smoke.mts). It is also unnecessary: the primary metric
 * is chosen by the derivation and rendered beside the prose, so a sentence that
 * names the wrong thing is visibly wrong and changes nothing about the test.
 * The ruled-out directions are given to the model as a hard prohibition
 * instead, which is where that risk actually lives.
 */

const MAX_HYPOTHESIS = 420;
const MAX_CANDIDATE = 260;

export interface NextTestCandidateIdea {
  title: string;
  rationale: string;
}

export interface NextTestDraft {
  /** A name for the follow-up prototype. */
  name: string;
  /** The claim, in one sentence, with no figures in it. */
  hypothesis: string;
  /** What to actually build, ranked. */
  candidates: NextTestCandidateIdea[];
  generatedAt: string;
  /** The parent run this was drawn from — lineage for the record. */
  basisKey: string;
  /** Anything refused and regenerated, kept so a bad draft is diagnosable. */
  rejected: string[];
}

export interface DraftInput {
  next: NextTest;
  parentKey: string;
  parentName: string;
  /** The parent's brief in one line — what was changed. */
  parentChange: string;
  /** What the parent claimed would happen. */
  parentHypothesis?: string;
  /** How the parent was adjudicated. */
  parentVerdict?: string;
  /** A correction from the user, for a regenerate. */
  correction?: string;
  /** The draft being corrected. */
  current?: NextTestDraft;
}

const num = (x: number | undefined, dp = 1) => (x === undefined ? "unknown" : `${(x * 100).toFixed(dp)}%`);

function figuresFor(next: NextTest): string {
  const l: string[] = [];
  l.push(`Traffic: ${next.traffic.perArmN} per arm over ${next.traffic.days} days.`);
  if (next.primary) {
    l.push(`RECOMMENDED PRIMARY METRIC (already decided — do not change it): "${next.primary.label}".`);
    l.push(`  It moved ${num(next.primary.lift)} in the run just finished.`);
    if (next.primary.resolvability.days !== undefined) {
      l.push(`  It resolves the target effect in about ${next.primary.resolvability.days} days at this traffic.`);
    }
    if (next.primary.reasons.length) l.push(`  Chosen because: ${next.primary.reasons.join("; ")}.`);
  }
  if (next.excluded.length) {
    l.push(`RULED OUT as a primary: ${next.excluded.slice(0, 3).map((c) => `"${c.label}" (${c.ineligible})`).join("; ")}.`);
  }
  if (next.ruleOuts.length) {
    l.push(`DIRECTIONS ALREADY ANSWERED — do not propose these: ${next.ruleOuts.map((r) => `"${r.label}" did not move (any effect beyond ±${num(r.bound)} is excluded)`).join("; ")}.`);
  }
  if (next.transfer) {
    l.push(`The decision metric gave up ${Math.abs(next.transfer.lost)} actions; the other measures net ${next.transfer.net > 0 ? "+" : ""}${next.transfer.net}.`);
    l.push(`  Biggest movers: ${next.transfer.contributors.slice(0, 5).map((c) => `${c.label} ${c.delta > 0 ? "+" : ""}${c.delta}`).join(", ")}.`);
  }
  for (const p of next.funnelPairs) {
    l.push(`UNCONFIRMED step: "${p.downLabel}" per "${p.upLabel}" moved from ${num(p.baseRatio)} to ${num(p.focusRatio)}. Treat as a lead, never as established.`);
  }
  if (next.guardrails.length) {
    l.push(`MUST NOT FALL BACK: ${next.guardrails.slice(0, 6).map((g) => `"${g.label}"`).join(", ")}.`);
  }
  return l.join("\n");
}

const SYSTEM = `You write the follow-up to a concluded A/B test for a hotel group's experimentation console.

The primary metric, the guardrails, the duration and the ruled-out directions have ALREADY BEEN COMPUTED and are given to you. You do not choose them and you do not second-guess them. Your job is to say what change we should make and why this run points at it.

HARD RULES.
- NEVER write a digit or a number in words. Every figure is computed and printed beside your text. If you write one too, the reader gets two sources for one fact.
- NEVER use statistical vocabulary: significant, p-value, confidence, power, uplift, variance.
- NEVER propose testing something listed as an answered direction. Those are settled and repeating them wastes a fortnight.
- The hypothesis must name the CHANGE, the AUDIENCE, and the EFFECT the recommended primary metric should show. One sentence. Plain words a hotel marketer would use.
- Build candidates must be things someone could actually build on a web page. Concrete surfaces, not strategies.

Return JSON only:
{"name": "...", "hypothesis": "...", "candidates": [{"title":"...","rationale":"..."}]}
- name: three to six words naming the follow-up test.
- hypothesis: one sentence, no digits.
- candidates: two or three, best first. rationale says which measured behaviour argues for it, in words.`;

function userMessage(inp: DraftInput): string {
  const parts = [
    `THE RUN THAT JUST FINISHED — "${inp.parentName}"`,
    `What was changed: ${inp.parentChange || "(not recorded)"}`,
    inp.parentHypothesis ? `What it claimed: ${inp.parentHypothesis}` : "",
    inp.parentVerdict ? `How it was adjudicated: ${inp.parentVerdict}` : "",
    "",
    "THE COMPUTED FIGURES — these are settled; use them, do not restate the numbers.",
    figuresFor(inp.next),
  ];
  if (inp.correction && inp.current) {
    parts.push(
      "",
      "A DRAFT ALREADY EXISTS AND THE USER HAS CORRECTED IT. Rewrite it to honour the correction, keeping everything the correction does not touch.",
      `Current name: ${inp.current.name}`,
      `Current hypothesis: ${inp.current.hypothesis}`,
      `Current candidates: ${inp.current.candidates.map((c) => `${c.title} — ${c.rationale}`).join(" | ")}`,
      `THE CORRECTION: ${inp.correction}`,
    );
  }
  return parts.filter(Boolean).join("\n");
}

/** Draft the follow-up. Figures are never asked for and never accepted. */
export async function draftNextTest(inp: DraftInput): Promise<NextTestDraft | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey });
  const rejected: string[] = [];

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1400,
      system: SYSTEM,
      messages: [{
        role: "user",
        content: attempt === 0 ? userMessage(inp)
          : `${userMessage(inp)}\n\nYOUR PREVIOUS ATTEMPT WAS REFUSED: ${rejected[rejected.length - 1]}. Fix exactly that and return the JSON again.`,
      }],
    });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    let parsed: { name?: string; hypothesis?: string; candidates?: { title?: string; rationale?: string }[] };
    try { parsed = JSON.parse(json); } catch { rejected.push("not valid JSON"); continue; }

    const hypothesis = normaliseProse(String(parsed.hypothesis ?? ""));
    const bad = rejectReason(hypothesis, MAX_HYPOTHESIS);
    if (bad) { rejected.push(`hypothesis: ${bad}`); continue; }

    const candidates = (parsed.candidates ?? [])
      .map((c) => ({ title: normaliseProse(String(c.title ?? "")), rationale: normaliseProse(String(c.rationale ?? "")) }))
      .filter((c) => c.title && !rejectReason(c.rationale, MAX_CANDIDATE));
    if (!candidates.length) { rejected.push("no usable build candidates"); continue; }

    const name = normaliseProse(String(parsed.name ?? "")).slice(0, 80);
    if (!name) { rejected.push("no name"); continue; }

    return {
      name, hypothesis, candidates: candidates.slice(0, 3),
      generatedAt: new Date().toISOString(), basisKey: inp.parentKey, rejected,
    };
  }
  return null;
}
