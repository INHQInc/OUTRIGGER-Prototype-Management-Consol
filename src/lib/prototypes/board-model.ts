/**
 * Client-safe board model — columns + card shape only, NO server imports.
 * (The client ProgramBoard value-imports BOARD_COLUMNS; if it lived next to
 * the store/undici code in board.ts, the whole server graph would get pulled
 * into the client bundle and the build fails.)
 */
import type { Pipeline } from "./pipeline";

// The ONE canonical stage list — identical to the pipeline steps and the tabs.
export type BoardColumn = "brief" | "build" | "review" | "experiment" | "handoff";

export const BOARD_COLUMNS: { id: BoardColumn; label: string; hint: string }[] = [
  { id: "brief", label: "Brief", hint: "what & why being written" },
  { id: "build", label: "Build", hint: "agent at work in the repo" },
  { id: "review", label: "Review", hint: "verifying on the real site" },
  { id: "experiment", label: "Experimentation", hint: "cut · push · run (locked when live)" },
  { id: "handoff", label: "Handoff", hint: "winner → production code" },
];

export interface BoardCard {
  key: string;
  name: string;
  column: BoardColumn;
  locked: boolean;               // experiment running → immutable
  experimentStatus?: string;     // not_started | running | paused | archived
  pipeline: Pipeline;
  metric?: string;
  guardrailCount?: number;
  hypothesis?: string;
  /** The brief's change, one line — the table's description row. */
  description?: string;
  versionCount?: number;
  owner?: string;
  priority?: number;
}
