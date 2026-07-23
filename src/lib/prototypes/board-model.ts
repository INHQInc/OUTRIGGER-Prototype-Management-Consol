/**
 * Client-safe board model — columns + card shape only, NO server imports.
 * (The client ProgramBoard value-imports BOARD_COLUMNS; if it lived next to
 * the store/undici code in board.ts, the whole server graph would get pulled
 * into the client bundle and the build fails.)
 */
import type { Pipeline } from "./pipeline";

export type BoardColumn = "brief" | "build" | "review" | "launch" | "testing" | "shipped";

export const BOARD_COLUMNS: { id: BoardColumn; label: string; hint: string }[] = [
  { id: "brief", label: "Brief", hint: "what & why being written" },
  { id: "build", label: "Build", hint: "agent at work in the repo" },
  { id: "review", label: "Review", hint: "verifying on the real site" },
  { id: "launch", label: "Launch", hint: "cut · certify · push · start" },
  { id: "testing", label: "Testing", hint: "experiment LIVE — locked" },
  { id: "shipped", label: "Shipped", hint: "winner in production code" },
];

export interface BoardCard {
  key: string;
  name: string;
  column: BoardColumn;
  locked: boolean;               // experiment running → immutable
  experimentStatus?: string;     // not_started | running | paused | archived
  pipeline: Pipeline;
  metric?: string;
  hypothesis?: string;
  owner?: string;
  priority?: number;
}
