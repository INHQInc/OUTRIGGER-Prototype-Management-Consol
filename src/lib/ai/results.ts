/**
 * The results ANALYST — Claude over the live experiment numbers.
 *
 * Two jobs:
 *  - proposeMetricMap: read the brief's decision metric IN WORDS, the built
 *    code (which CTAs fire which events), and the ACTUAL metric names coming
 *    back from Optimizely, and propose the composite mapping ("total booking
 *    intent = main CTA + overlay CTA"). Event names are ENUM-constrained to
 *    what Optimizely actually reports — the model cannot invent one.
 *  - analyzeResults: answer questions / produce the honest readout, with the
 *    full context assembled server-side (brief + hypothesis + mapping + raw
 *    numbers + significance). Honesty over confidence: sample sizes and
 *    significance are first-class, cannibalization patterns called out.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { PrototypeRecord } from "../prototypes/types";
import type { ExperimentResults, MetricMap, CompositeMetric } from "../prototypes/results";
import { computeComposite, compositeMembers } from "../prototypes/results";

const requireKey = () => {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY isn't set on the server — add it in Vercel → Settings → Environment Variables.");
  }
};

const mapTool = (eventNames: string[]) => ({
  name: "propose_metric_map",
  description: "Propose composite metrics mapping the brief's decision metric (and guardrails) onto the experiment's actual events.",
  input_schema: {
    type: "object" as const,
    properties: {
      composites: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            id: { type: "string" as const, description: "kebab-case slug" },
            label: { type: "string" as const, description: "the business name, e.g. 'Total booking intent'" },
            events: { type: "array" as const, items: { type: "string" as const, enum: eventNames }, description: "the Optimizely metric names summed into this composite" },
            role: { type: "string" as const, enum: ["primary", "guardrail", "info"] },
            note: { type: "string" as const, description: "one line: why these events compose this metric" },
          },
          required: ["id", "label", "events", "role"],
        },
      },
    },
    required: ["composites"],
  },
});

function trimCode(js: string): string {
  const stripped = js.replace(/data:[a-zA-Z0-9/+;=.-]{300,}/g, "data:<inlined-asset-stripped>");
  return stripped.length > 60_000 ? `${stripped.slice(0, 60_000)}\n/* …truncated */` : stripped;
}

export async function proposeMetricMap(opts: {
  proto: PrototypeRecord;
  variationJs: string | null;
  eventNames: string[];
}): Promise<CompositeMetric[]> {
  requireKey();
  if (!opts.eventNames.length) throw new Error("No metrics reported by Optimizely yet — results need traffic first.");
  const client = new Anthropic();
  const res = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 3000,
    system: "You map an experiment's BUSINESS metrics onto its INSTRUMENTED events. The brief states the decision metric in words; Optimizely reports raw event metrics; the built code shows which UI elements fire what. Propose composites: the PRIMARY decision metric (usually a sum of related events — e.g. the same CTA reachable in two places counts once as intent), guardrails from the brief, and at most one or two informative extras. Only compose events that genuinely measure the same intent — never pad. Use ONLY the provided event names.",
    messages: [{
      role: "user",
      content: `THE BRIEF'S METRICS (in words):
Primary: ${opts.proto.metrics.primary || "(unset)"}
Guardrails: ${opts.proto.metrics.guardrails.join(" · ") || "(none)"}
Hypothesis outcome: ${opts.proto.hypothesis.outcome || "(unset)"}

OPTIMIZELY'S ACTUAL METRIC NAMES (compose from these, verbatim):
${opts.eventNames.map((n) => `- ${n}`).join("\n")}
${opts.variationJs ? `
THE BUILT CODE (evidence for which elements fire what):
"""
${trimCode(opts.variationJs)}
"""` : ""}

Propose the metric map.`,
    }],
    tools: [mapTool(opts.eventNames)],
    tool_choice: { type: "tool", name: "propose_metric_map" },
  });
  const tu = res.content.find((c) => c.type === "tool_use");
  if (!tu || tu.type !== "tool_use") throw new Error("Mapping proposal returned nothing — try again.");
  const raw = ((tu.input ?? {}) as { composites?: unknown }).composites;
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: CompositeMetric[] = [];
  for (const r of list) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    let id = String(o.id ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (!id) id = `composite-${out.length + 1}`;
    while (seen.has(id)) id = `${id}-2`;
    seen.add(id);
    const events = (Array.isArray(o.events) ? o.events : []).filter((e): e is string => typeof e === "string" && opts.eventNames.includes(e));
    if (!events.length) continue;
    out.push({
      id,
      label: String(o.label ?? id).slice(0, 120),
      events: [...new Set(events)],
      role: o.role === "guardrail" ? "guardrail" : o.role === "info" ? "info" : "primary",
      note: typeof o.note === "string" && o.note.trim() ? o.note.trim().slice(0, 300) : undefined,
    });
  }
  if (!out.length) throw new Error("The proposal composed no valid metrics — try again once results have real events.");
  return out;
}

/** Compact, model-readable rendering of the numbers (composites first). */
function renderContext(results: ExperimentResults, map: MetricMap | null): string {
  const lines: string[] = [];
  lines.push(`Visitors: ${results.variations.map((v) => `${v.name}=${v.visitors.toLocaleString()}`).join(" · ")}${results.totalVisitors ? ` (total ${results.totalVisitors.toLocaleString()})` : ""}`);
  const fmt = (r: { name: string; conversions: number; rate?: number; lift?: number; significance?: number; isBaseline?: boolean }) =>
    `${r.name}${r.isBaseline ? " (baseline)" : ""}: ${r.conversions.toLocaleString()} conv${r.rate !== undefined ? ` · rate ${(r.rate * 100).toFixed(2)}%` : ""}${r.lift !== undefined ? ` · lift ${(r.lift * 100).toFixed(1)}%` : ""}${r.significance !== undefined ? ` · significance ${(r.significance * 100).toFixed(0)}%` : ""}`;
  if (map?.composites.length) {
    const provenance = map.confirmed
      ? `CONFIRMED by ${map.confirmedBy ?? "a human"}`
      : "PROPOSED by Claude, NOT human-confirmed — treat the mapping itself as provisional";
    lines.push(`\nCOMPOSITE METRICS (${provenance}; summed ACTION totals, not unique visitors — a guest converting on two member events counts twice, so rates are actions-per-visitor and can exceed 100%; lift derived from summed conversions — member-event significance listed below):`);
    for (const c of map.composites) {
      lines.push(`[${c.role.toUpperCase()}] ${c.label} = ${c.events.join(" + ")}${c.note ? ` — ${c.note}` : ""}`);
      const { missing, excluded } = compositeMembers(c, results);
      if (missing.length) lines.push(`  ⚠ STALE: ${missing.join(", ")} not reporting from Optimizely — composite is ${computeComposite(c, results).length ? "partial" : "not computable"}`);
      if (excluded.length) lines.push(`  ⚠ excluded from sum (value-style aggregator): ${excluded.join(", ")}`);
      for (const r of computeComposite(c, results)) lines.push(`  ${fmt(r)}`);
    }
  }
  lines.push("\nRAW OPTIMIZELY METRICS:");
  for (const m of results.metrics) {
    lines.push(`• ${m.name}${m.aggregator ? ` (${m.aggregator})` : ""}`);
    for (const r of m.perVariation) lines.push(`  ${fmt(r)}`);
  }
  return lines.join("\n");
}

export async function analyzeResults(opts: {
  proto: PrototypeRecord;
  results: ExperimentResults;
  map: MetricMap | null;
  question?: string;
}): Promise<string> {
  requireKey();
  const client = new Anthropic();
  const res = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1500,
    system: "You are the experiment analyst for a hospitality A/B testing program. Answer from the numbers provided — never invent data. Be HONEST about statistical significance and sample size: below ~90% significance say 'too early to call', and never recommend shipping on noise. Watch for cannibalization (a composite flat while its member events shift — traffic moving between CTAs, not new intent). Keep answers tight: lead with the verdict, then the two or three numbers that matter, then the caveat. Plain prose, no headers.",
    messages: [{
      role: "user",
      content: `EXPERIMENT: ${opts.proto.name}
HYPOTHESIS: We believe ${opts.proto.hypothesis.change || "…"} for ${opts.proto.hypothesis.audience || "…"} will cause ${opts.proto.hypothesis.outcome || "…"}.
DECISION METRIC (brief, in words): ${opts.proto.metrics.primary || "(unset)"}
GUARDRAILS: ${opts.proto.metrics.guardrails.join(" · ") || "(none)"}

LIVE RESULTS:
${renderContext(opts.results, opts.map)}

${opts.question?.trim()
  ? `QUESTION: ${opts.question.trim().slice(0, 1000)}`
  : "Give the readout: who's leading and on which metric, is it statistically trustworthy yet, how do the guardrails look, is there any cannibalization between member events, and the honest recommendation (keep running / ship / iterate)."}`,
    }],
  });
  const text = res.content.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("\n").trim();
  if (!text) throw new Error("The analyst returned nothing — try again.");
  return text;
}
