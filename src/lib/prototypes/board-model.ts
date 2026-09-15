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

/**
 * Append the ?opmc token that wakes the loader for this prototype. The loader
 * tag sits inert in the site template until a page carries it, so this — not
 * the bare URL — is the only link that shows the build.
 */
export function withOpmcToken(url: string, key: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("opmc", key);
    return u.toString();
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}opmc=${encodeURIComponent(key)}`;
  }
}

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
  /** SEE IT, DON'T TAKE OUR WORD FOR IT. The target page with ?opmc=<key> —
   *  opens the current build on the real site. Absent until a target is set. */
  previewUrl?: string;
  /** How many target pages exist; previewUrl opens the verified one (or the
   *  first). Lets the row say "1 of 3" instead of implying there is only one. */
  targetCount?: number;
  /** The bound experiment in the experimentation platform, running or not. */
  experimentUrl?: string;
}
