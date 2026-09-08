"use client";

/**
 * EVIDENCE — the experiment as a picture.
 *
 * A screenshot per arm with a box over every tracked element. The box stores a
 * MEASURE KEY; the number is resolved live from the same stats the readout
 * uses, so an annotation can never drift from the data it points at.
 *
 * Chroma is earned here too: a metric wears green or red only once its
 * interval excludes zero. An author may override a box's colour for emphasis —
 * the reading beside it keeps the earned tone, so emphasis can't restate data.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ExperimentResults } from "@/lib/prototypes/results";
import type { StatsReport, CellStats } from "@/lib/prototypes/stats";
import type { EvidenceBoard, EvidenceMark } from "@/lib/prototypes/evidence";

type Tone = "up" | "down" | "warn" | "new" | "flat";

const TONE_BOX: Record<Tone, string> = {
  up: "border-ok bg-ok/15",
  down: "border-danger bg-danger/15",
  warn: "border-warn bg-warn/15",
  new: "border-accent/70 bg-accent/10 border-dashed",
  flat: "border-border-strong bg-foreground/5",
};
const TONE_CHIP: Record<Tone, string> = {
  up: "border-ok text-ok",
  down: "border-danger text-danger",
  warn: "border-warn text-warn",
  new: "border-accent/70 text-accent",
  flat: "border-border-strong text-muted",
};

const TONE_LINE: Record<Tone, string> = {
  up: "text-ok",
  down: "text-danger",
  warn: "text-warn",
  new: "text-accent",
  flat: "text-muted",
};

/** ICONS. Drawn, not typed. A bare "\u25cf" tells a reader nothing about what it
 *  does, and this row is the only affordance the board offers — the dot that
 *  used to sit here was read as "open", which is why closing felt like losing
 *  the annotation. */
const ico = {
  viewBox: "0 0 16 16", width: 13, height: 13, fill: "none", stroke: "currentColor",
  strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  "aria-hidden": true,
};
const IconExpand = () => (<svg {...ico}><path d="M6.5 2H2v4.5M9.5 2H14v4.5M6.5 14H2V9.5M9.5 14H14V9.5" /></svg>);
const IconCollapse = () => (<svg {...ico}><path d="M2 6.5h4.5V2M14 6.5H9.5V2M2 9.5h4.5V14M14 9.5H9.5V14" /></svg>);
const IconPin = () => (<svg {...ico}><circle cx="8" cy="5.4" r="3.2" /><path d="M8 8.6V14" /></svg>);
const IconClose = () => (<svg {...ico}><path d="M4 4l8 8M12 4l-8 8" /></svg>);
const IconTrash = () => (<svg {...ico}><path d="M2.6 4.2h10.8M6.2 4.2V2.4h3.6v1.8M4.3 4.2l.7 9.4h6l.7-9.4" /></svg>);

/** A rectangle on a shot, in percent of that shot. */
type Rect = { x: number; y: number; w: number; h: number };

/** The point on `r`'s perimeter facing (tx, ty). Percent space is anisotropic —
 *  a horizontal 1% is not a vertical 1% — but the leader line is drawn in that
 *  same space, so clipping in it lands exactly on the rendered edge. */
function edgePoint(r: Rect, tx: number, ty: number) {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const sx = dx ? r.w / 2 / Math.abs(dx) : Infinity;
  const sy = dy ? r.h / 2 / Math.abs(dy) : Infinity;
  const k = Math.min(sx, sy, 1);
  return { x: cx + dx * k, y: cy + dy * k };
}

/** useLayoutEffect warns during SSR; the measurement it drives only exists in a
 *  browser anyway. */
const useMeasureEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

interface Metric {
  key: string;
  label: string;
  tone: Tone;
  delta: string;
  rates: string;
  detail: string;
  /** Split out so the expanded card can lay them out as a table rather than
   *  one run-on sentence. */
  focusRate: string;
  baseRate: string;
  events: string;
  settled: string;
  featureOnly: boolean;
}

export function EvidencePanel({ prototypeKey, bound }: { prototypeKey: string; bound: boolean }) {
  const [board, setBoard] = useState<EvidenceBoard | null>(null);
  const [results, setResults] = useState<ExperimentResults | null>(null);
  /** Arms from the experiment DEFINITION — present before any traffic, so the
   *  control can be screenshotted while the experiment is still a draft. */
  const [arms, setArms] = useState<{ variationId: string; name: string }[]>([]);
  const [stats, setStats] = useState<StatsReport | null>(null);
  const [loading, setLoading] = useState(bound);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [palette, setPalette] = useState<string | null>(null);
  /** Which mark has its numbers open. Collapsed shows the name and the change;
   *  expanded shows the rates, the counts and whether it is settled. */
  const [openMark, setOpenMark] = useState<string | null>(null);
  const [picking, setPicking] = useState<{ shotId: string; box: { x: number; y: number; w: number; h: number }; markId?: string } | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  /** WHERE EACH CALLOUT ACTUALLY IS, measured from the DOM in percent of its
   *  shot. The leader line has to touch the callout's edge, and a callout
   *  changes size the moment it expands — so the attachment point cannot be a
   *  constant computed from the mark alone. */
  const [geo, setGeo] = useState<Record<string, Rect>>({});
  const rootRef = useRef<HTMLDivElement>(null);
  /** Frames spent waiting for a shot that measures zero. Bounded, so a shot
   *  that is legitimately never laid out cannot spin. */
  const waitedRef = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, r] = await Promise.all([
        fetch(`/api/prototypes/evidence?key=${encodeURIComponent(prototypeKey)}`).then((x) => x.json()),
        fetch(`/api/prototypes/results?key=${encodeURIComponent(prototypeKey)}`).then((x) => x.json()),
      ]);
      if (b.board) setBoard(b.board);
      setResults(r.results ?? null);
      setArms(Array.isArray(r.arms) ? r.arms : []);
      setStats(r.stats ?? null);
    } catch {
      setErr("Couldn't load the board.");
    } finally { setLoading(false); }
  }, [prototypeKey]);

  useEffect(() => { if (bound) void load(); }, [bound, load]);

  async function post(action: string, body: Record<string, unknown>) {
    setBusy(action); setErr(null);
    try {
      const res = await fetch("/api/prototypes/evidence", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: prototypeKey, ...body }),
      });
      const data = await res.json();
      if (data.board) setBoard(data.board);
      if (!res.ok) { setErr(data.error ?? "That didn't work."); return null; }
      return data;
    } catch {
      setErr("Network hiccup — try again.");
      return null;
    } finally { setBusy(null); }
  }

  // ── the metrics, live from the same stats the readout adjudicates ──────
  const pct = (v?: number) => (v === undefined ? undefined : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`);
  // Two decimals below 10%, as in the readout: at one decimal a 2.31% variation
  // and a 2.28% control both print "2.3%" beside a change of +1.4%, and the box
  // contradicts itself.
  const rate = (v?: number) => {
    if (v === undefined) return "—";
    const p = v * 100;
    return `${p.toFixed(Math.abs(p) >= 10 ? 1 : 2)}%`;
  };
  const count = (v?: number) => (v === undefined ? "—" : v.toLocaleString());
  const sigOf = (c?: CellStats) => Boolean(c?.liftCi && c.liftCi.lo * c.liftCi.hi > 0);

  const metrics: Metric[] = (stats?.metrics ?? []).map((m) => {
    const focus = m.cells.find((c) => c.variationId === stats?.focusVariationId);
    const base = m.cells.find((c) => c.variationId === stats?.baselineVariationId);
    const sig = sigOf(focus);
    const tone: Tone = m.featureOnly ? "new" : !sig ? "flat" : (focus?.lift ?? 0) >= 0 ? "up" : "down";
    return {
      key: m.key,
      label: m.label,
      tone,
      delta: m.featureOnly ? "new" : pct(focus?.lift) ?? "—",
      rates: m.featureOnly
        ? `${rate(focus?.rate)} in the variation · nothing equivalent in the control`
        : `${rate(focus?.rate)} variation · ${rate(base?.rate)} control`,
      detail: m.featureOnly
        ? "This element exists only in the variation, so there is no lift to read — the number is adoption."
        : sig
          ? "The gap is beyond what luck explains."
          : "Moved, but still inside the range luck could produce.",
      focusRate: rate(focus?.rate),
      baseRate: m.featureOnly ? "—" : rate(base?.rate),
      events: m.featureOnly
        ? count(focus?.count)
        : `${count(focus?.count)} vs ${count(base?.count)}`,
      settled: m.featureOnly ? "new surface" : sig ? "settled" : "not settled",
      featureOnly: Boolean(m.featureOnly),
    };
  });
  const byKey = Object.fromEntries(metrics.map((m) => [m.key, m]));

  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const next: Record<string, Rect> = {};
    let unlaid = false;
    root.querySelectorAll<HTMLElement>("[data-shot]").forEach((host) => {
      const hb = host.getBoundingClientRect();
      // A hidden pane, a background tab or a not-yet-laid-out panel measures
      // zero, and nothing here would ever wake up: ResizeObserver callbacks
      // are NOT delivered while a document is hidden. requestAnimationFrame
      // is — on the first frame after it becomes visible.
      if (!hb.width || !hb.height) { unlaid = true; return; }
      host.querySelectorAll<HTMLElement>("[data-cal]").forEach((el) => {
        const b = el.getBoundingClientRect();
        next[el.dataset.cal as string] = {
          x: ((b.left - hb.left) / hb.width) * 100,
          y: ((b.top - hb.top) / hb.height) * 100,
          w: (b.width / hb.width) * 100,
          h: (b.height / hb.height) * 100,
        };
      });
    });
    if (unlaid && waitedRef.current < 90) {
      waitedRef.current += 1;
      requestAnimationFrame(() => measureRef.current());
      return;
    }
    waitedRef.current = 0;
    // Only re-render when something really moved, or a drag would loop.
    setGeo((prev) => {
      const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
      for (const k of keys) {
        const a = prev[k];
        const b = next[k];
        if (!a || !b) return next;
        if (Math.abs(a.x - b.x) > 0.04 || Math.abs(a.y - b.y) > 0.04 ||
            Math.abs(a.w - b.w) > 0.04 || Math.abs(a.h - b.h) > 0.04) return next;
      }
      return prev;
    });
  }, []);
  // The rAF retry above has to reach the CURRENT measure without making
  // `measure` depend on itself.
  const measureRef = useRef(measure);
  measureRef.current = measure;

  // Re-measure on anything that can change a callout's box: content, which one
  // is open, the mode's extra buttons, and the shot's own size.
  useMeasureEffect(() => { waitedRef.current = 0; measure(); }, [measure, board, openMark, drawing, stats]);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const again = () => { waitedRef.current = 0; measure(); };
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(again) : null;
    ro?.observe(root);
    root.querySelectorAll("[data-cal]").forEach((el) => ro?.observe(el));
    window.addEventListener("resize", again);
    document.addEventListener("visibilitychange", again);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", again);
      document.removeEventListener("visibilitychange", again);
    };
  }, [measure, board, openMark, drawing]);

  // ── upload: downsize in the browser so a 27MB page capture never travels ──
  async function addShot(file: File, variationId: string, label: string) {
    if (!file.type.startsWith("image/")) { setErr("That isn't an image."); return; }
    setBusy("upload"); setErr(null);
    try {
      const bitmap = await createImageBitmap(file);
      const maxW = 1600;
      const scale = Math.min(1, maxW / bitmap.width);
      const w = Math.round(bitmap.width * scale);
      const h = Math.round(bitmap.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      await post("addShot", { addShot: { dataUrl, variationId, label, width: w, height: h } });
    } catch {
      setErr("Couldn't read that image.");
    } finally { setBusy(null); }
  }

  if (!bound) return <p className="text-[14px] text-muted-2">Evidence needs a bound experiment — the boxes attach to its tracked metrics.</p>;
  if (loading && !board) return <p className="text-[14px] text-muted-2">Loading the board…</p>;

  const shots = board?.shots ?? [];
  const marks = board?.marks ?? [];
  // Definition first: results only report arms that HAVE traffic, so before the
  // run there was nothing to attach a control screenshot to, and during a run a
  // zero-visitor arm would silently disappear from the board.
  const variations = arms.length ? arms.map((a) => ({ variationId: a.variationId, name: a.name })) : (results?.variations ?? []);

  const markStyle = (mk: EvidenceMark) => ({ left: `${mk.x}%`, top: `${mk.y}%`, width: `${mk.w}%`, height: `${mk.h}%` });

  /** WHERE THE CALLOUT SITS. Stored per mark once the reader drags it; until
   *  then, parked clear of the box — to its right if there is room, otherwise
   *  its left — never on top of it, and never off the edge of the shot. The
   *  old placement hung off the box's own top edge, which is precisely where
   *  the thing being pointed at usually is. */
  const calloutAt = (mk: EvidenceMark) => {
    if (mk.lx !== undefined && mk.ly !== undefined) return { x: mk.lx, y: mk.ly };
    const right = mk.x + mk.w + 2;
    return { x: right < 66 ? right : Math.max(1, mk.x - 30), y: Math.max(1, mk.y - 1) };
  };
  const toneOf = (mk: EvidenceMark): Tone => (mk.tone as Tone) ?? byKey[mk.measureKey]?.tone ?? "flat";

  /** THE LEADER LINE, end to end. Both ends are computed from live rectangles,
   *  so the line leaves the box on the side facing the callout and lands on the
   *  callout's near edge — and when the callout expands, the landing point
   *  slides to the edge of the bigger card instead of staying pinned to a
   *  corner that is no longer the corner. */
  const leader = (mk: EvidenceMark) => {
    const c = calloutAt(mk);
    const box: Rect = { x: mk.x, y: mk.y, w: mk.w, h: mk.h };
    const cal: Rect = geo[mk.id] ?? { x: c.x, y: c.y, w: 0, h: 0 };
    // Sitting on the thing it points at, a line would only add clutter.
    if (cal.x < box.x + box.w && cal.x + cal.w > box.x &&
        cal.y < box.y + box.h && cal.y + cal.h > box.y) return null;
    const a = edgePoint(box, cal.x + cal.w / 2, cal.y + cal.h / 2);
    const b = edgePoint(cal, box.x + box.w / 2, box.y + box.h / 2);
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  };

  return (
    <div className="space-y-4" ref={rootRef}>
      {err && <div className="text-[14px] text-danger print:hidden">{err}</div>}

      {/* caption — framing only; the verdict and findings stay on the readout */}
      <div className="flex items-start gap-3 flex-wrap">
        <input
          defaultValue={board?.caption ?? ""}
          onBlur={(e) => { if (e.target.value !== (board?.caption ?? "")) void post("caption", { caption: e.target.value }); }}
          placeholder="One line framing what these pictures show…"
          className="flex-1 min-w-60 h-9 px-3 rounded-lg border border-border bg-background text-[14px] placeholder:text-muted-2 focus:border-accent focus:outline-none print:border-0 print:px-0"
        />
        <button onClick={() => setDrawing((d) => !d)}
          className="h-9 px-3 rounded-lg border border-border text-[12.5px] font-semibold text-muted hover:text-foreground hover:border-border-strong print:hidden">
          {drawing ? "Draw mode" : "Presenting"}
        </button>
        <button onClick={() => window.print()} className="h-9 px-3 rounded-lg border border-border text-[12.5px] font-semibold text-muted hover:text-foreground hover:border-border-strong print:hidden">Print</button>
      </div>

      {/* add a screenshot per arm */}
      {shots.length < 8 && (
        <div className="flex items-center gap-2 flex-wrap print:hidden">
          {(variations.length ? variations : [{ variationId: "", name: "Screenshot" }]).map((v) => (
            <label key={v.variationId || v.name}
              className="h-9 px-3 inline-flex items-center rounded-lg border border-dashed border-border-strong text-[12.5px] font-medium text-muted hover:text-accent hover:border-accent cursor-pointer">
              {busy === "upload" ? "Uploading…" : `+ ${v.name} screenshot`}
              <input type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void addShot(f, v.variationId, v.name); e.currentTarget.value = ""; }} />
            </label>
          ))}
          <span className="text-[12.5px] text-muted-2">Full-page captures are downsized before upload.</span>
        </div>
      )}

      {/* the boards */}
      <div className={`grid gap-5 ${shots.length > 1 ? "xl:grid-cols-2" : ""}`}>
        {shots.map((shot) => (
          <section key={shot.id} className="rounded-xl border border-border bg-surface overflow-hidden break-inside-avoid">
            <div className="flex items-center gap-2 px-3.5 py-2 border-b border-border">
              <span className="text-[13.5px] font-semibold">{shot.label}</span>
              {shot.variationId === stats?.baselineVariationId && (
                <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted-2 border border-border rounded px-1.5">control</span>
              )}
              <span className="ml-auto text-[12.5px] text-muted-2">{marks.filter((m) => m.shotId === shot.id).length} tracked</span>
              <button onClick={() => post("dropShot", { dropShot: shot.id })} disabled={busy !== null}
                className="text-[12.5px] text-muted-2 hover:text-danger print:hidden">Remove</button>
            </div>

            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/prototypes/evidence/asset?key=${encodeURIComponent(prototypeKey)}&name=${encodeURIComponent(shot.asset)}`}
                alt={`${shot.label} screenshot`} className="block w-full h-auto" onLoad={measure} />

              <div
                data-shot={shot.id}
                className={`absolute inset-0 ${drawing ? "cursor-crosshair" : ""}`}
                onPointerDown={(e) => {
                  if (!drawing || e.target !== e.currentTarget) return;
                  const host = e.currentTarget.getBoundingClientRect();
                  const x0 = ((e.clientX - host.left) / host.width) * 100;
                  const y0 = ((e.clientY - host.top) / host.height) * 100;
                  const move = (ev: PointerEvent) => {
                    const el = document.getElementById("ev-ghost");
                    if (!el) return;
                    const x1 = ((ev.clientX - host.left) / host.width) * 100;
                    const y1 = ((ev.clientY - host.top) / host.height) * 100;
                    el.style.left = `${Math.min(x0, x1)}%`; el.style.top = `${Math.min(y0, y1)}%`;
                    el.style.width = `${Math.abs(x1 - x0)}%`; el.style.height = `${Math.abs(y1 - y0)}%`;
                  };
                  const ghost = document.createElement("div");
                  ghost.id = "ev-ghost";
                  ghost.className = "absolute border-2 border-dashed border-accent bg-accent/10 rounded-lg pointer-events-none";
                  e.currentTarget.appendChild(ghost);
                  const up = (ev: PointerEvent) => {
                    window.removeEventListener("pointermove", move);
                    window.removeEventListener("pointerup", up);
                    ghost.remove();
                    const x1 = ((ev.clientX - host.left) / host.width) * 100;
                    const y1 = ((ev.clientY - host.top) / host.height) * 100;
                    const box = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
                    if (box.w < 1.5 || box.h < 1) return;   // a click, not a drag
                    setPicking({ shotId: shot.id, box });
                  };
                  window.addEventListener("pointermove", move);
                  window.addEventListener("pointerup", up);
                }}
              >
                {marks.filter((m) => m.shotId === shot.id).map((mk) => {
                  const meas = byKey[mk.measureKey];
                  const tone = toneOf(mk);
                  return (
                    <div key={mk.id} style={markStyle(mk)}
                      title={[meas?.label, mk.note, meas?.detail].filter(Boolean).join(" — ")}
                      className={`absolute rounded-lg border-2 ${TONE_BOX[tone]} ${selected === mk.id ? "ring-2 ring-accent z-30" : "z-0 hover:z-30"}`}
                      onPointerDown={(e) => {
                        if ((e.target as HTMLElement).closest("[data-act]")) return;
                        setSelected(mk.id);
                        if (!drawing) return;
                        e.stopPropagation();
                        const resize = Boolean((e.target as HTMLElement).closest('[data-grip="1"]'));
                        const host = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                        const el = e.currentTarget as HTMLElement;
                        // Pointer origin and box origin are different things —
                        // conflating them makes every drag jump.
                        const from = { px: e.clientX, py: e.clientY, x: mk.x, y: mk.y, w: mk.w, h: mk.h };
                        const next = { ...from };
                        const move = (ev: PointerEvent) => {
                          const dx = ((ev.clientX - from.px) / host.width) * 100;
                          const dy = ((ev.clientY - from.py) / host.height) * 100;
                          if (resize) {
                            next.w = Math.min(100 - from.x, Math.max(1.5, from.w + dx));
                            next.h = Math.min(100 - from.y, Math.max(1.5, from.h + dy));
                          } else {
                            next.x = Math.min(100 - from.w, Math.max(0, from.x + dx));
                            next.y = Math.min(100 - from.h, Math.max(0, from.y + dy));
                          }
                          el.style.left = `${next.x}%`; el.style.top = `${next.y}%`;
                          el.style.width = `${next.w}%`; el.style.height = `${next.h}%`;
                        };
                        const up = () => {
                          window.removeEventListener("pointermove", move);
                          window.removeEventListener("pointerup", up);
                          void post("mark", { mark: { id: mk.id, x: next.x, y: next.y, w: next.w, h: next.h } });
                        };
                        window.addEventListener("pointermove", move);
                        window.addEventListener("pointerup", up);
                      }}
                    >
                      {palette === mk.id && drawing && (
                        <span className="absolute top-4 left-2 z-10 flex gap-1 p-1 rounded-lg border border-border-strong bg-surface shadow-lg" onPointerDown={(e) => e.stopPropagation()}>
                          {([["", "A"], ["up", ""], ["down", ""], ["warn", ""], ["new", ""], ["flat", ""]] as const).map(([t, lbl]) => (
                            <button key={t || "auto"} data-act="tone"
                              onClick={(e) => { e.stopPropagation(); setPalette(null); void post("mark", { mark: { id: mk.id, tone: t || null } }); }}
                              title={t ? t : "Earned colour (from the data)"}
                              className={`w-5 h-5 rounded border text-[10px] font-bold ${t ? TONE_BOX[t as Tone] : "border-border-strong text-muted"}`}>
                              {lbl}
                            </button>
                          ))}
                        </span>
                      )}

                      {/* INSIDE the corner, deliberately. Hanging it outside put it
                          under whichever callout was parked beside the box, so the
                          grab read as a move and the box could never be resized. */}
                      {drawing && (
                        <span data-grip="1" title="Drag to resize"
                          className="absolute right-0 bottom-0 w-4 h-4 rounded-tl rounded-br-[0.3rem] bg-accent border-l-2 border-t-2 border-surface cursor-nwse-resize touch-none print:hidden" />
                      )}
                    </div>
                  );
                })}

                {/* LEADER LINES. Drawn under the callouts so a line never
                    crosses a label, and in one SVG so the geometry is computed
                    from the same percentages the boxes and callouts use. */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                  {marks.filter((m) => m.shotId === shot.id).map((mk) => {
                    const seg = leader(mk);
                    if (!seg) return null;
                    const line = TONE_LINE[toneOf(mk)];
                    // Stroke widths are SCREEN pixels here: non-scaling-stroke
                    // cancels the viewBox scale. The old 0.18 was sized for that
                    // scale, so it drew a fifth of a pixel — a line nobody saw.
                    return (
                      <g key={`l-${mk.id}`}>
                        {/* the shot underneath is arbitrary, so the line carries its own ground */}
                        <line x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2}
                          stroke="currentColor" strokeWidth="4.5" strokeLinecap="round"
                          vectorEffect="non-scaling-stroke" className="text-surface" opacity="0.85" />
                        <line x1={seg.x1} y1={seg.y1} x2={seg.x1} y2={seg.y1}
                          stroke="currentColor" strokeWidth="9" strokeLinecap="round"
                          vectorEffect="non-scaling-stroke" className="text-surface" opacity="0.85" />
                        <line x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2}
                          stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"
                          vectorEffect="non-scaling-stroke" className={line} />
                        {/* a zero-length round-capped segment is a true circle even
                            though the viewBox is stretched */}
                        <line x1={seg.x1} y1={seg.y1} x2={seg.x1} y2={seg.y1}
                          stroke="currentColor" strokeWidth="5.5" strokeLinecap="round"
                          vectorEffect="non-scaling-stroke" className={line} />
                      </g>
                    );
                  })}
                </svg>

                {/* CALLOUTS. Siblings of the boxes, not children — a callout
                    can be dragged anywhere on the shot, including far from what
                    it points at, and the leader line carries the connection. */}
                {marks.filter((m) => m.shotId === shot.id).map((mk) => {
                  const meas = byKey[mk.measureKey];
                  const tone = toneOf(mk);
                  const c = calloutAt(mk);
                  const open = mk.pinned || openMark === mk.id;
                  // Closing has to clear BOTH reasons a card is open. Clearing
                  // only the transient one left a pinned card open, which read
                  // as "the close button is broken" — and then as "it will
                  // never come back", because the only other X on the chip was
                  // the delete.
                  const closeCard = () => {
                    setOpenMark((v) => (v === mk.id ? null : v));
                    if (mk.pinned) void post("mark", { mark: { id: mk.id, pinned: false } });
                  };
                  const toggleCard = () => { if (open) closeCard(); else setOpenMark(mk.id); };
                  return (
                    <div key={`c-${mk.id}`} id={`cal-${mk.id}`} data-cal={mk.id}
                      className={`absolute ${open ? "z-20" : "z-10"}`} style={{ left: `${c.x}%`, top: `${c.y}%` }}>
                      <span
                        onPointerDown={(e) => {
                          // DRAG THE LABEL, not the box. Window listeners, so the
                          // gesture survives the pointer leaving the chip.
                          if ((e.target as HTMLElement).closest("[data-act]")) return;
                          e.stopPropagation();
                          const el = document.getElementById(`cal-${mk.id}`);
                          const host = (e.currentTarget.closest("[data-shot]") as HTMLElement)?.getBoundingClientRect();
                          if (!el || !host) return;
                          // Grab OFFSET, or the callout snaps its own corner to
                          // the cursor on the first pixel of every drag.
                          const eb = el.getBoundingClientRect();
                          const off = { x: e.clientX - eb.left, y: e.clientY - eb.top };
                          const px = e.clientX;
                          const py = e.clientY;
                          const maxX = Math.max(0, 100 - (eb.width / host.width) * 100);
                          const maxY = Math.max(0, 100 - (eb.height / host.height) * 100);
                          const at = (ev: PointerEvent) => ({
                            x: Math.min(maxX, Math.max(0, ((ev.clientX - off.x - host.left) / host.width) * 100)),
                            y: Math.min(maxY, Math.max(0, ((ev.clientY - off.y - host.top) / host.height) * 100)),
                          });
                          let moved = false;
                          let frame = 0;
                          const move = (ev: PointerEvent) => {
                            if (Math.abs(ev.clientX - px) + Math.abs(ev.clientY - py) > 3) moved = true;
                            if (!moved) return;
                            const p = at(ev);
                            el.style.left = `${p.x}%`;
                            el.style.top = `${p.y}%`;
                            // The line follows the hand, not the commit.
                            if (!frame) frame = requestAnimationFrame(() => { frame = 0; measure(); });
                          };
                          const up = (ev: PointerEvent) => {
                            window.removeEventListener("pointermove", move);
                            window.removeEventListener("pointerup", up);
                            if (frame) cancelAnimationFrame(frame);
                            if (!moved) { toggleCard(); return; }   // a press, not a drag
                            const p = at(ev);
                            void post("mark", { mark: { id: mk.id, lx: p.x, ly: p.y } });
                          };
                          window.addEventListener("pointermove", move);
                          window.addEventListener("pointerup", up);
                        }}
                        className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border bg-surface shadow-sm text-[13px] font-bold tabular-nums whitespace-nowrap cursor-move select-none touch-none ${TONE_CHIP[tone]}`}>
                        <span className="font-semibold text-foreground max-w-[22rem] truncate">{meas?.label ?? mk.measureKey}</span>
                        {meas?.delta ?? ""}
                        {/* The affordance for the numbers. A bare dot here read as
                            decoration; the lightbox corners read as "open this". */}
                        <button data-act="open" title={open ? "Collapse the numbers" : "Open the numbers"}
                          onClick={(e) => { e.stopPropagation(); toggleCard(); }}
                          className="ml-0.5 text-muted-2 hover:text-foreground">
                          {open ? <IconCollapse /> : <IconExpand />}
                        </button>
                        {drawing && (
                          <>
                            <span className="w-px self-stretch bg-border" />
                            <button data-act="tone" onClick={(e) => { e.stopPropagation(); setPalette(palette === mk.id ? null : mk.id); }} className="text-muted-2 hover:text-foreground" title="Box colour">&#9673;</button>
                            <button data-act="note" onClick={(e) => { e.stopPropagation(); setNoteFor(mk.id); setNoteText(mk.note ?? ""); }} className="text-muted-2 hover:text-foreground" title="What is happening here?">&#9998;</button>
                            <button data-act="swap" onClick={(e) => { e.stopPropagation(); setPicking({ shotId: shot.id, box: { x: mk.x, y: mk.y, w: mk.w, h: mk.h }, markId: mk.id }); }} className="text-muted-2 hover:text-foreground" title="Change which element this is">&#8635;</button>
                            {/* A trash can, not an X. As an X it sat where a close
                                button belongs and deleted the annotation instead. */}
                            <button data-act="del" onClick={(e) => { e.stopPropagation(); void post("dropMark", { dropMark: mk.id }); }} className="text-muted-2 hover:text-danger" title="Delete this box">
                              <IconTrash />
                            </button>
                          </>
                        )}
                      </span>

                      {open && meas && (
                        <div className="mt-1.5 w-72 rounded-xl border border-border-strong bg-surface shadow-lg" onPointerDown={(e) => e.stopPropagation()}>
                          <div className="flex items-start gap-2 px-3.5 pt-3 pb-2">
                            <div className="text-[14px] font-bold leading-snug flex-1 min-w-0">{meas.label}</div>
                            <button data-act="pin" title={mk.pinned ? "Unpin" : "Pin open — stays open, and prints"}
                              onClick={(e) => { e.stopPropagation(); void post("mark", { mark: { id: mk.id, pinned: !mk.pinned } }); }}
                              className={`shrink-0 mt-px ${mk.pinned ? "text-accent" : "text-muted-2 hover:text-foreground"}`}>
                              <IconPin />
                            </button>
                            <button data-act="close" title="Close" onClick={(e) => { e.stopPropagation(); closeCard(); }}
                              className="shrink-0 mt-px text-muted-2 hover:text-foreground">
                              <IconClose />
                            </button>
                          </div>
                          <div className="px-3.5 pb-3.5">
                            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13.5px] tabular-nums">
                              <span className="text-muted-2">Change</span>
                              <span className={`font-bold text-right ${tone === "up" ? "text-ok" : tone === "down" ? "text-danger" : "text-muted"}`}>{meas.delta}</span>
                              <span className="text-muted-2">Variation</span>
                              <span className="text-right font-semibold">{meas.focusRate}</span>
                              {!meas.featureOnly && (<><span className="text-muted-2">Control</span><span className="text-right font-semibold">{meas.baseRate}</span></>)}
                              <span className="text-muted-2">Events</span>
                              <span className="text-right">{meas.events}</span>
                              <span className="text-muted-2">Reading</span>
                              <span className="text-right">{meas.settled}</span>
                            </div>
                            <p className="text-[13px] text-muted leading-snug mt-2.5 pt-2.5 border-t border-border">{mk.note ?? meas.detail}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        ))}
      </div>

      {shots.length === 0 && (
        <p className="text-[14px] text-muted-2">
          Add a screenshot of each arm, then drag a box over any tracked element. The box carries that metric&apos;s live number —
          it re-reads every time this page loads, so the picture can never disagree with the numbers.
        </p>
      )}

      {/* what the picture shows — one card per annotated metric */}
      {marks.length > 0 && (
        <section>
          <div className="text-[12.5px] font-bold uppercase tracking-[0.08em] text-muted-2 border-b border-border pb-1.5 mb-2.5">What the picture shows</div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[...new Set(marks.map((m) => m.measureKey))].map((key) => {
              const meas = byKey[key];
              const note = marks.find((m) => m.measureKey === key && m.note)?.note;
              if (!meas) return (
                <article key={key} className="rounded-xl border border-border bg-surface px-4 py-3">
                  <h4 className="text-[14px] font-bold">{key}</h4>
                  <p className="text-[13.5px] text-muted">This metric isn&apos;t reporting any more — the box is still on the picture, but there is no live number for it.</p>
                </article>
              );
              const cls = meas.tone === "up" ? "text-ok" : meas.tone === "down" ? "text-danger" : meas.tone === "new" ? "text-accent" : "text-muted";
              return (
                <article key={key} className="rounded-xl border border-border bg-surface px-4 py-3 break-inside-avoid">
                  <h4 className="text-[14px] font-bold flex items-center gap-2">
                    <span className="min-w-0 truncate">{meas.label}</span>
                    <span className={`ml-auto tabular-nums ${cls}`}>{meas.delta}</span>
                  </h4>
                  <p className="text-[13.5px] text-muted leading-snug mt-1">{note ?? meas.detail}</p>
                  <div className="text-[12.5px] text-muted-2 tabular-nums mt-2">{meas.rates}</div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* pick which tracked element a box is */}
      {picking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden" onClick={() => setPicking(null)}>
          <div className="w-full max-w-lg rounded-xl border border-border bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-border text-[14px] font-bold">Which tracked element is this?</div>
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {metrics.length === 0 && <p className="p-3 text-[13.5px] text-muted-2">No metrics are reporting yet — bind the plan first.</p>}
              {metrics.map((m) => (
                <button key={m.key}
                  onClick={() => {
                    const p = picking;
                    setPicking(null);
                    void post("mark", { mark: p.markId ? { id: p.markId, measureKey: m.key } : { shotId: p.shotId, measureKey: m.key, ...p.box } });
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-background text-left">
                  <span className="flex-1 text-[13.5px] font-semibold min-w-0 truncate">{m.label}</span>
                  <span className="text-[11.5px] text-muted-2 shrink-0">{m.tone === "new" ? "new surface" : m.tone === "flat" ? "inside luck's range" : "beyond luck"}</span>
                  <span className={`text-[13px] font-bold tabular-nums shrink-0 ${m.tone === "up" ? "text-ok" : m.tone === "down" ? "text-danger" : "text-muted"}`}>{m.delta}</span>
                </button>
              ))}
            </div>
            <div className="px-4 py-2.5 border-t border-border flex justify-end">
              <button onClick={() => setPicking(null)} className="h-8 px-3 rounded-lg border border-border text-[12.5px] font-medium text-muted hover:text-foreground">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* a line about THIS element on THIS screen */}
      {noteFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden" onClick={() => setNoteFor(null)}>
          <div className="w-full max-w-lg rounded-xl border border-border bg-surface shadow-xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="text-[14px] font-bold">What is happening here?</div>
            <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={3} maxLength={240}
              placeholder="e.g. guests take this route instead of the room-card CTA below"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-[14px] leading-snug focus:border-accent focus:outline-none resize-none" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setNoteFor(null)} className="h-8 px-3 rounded-lg border border-border text-[12.5px] font-medium text-muted hover:text-foreground">Cancel</button>
              <button onClick={() => { const idNow = noteFor; setNoteFor(null); void post("mark", { mark: { id: idNow, note: noteText } }); }}
                className="h-8 px-3 rounded-lg bg-accent text-accent-fg text-[12.5px] font-semibold hover:bg-accent-hover">Save</button>
            </div>
          </div>
        </div>
      )}

      {board?.updatedBy && (
        <div className="text-[12.5px] text-muted-2">Board last edited by {board.updatedBy}{board.updatedAt ? ` · ${board.updatedAt.slice(0, 16).replace("T", " ")}` : ""}</div>
      )}
    </div>
  );
}
