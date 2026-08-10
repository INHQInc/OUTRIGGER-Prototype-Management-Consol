/**
 * The results ANALYST — Claude over the live experiment numbers.
 *
 * Division of labor (the enforce-LLM-behavior-in-code law):
 *  - lib/prototypes/stats.ts computes every number (CIs, p-values, SRM,
 *    power, Bayesian risk, flags) deterministically;
 *  - lib/prototypes/verdict.ts decides the verdict against the
 *    PRE-REGISTERED briefSnapshot;
 *  - THIS file only assembles the facts into a context and lets the model
 *    write language around them. The methodology/voice lives in the
 *    `opmc-experiment-analyst` skill (delivery: "console") — versioned and
 *    editable in the skill library, like opmc-brief-author — with a
 *    hardcoded fallback so a wiped library can't silence the analyst.
 *
 * proposeMetricMap: event names are ENUM-constrained to what Optimizely
 * actually reports — the model cannot invent one.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { PrototypeRecord } from "../prototypes/types";
import type { ExperimentResults, MetricMap, CompositeMetric } from "../prototypes/results";
import type { StatsReport } from "../prototypes/stats";
import type { VerdictRecord } from "../prototypes/verdict";
import type { OrgNotebook, ProtoNotebook, Reading } from "../prototypes/notebook";
import { computeComposite, compositeMembers, optiPrimaryKeyOf, supportingKeys } from "../prototypes/results";
import { STAT_NOISE, type AttentionItem } from "../prototypes/attention";
import { getSkill, parseFrontmatter } from "../skills/skills";
import { ensureSkillsSeeded } from "../skills/seed";

const requireKey = () => {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY isn't set on the server — add it in Vercel → Settings → Environment Variables.");
  }
};

const FALLBACK_SYSTEM =
  "You are the experiment analyst for a hospitality A/B testing program. Answer ONLY from the computed facts provided — never derive or adjust a number, never contradict the computed verdict or a validity flag. Notebook entries are history: never quote a number from them, only from the computed blocks. The pre-registered primary metric alone can confirm/refute the hypothesis; everything else is exploratory and must be labeled so. Below significance say 'too early to call' (running) or 'unproven, not refuted' (ended). Lead with the verdict, then the two or three numbers that matter, then flags, then the recommendation. Plain prose.";

export async function analystSkill(orgId: string): Promise<{ system: string; ref?: { id: string; updatedAt?: string } }> {
  try {
    await ensureSkillsSeeded(orgId);
    const skill = await getSkill(orgId, "opmc-experiment-analyst");
    if (skill) return { system: parseFrontmatter(skill.body).body, ref: { id: skill.id, updatedAt: skill.updatedAt } };
  } catch { /* fall through to the hardcoded analyst */ }
  return { system: FALLBACK_SYSTEM };
}

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
            direction: { type: "string" as const, enum: ["increase", "decrease"], description: "which way is GOOD for this metric (bounce/exit metrics: decrease)" },
            note: { type: "string" as const, description: "one line: why these events compose this metric" },
          },
          required: ["id", "label", "events", "role", "direction"],
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
    system: "You map an experiment's BUSINESS metrics onto its INSTRUMENTED events. The brief states the decision metric in words; Optimizely reports raw event metrics; the built code shows which UI elements fire what. Propose composites: the PRIMARY decision metric (usually a sum of related events — e.g. the same CTA reachable in two places counts once as intent), guardrails from the brief, and at most one or two informative extras. Only compose events that genuinely metric the same intent — never pad. Use ONLY the provided event names. Set direction=decrease on metrics where DOWN is good (bounce, exits, support contacts). CRITICAL: an event fired only by a variation-added element (a new CTA the control doesn't have) must NEVER stand alone as the primary — the control structurally can't convert on it. Pair it with the control's equivalent event (main CTA + new overlay CTA = total intent BOTH arms can express); standalone one-arm events are adoption metrics, not decision metrics.",
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
      direction: o.direction === "decrease" ? "decrease" : "increase",
      note: typeof o.note === "string" && o.note.trim() ? o.note.trim().slice(0, 300) : undefined,
    });
  }
  if (!out.length) throw new Error("The proposal composed no valid metrics — try again once results have real events.");
  return out;
}

const defineTool = (eventNames: string[]) => ({
  name: "define_custom_metric",
  description: "Turn the user's plain-language description into ONE console-computed compound metric over the experiment's real events.",
  input_schema: {
    type: "object" as const,
    properties: {
      id: { type: "string" as const, description: "kebab-case slug" },
      label: { type: "string" as const, description: "short business name for the metric" },
      definition: { type: "string" as const, description: "one sentence: exactly WHAT is being summed/compared" },
      meaning: { type: "string" as const, description: "one sentence: what this number TELLS you and when to care" },
      events: { type: "array" as const, items: { type: "string" as const, enum: eventNames }, description: "the events summed into it" },
      direction: { type: "string" as const, enum: ["increase", "decrease"] },
      feasible: { type: "boolean" as const, description: "false when the description needs data the events can't express (segments, revenue math, time windows)" },
      whyNot: { type: "string" as const, description: "when feasible=false: what's missing, plainly" },
    },
    required: ["id", "label", "definition", "meaning", "events", "direction", "feasible"],
  },
});

/** A user-described compound metric → a badged, console-computed composite.
 *  Honest by construction: infeasible asks come back as an explanation, and
 *  the events are enum-locked to what actually reports. */
/** Describe-it-and-I-will-pick-the-events, for the BUILDER — the proposal is
 *  reviewed and saved by a human, never written straight to the map. */
export async function defineCustomMetric(opts: {
  orgId: string;
  proto: PrototypeRecord;
  description: string;
  eventNames: string[];
}): Promise<{ composite: CompositeMetric | null; explanation: string }> {
  requireKey();
  if (!opts.eventNames.length) throw new Error("No events reporting yet — custom metrics need live results first.");
  const client = new Anthropic();
  const { system } = await analystSkill(opts.orgId);
  const res = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1500,
    system,
    messages: [{
      role: "user",
      content: `The team wants a CUSTOM console-computed metric for experiment "${opts.proto.name}".

THEIR DESCRIPTION: ${opts.description.slice(0, 600)}

AVAILABLE EVENTS (a custom metric can ONLY sum these):
${opts.eventNames.map((n) => `- ${n}`).join("\n")}

Define it via the tool. Action-total semantics (a guest firing two member events counts twice). If the description needs anything these events can't express — segments, revenue arithmetic, per-session windows — set feasible=false and say what's missing; NEVER approximate silently.`,
    }],
    tools: [defineTool(opts.eventNames)],
    tool_choice: { type: "tool", name: "define_custom_metric" },
  });
  const tu = res.content.find((c) => c.type === "tool_use");
  if (!tu || tu.type !== "tool_use") throw new Error("The definer returned nothing — try again.");
  const raw = (tu.input ?? {}) as Record<string, unknown>;
  if (raw.feasible === false) {
    return { composite: null, explanation: typeof raw.whyNot === "string" && raw.whyNot.trim() ? stripMd(raw.whyNot).slice(0, 400) : "That metric needs data the current events can't express." };
  }
  const events = (Array.isArray(raw.events) ? raw.events : []).filter((e): e is string => typeof e === "string" && opts.eventNames.includes(e));
  if (!events.length) return { composite: null, explanation: "None of the reporting events can express that metric." };
  let id = String(raw.id ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `custom-${Date.now().toString(36)}`;
  id = `custom-${id.replace(/^custom-/, "")}`;
  const definition = typeof raw.definition === "string" ? stripMd(raw.definition).slice(0, 300) : "";
  const meaning = typeof raw.meaning === "string" ? stripMd(raw.meaning).slice(0, 300) : "";
  return {
    composite: {
      id,
      label: String(raw.label ?? id).slice(0, 120),
      events: [...new Set(events)].slice(0, 10),
      role: "info",
      direction: raw.direction === "decrease" ? "decrease" : "increase",
      definition: definition || undefined,
      note: meaning || undefined,
      source: "custom",
    },
    explanation: meaning || definition,
  };
}

// ── context assembly: computed facts only ───────────────────────────────────

const fmtPct = (v: number | undefined, d = 1) => (v === undefined ? "—" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(d)}%`);

/** The UI renders plain text — markdown syntax must never leak into it. */
const stripMd = (s: string) => s.replace(/\*\*|__|^#+\s*/g, "").replace(/^\s*[-•▸*]\s*/, "").trim();

const PLAIN_VERDICT: Record<string, string> = {
  confirmed: "HYPOTHESIS CONFIRMED",
  refuted: "HYPOTHESIS DISPROVEN",
  guardrail_breach: "WON, BUT BROKE A GUARDRAIL",
  keep_running: "TOO EARLY — KEEP RUNNING",
  underpowered: "INCONCLUSIVE — NOT ENOUGH TRAFFIC",
  invalid: "DATA CAN'T BE TRUSTED",
  not_adjudicable: "NOT READY TO JUDGE YET",
};

function renderVerdict(v: VerdictRecord | null): string {
  if (!v) return "";
  const lines: string[] = [];
  lines.push(`\nCOMPUTED VERDICT (${v.state === "stamped" ? `STAMPED by ${v.stampedBy ?? "a human"} at ${v.stampedAt ?? "?"} — the official record` : "draft — re-derives while the experiment runs"}; decided by the console's code, NOT by you — narrate it, never override it. Use the plain phrase below verbatim if you name the verdict — NEVER an underscored code):`);
  lines.push(`VERDICT: ${PLAIN_VERDICT[v.verdict] ?? v.verdict} — ${v.headline}`);
  if (v.preRegistration) {
    const pr = v.preRegistration;
    lines.push(`PRE-REGISTERED ${pr.anchor === "cut" ? `at v${pr.version} cut ${pr.cutAt?.slice(0, 10) ?? "?"}` : `with the measurement plan's confirmation ${pr.cutAt?.slice(0, 10) ?? "?"}`}: ${pr.hypothesis} Primary metric (in words): ${pr.primaryMetric}. Guardrails: ${pr.guardrails.join(" · ") || "(none)"}.`);
    if (pr.mapConfirmedAfterObservation) lines.push(`DISCLOSURE: the metric mapping was confirmed AFTER results observation began — the metric WORDS are pre-registered; their operationalization is not.`);
    if (pr.primaryChangedAfterObservation) lines.push(`DISCLOSURE: the decision metric was CHANGED after traffic began (was "${pr.primaryChangedAfterObservation.was}", ${pr.primaryChangedAfterObservation.at.slice(0, 10)}) — say so whenever you name the primary.`);
  }
  lines.push(`Gate trace: ${v.gates.map((g) => `${g.title}=${g.pass === null ? "n/a" : g.pass ? "PASS" : "FAIL"}`).join(" · ")}`);
  for (const g of v.guardrails) lines.push(`Guardrail “${g.label}”: ${g.state.toUpperCase()} — ${g.detail}`);
  for (const d of v.discoveries) lines.push(`DISCOVERY (exploratory, FDR q=${(d.q * 100).toFixed(0)}%): ${d.label} ${fmtPct(d.lift)} on ${d.variationName} — a candidate for the NEXT pre-registered experiment, never confirmation here.`);
  return lines.join("\n");
}

function renderStats(s: StatsReport | null): string {
  if (!s) return "";
  const lines: string[] = [];
  lines.push(`\nCOMPUTED STATISTICS (deterministic; quote, never derive):`);
  lines.push(`Validity: ${s.validity.status.toUpperCase()} — ${s.validity.detail}`);
  for (const m of s.metrics) {
    const roleTag = m.role ? ` [${m.role.toUpperCase()}]` : "";
    const primaryTag = s.primaryKey === m.key ? " [PRE-REGISTERED PRIMARY — full alpha]" : m.kind === "composite" ? " [exploratory]" : "";
    const oneArmTag = m.featureOnly ? ` [${m.featureOnly.toUpperCase()}-ONLY — the other arm structurally cannot fire this event; ADOPTION view, no lift/significance, never a discovery. Its comparative impact lives in the composite pairing it with the other arm's equivalent action.]` : "";
    lines.push(`${m.kind === "composite" ? "◆" : "•"} ${m.label}${roleTag}${primaryTag}${oneArmTag}${m.test === "none" ? " (value metric — no inference possible from aggregates)" : ""}`);
    for (const c of m.cells) {
      if (c.isBaseline) {
        lines.push(`   ${c.name} (baseline): ${c.count.toLocaleString()}/${c.n.toLocaleString()}${c.rate !== undefined ? ` · rate ${(c.rate * 100).toFixed(2)}%` : ""}`);
      } else {
        lines.push(
          `   ${c.name}: ${c.count.toLocaleString()}/${c.n.toLocaleString()}${c.rate !== undefined ? ` · rate ${(c.rate * 100).toFixed(2)}%` : ""}${c.lift !== undefined ? ` · lift ${fmtPct(c.lift)}` : ""}${c.liftCi ? ` · 95% CI ${fmtPct(c.liftCi.lo)}…${fmtPct(c.liftCi.hi)}` : ""}${c.p !== undefined ? ` · p=${c.p < 0.0001 ? "<0.0001" : c.p.toFixed(4)}` : ""}${c.pBeat !== undefined ? ` · P(beat)=${(c.pBeat * 100).toFixed(0)}%` : ""}${c.expectedLossRel !== undefined ? ` · exp. loss if shipped wrongly ${(c.expectedLossRel * 100).toFixed(2)}% of baseline` : ""}`,
        );
      }
    }
  }
  if (s.exploratory.length) {
    lines.push(`Exploratory sweep (Benjamini-Hochberg corrected; expect ~${s.expectedFalsePositives} false movers among ${s.exploratory.length} at raw α=.05): ${s.exploratory.slice(0, 6).map((r) => `${r.label}/${r.variationName} q=${(r.q * 100).toFixed(0)}%${r.discovery ? " DISCOVERY" : ""}`).join(" · ")}`);
  }
  if (s.power) {
    const p = s.power;
    lines.push(`Power: baseline ${(p.baselineRate * 100).toFixed(2)}%, ${p.perArmN.toLocaleString()}/arm${p.mdeNow !== undefined ? ` · detectable lift now (80% power): ±${(p.mdeNow * 100).toFixed(1)}%` : ""}${p.observedLift !== undefined ? ` · observed ${fmtPct(p.observedLift)}` : ""}${p.daysToObserved !== undefined ? ` · ~${p.daysToObserved} more day(s) to confirm the observed effect` : ""}${p.targetLift !== undefined ? ` · PRE-REGISTERED ship-worthy lift ${fmtPct(p.targetLift)}${p.daysToTarget !== undefined ? ` (~${p.daysToTarget} more day(s) until detectable)` : ""}` : ""}${p.observationDays !== undefined ? ` · observed ${p.observationDays} day(s)` : ""}.`);
  }
  if (s.novelty) {
    lines.push(`Trend: early-window lift ${fmtPct(s.novelty.earlyLift)} (${s.novelty.earlyDays}) vs late ${fmtPct(s.novelty.lateLift)} (${s.novelty.lateDays}), difference p=${s.novelty.p.toFixed(3)}${s.novelty.decayed ? " — DECAYING (novelty)" : ""}.`);
  }
  for (const f of s.flags) lines.push(`FLAG ${f.code}: ${f.text}`);
  return lines.join("\n");
}

/** Compact, model-readable rendering of the raw numbers (composites first). */
function renderContext(results: ExperimentResults, map: MetricMap | null): string {
  const lines: string[] = [];
  lines.push(`Visitors: ${results.variations.map((v) => `${v.name}=${v.visitors.toLocaleString()}`).join(" · ")}${results.totalVisitors ? ` (total ${results.totalVisitors.toLocaleString()})` : ""}`);
  const fmt = (r: { name: string; conversions: number; rate?: number; lift?: number; significance?: number; isBaseline?: boolean }) =>
    `${r.name}${r.isBaseline ? " (baseline)" : ""}: ${r.conversions.toLocaleString()} conv${r.rate !== undefined ? ` · rate ${(r.rate * 100).toFixed(2)}%` : ""}${r.lift !== undefined ? ` · lift ${(r.lift * 100).toFixed(1)}%` : ""}${r.significance !== undefined ? ` · Optimizely significance ${(r.significance * 100).toFixed(0)}%` : ""}`;
  if (map?.composites.length) {
    const authored = map.composites.filter((c) => c.source !== "optimizely").length;
    const provenance = !authored
      ? "no console mapping exists — the decision metric below is Optimizely's own"
      : map.confirmed
        ? `CONFIRMED by ${map.confirmedBy ?? "a human"}`
        : "PROPOSED by Claude, NOT human-confirmed — treat the mapping itself as provisional";
    lines.push(`\nCOMPOSITE METRICS (${provenance}; summed ACTION totals, not unique visitors — a guest converting on two member events counts twice, so rates are actions-per-visitor and can exceed 100%):`);
    for (const c of map.composites) {
      // PER-COMPOSITE provenance. One sentence for the whole block described
      // Optimizely's own declared primary as "proposed by Claude", which is
      // both false and the opposite of reassuring.
      const from = c.source === "optimizely"
        ? " · DECLARED IN OPTIMIZELY as this experiment's primary metric — not authored here"
        : c.source === "custom" ? " · built in the console by the team" : "";
      lines.push(`[${c.role.toUpperCase()}${c.direction === "decrease" ? " · decrease-is-good" : c.source === "optimizely" ? " · direction of good not declared, UP assumed" : ""}${from}] ${c.label} = ${c.events.join(" + ")}${c.note ? ` — ${c.note}` : ""}`);
      const { missing, excluded } = compositeMembers(c, results);
      if (missing.length) lines.push(`  ⚠ STALE: ${missing.join(", ")} not reporting from Optimizely — composite is ${computeComposite(c, results).length ? "partial" : "not computable"}`);
      if (excluded.length) lines.push(`  ⚠ excluded from sum (value-style aggregator): ${excluded.join(", ")}`);
      for (const r of computeComposite(c, results)) lines.push(`  ${fmt(r)}`);
    }
  }
  lines.push("\nRAW OPTIMIZELY METRICS (Optimizely's own sequential significance — peek-safe; the console's p-values above are fixed-horizon):");
  for (const m of results.metrics) {
    lines.push(`• ${m.name}${m.aggregator ? ` (${m.aggregator})` : ""}`);
    for (const r of m.perVariation) lines.push(`  ${fmt(r)}`);
  }
  return lines.join("\n");
}

function renderNotebook(org: OrgNotebook | null, proto: ProtoNotebook | null): string {
  if (!org && !proto) return "";
  const lines: string[] = [];
  lines.push(`\nANALYST NOTEBOOK (tunes EMPHASIS and VOICE only — never the verdict, never thresholds. Entries are HISTORY: any NUMBER inside them was computed earlier and may be stale — never quote a figure from the notebook, only from the COMPUTED blocks):`);
  lines.push(`Audience: ${org?.audience || "leadership"}`);
  for (const p of org?.preferences ?? []) lines.push(`Preference: ${p}`);
  for (const e of (proto?.entries ?? []).slice(-14)) {
    const who =
      e.kind === "user-question" ? "They asked" :
      e.kind === "ai-question" ? "You asked" :
      e.kind === "answer" ? "They answered" :
      e.kind === "analyst-answer" ? "You previously answered (YOUR words, not theirs; numbers may be stale)" : "Note";
    lines.push(`${who}: ${e.text}`);
  }
  for (const w of proto?.dataWishes ?? []) lines.push(`Data wish (NOT measurable today — acknowledge, never improvise): ${w}`);
  return lines.join("\n");
}

/** The ordinal day the UI shows. observationDays is ELAPSED (0 on day one)
 *  and every surface renders it +1 — Timeline tile, action chip, findings.
 *  One derivation, or the page prints two different day numbers. */
export function dayNumber(stats: StatsReport | null): number | undefined {
  const d = stats?.power?.observationDays;
  return d === undefined ? undefined : d + 1;
}

/** The figures a finding may cite, BY NAME. The analyst names which number
 *  it means; the page renders the live value at render time. A copied number
 *  is stale the moment the counts move — which is exactly what put "+91.8%"
 *  in FINDINGS beside a live lift of +90.8%.
 *
 *  Slot-scoped on purpose: the certainty row cannot cite a visitor count, and
 *  no row can cite another metric's number. */
export const FIGURE_SLOTS: readonly (readonly string[])[] = [
  ["primary_lift", "primary_rate_variant", "primary_rate_control", "conversions_variant", "none"],
  ["primary_ci_low", "primary_ci_high", "none"],
  ["day", "visitors_total", "conversions_variant", "none"],
] as const;

/** Live value for a cited key — the ONE renderer, shared by the prompt (so
 *  the analyst sees what it is choosing between) and the readout. */
export function figureValue(key: string | undefined, opts: { results: ExperimentResults; stats: StatsReport | null }): string | undefined {
  const { results, stats } = opts;
  const primary = stats?.metrics.find((m) => m.key === stats.primaryKey);
  const focus = primary?.cells.find((c) => c.variationId === stats?.focusVariationId);
  const base = primary?.cells.find((c) => c.variationId === stats?.baselineVariationId);
  const pct = (v?: number) => (v === undefined ? undefined : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`);
  const rate = (v?: number) => (v === undefined ? undefined : `${(v * 100).toFixed(1)}%`);
  switch (key) {
    case "primary_lift": return pct(focus?.lift);
    case "primary_ci_low": return pct(focus?.liftCi?.lo);
    case "primary_ci_high": return pct(focus?.liftCi?.hi);
    case "primary_rate_variant": return rate(focus?.rate);
    case "primary_rate_control": return rate(base?.rate);
    case "conversions_variant": return focus?.count?.toLocaleString();
    case "conversions_control": return base?.count?.toLocaleString();
    case "visitors_total": {
      const f = results.variations.find((v) => v.variationId === stats?.focusVariationId)?.visitors ?? 0;
      const b = results.variations.find((v) => v.variationId === stats?.baselineVariationId)?.visitors ?? 0;
      return f + b > 0 ? (f + b).toLocaleString() : undefined;
    }
    case "day": {
      const d = dayNumber(stats);
      return d === undefined ? undefined : `Day ${d}`;
    }
    default: return undefined;
  }
}

/** Sign-preserving, glyph-insensitive comparison of a cited figure. */
function normFigure(s: string): string {
  return s.normalize("NFKC").replace(/[▲▼]/g, "").replace(/[\u2212\u2013\u2014]/g, "-").replace(/\s+/g, "").toLowerCase();
}

/** Statistician notation an executive doesn't read. The console says
 *  "beyond what luck explains"; q-values live in The numbers. */
const STAT_NOTATION = /\bq\s*[=<>]|\bp\s*[=<>]\s*0?\.|χ²|\bSRM\b|\balpha\b|\bFDR\b|\bconfidence interval\b|\bstatistically significant\b/i;

const readingTool = {
  name: "give_reading",
  description: "The story a leader reads: an executive summary, one headline, one short paragraph, then the numbers as beats. The words carry no numbers; a beat names the metric it is about.",
  input_schema: {
    type: "object" as const,
    properties: {
      headline: { type: "string" as const, description: "<=80 chars, NO DIGITS. The story in one line, e.g. 'Guests engage far more - but the booking path moved'. Not the verdict (the console already prints that) - what actually happened." },
      executive: { type: "string" as const, description: "<=420 chars, TWO OR THREE SENTENCES, NO DIGITS. THE EXECUTIVE SUMMARY, for a senior leader who will read this and nothing else on the page. Say (1) what the change actually did to guest behaviour in plain business language, (2) whether that reached the outcome the business cares about, and (3) what decision is now in front of them - ship, keep running, stop, or fix something. No statistics vocabulary: never 'significant', 'confidence', 'p-value', 'power', 'underpowered'. Write as if briefing a CEO in a lift: concrete, unhedged about what is known, honest about what is not." },
      effect: { type: "object" as const, properties: {
        text: { type: "string" as const, description: "<=420 chars, NO DIGITS. WHAT THE CHANGE DID to the thing it was aimed at — the surface you altered and how guests responded to it." },
        measure: { type: "string" as const, description: "REQUIRED. The ONE metric that evidences this movement — the page prints its live value beside these words, and a movement with no metric renders as words with no number." },
      }, required: ["text", "measure"] },
      shift: { type: "object" as const, properties: {
        text: { type: "string" as const, description: "<=420 chars, NO DIGITS. WHERE THE BEHAVIOUR WENT — if that intent moved, name the surfaces it moved TO and how far along the path it got. If it simply didn't move, say that plainly." },
        measure: { type: "string" as const, description: "REQUIRED. The ONE metric that evidences this movement — the page prints its live value beside these words, and a movement with no metric renders as words with no number." },
      }, required: ["text", "measure"] },
      cost: { type: "object" as const, properties: {
        text: { type: "string" as const, description: "<=420 chars, NO DIGITS. WHAT IT COST — the step that softened, the trade being made, or the leak between intent and outcome. If nothing measurably gave way, say so rather than inventing a cost." },
        measure: { type: "string" as const, description: "REQUIRED. The ONE metric that evidences this movement — the page prints its live value beside these words, and a movement with no metric renders as words with no number." },
      }, required: ["text", "measure"] },
      prediction: { type: "object" as const, properties: {
        text: { type: "string" as const, description: "<=420 chars, NO DIGITS. AGAINST THE PREDICTION — what the brief claimed, which half is settled, and which half is not." },
        measure: { type: "string" as const, description: "REQUIRED. The ONE metric that evidences this movement — the page prints its live value beside these words, and a movement with no metric renders as words with no number." },
      }, required: ["text", "measure"] },
      lede: { type: "string" as const, description: "<=900 chars, three to five sentences, NO DIGITS. THE OBSERVATION: what guests are doing differently (named by surface), where that behaviour arrives or stops along the chain to the decision metric, and what that implies about the mechanism. Not a status report — a sentence that would be true of any experiment is a failed lede. No statistics vocabulary." },
      beats: {
        // Bounds are set at call time from the team's supporting set — this
        // pair is only the shape for a run with nothing marked.
        type: "array" as const, minItems: 1, maxItems: 8,
        items: {
          type: "object" as const,
          properties: {
            measure: { type: "string" as const, description: "the NAME of a metric from the list given - never type a number, the page prints the live value" },
            label: { type: "string" as const, description: "<=34 chars, NO DIGITS - what that metric is, in plain words, e.g. 'room-detail engagement'" },
          },
          // `measure`, not `metric` — requiring an absent property taught the
          // model to emit a field the validator then failed to find.
          required: ["measure", "label"],
        },
        description: "ONE per metric in the beat list, in that order. Lead with the decision metric.",
      },
      riskNotes: {
        type: "array" as const, maxItems: 3,
        items: {
          type: "object" as const,
          properties: {
            code: { type: "string" as const, description: "an id from the RISKS ALREADY FOUND list" },
            note: { type: "string" as const, description: "<=70 chars, plain words, no bare statistics" },
          },
          required: ["code", "note"],
        },
      },
      observations: {
        type: "array" as const, maxItems: 8,
        items: {
          type: "object" as const,
          properties: {
            measure: { type: "string" as const, description: "a metric from the SUPPORTING list — you may not observe anything else" },
            note: { type: "string" as const, description: "<=180 chars, NO DIGITS. A CLAIM WITH ITS TENSION, in the shape 'More visitors reach the booking step, but the gap is still too faint to lean on' — say what happened AND what qualifies it, in one sentence. Never a status line like 'guests behave about the same'. Answer the only question the business is asking: WHAT DOES THIS TELL US? What guests are doing differently on this surface, and what it means for the booking path — where intent is being created, where it is leaking, what it implies about the next move. Name the surface in the reader's words. e.g. 'Guests reach for availability far more often once the overlay puts it in front of them — the intent was there, the old layout was burying it.' NEVER write about significance, sample size, confidence, or how long the test needs." },
          },
          // The property is `measure` — requiring a `metric` that does not
          // exist in the schema invited the model to emit the wrong field
          // name, and every observation carrying it was silently dropped.
          required: ["measure", "note"],
        },
        description: "ONE LINE FOR EVERY supporting metric listed — do not skip any. Each says WHAT THAT METRIC CAPTURES in guest behaviour, as a definition. What HAPPENED to it is written elsewhere. The console prints the numbers, the direction and the certainty itself; your job is what the business should take from it.",
      },
      trend: { type: "string" as const, description: "<=64 chars, a caption for the day-by-day picture" },
      question: { type: "string" as const, description: "<=80 chars, at most one PREFERENCE question for the team" },
      dataWishes: { type: "array" as const, items: { type: "string" as const }, description: "wanted-but-unmeasurable data, recorded honestly" },
    },
    required: ["headline", "executive", "effect", "shift", "cost", "prediction", "beats"],
  },
};

/** The deterministic story — day one, a failed call, or a model that broke
 *  the format all land here. The zone is never empty and never a spinner. */
/** Trim at a word boundary — "Room-detail engagement (overlay op" reads as a
 *  rendering bug, not as a label. Exported because the PAGE builds the same
 *  row from the same set and must label a metric the cached reading skipped
 *  exactly as the generator would. */
export function shortLabel(t: string): string {
  const bare = t.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (bare.length <= 34) return bare;
  const cut = bare.slice(0, 34);
  return cut.slice(0, cut.lastIndexOf(" ") > 12 ? cut.lastIndexOf(" ") : 34).trim();
}

export function templateStory(opts: {
  results: ExperimentResults; stats: StatsReport | null; verdict: VerdictRecord | null;
  /** The team's supporting set. When present it IS the beats row — the
   *  computed floor obeys the same contract the analyst does. */
  supporting?: string[];
}): { headline: string; lede: string; beats: { measureKey: string; label: string }[] } {
  const { stats, verdict } = opts;
  const headlineKey = stats?.primaryKey ?? (optiPrimaryKeyOf(opts.results) || undefined);
  const primary = stats?.metrics.find((m) => m.key === headlineKey);
  const focus = primary?.cells.find((c) => c.variationId === stats?.focusVariationId);
  const sig = Boolean(focus?.liftCi && focus.liftCi.lo * focus.liftCi.hi > 0);
  const lift = focus?.lift;
  // Even the computed floor names real metrics — a template that says
  // "the decision metric" tells the reader nothing they didn't know.
  const others2 = (stats?.metrics ?? []).filter((m) => m.key !== headlineKey);
  const cellOf = (m: (typeof others2)[number]) => m.cells.find((c) => c.variationId === stats?.focusVariationId);
  const sigOf2 = (m: (typeof others2)[number]) => {
    const c = cellOf(m);
    return Boolean(c?.liftCi && c.liftCi.lo * c.liftCi.hi > 0);
  };
  const moved = {
    up: others2.filter((m) => !m.featureOnly && sigOf2(m) && (cellOf(m)?.lift ?? 0) > 0).map((m) => m.label),
    down: others2.filter((m) => !m.featureOnly && sigOf2(m) && (cellOf(m)?.lift ?? 0) < 0).map((m) => m.label),
    flat: others2.filter((m) => !m.featureOnly && !sigOf2(m)).map((m) => m.label),
  };

  const headline =
    verdict?.verdict === "not_adjudicable" ? "The traffic is real; the definition is not settled"
    : lift === undefined ? "Nothing comparable has come through yet"
    : !sig ? "Nothing separates the two versions yet"
    : lift > 0 ? "The variant is ahead on the metric this test was written to prove"
    : "The variant is behind on the metric this test was written to prove";

  const lede =
    verdict?.verdict === "not_adjudicable"
      // The gate details are written for the METHOD FOLD — they name internal
      // machinery ("pre-registration anchor", "cut/push"). An executive
      // readout gets the same fact in the reader's own words, one line per
      // cause, and never the raw gate text.
      ? `${(() => {
          const f = verdict.gates.find((g) => g.pass === false);
          switch (f?.id) {
            case "mapping": return "Neither Optimizely nor this console has a primary metric for this experiment, so there is nothing to judge the run against";
            case "focus": return "The version this prototype is bound to isn't in the results, so the console won't read a result off a different one";
            case "prereg": return "The brief doesn't say what this experiment was meant to change, so there is no claim to test";
            case "significance": return "The decision metric isn't producing a number both versions can be compared on";
            default: return "The console can't read a result from this run yet";
          }
        })()} — the numbers below are real and everything already collected still counts.`
      : lift === undefined
        ? "The decision metric has not produced a comparable number yet, so there is nothing to read into. The run needs either more traffic or a mapping that both versions can convert on."
        : !sig
          ? (moved.up.length
            ? `${moved.up[0]} is clearly ahead in the new version, but ${primary?.label ?? "the decision metric"} has not followed it yet — the interest is being created and is not yet arriving at the outcome.${moved.down.length ? ` ${moved.down[0]} is going the other way, which is worth watching: some of this may be behaviour moving between surfaces rather than new demand.` : ""}`
            : moved.down.length
              ? `${moved.down[0]} is down in the new version while ${primary?.label ?? "the decision metric"} has not moved — the change is costing something without yet returning anything.`
              : `Nothing has separated the two versions yet, on ${primary?.label ?? "the decision metric"} or on the steps that lead to it.`)
          : lift > 0
            ? `${primary?.label ?? "The decision metric"} is ahead by more than luck explains${moved.down.length ? `, while ${moved.down[0]} moved the other way — part of the gain may be behaviour shifting between surfaces rather than new demand` : ""}. ${moved.flat.length ? `${moved.flat[0]} has not answered yet.` : "The downstream metrics have not answered yet."}`
            : `${primary?.label ?? "The decision metric"} is behind by more than luck explains${moved.up.length ? `, even though ${moved.up[0]} is up` : ""}. The idea as built is costing something rather than adding it.`;

  // Beats: the decision metric first, then the biggest movers that have
  // actually earned their number, then anything else reporting.
  const others = (stats?.metrics ?? []).filter((m) => m.key !== headlineKey);
  const scored = others.map((m) => {
    const c = m.cells.find((x) => x.variationId === stats?.focusVariationId);
    const s2 = Boolean(c?.liftCi && c.liftCi.lo * c.liftCi.hi > 0);
    return { m, mag: Math.abs(c?.lift ?? 0), sig: s2 };
  }).sort((a, b) => Number(b.sig) - Number(a.sig) || b.mag - a.mag);

  const beats: { measureKey: string; label: string }[] = [];
  if (opts.supporting?.length) {
    // The team said what belongs in the top line. The floor does not get to
    // pick something else because it moved more.
    const byKey = new Map((stats?.metrics ?? []).map((m) => [m.key, m] as const));
    for (const k of opts.supporting) {
      const m = byKey.get(k);
      if (m) beats.push({ measureKey: k, label: shortLabel(m.label) });
    }
    // THE HEADLINE METRIC READS FIRST. The supporting set is ordered with
    // Optimizely's primary at the front (it is the number the client sees in
    // their own tool), but the ROW is about whatever the verdict adjudicates
    // — the same promotion generateReading and the page both apply.
    const h = headlineKey ? beats.findIndex((b) => b.measureKey === headlineKey) : -1;
    if (h > 0) beats.unshift(...beats.splice(h, 1));
    return { headline, lede, beats };
  }
  if (primary) beats.push({ measureKey: primary.key, label: shortLabel(primary.label) });
  for (const s3 of scored) {
    if (beats.length >= 4) break;
    beats.push({ measureKey: s3.m.key, label: shortLabel(s3.m.label) });
  }
  return { headline, lede, beats };
}


/**
 * THE READOUT'S STRUCTURE, derived once — what the team said this experiment
 * is ABOUT, and the arithmetic between those metrics.
 *
 * ONE DERIVATION: the standing reading and the analyst's answers must reason
 * over the SAME decision metric, the SAME supporting set and the SAME chain.
 * They used to differ — the reading knew the team's structure and the ask box
 * was handed an undifferentiated pile of numbers, so asking a question got a
 * worse answer than not asking one.
 */
export function readoutStructure(opts: {
  results: ExperimentResults;
  map: MetricMap | null;
  stats: StatsReport | null;
}): { supporting: string[]; decisionLabel: string; supportingBlock: string; chain: string } {
  const allKeys = (opts.stats?.metrics ?? []).map((m) => m.key);
  const supporting = supportingKeys({
    map: opts.map,
    optiPrimaryKey: optiPrimaryKeyOf(opts.results),
    decisionKey: opts.stats?.primaryKey,
    available: allKeys,
    optiRowIsDecision: opts.map?.composites.some((c) => c.role === "primary" && c.source === "optimizely"),
  });
  const focusId = opts.stats?.focusVariationId;
  const rowOf = (k: string) => {
    const m = opts.stats?.metrics.find((x) => x.key === k);
    const c = m?.cells.find((x) => x.variationId === focusId);
    return m && c?.lift !== undefined
      ? { key: k, label: m.label, lift: c.lift, sig: Boolean(c.liftCi && c.liftCi.lo * c.liftCi.hi > 0), oneArm: Boolean(m.featureOnly) }
      : null;
  };
  const headKey = opts.stats?.primaryKey ?? optiPrimaryKeyOf(opts.results);
  const decisionLabel = opts.stats?.metrics.find((m) => m.key === headKey)?.label ?? "(none)";
  const rows = supporting.map(rowOf).filter((r): r is NonNullable<typeof r> => Boolean(r) && !r!.oneArm);
  const decisionRow = rows.find((r) => r.key === headKey);
  const upstream = rows.filter((r) => r.key !== headKey);
  const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

  const supportingBlock = supporting.length
    ? `WHAT THIS EXPERIMENT IS ABOUT — the team's own structure. Answer in terms of THESE; a metric that is not here is background and may only be raised as a caution.\nDECISION METRIC: ${decisionLabel}\nSUPPORTING: ${supporting.filter((k) => k !== headKey).map((k) => opts.stats?.metrics.find((m) => m.key === k)?.label ?? k).join(" · ") || "(none declared)"}`
    : "";

  const lines: string[] = [];
  if (decisionRow && upstream.length) {
    for (const u of upstream) {
      const gap = u.lift - decisionRow.lift;
      const read =
        u.lift > 0 && decisionRow.lift <= 0
          ? "guests take this step MORE and the outcome is still flat or down — intent is being created and then lost before it arrives"
          : u.lift > 0 && gap > 0.1
            ? `this step runs FAR ahead of the outcome (a gap of ${pct(gap)}) — the interest is real but most of it is not arriving`
            : u.lift > 0 && gap > 0
              ? "this step is a little ahead of the outcome — some of the gain carries through, not all of it"
              : u.lift < 0 && decisionRow.lift > 0
                ? "this step is DOWN while the outcome is up — behaviour looks like it MOVED here from somewhere else rather than being new"
                : "this step moves with the outcome";
      lines.push(`- ${u.label} ${pct(u.lift)}${u.sig ? "" : " (not settled)"} → ${decisionRow.label} ${pct(decisionRow.lift)}${decisionRow.sig ? "" : " (not settled)"}: ${read}`);
    }
  }
  const chain = lines.length
    ? `THE CHAIN — what each supporting step is doing TO the decision metric. These comparisons are computed; build the answer out of them and do not restate them as a list:\n${lines.join("\n")}`
    : "";
  return { supporting, decisionLabel, supportingBlock, chain };
}

/** The standing narrative — exec voice, three cited rows, cache-friendly. */
export async function generateReading(opts: {
  orgId: string;
  proto: PrototypeRecord;
  results: ExperimentResults;
  map: MetricMap | null;
  stats: StatsReport | null;
  verdict: VerdictRecord | null;
  orgNotebook: OrgNotebook | null;
  protoNotebook: ProtoNotebook | null;
  basisKey: string;
  /** The risks the CODE found — the only ones the analyst may gloss. */
  attention: AttentionItem[];
}): Promise<{ reading: Reading; dataWishes: string[] }> {
  requireKey();
  const client = new Anthropic();
  const { system } = await analystSkill(opts.orgId);
  // The metrics a beat may name, with what each reads right now. Shown so
  // the analyst picks the right one — never copied into the words.
  // THE SUPPORTING SET — the team's own answer to "what is this readout
  // about". It bounds what a beat may name, so the analyst's job is to
  // EXPLAIN the metrics they chose rather than to choose metrics.
  const allKeys = (opts.stats?.metrics ?? []).map((m) => m.key);
  const supporting = supportingKeys({
    map: opts.map,
    optiPrimaryKey: optiPrimaryKeyOf(opts.results),
    decisionKey: opts.stats?.primaryKey,
    available: allKeys,
  });
  const supportingSet = new Set(supporting);
  // A HIDDEN row is not part of the story: out of THE PATH, out of WHAT MOVED,
  // out of the beat menu. It stays in RAW NUMBERS, which is the numeric table
  // of record, and its risks still reach the analyst through the computed
  // attention list — hiding a guardrail must not hide a guardrail BREACH.
  // The two primaries can't hide.
  const hidden = new Set(opts.map?.hiddenMeasures ?? []);
  const narratable = (opts.stats?.metrics ?? []).filter((m) => !hidden.has(m.key) || supportingSet.has(m.key));
  const measureKeys = narratable.map((m) => m.key);
  // WHAT MOVED — the raw material for a mechanism sentence. Without this the
  // analyst can only write "the decision metric is ahead", which is a
  // restatement of the verdict rather than an observation of the experiment.
  // TIERED: the supporting metrics are what the story is made of; everything
  // else is context the analyst may CONTRADICT the story with but may never
  // promote. Marking controls what gets promoted, never what gets suppressed.
  const focusName = opts.results.variations.find((v) => v.variationId === opts.stats?.focusVariationId)?.name ?? "the variant";
  const movers = narratable.map((m) => {
    const c = m.cells.find((x) => x.variationId === opts.stats?.focusVariationId);
    const sig = Boolean(c?.liftCi && c.liftCi.lo * c.liftCi.hi > 0);
    return { label: m.label, lift: c?.lift, sig, oneArm: Boolean(m.featureOnly), role: m.role, key: m.key };
  });
  const movedBlock = (rows: typeof movers) => [
    rows.filter((m) => m.sig && (m.lift ?? 0) > 0).length ? `UP beyond luck: ${rows.filter((m) => m.sig && (m.lift ?? 0) > 0).map((m) => m.label).join(", ")}` : "",
    rows.filter((m) => m.sig && (m.lift ?? 0) < 0).length ? `DOWN beyond luck: ${rows.filter((m) => m.sig && (m.lift ?? 0) < 0).map((m) => m.label).join(", ")}` : "",
    rows.filter((m) => m.oneArm).length ? `ONLY EXISTS IN ${focusName.toUpperCase()}: ${rows.filter((m) => m.oneArm).map((m) => m.label).join(", ")}` : "",
    rows.filter((m) => !m.sig && !m.oneArm).length ? `NOT SETTLED EITHER WAY: ${rows.filter((m) => !m.sig && !m.oneArm).map((m) => m.label).join(", ")}` : "",
  ].filter(Boolean).join("\n");
  const supMovers = movers.filter((m) => supportingSet.has(m.key));
  const ctxMovers = movers.filter((m) => !supportingSet.has(m.key));
  const anyUp = movers.some((m) => m.sig && (m.lift ?? 0) > 0);
  const anyDown = movers.some((m) => m.sig && (m.lift ?? 0) < 0);
  const whatMoved = [
    supMovers.length ? `THE METRICS THIS READOUT IS ABOUT (the team marked these as supporting the hypothesis — the story is made of THESE):\n${movedBlock(supMovers)}` : "",
    ctxMovers.length ? `CONTEXT ONLY (running underneath; you may raise one as a CAUTION if it contradicts the story, but it may NEVER be a beat and may never lead):\n${movedBlock(ctxMovers)}` : "",
    anyUp && anyDown ? `TENSION: things moved BOTH ways — say whether the gain looks like new behaviour or behaviour that moved from one surface to another.` : "",
  ].filter(Boolean).join("\n\n");

  // THE PATH. The team's own row order (dragged in All metrics) is the funnel
  // as they understand it, so the story can trace steps instead of listing
  // movers. Plan definitions ride along — they say what each step IS.
  const orderRank = new Map((opts.map?.measureOrder ?? []).map((k, i) => [k, i] as const));
  const pathLines = [...narratable]
    .sort((a, b) => (orderRank.get(a.key) ?? 999) - (orderRank.get(b.key) ?? 999))
    .map((m) => {
      const c = m.cells.find((x) => x.variationId === opts.stats?.focusVariationId);
      const comp = opts.map?.composites.find((x) => `composite:${x.id}` === m.key);
      const state = m.missingEvents?.length
        ? `MISNAMED — this metric's definition names ${m.missingEvents.map((e) => `"${e}"`).join(", ")}, which Optimizely is not reporting under that name, so it computes as nothing`
        : m.featureOnly ? "one version only"
        : c?.lift === undefined ? "not reporting"
        : `${c.lift >= 0 ? "+" : ""}${(c.lift * 100).toFixed(1)}%${c.liftCi && c.liftCi.lo * c.liftCi.hi > 0 ? ", beyond luck" : ", not settled"}`;
      return `- ${m.label} (${state})${comp?.definition ? ` — ${comp.definition}` : ""}${comp?.role === "guardrail" ? " [GUARDRAIL: must not drop]" : ""}`;
    }).join("\n");

  // The beat menu is the SUPPORTING SET ONLY — showing the analyst metrics it
  // is not allowed to name would be an invitation to argue with the enum.
  const { chain } = readoutStructure({ results: opts.results, map: opts.map, stats: opts.stats ?? null });

  const measureMenu = supporting.map((k) => {
    const m = narratable.find((x) => x.key === k);
    if (!m) return "";
    const c = m.cells.find((x) => x.variationId === opts.stats?.focusVariationId);
    const delta = m.featureOnly ? "variation-only" : c?.lift === undefined ? "not computing" : `${c.lift >= 0 ? "+" : ""}${(c.lift * 100).toFixed(1)}%`;
    return `${m.key} — ${m.label} (${delta})`;
  }).filter(Boolean).join("\n") || "(no metrics reporting)";
  // "all-clear" is not a risk — leaving it in the enum lets the analyst write
  // its own sentence under "Nothing needs attention".
  const codes = opts.attention.filter((a) => a.severity !== "good").map((a) => a.id);

  // CALL-TIME ENUMS: an unknown risk id or metric key is unemittable.
  const tool = JSON.parse(JSON.stringify(readingTool)) as typeof readingTool & { input_schema: { properties: Record<string, unknown> } };
  if (codes.length) {
    (tool.input_schema.properties.riskNotes as { items: { properties: { code: Record<string, unknown> } } }).items.properties.code = {
      type: "string", enum: codes, description: "the risk you are glossing",
    };
  }
  // A BEAT MAY ONLY NAME A SUPPORTING METRIC. This is the whole feature: the
  // top line of the readout is the team's set, not whatever moved most. The
  // enum makes anything else unemittable rather than merely discouraged.
  // The fallback is only reachable with nothing reporting at all (a reporting
  // experiment always has an Optimizely primary, which is always supporting).
  // It is capped anyway: an unbounded enum would demand one beat per metric.
  const beatEnum = supporting.length ? supporting : measureKeys.slice(0, 4);
  if (beatEnum.length) {
    const beatsSchema = tool.input_schema.properties.beats as {
      minItems: number; maxItems: number;
      items: { properties: { measure: Record<string, unknown> } };
    };
    beatsSchema.items.properties.measure = {
      type: "string", enum: beatEnum, description: "the metric this beat is about",
    };
    // Exactly one beat per supporting metric. A floor of three when only two
    // are marked would force the model to pad from an enum that cannot supply
    // a third — an unsatisfiable schema, not a stricter one.
    beatsSchema.minItems = beatEnum.length;
    beatsSchema.maxItems = beatEnum.length;
    // Each movement names the ONE metric that evidences it, from the same set.
    for (const k of ["effect", "shift", "cost", "prediction"] as const) {
      const sc = tool.input_schema.properties[k] as { properties: { measure: Record<string, unknown> } } | undefined;
      if (sc) sc.properties.measure = { type: "string", enum: beatEnum, description: "the metric that evidences this movement" };
    }
  }
  // The same set is what gets an OBSERVATION — one act, one meaning: this
  // metric is part of the story. BOTH primaries are in it whether or not
  // anyone marked them: Optimizely's, because it is the number the client
  // reads in their own tool, and the console's decision metric, because it is
  // the one being adjudicated. They may disagree — that is exactly why each
  // needs its own read.
  const watched = supporting;
  if (watched.length) {
    const obsSchema = tool.input_schema.properties.observations as {
      maxItems: number; items: { properties: { measure: Record<string, unknown> } };
    };
    obsSchema.items.properties.measure = {
      type: "string", enum: watched, description: "the watched metric you are observing",
    };
    // The team decides how many metrics are worth observing; a fixed maxItems
    // would silently drop the tail of their own list.
    obsSchema.maxItems = watched.length;
  } else {
    delete (tool.input_schema.properties as Record<string, unknown>).observations;
  }

  const res = await client.messages.create({
    model: "claude-opus-4-8",
    // The mandated output scales with the TEAM'S set, which has no cap: one
    // beat per supporting metric and one observation per watched metric. A
    // truncated tool call returns nothing usable and falls back to the
    // computed story, so the budget is derived rather than guessed.
    max_tokens: Math.min(8000, 1200 + (beatEnum.length + watched.length) * 130),
    system,
    messages: [{
      role: "user",
      content: `EXPERIMENT: ${opts.proto.name}
${renderNotebook(opts.orgNotebook, opts.protoNotebook)}
${renderVerdict(opts.verdict)}
${renderStats(opts.stats)}

RAW NUMBERS:
${renderContext(opts.results, opts.map)}

${watched.length ? `THE SUPPORTING METRICS — the team marked these as the ones that support the hypothesis. Write ONE observation for EVERY metric below, no exceptions. The reader is the hotel's team and the only question they are asking is WHAT DOES THIS TELL US. So: what are guests doing differently on that surface, where is intent being created or lost along the booking path, and what does it imply about the next move. Name the surface in their words. NEVER write about significance, sample size, confidence, or days remaining — the console prints all of that beside your sentence.\n${watched.map((k) => {
  const m = opts.stats?.metrics.find((x) => x.key === k);
  const c = m?.cells.find((x) => x.variationId === opts.stats?.focusVariationId);
  return `${k} — ${m?.label ?? k}${m?.featureOnly ? " (fires in one version only)" : c?.lift !== undefined ? ` (${c.lift >= 0 ? "+" : ""}${(c.lift * 100).toFixed(1)}%)` : ""}`;
}).join("\n")}\n` : ""}
${opts.stats?.primaryKey
  ? `THE HEADLINE METRIC (the story is ABOUT this one — it is the decision metric the verdict adjudicates): ${opts.stats.metrics.find((m) => m.key === opts.stats!.primaryKey)?.label ?? opts.stats.primaryKey}${
      opts.map?.composites.find((c) => `composite:${c.id}` === opts.stats!.primaryKey)?.source === "optimizely"
        ? ". It is the experiment's OWN primary metric, declared in Optimizely — a real decision metric, so read it as one. Do not describe the experiment as unmeasured or undefined."
        : ""}`
  : `NO DECISION METRIC IS DECLARED — not in this console and not in Optimizely. Say plainly that there is nothing to judge the run against yet; do not silently treat another metric as the headline.`}

THE PATH, in the order the team laid it out — these are the steps that lead to the headline metric, and the story should follow them rather than list whichever moved most:
${pathLines || "(no metrics reporting)"}

WHAT MOVED (write about THESE, by name, in the reader's words):
${whatMoved || "(nothing has moved beyond luck yet)"}

${chain}

THE ONLY METRICS YOU MAY PUT IN A BEAT — write one beat for EACH of them, in
this order, and no others. These are the team's choice, not yours: a metric
that moved spectacularly and is not on this list does not belong in the top
line. NEVER type a number anywhere: the page prints the live value, so a
number you copy would be stale the moment the counts move.
${measureMenu}

RISKS ALREADY FOUND (the console computed these; you may gloss one in ≤70 plain words, you may never add your own):
${opts.attention.filter((a) => a.severity !== "good").map((a) => `${a.id} — ${a.title}: ${a.detail}`).join("\n") || "(none)"}

Give the READING for hotel executives: a HEADLINE (the story in one line), THE FOUR MOVEMENTS below, a LEDE that is those four run together as one flowing paragraph, and ONE BEAT FOR EACH metric in the beat list above, in that order, decision metric first.

THE FOUR MOVEMENTS — the same four in every experiment, so a reader learns the shape once:
· effect — what the change did to the thing it was aimed at.
Each section is at most 420 characters and carries NO DIGITS — a section that breaks either rule is dropped from the readout, so keep them short and wordy-not-numeric.
· shift — where that behaviour went, and how far along the path it got.
· cost — what softened, what is being traded, or where intent is leaking. If nothing measurably gave way, say that rather than inventing a cost.
· prediction — what the brief claimed, which half is settled and which isn't.
Each is one or two sentences and stands on its own: a reader scanning only "cost" must get a complete thought without having read the others.
EVERY MOVEMENT ALSO NAMES THE ONE METRIC THAT EVIDENCES IT. The page prints that metric's live value beside your words, so never type a number yourself — pick the metric whose movement your sentences are actually about.

THE STORY IS ABOUT THE HEADLINE METRIC named above — the headline and the lede are its story, and every other metric is there to support, explain or qualify it. Do not lead with a different metric because it moved more.

THE TEAM CHOSE WHAT THIS READOUT IS ABOUT. The supporting metrics are the steps they believe lead to the headline metric, so the lede's job is to CHAIN THEM: what guests do first, what that produces next, and where it does or does not arrive at the outcome. A CONTEXT-ONLY metric may be raised once, and only as a caution that something is moving against the story — never as the subject of a sentence and never in a beat. A metric that is absent from THE PATH and from WHAT MOVED has been taken off this readout by the team — it may still appear in the raw tables above, and you must not write about it at all.

TRACE THE PATH TO IT. The experiment's own hypothesis names the steps: clicks lead somewhere, that somewhere leads to the outcome. So say where guests are being gained and where they are being lost ALONG THAT PATH, and finish on what it means for the headline metric — "the shortcut wins the click, the click is not reaching the booking engine" is the shape. A metric marked MISNAMED is a BROKEN DEFINITION, not a result: the console cannot compute it because the event name in the plan does not match anything Optimizely reports. Say exactly that — "the plan's version of this step names an event that isn't reporting under that name" — and if ANOTHER metric on the path measures the same step and IS reporting, say so and read that one instead. NEVER describe a metric as unwired when it is reporting numbers: check the path above before making that claim. If a guardrail is dropping, name it — the team said in advance it must not.

THE LEDE IS THE WHOLE POINT, AND IT IS AN OBSERVATION — NOT A STATUS REPORT.
A status report says "the two versions are close and nothing is settled". Nobody needs you for that; the console prints it. An OBSERVATION says WHAT GUESTS ARE DOING DIFFERENTLY and WHERE THAT BEHAVIOUR IS GOING. Build it from THE CHAIN above, in this shape:
1. What changed in guest behaviour, named by surface — what are they reaching for that they weren't before.
2. WHERE IT GOES, or where it stops. This is the sentence that matters: the chain tells you whether the extra intent is arriving at the outcome, leaking before it, or simply moving from one surface to another. Say which, and name the step where it stops.
3. What that implies — the mechanism a person could act on ("the modal is winning the click and then handing off to a page that isn't converting it"), not a recommendation and not a summary of the numbers.
If the outcome is still unsettled, that is a fact about the OUTCOME, not the whole story: an unsettled decision metric sitting behind a large, settled gain upstream is itself the finding — say so, and say what it means.
Never write "the gap is small enough that ordinary variation could produce it", "nothing to ship or kill on yet", or any sentence that would be true of any experiment. If your lede would fit another test unchanged, it is wrong.
NEVER write a sentence like "the variant is ahead of the control on the decision metric" — that is the verdict restated, and the console has already printed it.
NO DIGITS in the headline, the lede, or a beat label — the numbers are printed for you. No statistics vocabulary anywhere: no p-values, no q-values, no "significance"; say "beyond what luck explains".
When nothing is settled yet, SAY THAT plainly — do not manufacture a story out of movement that luck could produce.`,
    }],
    tools: [tool],
    tool_choice: { type: "tool", name: "give_reading" },
  });

  const tu = res.content.find((c) => c.type === "tool_use");
  if (!tu || tu.type !== "tool_use") throw new Error("The reading returned nothing — try again.");
  const raw = (tu.input ?? {}) as Record<string, unknown>;

  // ── VALIDATE + REPAIR (enforce-in-code): the words may carry no digits and
  // a beat may only name a metric that exists. Anything that fails falls
  // back to the computed story rather than being patched into shape.
  const fallback = templateStory({ results: opts.results, stats: opts.stats, verdict: opts.verdict, supporting });
  const clean = (v: unknown, cap: number) => {
    const t = typeof v === "string" ? stripMd(v).replace(/\s+/g, " ").trim() : "";
    if (!t || t.length > cap || /\d/.test(t) || STAT_NOTATION.test(t)) return "";
    return t;
  };

  let headline = clean(raw.headline, 80);
  let executive = clean(raw.executive, 420);
  let lede = clean(raw.lede, 900);
  // A digit or an over-long sentence used to swap the analyst's paragraph for
  // a generic template silently. Ask once for a repair, in the same call
  // shape, before settling for the computed story.
  if (!headline || !lede || !executive) {
    try {
      const fix = await client.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 600,
        system,
        messages: [
          { role: "user", content: res.content.map((c) => (c.type === "text" ? c.text : "")).join("") || "(see below)" },
          { role: "assistant", content: JSON.stringify({ headline: raw.headline, executive: raw.executive, lede: raw.lede }) },
          { role: "user", content: `${[!headline && "headline", !executive && "executive", !lede && "lede"].filter(Boolean).join(", ")} rejected. Rules: NO DIGITS anywhere in the words, headline <=80 characters, executive <=420 characters and two or three sentences, lede <=900 characters, no statistics vocabulary anywhere (never "significant", "confidence", "power", "underpowered"). The executive summary is for a senior leader who reads nothing else: what the change did in business language, whether it reached the outcome the business cares about, and what decision is now in front of them. Rewrite about THESE facts, naming the actual surfaces:\n${whatMoved}\n\nReturn only JSON: {"headline": "...", "executive": "...", "lede": "..."}` },
        ],
      });
      const txt = fix.content.map((c) => (c.type === "text" ? c.text : "")).join("");
      const m = /\{[\s\S]*\}/.exec(txt);
      if (m) {
        const parsed = JSON.parse(m[0]) as { headline?: string; executive?: string; lede?: string };
        headline = headline || clean(parsed.headline, 80);
        executive = executive || clean(parsed.executive, 420);
        lede = lede || clean(parsed.lede, 900);
      }
    } catch { /* the computed story is the floor */ }
  }
  // THE FOUR MOVEMENTS. Every experiment gets the same shape, so a reader
  // learns it once and can scan straight back to the part they remember.
  // PARTIAL IS FINE. Requiring all four to validate meant one overlong or
  // digit-bearing section quietly collapsed the whole structure back to a wall
  // of prose — the reader sees a formatting regression and no reason for it.
  // Whatever passed is rendered; only an empty set falls back.
  const allowedMeasures = new Set(beatEnum);
  // NORMALIZE THE SHAPE AT THE BOUNDARY. The model returns a section as
  // {text, measure} most of the time and as a bare string some of the time,
  // and reading only `.text` silently dropped every string one — which is why
  // the four sections appeared on one refresh and vanished on the next.
  const sec = (v: unknown) => {
    const o = typeof v === "string" ? { text: v } : ((v ?? {}) as Record<string, unknown>);
    const text = clean(o.text, 420);
    if (!text) return undefined;
    const mk = typeof o.measure === "string" ? o.measure.trim() : "";
    return { text, ...(allowedMeasures.has(mk) ? { measureKey: mk } : {}) };
  };
  let read = (() => {
    const r = { effect: sec(raw.effect), shift: sec(raw.shift), cost: sec(raw.cost), prediction: sec(raw.prediction) };
    return Object.values(r).some(Boolean) ? r : undefined;
  })();

  // ASK AGAIN FOR WHAT WAS DROPPED. The lede had a repair pass and the
  // sections did not, so a section that broke a rule just disappeared and the
  // readout quietly reverted to a paragraph — the exact "sometimes they show,
  // sometimes they don't" the reader was seeing.
  const missingSections = (["effect", "shift", "cost", "prediction"] as const)
    .filter((k) => !read?.[k]);
  if (missingSections.length) {
    try {
      const fix = await client.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 1200,
        system,
        messages: [
          { role: "user", content: "Rewrite the sections of the reading you just gave." },
          { role: "assistant", content: JSON.stringify({ effect: raw.effect, shift: raw.shift, cost: raw.cost, prediction: raw.prediction }) },
          { role: "user", content: `These sections were rejected: ${missingSections.join(", ")}. Each must be plain text of AT MOST 420 characters with NO DIGITS AT ALL (every number is printed for you) and no statistics vocabulary (significance, sample size, confidence, p-values, days remaining). Keep the same substance. Return only JSON, an OBJECT per section with its text AND the metric key that evidences it: {${missingSections.map((k) => `"${k}": {"text": "...", "measure": "<one of the metric keys you were given>"}`).join(", ")}}.` },
        ],
      });
      const txt = fix.content.map((c) => (c.type === "text" ? c.text : "")).join("");
      const m2 = /\{[\s\S]*\}/.exec(txt);
      if (m2) {
        const parsed = JSON.parse(m2[0]) as Record<string, unknown>;
        const patched = { ...(read ?? {}) } as Record<string, { text: string; measureKey?: string } | undefined>;
        for (const k of missingSections) patched[k] = patched[k] ?? sec(parsed[k]);
        read = Object.values(patched).some(Boolean) ? (patched as typeof read) : read;
      }
    } catch { /* whatever survived is what renders */ }
  }
  // A SECTION WITHOUT ITS NUMBER IS HALF A SECTION. A section can arrive as a
  // bare string (no `measure` at all) or name a metric outside the enum, and
  // either way the movement rendered as prose with nothing above it. Rather
  // than leave the slot empty, pair it with the metric the movement is BY
  // DEFINITION about — and where no metric honestly qualifies, leave it empty
  // rather than attach a number the sentence was not written about.
  if (read) {
    const cellOf = (k: string) => opts.stats?.metrics.find((m) => m.key === k)?.cells.find((c) => c.variationId === opts.stats?.focusVariationId);
    const headKeyForRead = opts.stats?.primaryKey ?? (optiPrimaryKeyOf(opts.results) || undefined);
    const others = supporting.filter((k) => k !== headKeyForRead && !opts.stats?.metrics.find((m) => m.key === k)?.featureOnly);
    const byLift = [...others].sort((a, b) => (cellOf(b)?.lift ?? 0) - (cellOf(a)?.lift ?? 0));
    const biggestRise = byLift.find((k) => (cellOf(k)?.lift ?? 0) > 0);
    const biggestFall = [...byLift].reverse().find((k) => (cellOf(k)?.lift ?? 0) < 0);
    const fallback: Record<string, string | undefined> = {
      effect: headKeyForRead,
      shift: biggestRise ?? headKeyForRead,
      cost: biggestFall,
      prediction: headKeyForRead,
    };
    for (const k of ["effect", "shift", "cost", "prediction"] as const) {
      const sect = read[k];
      if (sect && !sect.measureKey && fallback[k]) sect.measureKey = fallback[k];
    }
  }

  // Two different failures, two different admissions: the paragraph fell back
  // to the computed floor, or the four sections could not be recovered and the
  // readout is showing prose where it should show structure.
  const ledeComputed = !lede && !read;
  const sectionsMissing = (["effect", "shift", "cost", "prediction"] as const).some((k) => !read?.[k]);
  headline = headline || fallback.headline;
  lede = lede || fallback.lede;

  // THE BEATS ROW IS THE TEAM'S SET, RECONCILED IN CODE — not whatever the
  // model returned. The analyst contributes WORDING; the membership and the
  // order are the console's. A supporting metric the model skipped still gets
  // a beat (labelled from the metric itself), and anything it named outside
  // the set is dropped. Prompt-hoping was never going to hold this.
  const allowed = new Set(beatEnum);
  const written = new Map<string, string>();
  for (const b of Array.isArray(raw.beats) ? raw.beats : []) {
    const rec = b as Record<string, unknown>;
    const key = typeof rec.measure === "string" ? rec.measure.trim() : "";
    const label = clean(rec.label, 34);
    if (!key || !label || !allowed.has(key) || written.has(key)) continue;
    written.set(key, label);
  }
  const labelOf = (k: string) => written.get(k) ?? shortLabel(opts.stats?.metrics.find((m) => m.key === k)?.label ?? k);
  const beats: { measureKey: string; label: string }[] = beatEnum
    .filter((k) => measureKeys.includes(k))
    .map((k) => ({ measureKey: k, label: labelOf(k) }));

  // THE HEADLINE METRIC IS ALWAYS THE FIRST BEAT. The story is about it — the
  // decision metric when one is nominated, Optimizely's own primary when none
  // is. (The supporting set leads with Optimizely's primary because that is
  // the number the client reads in their own tool; the beats row leads with
  // whatever the story is ABOUT. Both orderings are deliberate.)
  const headKey = opts.stats?.primaryKey ?? (optiPrimaryKeyOf(opts.results) || undefined);
  const at = headKey ? beats.findIndex((b) => b.measureKey === headKey) : -1;
  if (at > 0) beats.unshift(...beats.splice(at, 1));

  // A prototype with nothing marked and nothing reporting still gets a row.
  if (!beats.length) beats.push(...fallback.beats);

  const watchedSet = new Set(watched);
  const seenObs = new Set<string>();
  const observations: { measureKey: string; note: string }[] = [];
  for (const o of Array.isArray(raw.observations) ? raw.observations : []) {
    const rec = o as Record<string, unknown>;
    const key = typeof rec.measure === "string" ? rec.measure.trim() : "";
    // Asked for at 180 and discarded at 90 — the analyst's observations were
    // being thrown away for obeying the instruction they were given.
    const note = clean(rec.note, 180);
    if (!key || !note || !watchedSet.has(key) || seenObs.has(key)) continue;
    seenObs.add(key);
    observations.push({ measureKey: key, note });
  }

  const codeSet = new Set(codes);
  const seenCodes = new Set<string>();
  const riskNotes: { code: string; note: string }[] = [];
  for (const r of Array.isArray(raw.riskNotes) ? raw.riskNotes : []) {
    const rec = r as Record<string, unknown>;
    const code = typeof rec.code === "string" ? rec.code : "";
    const note = typeof rec.note === "string" ? stripMd(rec.note).replace(/\s+/g, " ").trim() : "";
    if (!code || !note || note.length > 70 || !codeSet.has(code) || seenCodes.has(code)) continue;
    if (STAT_NOTATION.test(note)) continue; // exec surface — plain words only
    // CROSS-SURFACE DEDUPE: when the computed detail is already short and
    // statistic-free, the computed sentence wins and the gloss never renders.
    const item = opts.attention.find((a) => a.id === code);
    if (item && item.detail.length <= 70 && !STAT_NOISE.test(item.detail)) continue;
    seenCodes.add(code);
    riskNotes.push({ code, note });
    if (riskNotes.length === 3) break;
  }

  const one = (v: unknown, cap: number) => {
    const t = typeof v === "string" ? stripMd(v).replace(/\s+/g, " ").trim() : "";
    return t && t.length <= cap ? t : undefined;
  };

  return {
    reading: {
      headline,
      ...(executive ? { executive } : {}),
      lede,
      ...(read ? { read } : {}),
      ...(ledeComputed ? { ledeComputed: true } : {}),
      ...(sectionsMissing ? { sectionsMissing: true } : {}),
      beats,
      observations,
      riskNotes,
      trend: one(raw.trend, 64),
      question: one(raw.question, 80),
      generatedAt: new Date().toISOString(),
      basisKey: opts.basisKey,
    },
    dataWishes: (Array.isArray(raw.dataWishes) ? raw.dataWishes : [])
      .filter((w): w is string => typeof w === "string" && w.trim().length > 0)
      .map((w) => stripMd(w).slice(0, 200)).slice(0, 4),
  };
}

export interface AnalystAnswer {
  headline: string;
  bullets: string[];
  caveat?: string;
  nextStep?: string;
}

const answerTool = {
  name: "give_answer",
  description: "The analyst's answer — executive format, enforced: a one-sentence direct answer, then bullets that each LEAD with a data point.",
  input_schema: {
    type: "object" as const,
    properties: {
      headline: { type: "string" as const, description: "ONE sentence answering the question directly, plain business words" },
      bullets: { type: "array" as const, items: { type: "string" as const }, description: "2-6 bullets, ONE fact each, LEADING with the number ('Hero clicks: 4.14% vs 1.47% — the variant is losing'). Plain text, no markdown. The audience is hotel executives: NEVER write q-values, p-values, 'alpha', 'FDR' or 'statistically significant' — say 'beyond what luck explains' / 'still inside the range luck could produce'" },
      caveat: { type: "string" as const, description: "one sentence when honesty demands it (too early, exploratory, data gap)" },
      nextStep: { type: "string" as const, description: "one sentence recommendation tied to the verdict" },
    },
    required: ["headline", "bullets"],
  },
};

export async function analyzeResults(opts: {
  orgId: string;
  proto: PrototypeRecord;
  results: ExperimentResults;
  map: MetricMap | null;
  stats?: StatsReport | null;
  verdict?: VerdictRecord | null;
  orgNotebook?: OrgNotebook | null;
  protoNotebook?: ProtoNotebook | null;
  question?: string;
  /** "challenge" runs the same analyst against its own conclusion — the
   *  strongest case that the current call is wrong, argued from the same
   *  numbers. Same answer schema, different job. */
  stance?: "ask" | "challenge";
}): Promise<AnalystAnswer> {
  requireKey();
  const client = new Anthropic();
  const { system } = await analystSkill(opts.orgId);
  // The SAME structure the standing reading is built from. Without it the ask
  // box got an undifferentiated pile of metrics, so asking the analyst a
  // question produced a worse answer than not asking one.
  const { supportingBlock, chain, decisionLabel } = readoutStructure({
    results: opts.results, map: opts.map, stats: opts.stats ?? null,
  });
  const res = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1500,
    system,
    messages: [{
      role: "user",
      content: `EXPERIMENT: ${opts.proto.name}
LIVE BRIEF HYPOTHESIS (may have evolved since the push — the PRE-REGISTERED one in the verdict block is the adjudication contract): We believe ${opts.proto.hypothesis.change || "…"} for ${opts.proto.hypothesis.audience || "…"} will cause ${opts.proto.hypothesis.outcome || "…"}.
${supportingBlock}

${chain}
${renderNotebook(opts.orgNotebook ?? null, opts.protoNotebook ?? null)}
${renderVerdict(opts.verdict ?? null)}
${renderStats(opts.stats ?? null)}

RAW NUMBERS:
${renderContext(opts.results, opts.map)}

${opts.stance === "challenge"
  ? `CHALLENGE THIS RESULT. Argue the strongest honest case that the current call is WRONG, from these same numbers. Name the weakest link in the chain, what would have to be true for the reading to be mistaken, and what evidence would settle it. Do not invent numbers, do not manufacture doubt where the data is genuinely clean — if the call holds up, say plainly which part is actually solid and where the remaining exposure is.${opts.question?.trim() ? `\nThe reader also asked: ${opts.question.trim().slice(0, 600)}` : ""}`
  : opts.question?.trim()
    ? `QUESTION: ${opts.question.trim().slice(0, 1000)}

ANSWER IT THROUGH THE TEAM'S OWN METRICS. The decision metric is ${decisionLabel}, and the supporting metrics above are the steps this team believes lead to it — several are COMPOSITES they defined themselves, which exist precisely because no single Optimizely event expresses what they mean. Reason with those, and with THE CHAIN, rather than reaching for whichever raw event happens to be nearest the question. A background metric may be raised as a caution; it is never the answer. If the honest answer is that their metrics cannot settle the question, say so and say what would.`
    : "Give the readout: the verdict as the headline, then the numbers that matter as bullets, a caveat if honesty demands one, and the recommendation. Build it from the decision metric and the supporting metrics above."}`,
    }],
    tools: [answerTool],
    tool_choice: { type: "tool", name: "give_answer" },
  });
  const tu = res.content.find((c) => c.type === "tool_use");
  if (!tu || tu.type !== "tool_use") throw new Error("The analyst returned nothing — try again.");
  const raw = (tu.input ?? {}) as Record<string, unknown>;
  const bullets = (Array.isArray(raw.bullets) ? raw.bullets : []).filter((b): b is string => typeof b === "string" && b.trim().length > 0).map((b) => stripMd(b).slice(0, 400)).filter(Boolean).slice(0, 6);
  const headline = typeof raw.headline === "string" ? stripMd(raw.headline).slice(0, 300) : "";
  if (!headline && !bullets.length) throw new Error("The analyst returned nothing — try again.");
  return {
    headline,
    bullets,
    caveat: typeof raw.caveat === "string" && raw.caveat.trim() ? stripMd(raw.caveat).slice(0, 300) : undefined,
    nextStep: typeof raw.nextStep === "string" && raw.nextStep.trim() ? stripMd(raw.nextStep).slice(0, 300) : undefined,
  };
}
