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
import { computeComposite, compositeMembers } from "../prototypes/results";
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
    system: "You map an experiment's BUSINESS metrics onto its INSTRUMENTED events. The brief states the decision metric in words; Optimizely reports raw event metrics; the built code shows which UI elements fire what. Propose composites: the PRIMARY decision metric (usually a sum of related events — e.g. the same CTA reachable in two places counts once as intent), guardrails from the brief, and at most one or two informative extras. Only compose events that genuinely measure the same intent — never pad. Use ONLY the provided event names. Set direction=decrease on metrics where DOWN is good (bounce, exits, support contacts). CRITICAL: an event fired only by a variation-added element (a new CTA the control doesn't have) must NEVER stand alone as the primary — the control structurally can't convert on it. Pair it with the control's equivalent event (main CTA + new overlay CTA = total intent BOTH arms can express); standalone one-arm events are adoption metrics, not decision metrics.",
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
      label: { type: "string" as const, description: "short business name for the measure" },
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

/** A user-described compound measure → a badged, console-computed composite.
 *  Honest by construction: infeasible asks come back as an explanation, and
 *  the events are enum-locked to what actually reports. */
export async function defineCustomMetric(opts: {
  orgId: string;
  proto: PrototypeRecord;
  description: string;
  eventNames: string[];
}): Promise<{ composite: CompositeMetric | null; explanation: string }> {
  requireKey();
  if (!opts.eventNames.length) throw new Error("No events reporting yet — custom measures need live results first.");
  const client = new Anthropic();
  const { system } = await analystSkill(opts.orgId);
  const res = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1500,
    system,
    messages: [{
      role: "user",
      content: `The team wants a CUSTOM console-computed measure for experiment "${opts.proto.name}".

THEIR DESCRIPTION: ${opts.description.slice(0, 600)}

AVAILABLE EVENTS (a custom measure can ONLY sum these):
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
    return { composite: null, explanation: typeof raw.whyNot === "string" && raw.whyNot.trim() ? stripMd(raw.whyNot).slice(0, 400) : "That measure needs data the current events can't express." };
  }
  const events = (Array.isArray(raw.events) ? raw.events : []).filter((e): e is string => typeof e === "string" && opts.eventNames.includes(e));
  if (!events.length) return { composite: null, explanation: "None of the reporting events can express that measure." };
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
    const provenance = map.confirmed
      ? `CONFIRMED by ${map.confirmedBy ?? "a human"}`
      : "PROPOSED by Claude, NOT human-confirmed — treat the mapping itself as provisional";
    lines.push(`\nCOMPOSITE METRICS (${provenance}; summed ACTION totals, not unique visitors — a guest converting on two member events counts twice, so rates are actions-per-visitor and can exceed 100%):`);
    for (const c of map.composites) {
      lines.push(`[${c.role.toUpperCase()}${c.direction === "decrease" ? " · decrease-is-good" : ""}] ${c.label} = ${c.events.join(" + ")}${c.note ? ` — ${c.note}` : ""}`);
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

/** Every value the readout actually renders, at DISPLAY precision. A figure
 *  the analyst cites must be byte-identical to one of these — a narrated
 *  number can then never drift from a rendered one after a refresh.
 *  Returns the DISPLAY forms (what the model is shown and what gets stored)
 *  alongside the normalised lookup — showing the model a normalised string
 *  makes it copy "day5" onto the board page. */
function allowedFigures(results: ExperimentResults, stats: StatsReport | null): { display: string[]; lookup: Map<string, string> } {
  const lookup = new Map<string, string>();
  const display: string[] = [];
  const add = (v: string | undefined | null) => {
    if (!v) return;
    const k = normFigure(v);
    if (lookup.has(k)) return;
    lookup.set(k, v);
    display.push(v);
  };
  const pct = (v?: number, dp = 1) => (v === undefined ? undefined : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(dp)}%`);

  for (const v of results.variations) add(v.visitors?.toLocaleString());
  // The Visitors tile shows focus + control only; a whole-experiment total
  // would contradict the number printed directly above the findings.
  const focusV = results.variations.find((v) => v.variationId === stats?.focusVariationId);
  const baseV = results.variations.find((v) => v.variationId === stats?.baselineVariationId);
  if (focusV && baseV) add(((focusV.visitors ?? 0) + (baseV.visitors ?? 0)).toLocaleString());

  const primary = stats?.metrics.find((m) => m.key === stats.primaryKey);
  for (const c of primary?.cells ?? []) {
    add(c.count?.toLocaleString());
    if (c.rate !== undefined) add(`${(c.rate * 100).toFixed(1)}%`);
    add(pct(c.lift, 0)); add(pct(c.lift, 1));
    add(pct(c.liftCi?.lo)); add(pct(c.liftCi?.hi));
  }
  for (const m of stats?.metrics ?? []) for (const c of m.cells) { add(pct(c.lift, 0)); add(pct(c.lift, 1)); }
  for (const e of stats?.exploratory ?? []) {
    add(pct(e.lift, 0)); add(pct(e.lift, 1));
    add(e.q * 100 < 0.5 ? "q<1%" : `q=${(e.q * 100).toFixed(0)}%`);
  }
  if (stats?.power?.mdeNow !== undefined) add(`±${(stats.power.mdeNow * 100).toFixed(1)}%`);
  const dayN = dayNumber(stats);
  if (dayN !== undefined) add(`Day ${dayN}`);
  return { display, lookup };
}

/** Sign-preserving, glyph-insensitive comparison of a cited figure. */
function normFigure(s: string): string {
  return s.normalize("NFKC").replace(/[▲▼]/g, "").replace(/[\u2212\u2013\u2014]/g, "-").replace(/\s+/g, "").toLowerCase();
}

const readingTool = {
  name: "give_reading",
  description: "Three cited findings over the computed facts, plus optional glosses on risks the console already found. Never prose.",
  input_schema: {
    type: "object" as const,
    properties: {
      findings: {
        type: "array" as const, minItems: 3, maxItems: 3,
        items: {
          type: "object" as const,
          properties: {
            figure: { type: "string" as const, description: "≤14 chars, copied EXACTLY from the ALLOWED FIGURES list — the number this claim is about" },
            claim: { type: "string" as const, description: "≤86 chars, MUST NOT CONTAIN ANY DIGIT — what that number means in plain business words. e.g. 'the variant gets far more guests into the room detail view'" },
          },
          required: ["figure", "claim"],
        },
        description: "EXACTLY 3, in this order: (1) the effect, (2) how certain it is, (3) scale or time. One line each.",
      },
      riskNotes: {
        type: "array" as const, maxItems: 3,
        items: {
          type: "object" as const,
          properties: {
            code: { type: "string" as const, description: "an id from the RISKS ALREADY FOUND list — you may only gloss a risk the console found" },
            note: { type: "string" as const, description: "≤70 chars, plain words, no bare statistics" },
          },
          required: ["code", "note"],
        },
      },
      trend: { type: "string" as const, description: "≤64 chars, a caption for the day-by-day picture (e.g. 'the gap has held steady all week')" },
      question: { type: "string" as const, description: "≤80 chars, at most one PREFERENCE question for the team — never a statistics question" },
      dataWishes: { type: "array" as const, items: { type: "string" as const }, description: "wanted-but-unmeasurable data (segments, device mix) — recorded honestly" },
    },
    required: ["findings"],
  },
};

/** Deterministic findings — the zone is never empty, never a spinner, never
 *  model-dependent. Day 1 with no reading at all still renders three rows. */
export function templateFindings(opts: {
  results: ExperimentResults; stats: StatsReport | null; verdict: VerdictRecord | null;
}): { figure?: string; claim: string }[] {
  const { stats, verdict } = opts;
  const primary = stats?.metrics.find((m) => m.key === stats.primaryKey);
  const focus = primary?.cells.find((c) => c.variationId === stats?.focusVariationId);
  const pct = (v?: number) => (v === undefined ? undefined : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`);
  const sig = focus?.liftCi && focus.liftCi.lo * focus.liftCi.hi > 0;
  const focusV = opts.results.variations.find((v) => v.variationId === stats?.focusVariationId);
  const baseV = opts.results.variations.find((v) => v.variationId === stats?.baselineVariationId);
  const total = (focusV?.visitors ?? 0) + (baseV?.visitors ?? 0);
  const days = dayNumber(stats);

  const effect: { figure?: string; claim: string } =
    verdict?.verdict === "not_adjudicable"
      ? { claim: "the decision measure isn't bound to a confirmed event yet, so there's no result to read" }
      : focus?.lift === undefined
        ? { claim: "the decision measure hasn't produced a comparable number yet" }
        : { figure: pct(focus.lift), claim: focus.lift > 0 ? "the variant is ahead of the control on the decision measure" : focus.lift < 0 ? "the variant is behind the control on the decision measure" : "the two versions are level on the decision measure" };

  const certainty: { figure?: string; claim: string } =
    focus?.liftCi
      ? { figure: pct(focus.liftCi.lo), claim: sig ? "the plausible range stays on one side of no-change, so the direction is real" : "the plausible range still includes no-change, so the direction isn't settled" }
      : { claim: "there isn't enough data yet to say how certain this direction is" };

  const scale: { figure?: string; claim: string } =
    days !== undefined
      ? { figure: `Day ${days}`, claim: total ? "guests have been through both versions since the run began" : "the run has started but no visitors have been recorded yet" }
      : { figure: total ? total.toLocaleString() : undefined, claim: "guests have been through the experiment so far" };

  return [effect, certainty, scale];
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
  const figures = allowedFigures(opts.results, opts.stats);
  // "all-clear" is not a risk — leaving it in the enum lets the analyst write
  // its own sentence under "Nothing needs attention".
  const codes = opts.attention.filter((a) => a.severity !== "good").map((a) => a.id);

  // CALL-TIME ENUM: an unknown risk id is unemittable, not merely dropped.
  const tool = JSON.parse(JSON.stringify(readingTool)) as typeof readingTool & { input_schema: { properties: Record<string, unknown> } };
  if (codes.length) {
    (tool.input_schema.properties.riskNotes as { items: { properties: { code: Record<string, unknown> } } }).items.properties.code = {
      type: "string", enum: codes, description: "the risk you are glossing",
    };
  }

  const res = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1200,
    system,
    messages: [{
      role: "user",
      content: `EXPERIMENT: ${opts.proto.name}
${renderNotebook(opts.orgNotebook, opts.protoNotebook)}
${renderVerdict(opts.verdict)}
${renderStats(opts.stats)}

RAW NUMBERS:
${renderContext(opts.results, opts.map)}

ALLOWED FIGURES — a figure you cite must be copied EXACTLY from this list:
${figures.display.join(" · ") || "(none — omit every figure)"}

RISKS ALREADY FOUND (the console computed these; you may gloss one in ≤70 plain words, you may never add your own):
${opts.attention.filter((a) => a.severity !== "good").map((a) => `${a.id} — ${a.title}: ${a.detail}`).join("\n") || "(none)"}

Give the READING: exactly three findings — the effect, how certain it is, then scale or time. Each claim is ONE line of plain business words with NO DIGITS IN IT; the number belongs in the figure field.`,
    }],
    tools: [tool],
    tool_choice: { type: "tool", name: "give_reading" },
  });

  const tu = res.content.find((c) => c.type === "tool_use");
  if (!tu || tu.type !== "tool_use") throw new Error("The reading returned nothing — try again.");
  const raw = (tu.input ?? {}) as Record<string, unknown>;

  // ── VALIDATE + REPAIR (enforce-in-code): every failure has a deterministic
  // repair and nothing is ever re-prompted. Bad rows are DISCARDED, never
  // truncated — a severed uncertainty statement is a lie.
  const templates = templateFindings({ results: opts.results, stats: opts.stats, verdict: opts.verdict });
  const rawFindings = Array.isArray(raw.findings) ? raw.findings : [];
  const seenFigures = new Set<string>();
  // SLOT-ALIGNED: row i is always the i-th thing (effect, certainty, scale).
  // Padding by array length would let a dropped middle row shift the others
  // up — the uncertainty statement would vanish and the effect's earned
  // colour would land on someone else's number.
  const findings = [0, 1, 2].map((i) => {
    const rec = (rawFindings[i] ?? {}) as Record<string, unknown>;
    const claim = typeof rec.claim === "string" ? stripMd(rec.claim).replace(/\s+/g, " ").trim() : "";
    if (!claim || claim.length > 86 || /\d/.test(claim)) return templates[i]; // DIGIT BAN
    // NOT stripMd: its bullet-strip eats a leading "-", which would silently
    // turn a losing figure into a winning one.
    const cited = typeof rec.figure === "string" ? rec.figure.replace(/\*\*|__/g, "").trim() : "";
    const key = normFigure(cited);
    // Soft failure: an uncited or repeated figure loses the gutter and keeps
    // the sentence. Storing the CANONICAL display form (not the model's
    // string) is what keeps the gutter byte-identical to the page.
    const canon = cited.length <= 14 && figures.lookup.has(key) && !seenFigures.has(key) ? figures.lookup.get(key)! : "";
    if (canon) seenFigures.add(key);
    return { claim, ...(canon ? { figure: canon } : {}) };
  });

  const codeSet = new Set(codes);
  const seenCodes = new Set<string>();
  const riskNotes: { code: string; note: string }[] = [];
  for (const r of Array.isArray(raw.riskNotes) ? raw.riskNotes : []) {
    const rec = r as Record<string, unknown>;
    const code = typeof rec.code === "string" ? rec.code : "";
    const note = typeof rec.note === "string" ? stripMd(rec.note).replace(/\s+/g, " ").trim() : "";
    if (!code || !note || note.length > 70 || !codeSet.has(code) || seenCodes.has(code)) continue;
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
      findings,
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
      bullets: { type: "array" as const, items: { type: "string" as const }, description: "2-6 bullets, ONE fact each, LEADING with the number ('Hero clicks: 4.14% vs 1.47% — the variant is losing'). Plain text, no markdown" },
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
}): Promise<AnalystAnswer> {
  requireKey();
  const client = new Anthropic();
  const { system } = await analystSkill(opts.orgId);
  const res = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1500,
    system,
    messages: [{
      role: "user",
      content: `EXPERIMENT: ${opts.proto.name}
LIVE BRIEF HYPOTHESIS (may have evolved since the push — the PRE-REGISTERED one in the verdict block is the adjudication contract): We believe ${opts.proto.hypothesis.change || "…"} for ${opts.proto.hypothesis.audience || "…"} will cause ${opts.proto.hypothesis.outcome || "…"}.
${renderNotebook(opts.orgNotebook ?? null, opts.protoNotebook ?? null)}
${renderVerdict(opts.verdict ?? null)}
${renderStats(opts.stats ?? null)}

RAW NUMBERS:
${renderContext(opts.results, opts.map)}

${opts.question?.trim()
  ? `QUESTION: ${opts.question.trim().slice(0, 1000)}`
  : "Give the readout: the verdict as the headline, then the numbers that matter as bullets, a caveat if honesty demands one, and the recommendation."}`,
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
