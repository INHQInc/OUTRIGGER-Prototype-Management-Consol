/**
 * THE FULL OBSERVATION — one metric, read properly.
 *
 * The line in the observations list is a teaser. This is the thing you can
 * read back in a meeting: what the variation did to this metric, why it
 * happened given what was actually built, how it bears on the brief's goal,
 * and what would make the reading wrong.
 *
 * Same laws as everywhere else: the WORDS carry no digits (the console prints
 * every number beside them, live, so a saved paragraph can never quote a stale
 * one), no statistics vocabulary, and the model may not decide anything — the
 * verdict is computed and belongs to the decision metric alone.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { PrototypeRecord } from "../prototypes/types";
import type { ExperimentResults, MetricMap } from "../prototypes/results";
import type { StatsReport } from "../prototypes/stats";
import type { VerdictRecord } from "../prototypes/verdict";
import { armEventsFor } from "../prototypes/results";

export interface DeepObservation {
  metricKey: string;
  headline: string;
  /** WHAT THIS METRIC CAPTURES — the guest behaviour it counts. A definition,
   *  not a finding: true before the experiment ran and after it ends. */
  captures?: string;
  /** WHAT HAPPENED — the behaviour, not the arithmetic. */
  observation: string;
  /** WHY — the mechanism, read off what was actually built. */
  mechanism: string;
  /** WHY IT MIGHT NOT BE THAT — the rival explanation for the same numbers.
   *  A mechanism with no stated rival is a story, not an analysis. */
  rival?: string;
  /** What it means for the booking path and the goal of the experiment. */
  implication: string;
  /** HOW THIS IS COUNTED — COMPUTED, never narrated. The console knows when a
   *  metric is an action total, fires in one arm, has members Optimizely isn't
   *  reporting, or hasn't separated from the control. Asking the model for
   *  "measurement caveats" produced the same sentence as the rival explanation
   *  ("it counts taps, not guests") in two sections of the same box — and a
   *  caveat that depends on the model remembering it is a caveat that will
   *  eventually go missing. */
  counting?: string;
  /** Legacy: the model-written caveat, still rendered on cached reads. */
  caution?: string;
  watch?: string;
  /** Legacy single-paragraph form, still rendered if a cached read has it. */
  read?: string;
  context?: string;
  generatedAt: string;
  basisKey: string;
}

const tool = {
  name: "give_observation",
  description: "A full read of ONE metric in this experiment, broken into the parts an analyst separates: what happened, why, what else could explain it, and what it means.",
  input_schema: {
    type: "object" as const,
    properties: {
      headline: { type: "string" as const, description: "<=110 chars, NO DIGITS. A claim carrying its own qualification, e.g. 'More visitors reach the booking step, but the gap is still too faint to lean on'. Never a status line." },
      captures: { type: "string" as const, description: "<=140 chars, NO DIGITS. WHAT THIS METRIC CAPTURES: the guest behaviour it counts, in plain words — e.g. 'Guests who reach the booking engine's rooms and rates step' or 'Guests opening a room's details, by either route'. A DEFINITION, not a finding: it must read the same whether the metric went up, down or nowhere. Never mention versions, results, or movement." },
      observation: { type: "string" as const, description: "<=450 chars, NO DIGITS. WHAT HAPPENED, behaviourally: what guests did differently on this surface between the two versions. Describe behaviour, not arithmetic." },
      mechanism: { type: "string" as const, description: "<=500 chars, NO DIGITS. WHY it happened, read off what was actually built — the specific thing on the screen that changed and how it altered the path. If the code or the surfaces do not support an explanation, say that the mechanism is unclear rather than inventing one." },
      rival: { type: "string" as const, description: "<=400 chars, NO DIGITS. WHY IT MIGHT NOT BE THAT: the strongest competing explanation for the same GUEST BEHAVIOUR — attention shifting from another surface rather than new demand, curiosity rather than intent, a difference in who was exposed, a knock-on from a change elsewhere in the path. This is about the world, NOT about the instrument: never write about how the metric is counted, actions-versus-guests, one-armed surfaces or sample size — the console states all of that itself, and repeating it here wastes the one section that can only come from you. Omit ONLY if no credible rival exists." },
      implication: { type: "string" as const, description: "<=400 chars, NO DIGITS. What it means for the booking path and for what the experiment set out to prove — where intent is created or lost, and what follows for the business." },

      watch: { type: "string" as const, description: "<=300 chars, NO DIGITS. The one thing to watch next on this metric." },
    },
    required: ["captures", "headline", "observation", "mechanism", "implication"],
  },
};

const DIGITS = /\d/;
const STATS = /\bq\s*[=<>]|\bp\s*[=<>]\s*0?\.|χ²|\bSRM\b|\balpha\b|\bFDR\b|\bconfidence interval\b|\bstatistically significant\b|\bsample size\b/i;

const clean = (v: unknown, cap: number) => {
  const t = typeof v === "string" ? v.replace(/\*\*|__/g, "").replace(/\s+/g, " ").trim() : "";
  if (!t || t.length > cap || DIGITS.test(t) || STATS.test(t)) return "";
  return t;
};

export async function deepObservation(opts: {
  metricKey: string;
  proto: PrototypeRecord;
  results: ExperimentResults;
  map: MetricMap | null;
  stats: StatsReport | null;
  verdict: VerdictRecord | null;
  /** The built variation code, when the console built it — the UX itself. */
  variationJs?: string | null;
  system: string;
  basisKey: string;
}): Promise<DeepObservation> {
  const client = new Anthropic();
  const m = opts.stats?.metrics.find((x) => x.key === opts.metricKey);
  if (!m) throw new Error("That metric isn't reporting.");

  const focusId = opts.stats?.focusVariationId;
  const baseId = opts.stats?.baselineVariationId;
  const armName = (id?: string) => opts.results.variations.find((v) => v.variationId === id)?.name ?? id ?? "?";
  const cell = (id?: string) => m.cells.find((c) => c.variationId === id);
  const pct = (v?: number) => (v === undefined ? "n/a" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`);
  const rate = (v?: number) => (v === undefined ? "n/a" : `${(v * 100).toFixed(2)}%`);

  const comp = opts.map?.composites.find((c) => `composite:${c.id}` === opts.metricKey);
  const howBuilt = comp
    ? comp.armEvents?.length
      ? `Composed per version — ${opts.results.variations.map((v) => `${v.name}: ${armEventsFor(comp, v.variationId).join(" + ")}`).join(" | ")}`
      : `Composed from: ${comp.events.join(" + ")}`
    : "A single Optimizely event, exactly as it fires.";

  // Everything else, so the read can talk about where this sits in the path.
  const neighbours = (opts.stats?.metrics ?? [])
    .filter((x) => x.key !== opts.metricKey)
    .map((x) => {
      const c = x.cells.find((y) => y.variationId === focusId);
      return `${x.label}: ${x.featureOnly ? "exists in one version only" : pct(c?.lift)}${c?.liftCi && c.liftCi.lo * c.liftCi.hi > 0 ? " (beyond luck)" : " (not settled)"}`;
    }).join("\n");

  const res = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1400,
    system: opts.system,
    messages: [{
      role: "user",
      content: `EXPERIMENT: ${opts.proto.name}
WHAT IT SET OUT TO PROVE: We believe ${opts.proto.hypothesis.change || "…"} for ${opts.proto.hypothesis.audience || "…"} will cause ${opts.proto.hypothesis.outcome || "…"}.
${opts.proto.brief?.problem ? `THE PROBLEM IT WAS ADDRESSING: ${opts.proto.brief.problem}` : ""}
${opts.proto.brief?.change ? `WHAT WAS BUILT: ${opts.proto.brief.change}` : ""}
${opts.proto.brief?.doneLooksLike ? `WHAT DONE LOOKED LIKE: ${opts.proto.brief.doneLooksLike}` : ""}
${opts.proto.brief?.where ? `WHERE ON THE PAGE: ${opts.proto.brief.where}` : ""}

THE MEASURE YOU ARE READING: ${m.label}
${comp?.definition ? `Defined at planning time as: ${comp.definition}` : ""}
${comp?.surfaces?.length ? `Surfaces: ${comp.surfaces.map((s) => `${s.description} (${s.arm})`).join(" · ")}` : ""}
How it is counted: ${howBuilt}${m.featureOnly ? " — NOTE: this fires in only one version, so there is no like-for-like comparison; the number is adoption." : ""}
${armName(focusId)}: ${rate(cell(focusId)?.rate)} · ${armName(baseId)} (control): ${rate(cell(baseId)?.rate)} · difference ${pct(cell(focusId)?.lift)}${cell(focusId)?.liftCi && cell(focusId)!.liftCi!.lo * cell(focusId)!.liftCi!.hi > 0 ? " — beyond what luck explains" : " — not settled either way yet"}

EVERY OTHER MEASURE, so you can place this one in the path:
${neighbours || "(none)"}

${opts.variationJs ? `THE CODE THAT WAS ACTUALLY BUILT (read it to explain WHY guests behaved differently — what changed on the screen):\n${opts.variationJs.slice(0, 6000)}` : "(The variation was built in Optimizely, so its code is not available here — reason from the surfaces named above.)"}

Start with CAPTURES — what this metric counts in guest behaviour, as a definition that would read identically if the numbers were reversed. Then write the full read of this ONE metric, for the hotel's team, in the parts an analyst separates:
  WHAT HAPPENED (behaviour, not arithmetic) · WHY (the mechanism, read off what was built) · WHY IT MIGHT NOT BE THAT (the strongest rival explanation) · WHAT IT MEANS (for the booking path and the goal).
A mechanism offered without a rival explanation is a story rather than an analysis, so give the rival unless none is credible.
NO DIGITS in your words — every number is printed beside your sentences and would go stale the moment the counts move. No statistics vocabulary: no significance, no sample size, no confidence, no days remaining. Do not give a verdict on the experiment; that belongs to the decision metric and the console computes it.`,
    }],
    tools: [tool],
    tool_choice: { type: "tool", name: "give_observation" },
  });

  const tu = res.content.find((c) => c.type === "tool_use");
  if (!tu || tu.type !== "tool_use") throw new Error("The observation came back empty — try again.");
  const raw = (tu.input ?? {}) as Record<string, unknown>;

  let captures = clean(raw.captures, 140);
  let headline = clean(raw.headline, 110);
  let observation = clean(raw.observation, 450);
  let mechanism = clean(raw.mechanism, 500);
  let implication = clean(raw.implication, 400);
  let rival = clean(raw.rival, 400);
  let watch = clean(raw.watch, 300);

  // A digit or a statistics word used to fail the whole read with an error the
  // reader could do nothing about. Ask once, quoting the rule that broke.
  if (!headline || !observation || !mechanism) {
    try {
      const fix = await client.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 1600,
        system: opts.system,
        messages: [
          { role: "user", content: "Rewrite the observation you just gave." },
          { role: "assistant", content: JSON.stringify(raw) },
          { role: "user", content: `Rejected. Every field must contain NO DIGITS AT ALL (the console prints every number beside your words) and no statistics vocabulary (significance, sample size, confidence, p-values, days remaining). Keep the same substance and the same parts. Return only JSON: {"headline","observation","mechanism","rival","implication","watch"}.` },
        ],
      });
      const txt = fix.content.map((c) => (c.type === "text" ? c.text : "")).join("");
      const m2 = /\{[\s\S]*\}/.exec(txt);
      if (m2) {
        const parsed = JSON.parse(m2[0]) as Record<string, unknown>;
        captures = captures || clean(parsed.captures, 140);
        headline = headline || clean(parsed.headline, 110);
        observation = observation || clean(parsed.observation, 450);
        mechanism = mechanism || clean(parsed.mechanism, 500);
        implication = implication || clean(parsed.implication, 400);
        rival = rival || clean(parsed.rival, 400);
        watch = watch || clean(parsed.watch, 300);
      }
    } catch { /* the computed floor below */ }
  }

  // Never a dead end: say the true thing the console already knows rather than
  // showing an error the reader cannot act on.
  if (!headline || !observation) {
    const dir = (cell(focusId)?.lift ?? 0) >= 0 ? "more" : "less";
    const settled = cell(focusId)?.liftCi && cell(focusId)!.liftCi!.lo * cell(focusId)!.liftCi!.hi > 0;
    headline = headline || (m.featureOnly
      ? `${m.label} exists only in ${armName(focusId)}, so it shows take-up rather than a gap`
      : `Guests do this ${dir} in ${armName(focusId)}${settled ? ", by more than luck explains" : ", though the gap has not settled"}`);
    observation = observation || (m.featureOnly
      ? `Guests in ${armName(focusId)} used this surface; there is nothing equivalent in ${armName(baseId)} to compare it against.`
      : `Guests in ${armName(focusId)} did this ${dir} often than guests in ${armName(baseId)}.`);
    mechanism = mechanism || `The console could not write a mechanism for this metric. How it is counted: ${howBuilt}`;
    implication = implication || "Open the numbers view for the full detail on this metric.";
  }

  // HOW THIS IS COUNTED — assembled from facts, in the order that matters most
  // to a reader deciding how much weight to put on the number.
  const counting = (() => {
    const parts: string[] = [];
    if (m.missingEvents?.length) {
      parts.push(`this metric's definition names ${m.missingEvents.map((e) => `“${e}”`).join(", ")}, which Optimizely is not reporting under that name, so what is shown is incomplete`);
    }
    if (m.featureOnly) {
      parts.push(`the surface only exists in the ${m.featureOnly === "variation" ? "new version" : "control"}, so there is nothing equivalent to compare it against — read it as adoption, not as a lift`);
    }
    if (m.kind === "composite" && m.test === "actions") {
      parts.push("this is a total of ACTIONS per visitor, not a head-count: one guest acting several times counts each time, so the rate can pass one hundred per cent and it measures behaviour rather than distinct people");
    }
    if (m.test === "none") {
      parts.push("this is a value-style metric, so per-visitor variation is not available from the totals and no confidence can be computed for it");
    }
    if (!m.featureOnly && m.test !== "none") {
      const cell = m.cells.find((c) => c.variationId === opts.stats?.focusVariationId);
      if (cell?.liftCi && cell.liftCi.lo * cell.liftCi.hi <= 0) {
        parts.push("the gap has not separated from the control yet, so the direction could still go either way");
      }
    }
    if (!parts.length) return "";
    return `${parts[0].charAt(0).toUpperCase()}${parts[0].slice(1)}${parts.length > 1 ? `. ${parts.slice(1).join(". ")}` : ""}.`;
  })();

  return {
    metricKey: opts.metricKey,
    captures: captures || `Counts ${m.label.toLowerCase()}, per visitor.`,
    headline, observation, mechanism, implication,
    rival: rival || undefined,
    counting: counting || undefined,
    watch: watch || undefined,
    generatedAt: new Date().toISOString(),
    basisKey: `${opts.basisKey}|obs2`,
  };
}
