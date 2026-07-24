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
import type { PrototypeRecord } from "../prototypes/types";

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
      clarifying_questions: { type: "array" as const, items: { type: "string" as const }, description: "OPTIONAL and rare — usually empty. At most 2, only on the first draft, and only for a missing answer that would change what gets built. MUST be empty when the user has already answered earlier questions." },
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
}): Promise<BriefDraft> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY isn't set on the server — add it in Vercel → Settings → Environment Variables to enable AI brief drafting.");
  }
  await ensureSkillsSeeded(opts.orgId);
  const skill = await getSkill(opts.orgId, "opmc-brief-author");
  const system = skill ? parseFrontmatter(skill.body).body : "You write structured, falsifiable A/B experiment briefs for client-side injected variations.";

  const context = [
    `Prototype name: ${opts.proto.name}`,
    opts.proto.targets.length ? `Target page(s): ${opts.proto.targets.map((t) => t.url).join(", ")}` : "Target pages: none set yet",
    opts.proto.brief.change ? `Existing brief (improve, don't discard what's right): ${JSON.stringify(opts.proto.brief)}` : "",
    opts.proto.metrics.primary ? `Existing primary metric: ${opts.proto.metrics.primary}` : "",
  ].filter(Boolean).join("\n");

  // The answers pass is TERMINAL: the user has answered once, so this draft is
  // final and asks nothing further. Told to the model AND enforced below, so an
  // endless question loop is structurally impossible, not just discouraged.
  const finalPass = Boolean(opts.answers?.trim());
  const closing = finalPass
    ? `\n\nAnswers to your earlier clarifying questions:\n"""\n${opts.answers!.trim()}\n"""\n\nThis is the FINAL draft — you now have enough. Commit to the brief and return clarifying_questions as an empty array; do not ask anything new.`
    : `\n\nDraft the complete brief now. Only include a clarifying question if a missing answer would genuinely change what gets built — otherwise return clarifying_questions empty.`;

  const client = new Anthropic();
  const res = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 3000,
    system,
    messages: [{
      role: "user",
      content: `${context}\n\nThe team explains the experiment in their own words:\n"""\n${opts.userText.trim()}\n"""${closing}`,
    }],
    tools: [DRAFT_TOOL],
    tool_choice: { type: "tool", name: "draft_brief" },
  });

  const tu = res.content.find((c) => c.type === "tool_use");
  if (!tu || tu.type !== "tool_use") throw new Error("The model returned no draft — try again.");
  const draft = tu.input as BriefDraft;

  // Hard backstop: the answers pass never returns questions, and the first pass
  // is capped at 2. The model's doctrine says the same; this makes it true.
  draft.clarifying_questions = finalPass ? [] : (draft.clarifying_questions ?? []).slice(0, 2);
  draft.readiness = Math.max(0, Math.min(100, Math.round(Number(draft.readiness) || 0)));
  return draft;
}
