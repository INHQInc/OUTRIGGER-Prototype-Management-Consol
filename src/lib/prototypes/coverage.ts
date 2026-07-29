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

export interface CoverageSpec {
  scenarios: CoverageScenario[];
  generatedAt: string;
  generatedBy?: string;
  /** The build the spec was derived from — differs from HEAD ⇒ stale. */
  builtSha?: string;
  /** scenarioId → device → result. Empty/missing = unreviewed. */
  results: Record<string, Partial<Record<CoverageDevice, CheckResult>>>;
}

const key = (prototypeKey: string) => `coverage:${prototypeKey}`;

export async function getCoverage(prototypeKey: string): Promise<CoverageSpec | null> {
  const raw = await (await getContentStore()).getFlag(key(prototypeKey));
  if (!raw) return null;
  try {
    const spec = JSON.parse(raw) as CoverageSpec;
    if (!Array.isArray(spec.scenarios)) return null;
    spec.results = spec.results && typeof spec.results === "object" ? spec.results : {};
    return spec;
  } catch { return null; }
}

export async function setCoverage(prototypeKey: string, spec: CoverageSpec): Promise<void> {
  await (await getContentStore()).setFlag(key(prototypeKey), JSON.stringify(spec));
}

/** Reviewed = every CORE scenario has a result on every one of its devices. */
export function coverageReviewed(spec: CoverageSpec): boolean {
  return spec.scenarios
    .filter((s) => s.priority === "core")
    .every((s) => s.devices.every((d) => Boolean(spec.results[s.id]?.[d])));
}

export function coverageHasFailures(spec: CoverageSpec): boolean {
  // Keyed by the scenario's CURRENT devices — a result orphaned by a
  // regeneration (device dropped, id survived) must not wedge the gate,
  // because the UI has no cell to clear it with.
  return spec.scenarios.some((s) => s.devices.some((d) => spec.results[s.id]?.[d] === "fail"));
}

/** The push-gate state: fine · unreviewed (needs ack) · failing (needs ack). */
export function coverageGate(spec: CoverageSpec | null): "none" | "unreviewed" | "failing" | "ok" {
  if (!spec || spec.scenarios.length === 0) return "none";
  if (coverageHasFailures(spec)) return "failing";
  return coverageReviewed(spec) ? "ok" : "unreviewed";
}

export function coverageStale(spec: CoverageSpec | null, currentSha?: string | null): boolean {
  return Boolean(spec?.builtSha && currentSha && spec.builtSha !== currentSha);
}

export type { PrototypeRecord };
