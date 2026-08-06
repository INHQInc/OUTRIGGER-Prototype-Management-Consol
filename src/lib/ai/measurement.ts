/**
 * The MEASUREMENT PLANNER — the brief composer's grammar applied to "how
 * will we know it worked".
 *
 * Runs in the Experiment stage AFTER bind (real event names exist, zero
 * traffic needed) and BEFORE start — the plan it produces is stamped
 * pre-traffic, which is what makes the verdict engine's pre-registration
 * story hold at full strength.
 *
 * Discipline (same as the brief composer, enforced in code):
 *  - event names are ENUM-constrained to what Optimizely actually has;
 *  - questions only when the answer changes the plan, at most TWO;
 *  - the answers pass is TERMINAL — code force-empties questions;
 *  - an event fired only by a variation-added element must never stand
 *    alone as the primary (declared via expectedOneArm + paired surfaces);
 *  - things the team wants measured that nothing fires land in gaps[],
 *    honestly, instead of being silently dropped.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { PrototypeRecord } from "../prototypes/types";
import type { CompositeMetric, MetricMap } from "../prototypes/results";
import { getSkill, parseFrontmatter } from "../skills/skills";
import { ensureSkillsSeeded } from "../skills/seed";

const FALLBACK_SYSTEM =
  "You turn an experiment brief's outcome-in-words into a MEASUREMENT PLAN over the experiment's real instrumented events. Decompose the outcome into intents: ONE primary decision composite both arms can convert on, guardrails from the brief, adoption/info views for variation-only surfaces. Declare per-surface arm presence; a variation-only event never stands alone as the primary — pair it with the control's equivalent. Ask at most TWO questions, only when the answer changes the plan (arm presence you can't infer, person-vs-action unit, the smallest lift worth shipping, what would veto a win). List wanted-but-uninstrumented measurements as gaps. Use ONLY the provided event names. If the brief's outcome does not map to an event this experiment REPORTS, do not compose one anyway and do not pick a similarly-named project event: ask which event means it, with candidates, using metricChoices. A plan that quietly binds an outcome to an event the experiment never reports produces a metric that reads as nothing and a verdict that cannot be given.";

export interface MeasurementDraft {
  composites: CompositeMetric[];
  questions: string[];
  /** Questions that come with candidate events to pick from — the answer to
   *  "which metric means this?" is a choice, not an essay. */
  metricChoices: { question: string; options: string[] }[];
  understanding: number;
  gaps: string[];
}

const planTool = (eventNames: string[], askable: string[]) => ({
  name: "propose_measurement_plan",
  description: "Propose the measurement plan: composites over real events, clarifying questions (if any genuinely change the plan), an honest understanding score, and instrumentation gaps.",
  input_schema: {
    type: "object" as const,
    properties: {
      composites: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            id: { type: "string" as const, description: "kebab-case slug" },
            label: { type: "string" as const, description: "business name, e.g. 'Total booking intent'" },
            definition: { type: "string" as const, description: "one sentence: what this metrics, in the team's words" },
            events: { type: "array" as const, items: { type: "string" as const, enum: eventNames } },
            role: { type: "string" as const, enum: ["primary", "guardrail", "info"] },
            direction: { type: "string" as const, enum: ["increase", "decrease"] },
            surfaces: {
              type: "array" as const,
              items: {
                type: "object" as const,
                properties: {
                  arm: { type: "string" as const, enum: ["both", "variation", "baseline"] },
                  description: { type: "string" as const },
                },
                required: ["arm", "description"],
              },
            },
            expectedOneArm: { type: "string" as const, enum: ["variation", "baseline"], description: "set when EVERY surface of this composite exists in only one arm (adoption view)" },
            mdeRel: { type: "number" as const, description: "primary only, when the user stated it: smallest relative lift worth shipping (0.05 = +5%)" },
            note: { type: "string" as const },
          },
          required: ["id", "label", "definition", "events", "role", "direction"],
        },
      },
      questions: { type: "array" as const, items: { type: "string" as const }, description: "at most 2; EMPTY when understanding ≥ 90 or when answers were provided" },
      metricChoices: {
        type: "array" as const, maxItems: 2,
        items: {
          type: "object" as const,
          properties: {
            question: { type: "string" as const, description: "e.g. 'Which event marks a booking-engine visit for this experiment?'" },
            options: { type: "array" as const, items: { type: "string" as const, enum: askable }, description: "the candidate events, best first — the reader picks one" },
          },
          required: ["question", "options"],
        },
        description: "USE THIS INSTEAD OF GUESSING. When the outcome names something you cannot bind to an event this experiment reports, ask which event means it and offer the closest candidates. Never invent a composite over an event the experiment does not report.",
      },
      understanding: { type: "number" as const, description: "0-100 honest confidence you know what the team is measuring" },
      gaps: { type: "array" as const, items: { type: "string" as const }, description: "wanted measurements nothing currently fires an event for" },
    },
    required: ["composites", "questions", "understanding", "gaps"],
  },
});

function trimCode(js: string): string {
  const stripped = js.replace(/data:[a-zA-Z0-9/+;=.-]{300,}/g, "data:<inlined-asset-stripped>");
  return stripped.length > 50_000 ? `${stripped.slice(0, 50_000)}\n/* …truncated */` : stripped;
}

export async function planMeasurement(opts: {
  orgId: string;
  proto: PrototypeRecord;
  variationJs: string | null;
  eventNames: string[];
  /** Events the experiment actually REPORTS — the only bindable ones. */
  reportingNames?: string[];
  /** Everything else in the project: offerable as a CHOICE, never bound
   *  silently, because binding one produces a metric that computes as
   *  nothing until someone attaches it in Optimizely. */
  askableNames?: string[];
  priorPlan?: MetricMap | null;
  answers?: { question: string; answer: string }[];
}): Promise<MeasurementDraft> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY isn't set on the server — add it in Vercel → Settings → Environment Variables.");
  }
  if (!opts.eventNames.length) {
    throw new Error("No events found on the experiment or in the project registry — add metrics to the experiment in Optimizely first.");
  }
  await ensureSkillsSeeded(opts.orgId);
  const skill = await getSkill(opts.orgId, "opmc-measurement-planner");
  const system = skill ? parseFrontmatter(skill.body).body : FALLBACK_SYSTEM;
  const finalPass = Boolean(opts.answers?.length);

  const client = new Anthropic();
  const res = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 4000,
    system,
    messages: [{
      role: "user",
      content: `THE BRIEF'S INTENT (in words — decompose this):
Outcome: ${opts.proto.hypothesis.outcome || "(unset)"}
Primary metric: ${opts.proto.metrics.primary || "(unset)"}
Guardrails: ${opts.proto.metrics.guardrails.join(" · ") || "(none)"}
Change being tested: ${opts.proto.brief.change || opts.proto.hypothesis.change || "(unset)"}

REAL EVENT NAMES (bind ONLY to these, verbatim):
${opts.eventNames.map((n) => `- ${n}`).join("\n")}
${opts.priorPlan?.composites.length ? `
THE CURRENT PLAN (improve, don't discard what's right):
${JSON.stringify({ composites: opts.priorPlan.composites, gaps: opts.priorPlan.gaps }, null, 1).slice(0, 4000)}` : ""}
${opts.priorPlan?.interview?.length ? `
EARLIER INTERVIEW (already answered — NEVER re-ask these; honor the decisions):
${opts.priorPlan.interview.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join("\n")}` : ""}
${opts.answers?.length ? `
THE TEAM'S ANSWERS (this pass is FINAL — ask nothing further):
${opts.answers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join("\n")}` : ""}
${opts.variationJs ? `
THE BUILT CODE (evidence for which elements fire what, and which exist only in the variation):
"""
${trimCode(opts.variationJs)}
"""` : ""}

Propose the measurement plan.`,
    }],
    tools: [planTool(opts.eventNames, opts.askableNames?.length ? opts.askableNames : opts.eventNames)],
    tool_choice: { type: "tool", name: "propose_measurement_plan" },
  });

  const tu = res.content.find((c) => c.type === "tool_use");
  if (!tu || tu.type !== "tool_use") throw new Error("The planner returned nothing — try again.");
  const raw = (tu.input ?? {}) as Partial<MeasurementDraft> & { composites?: unknown; questions?: unknown; gaps?: unknown };

  // Normalize at the boundary — the tool schema constrains but never trust.
  const seen = new Set<string>();
  const composites: CompositeMetric[] = [];
  for (const r of Array.isArray(raw.composites) ? raw.composites : []) {
    if (!r || typeof r !== "object") continue;
    const o = r as unknown as Record<string, unknown>;
    let id = String(o.id ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (!id) id = `composite-${composites.length + 1}`;
    while (seen.has(id)) id = `${id}-2`;
    seen.add(id);
    const events = (Array.isArray(o.events) ? o.events : []).filter((e): e is string => typeof e === "string" && opts.eventNames.includes(e));
    if (!events.length) continue;
    composites.push({
      id,
      label: String(o.label ?? id).slice(0, 120),
      definition: typeof o.definition === "string" ? o.definition.trim().slice(0, 300) || undefined : undefined,
      events: [...new Set(events)].slice(0, 10),
      role: o.role === "guardrail" ? "guardrail" : o.role === "info" ? "info" : "primary",
      direction: o.direction === "decrease" ? "decrease" : "increase",
      surfaces: Array.isArray(o.surfaces)
        ? o.surfaces
            .filter((s): s is { arm: string; description: string } => Boolean(s && typeof s === "object" && typeof (s as Record<string, unknown>).description === "string"))
            .map((s) => ({ arm: s.arm === "variation" ? "variation" as const : s.arm === "baseline" ? "baseline" as const : "both" as const, description: s.description.slice(0, 160) }))
            .slice(0, 8)
        : undefined,
      expectedOneArm: o.expectedOneArm === "variation" ? "variation" : o.expectedOneArm === "baseline" ? "baseline" : undefined,
      mdeRel: typeof o.mdeRel === "number" && o.mdeRel > 0 && o.mdeRel < 5 ? o.mdeRel : undefined,
      note: typeof o.note === "string" && o.note.trim() ? o.note.trim().slice(0, 300) : undefined,
    });
  }
  if (!composites.length) throw new Error("The planner composed no valid metrics — check that the experiment's events are relevant to the brief.");

  // ENFORCED, not asked: only one primary; a one-arm composite can't be it.
  let sawPrimary = false;
  const demoted: string[] = [];
  for (const c of composites) {
    if (c.role !== "primary") continue;
    if (sawPrimary || c.expectedOneArm) {
      if (c.expectedOneArm) demoted.push(c.label);
      c.role = "info";
    } else sawPrimary = true;
  }

  const understanding = typeof raw.understanding === "number" ? Math.max(0, Math.min(100, Math.round(raw.understanding))) : 0;
  // Terminal-pass + agreement rules enforced in code (the brief composer's
  // hard-won lesson: an endless question loop must be structurally
  // impossible, not just discouraged). Duplicate questions deduped — a
  // repeated string collides as a React key AND as an answers-record key.
  let questions = [...new Set(
    (Array.isArray(raw.questions) ? raw.questions : []).filter((q): q is string => typeof q === "string" && q.trim().length > 0).map((q) => q.trim().slice(0, 300)),
  )].slice(0, 2);
  if (finalPass || understanding >= 90) questions = [];

  // Choices survive the understanding gate: "which event means this" is not a
  // preference the model can resolve by being more confident.
  const metricChoices = (Array.isArray((raw as { metricChoices?: unknown }).metricChoices) ? (raw as { metricChoices: unknown[] }).metricChoices : [])
    .map((c) => c as { question?: unknown; options?: unknown })
    .map((c) => ({
      question: typeof c.question === "string" ? c.question.trim().slice(0, 300) : "",
      options: (Array.isArray(c.options) ? c.options : [])
        .filter((o): o is string => typeof o === "string" && (opts.askableNames ?? opts.eventNames).includes(o))
        .slice(0, 8),
    }))
    .filter((c) => c.question && c.options.length)
    .slice(0, 2);
  if (metricChoices.length) {
    // A choice IS an open question — the plan is not finished while one stands.
    questions = [...new Set([...questions, ...metricChoices.map((c) => c.question)])].slice(0, 3);
  }

  const gaps = (Array.isArray(raw.gaps) ? raw.gaps : []).filter((g): g is string => typeof g === "string" && g.trim().length > 0).map((g) => g.trim().slice(0, 240)).slice(0, 8);
  // The demotion must never be a silent dead-end: no primary left → say
  // exactly what unblocks it (instrument the control's equivalent).
  if (!composites.some((c) => c.role === "primary")) {
    gaps.push(
      demoted.length
        ? `No both-arms event exists to serve as the PRIMARY — “${demoted[0]}” fires in only one arm. Instrument the control's equivalent action (or attach its existing event to the experiment), re-sync, then Re-plan.`
        : "No primary decision composite could be formed from the available events — instrument the decision action in BOTH arms, then Re-plan.",
    );
  }

  return {
    composites,
    questions,
    metricChoices,
    // First pass: score and questions must agree (questions ⇔ <90). The
    // TERMINAL pass keeps the model's honest score — forcing 90 because we
    // forced zero questions would fake understanding it doesn't have.
    understanding: finalPass ? understanding : questions.length ? Math.min(understanding, 89) : Math.max(understanding, 90),
    gaps: gaps.slice(0, 9),
  };
}
