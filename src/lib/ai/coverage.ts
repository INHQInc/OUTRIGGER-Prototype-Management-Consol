/**
 * Coverage generation — the API-side Claude derives scenarios + checks from
 * EVIDENCE: the brief (intent) and the built variation.js (real triggers,
 * states, breakpoints). Scenarios the code does NOT appear to handle are
 * marked gap:true — the most valuable output. Checks are given/when/then so a
 * browser agent can execute them on the review URL later.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { PrototypeRecord } from "../prototypes/types";
import type { CoverageScenario, CoverageDevice, TestCase } from "../prototypes/coverage";

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

/** The tool schema is built PER CALL so scenarioId is an ENUM of the real
 *  scenario ids — the API enforces membership, the model cannot invent one
 *  (an invented id used to silently drop the case at normalization). */
const testcasesTool = (scenarioIds: string[]) => ({
  name: "report_test_cases",
  description: "Return traditional test cases derived from the scenarios and the built code.",
  input_schema: {
    type: "object" as const,
    properties: {
      testCases: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            id: { type: "string" as const, description: "stable slug: tc-<scenarioId>-<n>, e.g. tc-open-overlay-from-card-1" },
            scenarioId: { type: "string" as const, enum: scenarioIds, description: "the parent scenario's id, verbatim" },
            title: { type: "string" as const },
            priority: { type: "string" as const, enum: ["core", "edge"] },
            preconditions: { type: "array" as const, items: { type: "string" as const }, description: "concrete starting state: the URL, viewport, data state" },
            steps: {
              type: "array" as const,
              items: {
                type: "object" as const,
                properties: {
                  action: { type: "string" as const, description: "one imperative, mechanical action" },
                  expect: { type: "string" as const, description: "the observable expected result of this step" },
                },
                required: ["action", "expect"],
              },
            },
            devices: { type: "array" as const, items: { type: "string" as const, enum: ["desktop", "tablet", "mobile"] } },
          },
          required: ["id", "scenarioId", "title", "priority", "preconditions", "steps", "devices"],
        },
      },
    },
    required: ["testCases"],
  },
});

/**
 * Expand the scenarios into TRADITIONAL test cases — numbered steps, each
 * with its own expected result — executable verbatim by a person following
 * the script or by a browser agent driving the review URL.
 */
export async function generateTestCases(opts: {
  proto: PrototypeRecord;
  scenarios: CoverageScenario[];
  variationJs: string;
  builtSha?: string;
}): Promise<TestCase[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY isn't set on the server — add it in Vercel → Settings → Environment Variables.");
  }
  const client = new Anthropic();
  const res = await client.messages.create({
    model: "claude-opus-4-8",
    // Test cases are VERBOSE structured output (per scenario: 1-3 cases ×
    // numbered steps × expected results). 8000 truncated real specs
    // mid-JSON — the tool input then parses to nothing and every case
    // "vanished" with a useless error.
    max_tokens: 16000,
    system: "You write TRADITIONAL test cases for client-side injected web experiments: per scenario, 1–3 concrete step-scripts a QA analyst executes verbatim. Each case: concrete preconditions (exact URL with the preview param, viewport, required data state), then numbered steps where every step is ONE mechanical action with ONE observable expected result. Ground every selector, label, and behavior in the BUILT code — never invent UI the code doesn't create. Steps must be executable by a human following the script OR a browser agent driving the page: no vague actions ('interact with the tray'), no compound steps, no unverifiable expectations. Include the scenario's edge/negative paths as their own cases where they need different steps. Keep ids stable: tc-<scenarioId>-<n>. Skip gap:true scenarios — untestable until built.",
    messages: [{
      role: "user",
      content: `Prototype: ${opts.proto.name}${opts.builtSha ? ` · built at ${opts.builtSha.slice(0, 7)}` : ""}
Review page(s) (the ?opmc preview param activates the prototype): ${opts.proto.targets.map((t) => t.url).join(", ") || "none set"}

THE SCENARIOS (parent use cases — derive test cases from these):
"""
${JSON.stringify(opts.scenarios.map((s) => ({ id: s.id, title: s.title, priority: s.priority, gap: s.gap, given: s.given, when: s.when, then: s.then, devices: s.devices, deviceNotes: s.deviceNotes })), null, 2)}
"""

THE BUILT CODE (dist/variation.js — the evidence for selectors and behavior):
"""
${trimCode(opts.variationJs)}
"""

Produce the test cases.`,
    }],
    tools: [testcasesTool(opts.scenarios.map((s) => s.id))],
    tool_choice: { type: "tool", name: "report_test_cases" },
  });

  if (res.stop_reason === "max_tokens") {
    throw new Error("Test-case generation ran out of output space mid-write. Try again — if it persists, trim the scenario list (fewer/lower-priority scenarios) and regenerate.");
  }
  const tu = res.content.find((c) => c.type === "tool_use");
  if (!tu || tu.type !== "tool_use") throw new Error("Test-case generation returned nothing — try again.");
  const raw = ((tu.input ?? {}) as { testCases?: unknown }).testCases;
  const list = Array.isArray(raw) ? raw : [];
  const scenarioIds = new Set(opts.scenarios.map((s) => s.id));
  const byScenario = new Map(opts.scenarios.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const cases: TestCase[] = [];
  let droppedOrphan = 0, droppedNoSteps = 0;
  for (const r of list) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const scenarioId = String(o.scenarioId ?? "").trim();
    if (!scenarioIds.has(scenarioId)) { droppedOrphan++; continue; } // orphan — no parent use case (the enum should make this impossible)
    if (byScenario.get(scenarioId)?.gap) continue; // gap = untestable until built — enforced in code, not just the prompt
    let id = String(o.id ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (!id) id = `tc-${scenarioId}-${cases.length + 1}`;
    while (seen.has(id)) id = `${id}-2`;
    seen.add(id);
    const steps = (Array.isArray(o.steps) ? o.steps : [])
      .filter((s): s is { action?: unknown; expect?: unknown } => Boolean(s) && typeof s === "object")
      .map((s) => ({ action: String(s.action ?? "").trim(), expect: String(s.expect ?? "").trim() }))
      .filter((s) => s.action && s.expect);
    if (!steps.length) { droppedNoSteps++; continue; }
    const parent = byScenario.get(scenarioId);
    const devices = (Array.isArray(o.devices) ? o.devices : []).filter((d): d is CoverageDevice => (DEVICES as string[]).includes(String(d)));
    cases.push({
      id,
      scenarioId,
      title: String(o.title ?? id),
      priority: o.priority === "edge" ? "edge" : "core",
      preconditions: (Array.isArray(o.preconditions) ? o.preconditions : []).filter((x): x is string => typeof x === "string" && x.trim().length > 0),
      steps,
      devices: devices.length ? devices : (parent?.devices?.length ? [...parent.devices] : [...DEVICES]),
    });
  }
  if (!cases.length) {
    // Say WHY nothing survived — "try again" with zero diagnostics sent
    // people into blind regenerate loops.
    const why = list.length === 0
      ? "the model returned an empty list"
      : `all ${list.length} returned cases were dropped (${droppedOrphan} with unknown scenario ids, ${droppedNoSteps} without usable steps)`;
    throw new Error(`Test-case generation produced no runnable cases — ${why}. Try again; if it persists, regenerate the QA scenarios first.`);
  }
  return cases;
}
