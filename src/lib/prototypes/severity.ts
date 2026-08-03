/**
 * Client-safe severity model — the four-color status vocabulary, split out so
 * client components (ProgramBoard, PrototypeTable) can value-import it without
 * pulling pipeline.ts's server graph (store/auth) into the browser bundle.
 * Only TYPE imports here, so this module has zero runtime dependencies.
 */
import type { PipelineStep, PipelineAlert } from "./pipeline";

/**
 * The one status vocabulary every surface uses — dots and the Overview checklist:
 *   critical  🔴  blocked — no way forward until it's fixed
 *   attention 🟠  needs you now — the active step, or a warning on a done one
 *   good      🟢  done and verified
 *   pending   ⚪  not started yet
 *   na        ◌   not applicable — the stage doesn't exist for this prototype
 *                 (externally-built experiments have no Build/Review/Handoff)
 */
export type StepSeverity = "critical" | "attention" | "good" | "pending" | "na";

export function stepSeverity(step: PipelineStep, alerts: PipelineAlert[]): StepSeverity {
  if (step.na) return "na"; // n/a beats everything — an alert can't target a stage that doesn't exist
  if (step.state === "blocked") return "critical";
  const targeting = alerts.filter((a) => a.anchor === step.anchor);
  if (targeting.some((a) => a.level === "danger")) return "critical";
  if (targeting.some((a) => a.level === "warn")) return "attention";
  if (step.state === "current") return "attention";
  if (step.state === "done") return "good";
  return "pending";
}
