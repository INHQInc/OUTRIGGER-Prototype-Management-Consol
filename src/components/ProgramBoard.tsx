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
 * of that: capture makes the sequence ours from press to release, the same code
 * serves mouse, pen and touch, and the commit reads a ref rather than state, so
 * it can't depend on a React flush landing before the release.
 */
export function ProgramBoard({ cards: initial, archivedCount }: { cards: BoardCard[]; archivedCount: number }) {
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [toast, setToast] = useState<string | null>(null);
  /** Where the card would land right now — the column under the pointer and the
   *  slot within it, counted over that column WITHOUT the card being dragged. */
  const [drag, setDrag] = useState<{ key: string; col: BoardColumn; idx: number } | null>(null);
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
    pressRef.current = null;
    setDrag(null);
  }

  // Escape abandons the drag — a board you can't back out of is a board you
  // hesitate to touch.
  useEffect(() => {
    if (!drag) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") endDrag(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drag]);

  async function persistPriorities(colCards: BoardCard[]) {
    const results = await Promise.all(colCards.map((c, i) =>
      fetch("/api/prototypes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: c.key, priority: (i + 1) * 10 }) })
        .then((r) => r.ok).catch(() => false)
    ));
    // Degrade, never invent: if the order didn't save, the board must not go on
    // showing an order the server doesn't have.
    if (results.some((ok) => !ok)) {
      say("Couldn't save the new order — reloading the real one.");
      router.refresh();
    }
  }

  async function markShipped(card: BoardCard) {
    setCards((cs) => cs.map((c) => (c.key === card.key ? { ...c, column: "handoff" as BoardColumn } : c)));
    const res = await fetch("/api/prototypes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: card.key, status: "shipped" }) });
    if (!res.ok) {
      setCards((cs) => cs.map((c) => (c.key === card.key ? { ...c, column: card.column } : c)));
      say("Couldn't hand it off — try again.");
      return;
    }
    say(`${card.name} handed off.`);
    router.refresh();
  }

  function commit(target: { col: BoardColumn; idx: number } | null, card: BoardCard) {
    if (!target) return;
    if (card.locked) { say("The experiment is running — this card is locked until it isn't."); return; }
    if (!canLand(card, target.col)) { say(BOUNCE[target.col]); return; }

    if (target.col === "handoff" && card.column === "experiment") { void markShipped(card); return; }

    const rest = cards.filter((c) => c.column === card.column && c.key !== card.key);
    const at = Math.max(0, Math.min(target.idx, rest.length));
    const before = cards.filter((c) => c.column === card.column);
    const next = [...rest.slice(0, at), card, ...rest.slice(at)];
    if (before.every((c, i) => c.key === next[i]?.key)) return; // already there
    setCards((cs) => [...cs.filter((c) => c.column !== card.column), ...next]);
    void persistPriorities(next);
  }

  // ── the press → drag → release sequence ────────────────────────────────────
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>, card: BoardCard) {
    // BEFORE the guard, not after. This flag is what suppresses the click that
    // follows a drag, and it stays set until the next press clears it — so if
    // clearing sat behind the locked/right-button early return, the first
    // ordinary click on a LOCKED card after any drag would be swallowed.
    draggedRef.current = false;
    if (card.locked || e.button !== 0) return;
    const el = e.currentTarget;
    const start = { key: card.key, x: e.clientX, y: e.clientY, hold: null as ReturnType<typeof setTimeout> | null };
    pressRef.current = start;
    if (e.pointerType === "touch") {
      // A touch that drags immediately is a touch that can't scroll the page.
      start.hold = setTimeout(() => {
        if (pressRef.current !== start) return;
        draggedRef.current = true;
        el.setPointerCapture(e.pointerId);
        setTarget(targetAt(start.x, start.y, card.key), card.key);
      }, TOUCH_HOLD_MS);
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>, card: BoardCard) {
    const press = pressRef.current;
    if (!press || press.key !== card.key) return;
    if (!draggedRef.current) {
      // A PRESS IS ONLY LIVE WHILE A BUTTON IS DOWN. Without capture (which we
      // don't take until the drag starts) a release outside this card never
      // fires our pointerup, leaving the press recorded — and then merely
      // moving the mouse back over the card later would clear the 5px
      // threshold and begin a drag with nothing held down.
      if (e.buttons === 0) { if (press.hold) clearTimeout(press.hold); pressRef.current = null; return; }
      const far = Math.hypot(e.clientX - press.x, e.clientY - press.y) > DRAG_THRESHOLD;
      if (!far) return;
      if (e.pointerType === "touch") { // moved before the hold — that's a scroll
        if (press.hold) clearTimeout(press.hold);
        pressRef.current = null;
        return;
      }
      draggedRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setTarget(targetAt(e.clientX, e.clientY, card.key), card.key);
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>, card: BoardCard) {
    const press = pressRef.current;
    if (press?.hold) clearTimeout(press.hold);
    if (!draggedRef.current) { pressRef.current = null; return; } // a click; the link handles it
    // Re-read the position at the moment of release rather than trusting the
    // last move — the two can differ by a frame, and the frame is the drop.
    commit(targetAt(e.clientX, e.clientY, card.key), card);
    endDrag();
  }

  const dragging = cardOf(drag?.key ?? null);

  return (
    <div className="space-y-4">
      {cards.length === 0 ? (
        <EmptyState title="No prototypes yet." hint="Create one — then build it with the agent and review it on the real site." />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 items-start">
          {BOARD_COLUMNS.map((col) => {
            const items = cards.filter((c) => c.column === col.id);
            const anyLocked = col.id === "experiment" && items.some((c) => c.locked);
            const over = drag?.col === col.id && dragging !== null;
            const welcome = over && canLand(dragging!, col.id);
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
                    const mark = welcome && !isDragged && slot === drag!.idx;
                    if (!isDragged) slot++;
                    return (
                      <Fragment key={c.key}>
                        {mark && line}
                        <div
                          ref={(el) => { if (el) cardRefs.current.set(c.key, el); else cardRefs.current.delete(c.key); }}
                          onPointerDown={(e) => onPointerDown(e, c)}
                          onPointerMove={(e) => onPointerMove(e, c)}
                          onPointerUp={(e) => onPointerUp(e, c)}
                          onPointerCancel={endDrag}
                          // Native DnD would race our own sequence; the card's
                          // anchor is draggable by default, so refuse it here.
                          onDragStart={(e) => e.preventDefault()}
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
                  {welcome && slot === drag!.idx && line}
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
