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
  read: string;
  context: string;
  caution?: string;
  watch?: string;
  generatedAt: string;
  basisKey: string;
}

const tool = {
  name: "give_observation",
  description: "A full read of ONE metric in this experiment, for the hotel's team.",
  input_schema: {
    type: "object" as const,
    properties: {
      headline: { type: "string" as const, description: "<=110 chars, NO DIGITS. A claim carrying its own qualification, e.g. 'More visitors reach the booking step, but the gap is still too faint to lean on'. Never a status line." },
      read: { type: "string" as const, description: "<=900 chars, NO DIGITS. What guests did differently on this surface between the two versions, and WHY that follows from what was built. Name the surfaces and the actions in the reader's words." },
      context: { type: "string" as const, description: "<=600 chars, NO DIGITS. How this bears on what the experiment set out to prove, and on the booking path either side of it — where intent is created, where it leaks." },
      caution: { type: "string" as const, description: "<=400 chars, NO DIGITS. What would make this reading wrong: a surface only one version has, clicks moving between places rather than new demand, a metric that counts actions rather than guests, too little data. Omit if there is genuinely nothing." },
      watch: { type: "string" as const, description: "<=300 chars, NO DIGITS. The one thing to watch next on this metric." },
    },
    required: ["headline", "read", "context"],
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

Write the full observation for this ONE metric, for the hotel's team.
NO DIGITS in your words — every number is printed beside your sentences and would go stale the moment the counts move. No statistics vocabulary: no significance, no sample size, no confidence, no days remaining. Do not give a verdict on the experiment; that belongs to the decision metric and the console computes it.`,
    }],
    tools: [tool],
    tool_choice: { type: "tool", name: "give_observation" },
  });

  const tu = res.content.find((c) => c.type === "tool_use");
  if (!tu || tu.type !== "tool_use") throw new Error("The observation came back empty — try again.");
  const raw = (tu.input ?? {}) as Record<string, unknown>;

  let headline = clean(raw.headline, 110);
  let read = clean(raw.read, 900);
  let context = clean(raw.context, 600);
  let caution = clean(raw.caution, 400);
  let watch = clean(raw.watch, 300);

  // A digit or a statistics word used to fail the whole read with an error the
  // reader could do nothing about. Ask once, quoting the rule that broke.
  if (!headline || !read) {
    try {
      const fix = await client.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 1400,
        system: opts.system,
        messages: [
          { role: "user", content: "Rewrite the observation you just gave." },
          { role: "assistant", content: JSON.stringify({ headline: raw.headline, read: raw.read, context: raw.context, caution: raw.caution, watch: raw.watch }) },
          { role: "user", content: `Rejected. Every field must contain NO DIGITS AT ALL (spell nothing numerically — the console prints every number beside your words) and no statistics vocabulary (significance, sample size, confidence, p-values, days remaining). Keep the same substance and the same structure. Return only JSON: {"headline","read","context","caution","watch"}.` },
        ],
      });
      const txt = fix.content.map((c) => (c.type === "text" ? c.text : "")).join("");
      const m2 = /\{[\s\S]*\}/.exec(txt);
      if (m2) {
        const parsed = JSON.parse(m2[0]) as Record<string, unknown>;
        headline = headline || clean(parsed.headline, 110);
        read = read || clean(parsed.read, 900);
        context = context || clean(parsed.context, 600);
        caution = caution || clean(parsed.caution, 400);
        watch = watch || clean(parsed.watch, 300);
      }
    } catch { /* the computed floor below */ }
  }

  // Never a dead end: if the words still break the rules, say the true thing
  // the console already knows about this metric rather than showing an error.
  if (!headline || !read) {
    const dir = (cell(focusId)?.lift ?? 0) >= 0 ? "more" : "less";
    const settled = cell(focusId)?.liftCi && cell(focusId)!.liftCi!.lo * cell(focusId)!.liftCi!.hi > 0;
    headline = headline || (m.featureOnly
      ? `${m.label} exists only in ${armName(focusId)}, so it shows take-up rather than a gap`
      : `Guests do this ${dir} in ${armName(focusId)}${settled ? ", by more than luck explains" : ", though the gap has not settled"}`);
    read = read || `The console could not produce a written read for this metric. What it can say: ${howBuilt}. ${m.featureOnly ? `There is nothing equivalent in ${armName(baseId)}, so the number is take-up, not a comparison.` : `${armName(focusId)} and ${armName(baseId)} are being compared on the same actions.`}`;
    context = context || "Open the numbers view for the full detail on this metric.";
  }

  return {
    metricKey: opts.metricKey,
    headline, read, context,
    caution: caution || undefined,
    watch: watch || undefined,
    generatedAt: new Date().toISOString(),
    basisKey: opts.basisKey,
  };
}
