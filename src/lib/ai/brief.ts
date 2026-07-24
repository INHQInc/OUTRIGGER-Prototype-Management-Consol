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
      clarifying_questions: { type: "array" as const, items: { type: "string" as const } },
    },
    required: ["brief", "hypothesis", "metrics", "clarifying_questions"],
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

  const client = new Anthropic();
  const res = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 3000,
    system,
    messages: [{
      role: "user",
      content: `${context}\n\nThe team explains the experiment in their own words:\n"""\n${opts.userText.trim()}\n"""${opts.answers ? `\n\nAnswers to your earlier clarifying questions:\n"""\n${opts.answers.trim()}\n"""` : ""}\n\nDraft the complete brief now.`,
    }],
    tools: [DRAFT_TOOL],
    tool_choice: { type: "tool", name: "draft_brief" },
  });

  const tu = res.content.find((c) => c.type === "tool_use");
  if (!tu || tu.type !== "tool_use") throw new Error("The model returned no draft — try again.");
  return tu.input as BriefDraft;
}
