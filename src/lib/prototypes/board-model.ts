/**
 * Client-safe board model — columns + card shape only, NO server imports.
 * (The client ProgramBoard value-imports BOARD_COLUMNS; if it lived next to
 * the store/undici code in board.ts, the whole server graph would get pulled
 * into the client bundle and the build fails.)
 */
import type { Pipeline } from "./pipeline";

// The ONE canonical stage list — identical to the pipeline steps and the tabs.
// NOTE: the first column's ID stays `brief` and the STEP is still called Brief
// everywhere else (the workspace room, the tab, the checklist, the alert
// anchors). Only the board column is labelled Backlog, because a column is a
// queue — the work waiting to be written — while the step is the thing you
// write. Renaming the id would rename the room too, which is not the ask.
export type BoardColumn = "brief" | "build" | "review" | "experiment" | "handoff" | "deployed" | "archived";

export const BOARD_COLUMNS: { id: BoardColumn; label: string; hint: string }[] = [
  { id: "brief", label: "Backlog", hint: "waiting on a brief — what & why" },
  { id: "build", label: "Build", hint: "agent at work in the repo" },
  { id: "review", label: "Review", hint: "verifying on the real site" },
  { id: "experiment", label: "Experimentation", hint: "cut · push · run (locked when live)" },
  { id: "handoff", label: "Handoff", hint: "winner → production code" },
  // PAST THE PIPELINE. Neither of these is a step — no work happens in them and
  // derivePipeline knows nothing about them. Handoff was doing two jobs: "we
  // chose a winner and gave it to the dev team" (a decision, ours) and "the dev
  // team shipped it" (a fact about production, weeks later, not ours). Deployed
  // separates them. Archived is where everything else ends — above all a LOSING
  // experiment, which could not be handed off and so had nowhere to go but the
  // column it ran in.
  { id: "deployed", label: "Deployed", hint: "live in production" },
  { id: "archived", label: "Archived", hint: "closed out — no work left" },
];

/** Pipeline order. A card may be placed at or before its derived column, never past it. */
export const COLUMN_RANK: Record<BoardColumn, number> =
  BOARD_COLUMNS.reduce((m, c, i) => ({ ...m, [c.id]: i }), {} as Record<BoardColumn, number>);

export interface BoardCard {
  key: string;
  name: string;
  /** Where the card SITS — the derived column, or an earlier one a human parked it in. */
  column: BoardColumn;
  /** Where the FACTS put it. The ceiling for any drag: you can go back, never past this. */
  derivedColumn: BoardColumn;
  /** True when a human is holding it behind the facts (column !== derivedColumn). */
  held?: boolean;
  /** ISO date someone recorded the winner as live in production. */
  deployedAt?: string;
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
