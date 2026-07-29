/**
 * Draft-with-AI brief composer — the console's first API-side Claude.
 *
 * The expertise lives in the SKILL LIBRARY (opmc-brief-author, delivery:
 * "console"), loaded as the system prompt — one knowledge system initializes
 * every Claude here, whether it's Claude Code in a branch or the API in a
 * route. Edit the skill in the console and this endpoint's behavior follows.
 *
 * Structured output via a forced tool call, so the response is validated JSON.
 */
import Anthropic from "@anthropic-ai/sdk";
import { getSkill, parseFrontmatter } from "../skills/skills";
import { ensureSkillsSeeded } from "../skills/seed";
import type { PrototypeRecord, BriefReference } from "../prototypes/types";

export interface BriefDraft {
  brief: { change: string; problem: string; where: string; doneLooksLike: string[]; constraints: string };
  hypothesis: { change: string; audience: string; outcome: string; rationale: string };
  metrics: { primary: string; guardrails: string[] };
  clarifying_questions: string[];
  /** 0–100: the model's own confidence the brief is complete enough to build. */
  readiness: number;
}

const DRAFT_TOOL = {
  name: "draft_brief",
  description: "Return the structured OPMC experiment brief drafted from the user's explanation.",
  input_schema: {
    type: "object" as const,
    properties: {
      brief: {
        type: "object" as const,
        properties: {
          change: { type: "string" as const }, problem: { type: "string" as const },
          where: { type: "string" as const },
          doneLooksLike: { type: "array" as const, items: { type: "string" as const }, description: "3-5 acceptance criteria, each independently checkable on the live preview" },
          constraints: { type: "string" as const },
        },
        required: ["change", "problem", "where", "doneLooksLike", "constraints"],
      },
      hypothesis: {
        type: "object" as const,
        properties: {
          change: { type: "string" as const }, audience: { type: "string" as const },
          outcome: { type: "string" as const }, rationale: { type: "string" as const },
        },
        required: ["change", "audience", "outcome", "rationale"],
      },
      metrics: {
        type: "object" as const,
        properties: {
          primary: { type: "string" as const },
          guardrails: { type: "array" as const, items: { type: "string" as const } },
        },
        required: ["primary", "guardrails"],
      },
      clarifying_questions: { type: "array" as const, items: { type: "string" as const }, description: "Tied to readiness: REQUIRED (1–2, naming what's unsure) whenever readiness is below 90; empty ONLY when readiness is 90+. At most 2, first draft only. MUST be empty on the answers pass." },
      readiness: { type: "integer" as const, minimum: 0, maximum: 100, description: "0–100: your HONEST confidence that this brief is complete enough to build and judge with no further input. 100 = a stranger could build it with zero questions. Lower it when you are guessing at the change, its trigger/location, or the decision metric. It should RISE as answers resolve your uncertainty, and may FALL if an answer reveals the idea is bigger or vaguer than it first seemed. Be honest, not generous." },
    },
    required: ["brief", "hypothesis", "metrics", "clarifying_questions", "readiness"],
  },
};

export async function draftBrief(opts: {
  orgId: string | null;
  proto: PrototypeRecord;
  userText: string;
  answers?: string; // follow-up answers to clarifying questions, if regenerating
  references?: BriefReference[]; // current (possibly unsaved) supporting links
}): Promise<BriefDraft> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY isn't set on the server — add it in Vercel → Settings → Environment Variables to enable AI brief drafting.");
  }
  await ensureSkillsSeeded(opts.orgId);
  const skill = await getSkill(opts.orgId, "opmc-brief-author");
  const system = skill ? parseFrontmatter(skill.body).body : "You write structured, falsifiable A/B experiment briefs for client-side injected variations.";

  const refs = opts.references ?? opts.proto.brief.references ?? [];
  const context = [
    `Prototype name: ${opts.proto.name}`,
    opts.proto.targets.length ? `Target page(s): ${opts.proto.targets.map((t) => t.url).join(", ")}` : "Target pages: none set yet",
    refs.length ? `Supporting references the team attached (design intent — factor them into the brief; if one clearly implies something the text doesn't cover, note the assumption or ask): ${refs.map((r) => `${r.kind}: ${r.label ? `${r.label} (${r.url})` : r.url}`).join("; ")}` : "",
    opts.proto.brief.change ? `Existing brief (improve, don't discard what's right): ${JSON.stringify(opts.proto.brief)}` : "",
    opts.proto.metrics.primary ? `Existing primary metric: ${opts.proto.metrics.primary}` : "",
  ].filter(Boolean).join("\n");

  // The answers pass is TERMINAL: the user has answered once, so this draft is
  // final and asks nothing further. Told to the model AND enforced below, so an
  // endless question loop is structurally impossible, not just discouraged.
  const finalPass = Boolean(opts.answers?.trim());
  const READY = 90; // at/above this the brief is buildable with no questions
  const closing = finalPass
    ? `\n\nAnswers to your earlier clarifying questions:\n"""\n${opts.answers!.trim()}\n"""\n\nThis is the FINAL draft — you now have enough. Commit to the brief and return clarifying_questions as an empty array; do not ask anything new.`
    : `\n\nDraft the complete brief now, then score your readiness honestly. If readiness is below ${READY} you are NOT sure enough to build without guessing — you MUST return 1–2 clarifying_questions naming exactly what is holding your confidence down. Return an empty clarifying_questions array ONLY when readiness is ${READY}+.`;

  const client = new Anthropic();
  const draft = await runDraft(client, system, `${context}\n\nThe team explains the experiment in their own words:\n"""\n${opts.userText.trim()}\n"""${closing}`);

  draft.clarifying_questions = finalPass ? [] : (draft.clarifying_questions ?? []).slice(0, 2);
  draft.readiness = clampReadiness(draft.readiness);

  // ENFORCE THE CONTRACT IN CODE, not just the prompt: an under-confident first
  // draft with no questions is invalid (the model reliably ignores the "ask
  // when unsure" instruction because it can always produce a full draft). When
  // that happens, make a focused follow-up that ONLY extracts the questions.
  if (!finalPass && draft.readiness < READY && draft.clarifying_questions.length === 0) {
    const repair = await runDraft(client, system,
      `${context}\n\nYou drafted this brief and scored your own readiness at ${draft.readiness}/100 — below ${READY}, which means you are guessing about something that changes what gets built. You returned NO clarifying questions, which contradicts that score.\n\nYour draft:\n"""\n${JSON.stringify({ brief: draft.brief, hypothesis: draft.hypothesis, metrics: draft.metrics }, null, 2)}\n"""\n\nReturn the SAME brief unchanged, but now with 1–2 specific clarifying_questions naming exactly what is holding your confidence below ${READY} (the concrete unknowns — trigger, audience, data source, the decision metric — not vague ones). Keep the same readiness.`);
    const qs = (repair.clarifying_questions ?? []).map((q) => q.trim()).filter(Boolean).slice(0, 2);
    if (qs.length) draft.clarifying_questions = qs;
    else draft.readiness = READY; // model insists it has nothing to ask → it's actually confident; make the score honest
  }
  return draft;
}

function clampReadiness(r: unknown): number {
  return Math.max(0, Math.min(100, Math.round(Number(r) || 0)));
}

/**
 * Coalesce the model's tool output into a COMPLETE BriefDraft. A forced tool
 * call does not hard-guarantee every nested required field is present, and a
 * missing one (e.g. `hypothesis`) crashed the composer's render (black screen).
 * Normalizing here — at the boundary — means the UI can never receive a partial
 * shape, no matter what the model returns.
 */
function normalizeDraft(d: unknown): BriefDraft {
  const o = (d ?? {}) as Partial<BriefDraft>;
  const b = (o.brief ?? {}) as Partial<BriefDraft["brief"]>;
  const h = (o.hypothesis ?? {}) as Partial<BriefDraft["hypothesis"]>;
  const m = (o.metrics ?? {}) as Partial<BriefDraft["metrics"]>;
  return {
    brief: {
      change: b.change ?? "",
      problem: b.problem ?? "",
      where: b.where ?? "",
      doneLooksLike: Array.isArray(b.doneLooksLike) ? b.doneLooksLike.filter((x) => typeof x === "string") : [],
      constraints: b.constraints ?? "",
    },
    hypothesis: { change: h.change ?? "", audience: h.audience ?? "", outcome: h.outcome ?? "", rationale: h.rationale ?? "" },
    metrics: { primary: m.primary ?? "", guardrails: Array.isArray(m.guardrails) ? m.guardrails.filter((x) => typeof x === "string") : [] },
    clarifying_questions: Array.isArray(o.clarifying_questions) ? o.clarifying_questions.filter((x) => typeof x === "string") : [],
    readiness: clampReadiness(o.readiness),
  };
}

async function runDraft(client: Anthropic, system: string, content: string): Promise<BriefDraft> {
  const res = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 3000,
    system,
    messages: [{ role: "user", content }],
    tools: [DRAFT_TOOL],
    tool_choice: { type: "tool", name: "draft_brief" },
  });
  const tu = res.content.find((c) => c.type === "tool_use");
  if (!tu || tu.type !== "tool_use") throw new Error("The model returned no draft — try again.");
  return normalizeDraft(tu.input);
}

/** The brief sections a user can correct in place. */
export type BriefSection = "change" | "where" | "doneLooksLike" | "hypothesis" | "metrics";
const SECTION_LABEL: Record<BriefSection, string> = {
  change: "the change (what we're building)",
  where: "where it lives / the trigger",
  doneLooksLike: "the acceptance criteria (done looks like)",
  hypothesis: "the hypothesis",
  metrics: "the success metrics",
};

/**
 * Refine ONE section of an existing brief from the user's correction — the
 * "this is wrong because…" loop. Returns the full revised draft (so a fix that
 * resolves a misunderstanding can ripple into related fields and re-score
 * readiness), but the model is told to touch only what the correction implies
 * and leave everything else verbatim.
 */
export async function refineBrief(opts: {
  orgId: string | null;
  proto: PrototypeRecord;
  current: BriefDraft;
  section: BriefSection;
  correction: string;
  references?: BriefReference[];
}): Promise<BriefDraft> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY isn't set on the server — add it in Vercel → Settings → Environment Variables to enable AI brief drafting.");
  }
  await ensureSkillsSeeded(opts.orgId);
  const skill = await getSkill(opts.orgId, "opmc-brief-author");
  const system = skill ? parseFrontmatter(skill.body).body : "You write structured, falsifiable A/B experiment briefs for client-side injected variations.";

  const refs = opts.references ?? opts.proto.brief.references ?? [];
  const context = [
    `Prototype name: ${opts.proto.name}`,
    opts.proto.targets.length ? `Target page(s): ${opts.proto.targets.map((t) => t.url).join(", ")}` : "Target pages: none set yet",
    refs.length ? `Supporting references: ${refs.map((r) => `${r.kind}: ${r.label ? `${r.label} (${r.url})` : r.url}`).join("; ")}` : "",
  ].filter(Boolean).join("\n");

  const { clarifying_questions: _q, ...briefNoQ } = opts.current;
  void _q;

  const client = new Anthropic();
  const res = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 3000,
    system,
    messages: [{
      role: "user",
      content: `${context}\n\nHere is the current brief you drafted:\n"""\n${JSON.stringify(briefNoQ, null, 2)}\n"""\n\nThe user is correcting **${SECTION_LABEL[opts.section]}**. In their words:\n"""\n${opts.correction.trim()}\n"""\n\nThis is a REFINEMENT, not a redraft: apply the correction to that section, let it ripple ONLY into fields it genuinely changes (e.g. a fixed audience updates the hypothesis), and leave every other field EXACTLY as it is — same wording. Return the complete brief. Return clarifying_questions as an empty array (this is a correction, not a question round). Re-score readiness honestly for the corrected brief.`,
    }],
    tools: [DRAFT_TOOL],
    tool_choice: { type: "tool", name: "draft_brief" },
  });

  const tu = res.content.find((c) => c.type === "tool_use");
  if (!tu || tu.type !== "tool_use") throw new Error("The model returned no revision — try again.");
  const draft = tu.input as BriefDraft;
  draft.clarifying_questions = [];
  draft.readiness = Math.max(0, Math.min(100, Math.round(Number(draft.readiness) || 0)));
  return draft;
}

// ────────────────────────────────────────────────────────────────────────────
// Drift check — does the brief still describe what was actually built?
// The console can't compare prose to code; its API-side Claude can. It reads
// the brief AND the built variation.js and reports the specific mismatches,
// plus suggested DESIGN-layer fields (intent — metrics/hypothesis — stays
// human-owned and is only flagged, never rewritten).
// ────────────────────────────────────────────────────────────────────────────

export interface BriefDriftReport {
  inSync: boolean;
  /** One honest sentence: the verdict. */
  summary: string;
  mismatches: { aspect: string; briefSays: string; buildDoes: string }[];
  /** Updated design-layer fields matching the build — applied only by a human click. */
  suggested?: { change: string; where: string; doneLooksLike: string[] };
}

const DRIFT_TOOL = {
  name: "report_drift",
  description: "Report whether the brief still describes the built implementation.",
  input_schema: {
    type: "object" as const,
    properties: {
      inSync: { type: "boolean" as const, description: "true only if a stranger reading the brief would correctly understand what this code does" },
      summary: { type: "string" as const, description: "One sentence: the verdict, concrete." },
      mismatches: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            aspect: { type: "string" as const, description: "short label, e.g. 'trigger', 'layout', 'CTA'" },
            briefSays: { type: "string" as const },
            buildDoes: { type: "string" as const },
          },
          required: ["aspect", "briefSays", "buildDoes"],
        },
      },
      suggested: {
        type: "object" as const,
        description: "Updated DESIGN-layer brief fields describing what was actually built. Omit when inSync.",
        properties: {
          change: { type: "string" as const },
          where: { type: "string" as const },
          doneLooksLike: { type: "array" as const, items: { type: "string" as const } },
        },
        required: ["change", "where", "doneLooksLike"],
      },
    },
    required: ["inSync", "summary", "mismatches"],
  },
};

/** Data URIs and megabyte bundles bloat the prompt without adding evidence. */
function trimCodeForAudit(js: string): string {
  const stripped = js.replace(/data:[a-zA-Z0-9/+;=.-]{300,}/g, "data:<inlined-asset-stripped>");
  return stripped.length > 90_000 ? `${stripped.slice(0, 90_000)}\n/* …truncated for audit (${stripped.length.toLocaleString()} chars total) */` : stripped;
}

export async function checkBriefDrift(opts: {
  orgId: string | null;
  proto: PrototypeRecord;
  variationJs: string;
  builtSha?: string;
}): Promise<BriefDriftReport> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY isn't set on the server — add it in Vercel → Settings → Environment Variables.");
  }
  const client = new Anthropic();
  const res = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 2500,
    system: "You audit experiment briefs against their shipped implementation. You read client-side variation code (DOM selectors, injected markup, text content, event wiring) as evidence of what was actually built, and judge whether the brief still describes it. Be concrete and terse; cite only what the code evidences — never invent behavior you cannot see in the code. The hypothesis and metrics are the humans' contract: flag a mismatch if the code contradicts them (e.g. the CTA the metric counts does not exist), but never propose rewriting them.",
    messages: [{
      role: "user",
      content: `Prototype: ${opts.proto.name}${opts.builtSha ? ` · built at ${opts.builtSha.slice(0, 7)}` : ""}
Target page(s): ${opts.proto.targets.map((t) => t.url).join(", ") || "none set"}

THE BRIEF (current, live):
"""
${JSON.stringify({ brief: opts.proto.brief, hypothesis: opts.proto.hypothesis, metrics: opts.proto.metrics }, null, 2)}
"""

THE BUILT CODE (dist/variation.js from the branch):
"""
${trimCodeForAudit(opts.variationJs)}
"""

Compare them. Report inSync + the specific mismatches (aspect · brief says · build does). If out of sync, propose updated DESIGN-layer fields (change, where, doneLooksLike) that describe what was ACTUALLY built — terse, reviewer-checkable, same voice as a good brief. Do not touch hypothesis or metrics in the suggestion.`,
    }],
    tools: [DRIFT_TOOL],
    tool_choice: { type: "tool", name: "report_drift" },
  });

  const tu = res.content.find((c) => c.type === "tool_use");
  if (!tu || tu.type !== "tool_use") throw new Error("The audit returned nothing — try again.");
  // Normalize at the boundary — never hand the UI a partial shape.
  const o = (tu.input ?? {}) as Partial<BriefDriftReport>;
  const mismatches = Array.isArray(o.mismatches)
    ? o.mismatches.filter((m) => m && typeof m === "object").map((m) => ({
        aspect: String(m.aspect ?? "—"), briefSays: String(m.briefSays ?? ""), buildDoes: String(m.buildDoes ?? ""),
      }))
    : [];
  const s = o.suggested;
  return {
    inSync: Boolean(o.inSync) && mismatches.length === 0,
    summary: String(o.summary ?? (mismatches.length ? "The brief no longer matches the build." : "The brief matches the build.")),
    mismatches,
    suggested: s && typeof s === "object"
      ? { change: String(s.change ?? ""), where: String(s.where ?? ""), doneLooksLike: Array.isArray(s.doneLooksLike) ? s.doneLooksLike.filter((x) => typeof x === "string") : [] }
      : undefined,
  };
}
