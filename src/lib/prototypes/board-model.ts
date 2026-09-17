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

/**
 * A TEST'S COLOUR, DERIVED FROM ITS ID. Arms of one A/B/n test land in
 * different columns — one still building, one in review, one pushed — so they
 * cannot be tied together by adjacency. A stable colour can do it across the
 * whole board and down the table at once, and deriving it from the id means no
 * palette to assign, no state to keep, and the same test is the same colour on
 * every screen and after every reload.
 *
 * Hue only: saturation and lightness are fixed so every group sits at the same
 * weight and none of them competes with the severity colours, which are the
 * ones that actually mean something.
 */
export function armHue(groupId: string): number {
  let h = 0;
  for (let i = 0; i < groupId.length; i++) h = (h * 31 + groupId.charCodeAt(i)) % 360;
  return h;
}
export const armColor = (groupId: string) => `hsl(${armHue(groupId)} 70% 62%)`;

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
  /** Where on the page it goes (brief.where) — the tracker's "Website Area". */
  where?: string;
  /** The hypothesis in full, so the table can read like the plan it came from. */
  audience?: string;
  outcome?: string;
  /** The guardrails themselves, not just how many. */
  guardrails?: string[];
  /** Supporting files on the brief — a build input, so it belongs in the list. */
  attachmentCount?: number;
  /** A/B/n membership, resolved across the org so a card knows its own position. */
  arm?: {
    groupId: string;
    groupName?: string;
    /** 1-based, ordered the way the board orders anything: priority, then name. */
    index: number;
    count: number;
    /** The arms disagree about which Optimizely experiment they belong to.
     *  Two arms bound to different experiments is not an A/B/n test. */
    split?: boolean;
  };
  versionCount?: number;
  owner?: string;
  priority?: number;
}
