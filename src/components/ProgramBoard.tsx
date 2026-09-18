"use client";

import Link from "next/link";
import { Fragment, useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, SEVERITY_DOT } from "@/components/ui";
import { BOARD_COLUMNS, COLUMN_RANK, BOARD_SORTS, sortCards, sortCompare, armColor, type BoardCard, type BoardColumn, type SortId } from "@/lib/prototypes/board-model";
import { ScoreBadge } from "@/components/ScorePanel";
import { stepSeverity } from "@/lib/prototypes/severity";
import type { Pipeline } from "@/lib/prototypes/pipeline";

/** 1st, 2nd, 3rd — for saying a queue position in words a tooltip can use. */
function ordinal(n: number): string {
  const t = n % 100;
  const suffix = t >= 11 && t <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** A column's own name, for prose. */
const LABEL = (id: BoardColumn) => BOARD_COLUMNS.find((c) => c.id === id)?.label ?? id;


/** Pointer travel before a press becomes a drag rather than a click. */
const DRAG_THRESHOLD = 5;
/** A touch must be held this long before it drags, so the page can still scroll. */
const TOUCH_HOLD_MS = 350;

function MiniPipeline({ pipeline }: { pipeline: Pipeline }) {
  return (
    <div className="flex items-center gap-1">
      {pipeline.steps.map((s) => <span key={s.id} title={`${s.title}: ${s.status}`} className={`w-1.5 h-1.5 rounded-full ${SEVERITY_DOT[stepSeverity(s, pipeline.alerts)]}`} />)}
    </div>
  );
}

/**
 * The Program Board — kanban over ground truth, with drag exactly where human
 * judgment lives and nowhere else:
 *   · reorder INSIDE a column = priority (yours to decide)
 *   · Experimentation → Handoff = "we're calling it" (yours to decide)
 *   · everything else is derived state — a wrong drag bounces with the reason.
 *
 * WHY THIS IS POINTER EVENTS AND NOT HTML5 DRAG-AND-DROP. The first version
 * used `draggable` + dataTransfer and had two defects that between them made
 * dropping feel broken (user, 08-14: "the container highlights but dropping the
 * item does not move it"):
 *
 *   1. POSITION CAME FROM WHICH CARD YOU WERE OVER, and always meant "insert
 *      before it". So dragging a card down onto the one directly below it
 *      computed the position it already had — a no-op, on the single most
 *      natural gesture on a board. Position now comes from the POINTER against
 *      each card's midpoint, which is the only thing that can express "after
 *      the last one" and "one slot down".
 *   2. THERE WAS NO INDICATOR. The card stayed where it was while a whole
 *      column lit up, so the only feedback was column-sized — it could not
 *      answer "where will this land", and a drop that landed exactly where it
 *      started was indistinguishable from one that did nothing.
 *
 * Native DnD also fought the card's own `<a>` (an anchor is natively draggable,
 * and `draggable={false}` on it left the drag source ambiguous), it can't be
 * driven on touch at all, and mutating the source node in `dragstart` — which
 * the fade did — aborts the drag outright in Firefox. Pointer events have none
 * of that: the same code serves mouse, pen and touch, and the commit reads a
 * ref rather than state, so it can't depend on a React flush landing before the
 * release.
 *
 * The gesture itself is owned by the WINDOW once a card is pressed, not by the
 * card — see `onPointerDown` for why that distinction was the whole bug.
 */
export function ProgramBoard({ cards: initial, archivedCount }: { cards: BoardCard[]; archivedCount: number }) {
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [toast, setToast] = useState<string | null>(null);
  /** Where the card would land right now — the column under the pointer and the
   *  slot within it, counted over that column WITHOUT the card being dragged. */
  /** ARCHIVED IS A DRAWER, NOT A COLUMN OF WORK. It grows without bound and
   *  nothing in it needs doing, so it must not take a seventh of the width from
   *  the five columns that do. Collapsed it is a spine with a count; it still
   *  accepts a drop, because archiving has to stay one gesture. */
  const [archiveOpen, setArchiveOpen] = useState(false);
  /** HOW THE COLUMNS ARE ORDERED. "priority" — your hand-ordering where you set
   *  one, the RICE score everywhere else — is the default and the only sort
   *  that can be dragged, because dragging IS setting the hand-ordering. The
   *  others are read-only lenses, and a drop inside a column says so rather
   *  than writing an order the next render would throw away. */
  const [sort, setSort] = useState<SortId>("priority");
  useEffect(() => {
    try { const v = localStorage.getItem("opmc.board.sort"); if (v && BOARD_SORTS.some((s) => s.id === v)) setSort(v as SortId); } catch { /* private mode */ }
  }, []);
  const pickSort = (id: SortId) => {
    setSort(id);
    try { localStorage.setItem("opmc.board.sort", id); } catch { /* private mode */ }
  };
  const [drag, setDrag] = useState<{ key: string; col: BoardColumn; idx: number } | null>(null);
  /** A card is held. Drives the window-level listeners that own the gesture. */
  const [pressing, setPressing] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The commit path reads refs, never state: a pointerup can arrive in the same
  // frame as the move that preceded it, and a dropped card is not the place to
  // find out whether React had re-rendered yet.
  const dragRef = useRef<{ key: string; col: BoardColumn; idx: number } | null>(null);
  const pressRef = useRef<{ key: string; x: number; y: number; hold: ReturnType<typeof setTimeout> | null } | null>(null);
  /** Set once a press turns into a drag, so the card's link doesn't navigate on release. */
  const draggedRef = useRef(false);
  const colRefs = useRef(new Map<BoardColumn, HTMLDivElement>());
  const cardRefs = useRef(new Map<string, HTMLDivElement>());


  const say = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const cardOf = (key: string | null) => (key ? cards.find((c) => c.key === key) ?? null : null);
  /** A COLUMN IN THE ORDER IT IS ON SCREEN — the one definition. Render, hit
   *  testing and the commit all read this, because a drop computed against a
   *  different order than the one the eye sees lands in the wrong slot. */
  const ordered = useCallback(
    (col: BoardColumn) => sortCards(cards.filter((c) => c.column === col), sort),
    [cards, sort]);
  /** A CARD MAY SIT ANYWHERE AT OR BEHIND WHAT THE FACTS SUPPORT.
   *
   *  The pipeline reads the branch, the pages and the experiment, and that tells
   *  it the furthest a card could honestly be — `derivedColumn`. What it cannot
   *  read is whether anyone is FINISHED: a branch carrying a build looks the
   *  same whether the work is done or halfway. So the derived column is a
   *  ceiling, not a position. Drag anywhere at or below it and the board
   *  remembers; drag past it and it bounces, because that would be claiming
   *  progress nobody made. Experimentation -> Handoff is the exception: calling
   *  a winner is a human decision, so it is allowed and it writes the claim. */
  const canLand = (card: BoardCard, col: BoardColumn) =>
    !card.locked && (
      COLUMN_RANK[col] <= COLUMN_RANK[card.derivedColumn]
      // The three moves that are DECISIONS rather than derivations, so they are
      // allowed to go past the ceiling. Each writes the claim it asserts.
      || (col === "handoff" && card.column === "experiment")   // we picked a winner
      || (col === "deployed" && card.column === "handoff")     // the dev team shipped it
      || col === "archived"                                    // we are done with it
    );

  const bounceReason = (card: BoardCard, col: BoardColumn) =>
    card.locked
      ? "The experiment is running — this card is locked until it isn't."
      : `${LABEL(col)} is further than the work has actually got. ${LABEL(card.derivedColumn)} is as far as the facts support — ${card.pipeline.primaryAction?.label ?? "finish the current step"} to move it on. You can always drag it back.`;

  /** Hit-test the pointer against the live layout: which column, and which slot. */
  function targetAt(x: number, y: number, dragKey: string): { col: BoardColumn; idx: number } | null {
    let col: BoardColumn | null = null;
    for (const [id, el] of colRefs.current) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) { col = id; break; }
    }
    // THE COLUMN IS ITS X BAND, NOT ITS BOX. Columns shrink-wrap their cards, so
    // a busy column can be 750px tall next to an empty one 144px tall — measured
    // on the real board, Experimentation 149→901 against Handoff 149→293. Drag
    // the bottom Experimentation card straight across and you release 500px
    // BELOW Handoff's box, inside no column at all, and the gesture evaporated
    // without a word. Since the columns tile the row horizontally, the band
    // under the pointer is unambiguous, so a release beside a column counts as a
    // release in it. (The row also stretches now — see the grid — but a pointer
    // dragged past the bottom of the page still has to land somewhere.)
    if (!col) {
      for (const [id, el] of colRefs.current) {
        const r = el.getBoundingClientRect();
        if (x >= r.left && x <= r.right) { col = id; y = Math.min(Math.max(y, r.top + 1), r.bottom - 1); break; }
      }
    }
    if (!col) return null;
    // Counted over the column minus the dragged card — it keeps its slot in the
    // layout while dragging (so the rects we measure stay still), but it is not
    // one of the places the card can go.
    const rest = ordered(col).filter((c) => c.key !== dragKey);
    let idx = rest.length;
    for (let i = 0; i < rest.length; i++) {
      const el = cardRefs.current.get(rest[i].key);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      // Past the midpoint means below this card, which is what lets a card move
      // one slot down and what makes "after the last one" reachable at all.
      if (y < r.top + r.height / 2) { idx = i; break; }
    }
    return { col, idx };
  }

  function setTarget(next: { col: BoardColumn; idx: number } | null, key: string) {
    const now = next ? { key, ...next } : null;
    const prev = dragRef.current;
    dragRef.current = now;
    if (prev?.col !== now?.col || prev?.idx !== now?.idx || prev?.key !== now?.key) setDrag(now);
  }

  function endDrag() {
    dragRef.current = null;
    if (pressRef.current?.hold) clearTimeout(pressRef.current.hold);
    pressRef.current = null;
    setDrag(null);
    setPressing(false);
  }

  async function persistPriorities(colCards: BoardCard[], rollback: BoardCard[]) {
    // SEQUENTIAL, not Promise.all. A whole-column reorder is N writes to the
    // same logical thing, and the local FS store round-trips the entire
    // prototype map per write — fired concurrently, all but the last read a
    // pre-reorder snapshot and the surviving file holds an order nobody chose.
    // Postgres upserts by key and would survive it; the board should not depend
    // on which store it happens to be talking to.
    let ok = true;
    for (let i = 0; i < colCards.length; i++) {
      const saved = await fetch("/api/prototypes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: colCards[i].key, priority: (i + 1) * 10 }) })
        .then((r) => r.ok).catch(() => false);
      if (!saved) { ok = false; break; } // stop: further writes only deepen a half-applied order
    }
    // DEGRADE, NEVER INVENT — and the recovery has to actually recover. This
    // used to promise "reloading the real one" and call router.refresh(), which
    // could not repaint anything: `cards` seeds from the server prop once and
    // never reads it again, so the failed order stayed on screen under a message
    // saying it had been corrected. A false reassurance is worse than the
    // failure it reports. We already hold the order from before the drag, so put
    // that back — no round trip, and it is the truth by construction.
    if (!ok) {
      setCards((cs) => [...cs.filter((c) => c.column !== rollback[0]?.column), ...rollback]);
      say("Couldn't save the new order — put it back.");
    }
  }

  async function markShipped(card: BoardCard) {
    setCards((cs) => cs.map((c) => (c.key === card.key ? { ...c, column: "handoff" as BoardColumn } : c)));
    // The optimistic move must be undone on a THROWN failure too, not just a
    // non-ok response — an offline fetch rejects, and without this the card sits
    // in Handoff claiming a handoff that never happened.
    const res = await fetch("/api/prototypes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: card.key, status: "shipped" }) })
      .catch(() => null);
    if (!res?.ok) {
      setCards((cs) => cs.map((c) => (c.key === card.key ? { ...c, column: card.column } : c)));
      say("Couldn't hand it off — try again.");
      return;
    }
    say(`${card.name} handed off.`);
    router.refresh();
  }

  /** Close a prototype out. Archiving is allowed from anywhere except a running
   *  experiment (canLand's !locked), because "we are done with this" is a
   *  decision, not a derivation — and a LOSING experiment has no other exit. */
  async function archive(card: BoardCard) {
    const from = card.column;
    setCards((cs) => cs.map((c) => (c.key === card.key ? { ...c, column: "archived" as BoardColumn } : c)));
    const res = await fetch("/api/prototypes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: card.key, status: "archived" }) }).catch(() => null);
    if (!res?.ok) {
      setCards((cs) => cs.map((c) => (c.key === card.key ? { ...c, column: from } : c)));
      say("Couldn't archive it — try again.");
      return;
    }
    say(`${card.name} archived. Drag it out to reopen it.`);
    router.refresh();
  }

  /** Reopen. The stage it held before archiving is not recorded, so this does
   *  not guess one: it clears the archive and lets the pipeline place the card
   *  from the facts, which is the only answer that cannot be wrong. */
  async function unarchive(card: BoardCard) {
    const from = card.column;
    const res = await fetch("/api/prototypes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: card.key, status: "review" }) }).catch(() => null);
    if (!res?.ok) {
      setCards((cs) => cs.map((c) => (c.key === card.key ? { ...c, column: from } : c)));
      say("Couldn't reopen it — try again.");
      return;
    }
    say(`${card.name} reopened — the board will place it where the work actually is.`);
    router.refresh();
  }

  /** Claim (or withdraw) that the winner is live in production. The console
   *  cannot see another team's release train, so this is a stated fact with a
   *  date on it, not an observation — and it is audited both ways. */
  async function setDeployed(card: BoardCard, on: boolean) {
    const from = card.column;
    setCards((cs) => cs.map((c) => (c.key === card.key ? { ...c, column: (on ? "deployed" : "handoff") as BoardColumn } : c)));
    const res = await fetch("/api/prototypes/deployed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: card.key, deployed: on }) }).catch(() => null);
    if (!res?.ok) {
      setCards((cs) => cs.map((c) => (c.key === card.key ? { ...c, column: from } : c)));
      say(on ? "Couldn't mark it deployed — try again." : "Couldn't clear it — try again.");
      return;
    }
    say(on ? `${card.name} marked live in production.` : `${card.name} is back at Handoff — the deployment claim is cleared.`);
    router.refresh();
  }

  /** Park a card in an earlier column, or release it back to where the facts
   *  put it. Dropping it ON its derived column is the release — there is no
   *  separate control to find, because "put it back" is the same gesture. */
  async function park(card: BoardCard, to: BoardColumn) {
    const from = card.column;
    const releasing = to === card.derivedColumn;
    setCards((cs) => cs.map((c) => (c.key === card.key ? { ...c, column: to, held: !releasing } : c)));
    const res = await fetch("/api/prototypes/hold", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: card.key, column: releasing ? null : to }) })
      .catch(() => null);
    if (!res?.ok) {
      setCards((cs) => cs.map((c) => (c.key === card.key ? { ...c, column: from, held: card.held } : c)));
      say("Couldn't move it — try again.");
      return;
    }
    say(releasing
      ? `${card.name} released — back to ${LABEL(to)}, where the work actually is.`
      : `${card.name} held at ${LABEL(to)}. Drag it to ${LABEL(card.derivedColumn)} to release it.`);
    router.refresh();
  }

  /** Undo a handoff. We write "review" rather than the column the pointer landed
   *  on, because the column is not ours to set — clearing the stored "shipped"
   *  claim is, and the pipeline then re-derives the true column from the facts.
   *  So the card may well settle somewhere other than where it was dropped; the
   *  toast says so rather than letting that look like a bug. */
  async function sendBack(card: BoardCard, to: BoardColumn) {
    const from = card.column;
    setCards((cs) => cs.map((c) => (c.key === card.key ? { ...c, column: to } : c)));
    const res = await fetch("/api/prototypes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: card.key, status: "review" }) })
      .catch(() => null);
    if (!res?.ok) {
      setCards((cs) => cs.map((c) => (c.key === card.key ? { ...c, column: from } : c)));
      say("Couldn't send it back — try again.");
      return;
    }
    say(`${card.name} sent back — the board will place it where the work actually is.`);
    router.refresh();
  }

  /** Did this gesture ever propose a different home than the card already had? */
  function moved(target: { col: BoardColumn; idx: number } | null, card: BoardCard) {
    if (!target) return true; // off the board — say so rather than navigate
    if (target.col !== card.column) return true;
    const rest = ordered(card.column).filter((c) => c.key !== card.key);
    const at = Math.max(0, Math.min(target.idx, rest.length));
    const before = ordered(card.column);
    const next = [...rest.slice(0, at), card, ...rest.slice(at)];
    return !before.every((c, i) => c.key === next[i]?.key);
  }

  function commit(target: { col: BoardColumn; idx: number } | null, card: BoardCard) {
    // The one path that used to end in silence. A drop the board can't place is
    // still an answer, and "nothing happened" is the one thing it must never
    // look like.
    if (!target) { say("Dropped off the board — nothing moved."); return; }
    if (card.locked) { say("The experiment is running — this card is locked until it isn't."); return; }
    if (!canLand(card, target.col)) { say(bounceReason(card, target.col)); return; }

    if (target.col === "archived") { void archive(card); return; }
    if (card.column === "archived") { void unarchive(card); return; }
    if (target.col === "deployed") { void setDeployed(card, true); return; }
    if (card.column === "deployed") { void setDeployed(card, false); return; }
    if (target.col === "handoff" && card.column === "experiment") { void markShipped(card); return; }
    if (card.column === "handoff" && target.col !== "handoff") { void sendBack(card, target.col); return; }
    if (target.col !== card.column) { void park(card, target.col); return; }

    // A HAND-ORDER UNDER A COMPUTED SORT IS A LIE. Under "Score" or "Stalest"
    // the column's order comes from the data, so a drop here would write ranks
    // the very next render ignores — the card would visibly snap back and look
    // broken. Say what to do instead.
    if (sort !== "priority") {
      say(`Sorted by ${BOARD_SORTS.find((s) => s.id === sort)?.label ?? sort} — switch to Priority to hand-order a column.`);
      return;
    }
    const rest = ordered(card.column).filter((c) => c.key !== card.key);
    const at = Math.max(0, Math.min(target.idx, rest.length));
    const before = ordered(card.column);
    const next = [...rest.slice(0, at), card, ...rest.slice(at)];
    if (before.every((c, i) => c.key === next[i]?.key)) return; // already there
    // Stamp the new ranks LOCALLY as well as on the server. The column renders
    // from `priority`, not from array order, so without this the optimistic
    // move would be re-sorted away on the very next render and the drag would
    // look like it did nothing.
    const ranked = next.map((c, i) => ({ ...c, priority: (i + 1) * 10 }));
    setCards((cs) => [...cs.filter((c) => c.column !== card.column), ...ranked]);
    void persistPriorities(ranked, before);
  }

  // ── the press → drag → release sequence ────────────────────────────────────
  //
  // ONCE A CARD IS PRESSED, THE GESTURE BELONGS TO THE WINDOW — not to the card,
  // and not to whatever the cursor happens to be over. An earlier version put
  // pointermove/pointerup on the card and only took pointer capture once the
  // 5px threshold was cleared, which is a chicken-and-egg: the threshold could
  // only be cleared by a move event that still landed ON the pressed card, and
  // a real drag leaves the card on its very first move. The event log said it
  // outright — pointerdown on the card, then every move retargeting to a
  // neighbouring card, the grid, the next column — so a drag out of a column,
  // the whole point of the gesture, could never start. Only a short slow wiggle
  // inside the card worked, which is why it looked like "drag does nothing".
  //
  // Window listeners see every move regardless of what is underneath, so target
  // identity stops mattering. Pointer capture would also fix the retargeting,
  // but it retargets the compatibility mouse events too, so the click would
  // land on the wrapper instead of the card's <a> and the card would stop
  // navigating. Listening on the window costs nothing and keeps the link.
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>, card: BoardCard) {
    // BEFORE the guard, not after. This flag is what suppresses the click that
    // follows a drag, and it stays set until the next press clears it — so if
    // clearing sat behind the locked/right-button early return, the first
    // ordinary click on a LOCKED card after any drag would be swallowed.
    draggedRef.current = false;
    if (card.locked || e.button !== 0) return;
    const start = { key: card.key, x: e.clientX, y: e.clientY, hold: null as ReturnType<typeof setTimeout> | null };
    pressRef.current = start;
    if (e.pointerType === "touch") {
      // A touch that drags immediately is a touch that can't scroll the page.
      start.hold = setTimeout(() => {
        if (pressRef.current !== start) return;
        draggedRef.current = true;
        setTarget(targetAt(start.x, start.y, card.key), card.key);
      }, TOUCH_HOLD_MS);
    }
    setPressing(true);
  }

  // Re-attached whenever `cards` changes so the closure below always measures
  // and commits against the list currently on screen.
  useEffect(() => {
    if (!pressing) return;

    const move = (e: PointerEvent) => {
      const press = pressRef.current;
      if (!press) return;
      const card = cards.find((c) => c.key === press.key);
      if (!card) return;
      if (!draggedRef.current) {
        // A PRESS IS ONLY LIVE WHILE A BUTTON IS DOWN. A release we never saw
        // (over an iframe, outside the window) would otherwise leave the press
        // recorded, and the next stray move would start a drag with nothing
        // held down.
        if (e.buttons === 0) { endDrag(); return; }
        if (Math.hypot(e.clientX - press.x, e.clientY - press.y) <= DRAG_THRESHOLD) return;
        if (e.pointerType === "touch") { endDrag(); return; } // moved before the hold — a scroll
        draggedRef.current = true;
      }
      // Once dragging, the page must not select text or scroll under us.
      e.preventDefault();
      setTarget(targetAt(e.clientX, e.clientY, press.key), press.key);
    };

    const up = (e: PointerEvent) => {
      const press = pressRef.current;
      const card = press ? cards.find((c) => c.key === press.key) : null;
      // Re-read the position at the moment of release rather than trusting the
      // last move — the two can differ by a frame, and the frame is the drop.
      if (draggedRef.current && card) {
        const target = targetAt(e.clientX, e.clientY, card.key);
        // A CLICK WITH A TREMOR IS STILL A CLICK. 6px of drift promoted the
        // gesture to a drag, the drag resolved to the slot the card was already
        // in, and the click was then suppressed — so a slightly unsteady click
        // on a card did nothing at all. If the gesture never proposed a new
        // home, hand it back to the link.
        if (!moved(target, card)) draggedRef.current = false;
        else commit(target, card);
      }
      // Cleared on a macrotask, AFTER the click this release generates. It used
      // to persist until the next pointerdown, which meant a card focused by
      // keyboard could not be opened with Enter until you had pressed some card
      // with the mouse first.
      setTimeout(() => { draggedRef.current = false; }, 0);
      endDrag();
    };

    const cancel = () => endDrag();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") endDrag(); };

    // Non-passive: `move` calls preventDefault once the drag is live.
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pressing, cards]);

  const dragging = cardOf(drag?.key ?? null);

  return (
    <div className="space-y-4">
      {cards.length > 0 && (
        // ONE ROW, AND IT EXPLAINS ITSELF. The hint belongs to the ACTIVE sort
        // rather than sitting on every button, so the bar answers "what am I
        // looking at" without a tooltip — and there is nowhere else on the
        // board that this fact appears (§1).
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[12.5px] text-muted-2 shrink-0">Sort</span>
          {BOARD_SORTS.map((s) => (
            <button key={s.id} type="button" onClick={() => pickSort(s.id)} title={s.hint}
              className={`rounded-md px-2 py-0.5 text-[12.5px] transition-colors ${
                sort === s.id ? "bg-surface-2 text-foreground font-semibold" : "text-muted-2 hover:text-foreground"}`}>
              {s.label}
            </button>
          ))}
          <span className="text-[12.5px] text-muted-2 ml-1.5 min-w-0 truncate">
            — {BOARD_SORTS.find((s) => s.id === sort)?.hint}
          </span>
        </div>
      )}
      {cards.length === 0 ? (
        <EmptyState title="No prototypes yet." hint="Create one — then build it with the agent and review it on the real site." />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 xl:flex xl:items-start">
          {BOARD_COLUMNS.map((col) => {
            const items = ordered(col.id);
            // THE QUEUE'S POSITION IS THE QUEUE'S POINT, so Backlog numbers its
            // cards. And where a hand-ordering disagrees with the score, the
            // card says so — quietly, next to the number. Overriding the model
            // is allowed; overriding it without noticing is the thing worth
            // catching, and a ranking nobody can see themselves departing from
            // is just a number that gets ignored.
            const isQueue = col.id === "brief";
            const byScore = isQueue ? [...items].sort(sortCompare("score")) : [];
            const scoreSeat = new Map(byScore.map((c, i) => [c.key, i]));
            const shut = col.id === "archived" && !archiveOpen;
            const anyLocked = col.id === "experiment" && items.some((c) => c.locked);
            const over = drag?.col === col.id && dragging !== null;
            const welcome = over && canLand(dragging!, col.id);
            // A CROSS-COLUMN LAND HAS NO SLOT. Experimentation → Handoff sets a
            // status; where the card sits afterwards is the server's ordering,
            // not the pointer's. Drawing an insertion line there would promise a
            // position nothing honours, so the column highlight is the whole
            // answer for that move.
            const showSlot = welcome && dragging!.column === col.id;
            const rejecting = over && !canLand(dragging!, col.id);
            // The indicator is placed by slot number, counted over this column
            // WITHOUT the dragged card — the same count `targetAt` produces.
            let slot = 0;
            // ZERO LAYOUT IMPACT, DELIBERATELY — and the arithmetic matters,
            // because any shift here moves the very card midpoints `targetAt`
            // measures, so the indicator would displace the slot it is pointing
            // at and a pointer parked on a boundary would oscillate.
            //
            // Inserting an item between two cards costs gap + itsMarginBox +
            // gap where the two cards previously cost one gap. With gap-1.5 =
            // 6px, the margin box has to come to −6px for the total to stay at
            // 6 — so −3px top and bottom, NOT −6px each. (−6 each nets −12 and
            // collapses the two cards flush together.) Flexbox does not fold
            // margins into `gap`; they add, and negative ones subtract.
            //
            // The item's border box then lands exactly mid-gap, and the bar
            // draws out of flow, centred on it.
            const line = (
              <div className="relative h-0 -my-[3px] pointer-events-none" aria-hidden>
                <span className="absolute -top-[1.5px] left-0 right-0 h-[3px] rounded-full bg-accent" />
              </div>
            );
            return (
              <div
                key={col.id}
                ref={(el) => { if (el) colRefs.current.set(col.id, el); else colRefs.current.delete(col.id); }}
                className={`rounded-xl border p-2 min-h-[9rem] transition-colors xl:min-w-0 ${shut ? "xl:flex-none xl:w-[3.25rem]" : "xl:flex-1"} ${
                  welcome ? "border-accent bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]"
                  : rejecting ? "border-danger/40"
                  : "border-border bg-surface/40"}`}
              >
                {shut ? (
                  <button type="button" onClick={() => setArchiveOpen(true)}
                    title={`${items.length} archived — click to open`}
                    className="hidden xl:flex w-full flex-col items-center gap-2 py-2 text-muted-2 hover:text-foreground transition-colors">
                    <span className="text-[12.5px] tabular-nums font-semibold">{items.length}</span>
                    <span className="text-[12.5px] [writing-mode:vertical-rl] tracking-wider">{col.label}</span>
                  </button>
                ) : null}
                <div className={`px-1.5 pb-2 pt-0.5 ${shut ? "xl:hidden" : ""}`}>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[13px] font-semibold ${col.id === "handoff" ? "text-ok" : col.id === "deployed" ? "text-ok" : ""}`}>{col.label}</span>
                    {anyLocked && <span className="text-[12.5px]" title="a running experiment is locked">🔒</span>}
                    <span className="text-[12.5px] text-muted-2 tabular-nums ml-auto">{items.length}</span>
                    {col.id === "archived" && archiveOpen && (
                      <button type="button" onClick={() => setArchiveOpen(false)} title="collapse" className="hidden xl:block text-[12.5px] text-muted-2 hover:text-foreground">×</button>
                    )}
                  </div>
                  <div className="text-[12.5px] text-muted-2 leading-tight">{col.hint}</div>
                </div>
                <div className={`flex flex-col gap-1.5 ${shut ? "xl:hidden" : ""}`}>
                  {items.map((c, i) => {
                    const isDragged = drag?.key === c.key;
                    // Hand-ranked into a seat the score disagrees with.
                    const offScore = isQueue && c.priority != null && scoreSeat.get(c.key) !== i;
                    const mark = showSlot && !isDragged && slot === drag!.idx;
                    if (!isDragged) slot++;
                    return (
                      <Fragment key={c.key}>
                        {mark && line}
                        <div
                          ref={(el) => { if (el) cardRefs.current.set(c.key, el); else cardRefs.current.delete(c.key); }}
                          onPointerDown={(e) => onPointerDown(e, c)}
                          // Native DnD would race our own sequence; the card's
                          // anchor is draggable by default, so refuse it here.
                          onDragStart={(e) => e.preventDefault()}
                          // touch-action:none is what makes the long-press drag
                          // possible at all: the browser decides pan-vs-gesture
                          // at touchstart, and once it has chosen to pan it
                          // fires pointercancel and no amount of
                          // preventDefault on pointermove takes it back. The
                          // cost is that a finger landing ON a card can't
                          // scroll the page — the gaps and column background
                          // still can.
                          style={{ touchAction: "none" }}
                          className={`select-none ${isDragged ? "opacity-40" : ""}`}
                        >
                          <Link
                            href={`/prototypes/${c.key}`}
                            draggable={false}
                            onClick={(e) => { if (draggedRef.current) e.preventDefault(); }}
                            style={c.arm ? { borderLeftColor: armColor(c.arm.groupId), borderLeftWidth: 3 } : undefined}
                            className={`block rounded-lg border px-3 py-2.5 bg-surface hover:border-border-strong transition-colors space-y-1.5 ${c.locked ? "border-warn/50" : "border-border cursor-grab active:cursor-grabbing"}`}
                          >
                            {c.arm && (
                              <div className="flex items-center gap-1.5 text-[11.5px] font-semibold leading-none"
                                title={`${c.arm.groupName ?? c.arm.groupId} — an A/B/n test of ${c.arm.count} arms. They run as one experiment and are judged on one metric.`}>
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: armColor(c.arm.groupId) }} />
                                <span className="truncate" style={{ color: armColor(c.arm.groupId) }}>{c.arm.groupName ?? c.arm.groupId}</span>
                                <span className="text-muted-2 shrink-0 tabular-nums">arm {c.arm.index}/{c.arm.count}</span>
                                {c.arm.split && <span className="text-danger shrink-0" title="These arms are bound to DIFFERENT Optimizely experiments — that is not one test.">⚠</span>}
                              </div>
                            )}
                            {/* PRIORITY GETS ITS OWN LINE, ABOVE THE NAME.
                                Sharing the title's row made it whatever width
                                the name left over — which on a long name is
                                nothing — and buried the one thing the column
                                is now ordered by. On its own line it is read
                                before the name, which is the order you want
                                when you are scanning a queue rather than
                                looking for a prototype you already know. */}
                            {(isQueue || c.score?.scored) && (
                              <div className="flex items-center gap-2">
                                {isQueue && (
                                  <span
                                    title={offScore
                                      ? `You put this ${ordinal(i + 1)} in the queue; the score puts it ${ordinal((scoreSeat.get(c.key) ?? 0) + 1)}. Both are fine — the score is advice, the order is yours.`
                                      : `${ordinal(i + 1)} in the queue.`}
                                    className="inline-flex items-center gap-0.5 shrink-0 text-[13px] font-bold tabular-nums text-foreground leading-none">
                                    {i + 1}
                                    {offScore && <span className="text-[11px] font-normal text-muted-2" aria-label="you moved this against the score">⇅</span>}
                                  </span>
                                )}
                                {c.score && <ScoreBadge d={c.score} />}
                              </div>
                            )}
                            <div className="text-[14px] font-semibold leading-snug">{c.name}</div>
                            {c.hypothesis && <div className="text-[12.5px] text-muted-2 leading-snug line-clamp-2">{c.hypothesis}</div>}

                            <MiniPipeline pipeline={c.pipeline} />
                            <div className={`text-[12.5px] leading-tight ${c.locked ? "text-warn font-semibold" : "text-foreground"}`}>
                              {c.locked ? "🔒 experiment LIVE — locked" : <>
                                <span className="text-muted-2">Next: </span>{c.pipeline.primaryAction.label}
                              </>}
                            </div>
                            {c.deployedAt && (
                              <div className="text-[12.5px] text-ok leading-tight">✔ Live in production · {c.deployedAt.slice(0, 10)}</div>
                            )}
                            {c.held && (
                              <div className="text-[12.5px] text-muted-2 leading-tight" title={`The pipeline puts this at ${LABEL(c.derivedColumn)}; you are holding it here. Drag it to ${LABEL(c.derivedColumn)} to release it.`}>
                                ✋ Held here — the build says {LABEL(c.derivedColumn)}
                              </div>
                            )}
                            {!c.locked && c.pipeline.steps.some((s) => s.state === "blocked") && (
                              <div className="text-[12.5px] text-danger leading-tight">⚠ {c.pipeline.steps.filter((s) => s.state === "blocked").map((s) => `${s.title}: ${s.status}`).join(" · ")}</div>
                            )}
                            {c.pipeline.alerts.filter((a) => a.level === "warn").slice(0, 1).map((a, i) => (
                              <div key={i} className="text-[12.5px] text-warn leading-tight line-clamp-2">{a.text}</div>
                            ))}

                            <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-border/50">
                              {c.pipeline.truth.latestVersion != null && (
                                <span className="text-[12.5px] px-1.5 py-0.5 rounded bg-surface-2 text-muted font-mono">v{c.pipeline.truth.latestVersion}{c.pipeline.truth.certified === true ? " ✓" : c.pipeline.truth.certified === false ? " ✗" : ""}</span>
                              )}
                              {c.pipeline.truth.pushedVersion != null && (
                                <span className="text-[12.5px] px-1.5 py-0.5 rounded bg-surface-2 text-muted font-mono">pushed v{c.pipeline.truth.pushedVersion}</span>
                              )}
                              {c.experimentStatus && (
                                <span className={`text-[12.5px] px-1.5 py-0.5 rounded font-semibold ${c.experimentStatus === "running" ? "bg-[color-mix(in_srgb,var(--warn)_15%,transparent)] text-warn" : "bg-surface-2 text-muted-2"}`}>{c.experimentStatus.replace("_", " ")}</span>
                              )}
                              {c.metric && <span className="text-[12.5px] px-1.5 py-0.5 rounded bg-surface-2 text-muted-2 truncate max-w-[9rem]" title={`Primary metric: ${c.metric}`}>📊 {c.metric}</span>}
                              {c.owner && <span className="text-[12.5px] text-muted-2 ml-auto">{c.owner}</span>}
                            </div>
                          </Link>
                        </div>
                      </Fragment>
                    );
                  })}
                  {/* Below every card — the slot a plain "move it to the bottom"
                      needs, which insert-before could never express. */}
                  {showSlot && slot === drag!.idx && line}
                  {items.length === 0 && !welcome && <div className="px-1.5 py-3 text-[12.5px] text-muted-2/60">—</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {archivedCount > 0 && <p className="text-[12.5px] text-muted-2">{archivedCount} archived — in the Archived column at the end of the board.</p>}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[14px] text-foreground shadow-lg max-w-md">
          {toast}
        </div>
      )}
    </div>
  );
}
