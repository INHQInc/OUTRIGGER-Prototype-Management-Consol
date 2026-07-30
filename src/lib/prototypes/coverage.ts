/**
 * Coverage spec — ONE artifact for use cases AND test cases (kept together so
 * they can't drift from each other): scenarios, each carrying given/when/then
 * checks and a device matrix. Derived from EVIDENCE (brief intent + the built
 * code's real triggers/breakpoints), reviewed per device in the Coverage room,
 * frozen onto each cut, and stale-flagged when the build moves past it.
 * Checks are phrased mechanically so a browser agent can execute them later.
 */
import { getContentStore } from "../content/store";
import type { PrototypeRecord } from "./types";

export type CoverageDevice = "desktop" | "tablet" | "mobile";
export type CheckResult = "pass" | "fail" | "na";

export interface CoverageScenario {
  id: string;                       // slug, stable across regenerations when possible
  title: string;
  priority: "core" | "edge";
  /** TRUE when the audit believes the built code does NOT handle this — the gold. */
  gap?: boolean;
  given: string;
  when: string;
  then: string[];
  devices: CoverageDevice[];
  /** Device-specific behavior notes, e.g. "mobile: full-screen sheet". */
  deviceNotes?: string;
}

/** One numbered step of a traditional test case: do X, expect Y. */
export interface TestCaseStep {
  action: string;   // imperative, mechanical — a person or an agent can do it
  expect: string;   // the observable expected result of THIS step
}

/**
 * A traditional test case — the step-scripted layer under a scenario.
 * Derived from its parent scenario + the built code; linked by scenarioId so
 * use cases and test cases can never drift apart (one artifact, one law).
 */
export interface TestCase {
  id: string;             // stable slug: tc-<scenarioId>-<n>
  scenarioId: string;     // parent use case (must exist in spec.scenarios)
  title: string;
  priority: "core" | "edge";
  preconditions: string[];
  steps: TestCaseStep[];
  devices: CoverageDevice[];
}

export type TestStatus = "pass" | "fail" | "blocked" | "na";

/** The latest run of a test case on a device — human OR agent, one record. */
export interface TestResult {
  status: TestStatus;
  /** Actual result — on fail, observed-vs-expected. */
  note?: string;
  by: string;             // "Bryan" · "claude (agent)"
  mode: "human" | "agent";
  at: string;             // ISO
}

export interface CoverageSpec {
  scenarios: CoverageScenario[];
  generatedAt: string;
  generatedBy?: string;
  /** The build the spec was derived from (display). */
  builtSha?: string;
  /** Content hash of the CODE the spec was derived from — staleness compares
   *  this, not the branch sha, so console commits (.opmc re-syncs) that don't
   *  touch the built artifact never false-flag the spec as stale. */
  builtCodeHash?: string;
  /** scenarioId → device → result. Empty/missing = unreviewed. */
  results: Record<string, Partial<Record<CoverageDevice, CheckResult>>>;
  /** Traditional test cases (see TestCase). Absent until generated. */
  testCases?: TestCase[];
  /** testCaseId → device → latest run (human or agent, attributed). */
  testResults?: Record<string, Partial<Record<CoverageDevice, TestResult>>>;
  testsGeneratedAt?: string;
  /** The build the test cases were derived from (display). */
  testsBuiltSha?: string;
  /** Code-content hash the test cases were derived from (staleness key). */
  testsBuiltCodeHash?: string;
  /** Set when the SCENARIOS regenerate: surviving test cases may no longer
   *  match their re-derived parents — regenerate them to re-align. */
  testsStale?: boolean;
}

const key = (prototypeKey: string) => `coverage:${prototypeKey}`;

function parseSpec(raw: string): CoverageSpec | null {
  try {
    const spec = JSON.parse(raw) as CoverageSpec;
    if (!Array.isArray(spec.scenarios)) return null;
    spec.results = spec.results && typeof spec.results === "object" ? spec.results : {};
    if (spec.testCases && !Array.isArray(spec.testCases)) spec.testCases = undefined;
    if (spec.testCases) spec.testResults = spec.testResults && typeof spec.testResults === "object" ? spec.testResults : {};
    return spec;
  } catch { return null; }
}

export async function getCoverage(prototypeKey: string): Promise<CoverageSpec | null> {
  const raw = await (await getContentStore()).getFlag(key(prototypeKey));
  return raw ? parseSpec(raw) : null;
}

export async function setCoverage(prototypeKey: string, spec: CoverageSpec): Promise<void> {
  await (await getContentStore()).setFlag(key(prototypeKey), JSON.stringify(spec));
}

/**
 * Read-modify-write the spec SAFELY under concurrent writers (an agent's
 * test-run batch and a human clicking cells are separate serverless
 * invocations): compare-and-set with re-read + re-apply on a lost race.
 * `mutate` must be a pure delta (re-applicable to a fresh spec); it runs on
 * the FRESHEST spec each attempt. When no spec exists, `init` (if given)
 * seeds one; otherwise returns null.
 */
export async function mutateCoverage(
  prototypeKey: string,
  mutate: (spec: CoverageSpec) => void,
  opts: { init?: () => CoverageSpec } = {},
): Promise<CoverageSpec | null> {
  const store = await getContentStore();
  const k = key(prototypeKey);
  for (let attempt = 0; attempt < 4; attempt++) {
    const raw = await store.getFlag(k);
    const spec = raw ? parseSpec(raw) : null;
    if (!spec) {
      if (!opts.init) return null;
      const seeded = opts.init();
      mutate(seeded);
      if (await store.compareAndSetFlag(k, raw ?? null, JSON.stringify(seeded))) return seeded;
      continue; // someone created/changed it meanwhile — re-read and retry
    }
    mutate(spec);
    if (await store.compareAndSetFlag(k, raw as string, JSON.stringify(spec))) return spec;
  }
  throw new Error("The QA spec is being updated by someone else right now — try again.");
}

/** Reviewed = every CORE scenario has a result on every one of its devices. */
export function coverageReviewed(spec: CoverageSpec): boolean {
  return spec.scenarios
    .filter((s) => s.priority === "core")
    .every((s) => s.devices.every((d) => Boolean(spec.results[s.id]?.[d])));
}

export function coverageHasFailures(spec: CoverageSpec): boolean {
  // Keyed by the scenario's/case's CURRENT devices — a result orphaned by a
  // regeneration (device dropped, id survived) must not wedge the gate,
  // because the UI has no cell to clear it with. Test-case failures feed the
  // SAME gate: one gate, one truth.
  return spec.scenarios.some((s) => s.devices.some((d) => spec.results[s.id]?.[d] === "fail"))
    || (spec.testCases ?? []).some((t) => t.devices.some((d) => spec.testResults?.[t.id]?.[d]?.status === "fail"));
}

/** The push-gate state: fine · unreviewed (needs ack) · failing (needs ack). */
export function coverageGate(spec: CoverageSpec | null): "none" | "unreviewed" | "failing" | "ok" {
  if (!spec || spec.scenarios.length === 0) return "none";
  if (coverageHasFailures(spec)) return "failing";
  return coverageReviewed(spec) ? "ok" : "unreviewed";
}

/**
 * Staleness compares CODE CONTENT when both sides have a hash — a console
 * re-sync commit moves the branch sha without touching dist/variation.js and
 * must not flag anything stale. Sha comparison is the legacy fallback only.
 */
export function coverageStale(spec: CoverageSpec | null, currentSha?: string | null, currentCodeHash?: string | null): boolean {
  if (!spec) return false;
  if (spec.builtCodeHash && currentCodeHash) return spec.builtCodeHash !== currentCodeHash;
  return Boolean(spec.builtSha && currentSha && spec.builtSha !== currentSha);
}

export function testCasesStale(spec: CoverageSpec | null, currentSha?: string | null, currentCodeHash?: string | null): boolean {
  if (!spec) return false;
  if (spec.testsStale) return true; // scenarios regenerated — parents may have moved
  if (spec.testsBuiltCodeHash && currentCodeHash) return spec.testsBuiltCodeHash !== currentCodeHash;
  return Boolean(spec.testsBuiltSha && currentSha && spec.testsBuiltSha !== currentSha);
}

/** Every CORE test case has a run (any status) on every one of its devices. */
export function testCasesRun(spec: CoverageSpec): boolean {
  const cases = (spec.testCases ?? []).filter((t) => t.priority === "core");
  if (!cases.length) return false;
  return cases.every((t) => t.devices.every((d) => Boolean(spec.testResults?.[t.id]?.[d])));
}

export type { PrototypeRecord };
