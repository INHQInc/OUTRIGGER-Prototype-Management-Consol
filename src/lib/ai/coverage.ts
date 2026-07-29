/**
 * Coverage generation — the API-side Claude derives scenarios + checks from
 * EVIDENCE: the brief (intent) and the built variation.js (real triggers,
 * states, breakpoints). Scenarios the code does NOT appear to handle are
 * marked gap:true — the most valuable output. Checks are given/when/then so a
 * browser agent can execute them on the review URL later.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { PrototypeRecord } from "../prototypes/types";
import type { CoverageScenario, CoverageDevice } from "../prototypes/coverage";

const DEVICES: CoverageDevice[] = ["desktop", "tablet", "mobile"];

const COVERAGE_TOOL = {
  name: "report_coverage",
  description: "Return the coverage spec derived from the brief and the built code.",
  input_schema: {
    type: "object" as const,
    properties: {
      scenarios: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            id: { type: "string" as const, description: "stable kebab-case slug, e.g. open-overlay-from-card" },
            title: { type: "string" as const },
            priority: { type: "string" as const, enum: ["core", "edge"] },
            gap: { type: "boolean" as const, description: "TRUE if the built code does not appear to handle this scenario" },
            given: { type: "string" as const },
            when: { type: "string" as const },
            then: { type: "array" as const, items: { type: "string" as const }, description: "each independently checkable on the live page" },
            devices: { type: "array" as const, items: { type: "string" as const, enum: ["desktop", "tablet", "mobile"] } },
            deviceNotes: { type: "string" as const, description: "device-specific expected behavior, if any" },
          },
          required: ["id", "title", "priority", "given", "when", "then", "devices"],
        },
      },
    },
    required: ["scenarios"],
  },
};

function trimCode(js: string): string {
  const stripped = js.replace(/data:[a-zA-Z0-9/+;=.-]{300,}/g, "data:<inlined-asset-stripped>");
  return stripped.length > 90_000 ? `${stripped.slice(0, 90_000)}\n/* …truncated (${stripped.length.toLocaleString()} chars) */` : stripped;
}

export async function generateCoverage(opts: {
  proto: PrototypeRecord;
  variationJs: string;
  builtSha?: string;
}): Promise<CoverageScenario[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY isn't set on the server — add it in Vercel → Settings → Environment Variables.");
  }
  const client = new Anthropic();
  const res = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 6000,
    system: "You write coverage specs for client-side injected web experiments: the complete set of scenarios (use cases) with checkable acceptance tests, derived from the brief and the BUILT code. Read the code as evidence — its actual triggers, selectors, states, breakpoints, keyboard/escape handling, observers, fetches. Cover: core user flows; edge states the page data implies (missing images/fields, empty lists); device-specific behavior (breakpoints found in the code, touch vs hover); interaction hygiene (Esc, backdrop, back button, focus, scroll restore); resilience (re-render survival, late/early injection); and the brief's constraints as guardrail checks. Mark gap:true on any scenario the code does NOT visibly handle — finding gaps is the point. Every `then` must be checkable by a person (or a browser agent) looking at the live page. Terse, concrete, no filler scenarios. 6–14 scenarios.",
    messages: [{
      role: "user",
      content: `Prototype: ${opts.proto.name}${opts.builtSha ? ` · built at ${opts.builtSha.slice(0, 7)}` : ""}
Target page(s): ${opts.proto.targets.map((t) => t.url).join(", ") || "none set"}

THE BRIEF:
"""
${JSON.stringify({ brief: opts.proto.brief, hypothesis: opts.proto.hypothesis, metrics: opts.proto.metrics }, null, 2)}
"""

THE BUILT CODE (dist/variation.js):
"""
${trimCode(opts.variationJs)}
"""

Produce the coverage spec.`,
    }],
    tools: [COVERAGE_TOOL],
    tool_choice: { type: "tool", name: "report_coverage" },
  });

  const tu = res.content.find((c) => c.type === "tool_use");
  if (!tu || tu.type !== "tool_use") throw new Error("Coverage generation returned nothing — try again.");
  // Normalize at the boundary — the UI never receives a partial shape.
  const raw = ((tu.input ?? {}) as { scenarios?: unknown }).scenarios;
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const scenarios: CoverageScenario[] = [];
  for (const r of list) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    let id = String(o.id ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (!id) id = `scenario-${scenarios.length + 1}`;
    while (seen.has(id)) id = `${id}-2`;
    seen.add(id);
    const devices = (Array.isArray(o.devices) ? o.devices : []).filter((d): d is CoverageDevice => (DEVICES as string[]).includes(String(d)));
    scenarios.push({
      id,
      title: String(o.title ?? id),
      priority: o.priority === "edge" ? "edge" : "core",
      gap: Boolean(o.gap) || undefined,
      given: String(o.given ?? ""),
      when: String(o.when ?? ""),
      then: (Array.isArray(o.then) ? o.then : []).filter((x): x is string => typeof x === "string"),
      devices: devices.length ? devices : [...DEVICES],
      deviceNotes: typeof o.deviceNotes === "string" && o.deviceNotes.trim() ? o.deviceNotes.trim() : undefined,
    });
  }
  if (!scenarios.length) throw new Error("Coverage generation produced no scenarios — try again.");
  return scenarios;
}
