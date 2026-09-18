/**
 * Client-safe board model — columns + card shape only, NO server imports.
 * (The client ProgramBoard value-imports BOARD_COLUMNS; if it lived next to
 * the store/undici code in board.ts, the whole server graph would get pulled
 * into the client bundle and the build fails.)
 */
import type { Pipeline } from "./pipeline";
import type { DerivedPriority } from "./score";

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
  /** MANUAL RANK inside the column — what drag-to-reorder writes. Lower first. */
  priority?: number;
  /** RICE, derived once in score.ts. Every surface reads this; none recompute it. */
  score?: DerivedPriority;
  createdAt?: string;
  updatedAt?: string;
}

// ── SORTING — one list of definitions, both views ──────────────────────────
//
// The board's sort menu and the table's clickable headers were always going to
// drift apart if each owned its own comparators, and two screens that disagree
// about what "most urgent" means is exactly the confusion the score exists to
// remove. So the orders live here, once, as data.

export type SortId = "priority" | "score" | "effort" | "alerts" | "stale" | "newest" | "name";

const riceOf = (c: BoardCard) => c.score?.rice ?? null;
/** Highest score first; an UNSCORED card sorts last rather than as a zero —
 *  "we have not judged this yet" is a different statement from "it scored badly". */
const byScore = (a: BoardCard, b: BoardCard) => {
  const x = riceOf(a), y = riceOf(b);
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return y - x;
};
const byName = (a: BoardCard, b: BoardCard) => a.name.localeCompare(b.name);
const blocked = (c: BoardCard) => c.pipeline.steps.some((s) => s.state === "blocked");
const warnCount = (c: BoardCard) => c.pipeline.alerts.filter((a) => a.level === "warn").length;

export const BOARD_SORTS: { id: SortId; label: string; hint: string; compare: (a: BoardCard, b: BoardCard) => number }[] = [
  {
    id: "priority", label: "Priority", hint: "your order where you set one, the score everywhere else",
    // THE DEFAULT, AND THE ONE THAT KEEPS DRAG WORKING. A hand-dragged column
    // has a rank on every card and keeps the order a person chose; a column
    // nobody has touched has no ranks at all and falls through to the score.
    // A new card joining a hand-ordered column lands at the bottom until it is
    // dragged, which is how every board behaves and is the only placement that
    // cannot silently reshuffle somebody's decision.
    compare: (a, b) => (a.priority ?? 1e9) - (b.priority ?? 1e9) || byScore(a, b) || byName(a, b),
  },
  { id: "score",  label: "Score",      hint: "RICE, highest first — ignores hand-ordering", compare: (a, b) => byScore(a, b) || byName(a, b) },
  { id: "effort", label: "Quickest",   hint: "least build effort first — the Friday afternoon list",
    compare: (a, b) => (a.score?.effortDays ?? 1e9) - (b.score?.effortDays ?? 1e9) || byScore(a, b) || byName(a, b) },
  { id: "alerts", label: "Needs you",  hint: "blocked first, then warnings",
    compare: (a, b) => Number(blocked(b)) - Number(blocked(a)) || warnCount(b) - warnCount(a) || byScore(a, b) || byName(a, b) },
  { id: "stale",  label: "Stalest",    hint: "longest untouched first — what the programme forgot",
    compare: (a, b) => (a.updatedAt ?? "").localeCompare(b.updatedAt ?? "") || byName(a, b) },
  { id: "newest", label: "Newest",     hint: "most recently created first",
    compare: (a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || byName(a, b) },
  { id: "name",   label: "Name",       hint: "A–Z", compare: byName },
];

export const sortCompare = (id: SortId) =>
  (BOARD_SORTS.find((s) => s.id === id) ?? BOARD_SORTS[0]).compare;

/**
 * ARMS OF ONE TEST STAY TOGETHER, WHATEVER THE SORT. Scattering four arms of a
 * six-way test down a list by their individual scores is not "tied together" —
 * and arms share one decision metric, so they are one queue item, not four.
 * The group takes its best arm's position and the arms follow in arm order.
 */
export function sortCards(cards: BoardCard[], id: SortId): BoardCard[] {
  const cmp = sortCompare(id);
  const best = new Map<string, BoardCard>();
  for (const c of cards) {
    const g = c.arm?.groupId;
    if (!g) continue;
    const held = best.get(g);
    if (!held || cmp(c, held) < 0) best.set(g, c);
  }
  // A card's sort position is its group's leader (itself, when it is solo).
  const lead = (c: BoardCard) => (c.arm?.groupId ? best.get(c.arm.groupId) ?? c : c);
  return [...cards].sort((a, b) => {
    const la = lead(a), lb = lead(b);
    if (la.key !== lb.key) return cmp(la, lb);
    // Same group → arm order, which is the only order inside a test that means
    // anything.
    return (a.arm?.index ?? 0) - (b.arm?.index ?? 0);
  });
}
