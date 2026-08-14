"use client";

import Link from "next/link";
import { Fragment, useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, SEVERITY_DOT } from "@/components/ui";
import { BOARD_COLUMNS, type BoardCard, type BoardColumn } from "@/lib/prototypes/board-model";
import { stepSeverity } from "@/lib/prototypes/severity";
import type { Pipeline } from "@/lib/prototypes/pipeline";

/** Why a cross-column drag bounces: the column is a fact, not an opinion. */
const BOUNCE: Record<BoardColumn, string> = {
  brief: "Brief is where cards start — they move on when a build begins, not when they're dragged.",
  build: "Build means a real build exists on the branch. It moves when the agent pushes one.",
  review: "Review means the pages verify on the real site. Verify them and the card moves itself.",
  experiment: "Experimentation means cut + certified + pushed. Do those and the card arrives on its own.",
  handoff: "Handoff is a decision — drag here only from Experimentation, once the winner is chosen.",
};

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
  const canLand = (card: BoardCard, col: BoardColumn) =>
    !card.locked && (col === card.column || (col === "handoff" && card.column === "experiment"));

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
    const rest = cards.filter((c) => c.column === col && c.key !== dragKey);
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

  /** Did this gesture ever propose a different home than the card already had? */
  function moved(target: { col: BoardColumn; idx: number } | null, card: BoardCard) {
    if (!target) return true; // off the board — say so rather than navigate
    if (target.col !== card.column) return true;
    const rest = cards.filter((c) => c.column === card.column && c.key !== card.key);
    const at = Math.max(0, Math.min(target.idx, rest.length));
    const before = cards.filter((c) => c.column === card.column);
    const next = [...rest.slice(0, at), card, ...rest.slice(at)];
    return !before.every((c, i) => c.key === next[i]?.key);
  }

  function commit(target: { col: BoardColumn; idx: number } | null, card: BoardCard) {
    // The one path that used to end in silence. A drop the board can't place is
    // still an answer, and "nothing happened" is the one thing it must never
    // look like.
    if (!target) { say("Dropped off the board — nothing moved."); return; }
    if (card.locked) { say("The experiment is running — this card is locked until it isn't."); return; }
    if (!canLand(card, target.col)) { say(BOUNCE[target.col]); return; }

    if (target.col === "handoff" && card.column === "experiment") { void markShipped(card); return; }

    const rest = cards.filter((c) => c.column === card.column && c.key !== card.key);
    const at = Math.max(0, Math.min(target.idx, rest.length));
    const before = cards.filter((c) => c.column === card.column);
    const next = [...rest.slice(0, at), card, ...rest.slice(at)];
    if (before.every((c, i) => c.key === next[i]?.key)) return; // already there
    setCards((cs) => [...cs.filter((c) => c.column !== card.column), ...next]);
    void persistPriorities(next, before);
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
      {cards.length === 0 ? (
        <EmptyState title="No prototypes yet." hint="Create one — then build it with the agent and review it on the real site." />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          {BOARD_COLUMNS.map((col) => {
            const items = cards.filter((c) => c.column === col.id);
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
                className={`rounded-xl border p-2 min-h-[9rem] transition-colors ${
                  welcome ? "border-accent bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]"
                  : rejecting ? "border-danger/40"
                  : "border-border bg-surface/40"}`}
              >
                <div className="px-1.5 pb-2 pt-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[13px] font-semibold ${col.id === "handoff" ? "text-ok" : ""}`}>{col.label}</span>
                    {anyLocked && <span className="text-[12.5px]" title="a running experiment is locked">🔒</span>}
                    <span className="text-[12.5px] text-muted-2 tabular-nums ml-auto">{items.length}</span>
                  </div>
                  <div className="text-[12.5px] text-muted-2 leading-tight">{col.hint}</div>
                </div>
                <div className="flex flex-col gap-1.5">
                  {items.map((c) => {
                    const isDragged = drag?.key === c.key;
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
                            className={`block rounded-lg border px-3 py-2.5 bg-surface hover:border-border-strong transition-colors space-y-1.5 ${c.locked ? "border-warn/50" : "border-border cursor-grab active:cursor-grabbing"}`}
                          >
                            <div className="text-[14px] font-semibold leading-snug">{c.name}</div>
                            {c.hypothesis && <div className="text-[12.5px] text-muted-2 leading-snug line-clamp-2">{c.hypothesis}</div>}

                            <MiniPipeline pipeline={c.pipeline} />
                            <div className={`text-[12.5px] leading-tight ${c.locked ? "text-warn font-semibold" : "text-foreground"}`}>
                              {c.locked ? "🔒 experiment LIVE — locked" : <>
                                <span className="text-muted-2">Next: </span>{c.pipeline.primaryAction.label}
                              </>}
                            </div>
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

      {archivedCount > 0 && <p className="text-[12.5px] text-muted-2">{archivedCount} archived prototype{archivedCount === 1 ? "" : "s"} hidden.</p>}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[14px] text-foreground shadow-lg max-w-md">
          {toast}
        </div>
      )}
    </div>
  );
}
