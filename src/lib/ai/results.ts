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

const readingTool = {
  name: "give_reading",
  description: "The standing leadership reading over the computed facts — fixed sections, plain language, no unexplained statistics.",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: { type: "string" as const, description: "the TLDR: one or two sentences a leader reads first — where this experiment stands, in plain business words" },
      keyPoints: { type: "array" as const, items: { type: "string" as const }, description: "3-6 BULLETS, one fact each, LEADING with the number: 'Hero clicks: 4.14% control vs 1.47% variant — the variant is losing the main metric'. Plain words, statistic glossed, NEVER a paragraph. No markdown syntax — plain text only" },
      trendLine: { type: "string" as const, description: "one sentence: the direction of travel (stabilizing, growing, fading, flat)" },
      watchItems: { type: "array" as const, items: { type: "string" as const }, description: "0-3 one-sentence things that could change the story — in plain words (e.g. 'the traffic split looks uneven', never bare 'SRM p=0.03')" },
      questionsForYou: { type: "array" as const, items: { type: "string" as const }, description: "0-2 PREFERENCE questions (what does this team care about) — never statistics questions" },
      nextStep: { type: "string" as const, description: "one sentence: keep running / ship / iterate / close it out, tied to the verdict" },
      dataWishes: { type: "array" as const, items: { type: "string" as const }, description: "wanted-but-unmeasurable data the notebook or questions surfaced (device mix, segments) — recorded honestly" },
    },
    required: ["summary", "keyPoints", "watchItems", "questionsForYou", "nextStep"],
  },
};

/** The standing narrative — exec voice, structured, cache-friendly. */
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
}): Promise<{ reading: Reading; dataWishes: string[] }> {
  requireKey();
  const client = new Anthropic();
  const { system } = await analystSkill(opts.orgId);
  const res = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 2000,
    system,
    messages: [{
      role: "user",
      content: `EXPERIMENT: ${opts.proto.name}
${renderNotebook(opts.orgNotebook, opts.protoNotebook)}
${renderVerdict(opts.verdict)}
${renderStats(opts.stats)}

RAW NUMBERS:
${renderContext(opts.results, opts.map)}

Give the READING (per the standing-reading structure in your instructions).`,
    }],
    tools: [readingTool],
    tool_choice: { type: "tool", name: "give_reading" },
  });
  const tu = res.content.find((c) => c.type === "tool_use");
  if (!tu || tu.type !== "tool_use") throw new Error("The reading returned nothing — try again.");
  const raw = (tu.input ?? {}) as Record<string, unknown>;
  const strArr = (v: unknown, cap: number, len: number) =>
    (Array.isArray(v) ? v : []).filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => stripMd(s).slice(0, len)).filter(Boolean).slice(0, cap);
  const summary = typeof raw.summary === "string" ? stripMd(raw.summary).slice(0, 400) : "";
  const keyPoints = strArr(raw.keyPoints, 6, 400);
  if (!summary && !keyPoints.length) throw new Error("The reading came back empty — try again.");

  // DETECT-AND-REPAIR (enforce-LLM-behavior-in-code): nextStep is the one
  // verdict-adjacent sentence with no code tether — a voice preference must
  // never make it recommend shipping past a non-confirmed verdict.
  let nextStep = typeof raw.nextStep === "string" ? raw.nextStep.trim().slice(0, 300) : "";
  const v = opts.verdict?.verdict;
  if (v && v !== "confirmed" && /\b(ship( it)?|roll( it)? out|launch|go live)\b/i.test(nextStep)) {
    const SAFE: Record<string, string> = {
      keep_running: "Keep running — the pre-registered primary is still too early to call.",
      underpowered: "Don't ship on this — the run is underpowered; decide whether to keep chasing or redesign for a bigger effect.",
      refuted: "Don't ship — the hypothesis was refuted; document the learning and iterate.",
      guardrail_breach: "Don't ship — a guardrail broke its pre-set tolerance; iterate before rollout.",
      invalid: "No decision until the data validity issue is fixed — the numbers can't be trusted.",
      not_adjudicable: "Confirm the measurement plan first — then the experiment can be judged.",
    };
    nextStep = SAFE[v] ?? "Hold the decision — the verdict doesn't support shipping yet.";
  }

  return {
    reading: {
      summary: summary || undefined,
      keyPoints,
      trendLine: typeof raw.trendLine === "string" && raw.trendLine.trim() ? raw.trendLine.trim().slice(0, 300) : undefined,
      watchItems: strArr(raw.watchItems, 3, 300),
      questionsForYou: [...new Set(strArr(raw.questionsForYou, 2, 300))],
      nextStep,
      generatedAt: new Date().toISOString(),
      basisKey: opts.basisKey,
    },
    dataWishes: strArr(raw.dataWishes, 4, 200),
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
