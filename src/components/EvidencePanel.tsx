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

import { useCallback, useEffect, useState } from "react";
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

  return (
    <div className="space-y-4">
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
                alt={`${shot.label} screenshot`} className="block w-full h-auto" />

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
                      className={`absolute rounded-lg border-2 ${TONE_BOX[tone]} ${selected === mk.id ? "ring-2 ring-accent" : ""}`}
                      onPointerDown={(e) => {
                        if ((e.target as HTMLElement).dataset.act) return;
                        setSelected(mk.id);
                        if (!drawing) return;
                        e.stopPropagation();
                        const resize = (e.target as HTMLElement).dataset.grip === "1";
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

                      {drawing && <span data-grip="1" className="absolute -right-2 -bottom-2 w-4 h-4 rounded bg-accent border-2 border-surface cursor-nwse-resize" />}
                    </div>
                  );
                })}

                {/* LEADER LINES. Drawn under the callouts so a line never
                    crosses a label, and in one SVG so the geometry is computed
                    from the same percentages the boxes and callouts use. */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 100">
                  {marks.filter((m) => m.shotId === shot.id).map((mk) => {
                    const c = calloutAt(mk);
                    return (
                      <line key={`l-${mk.id}`}
                        x1={mk.x + mk.w / 2} y1={mk.y + mk.h / 2} x2={c.x} y2={c.y}
                        stroke="currentColor" strokeWidth="0.18" vectorEffect="non-scaling-stroke"
                        className="text-border-strong" />
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
                  return (
                    <div key={`c-${mk.id}`} id={`cal-${mk.id}`} className="absolute z-10" style={{ left: `${c.x}%`, top: `${c.y}%` }}>
                      <span
                        onPointerDown={(e) => {
                          // DRAG THE LABEL, not the box. Window listeners, so the
                          // gesture survives the pointer leaving the chip.
                          if ((e.target as HTMLElement).closest("[data-act]")) return;
                          e.stopPropagation();
                          const host = (e.currentTarget.closest("[data-shot]") as HTMLElement)?.getBoundingClientRect();
                          if (!host) return;
                          const move = (ev: PointerEvent) => {
                            const el = document.getElementById(`cal-${mk.id}`);
                            if (!el) return;
                            el.style.left = `${Math.min(97, Math.max(0, ((ev.clientX - host.left) / host.width) * 100))}%`;
                            el.style.top = `${Math.min(97, Math.max(0, ((ev.clientY - host.top) / host.height) * 100))}%`;
                          };
                          const up = (ev: PointerEvent) => {
                            window.removeEventListener("pointermove", move);
                            window.removeEventListener("pointerup", up);
                            const lx = Math.min(97, Math.max(0, ((ev.clientX - host.left) / host.width) * 100));
                            const ly = Math.min(97, Math.max(0, ((ev.clientY - host.top) / host.height) * 100));
                            if (Math.abs(lx - c.x) < 0.4 && Math.abs(ly - c.y) < 0.4) {
                              setOpenMark(openMark === mk.id ? null : mk.id);   // a click, not a drag
                              return;
                            }
                            void post("mark", { mark: { id: mk.id, lx, ly } });
                          };
                          window.addEventListener("pointermove", move);
                          window.addEventListener("pointerup", up);
                        }}
                        className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border bg-surface shadow-sm text-[13px] font-bold tabular-nums whitespace-nowrap cursor-move select-none ${TONE_CHIP[tone]}`}>
                        <span className="font-semibold text-foreground max-w-[22rem] truncate">{meas?.label ?? mk.measureKey}</span>
                        {meas?.delta ?? ""}
                        <button data-act="pin" title={mk.pinned ? "Unpin" : "Pin open — stays open, and prints"}
                          onClick={(e) => { e.stopPropagation(); void post("mark", { mark: { id: mk.id, pinned: !mk.pinned } }); }}
                          className={`text-[12px] ${mk.pinned ? "text-accent" : "text-muted-2 hover:text-foreground"}`}>&#9679;</button>
                        {drawing && (
                          <>
                            <button data-act="tone" onClick={(e) => { e.stopPropagation(); setPalette(palette === mk.id ? null : mk.id); }} className="text-muted-2 hover:text-foreground" title="Box colour">&#9673;</button>
                            <button data-act="note" onClick={(e) => { e.stopPropagation(); setNoteFor(mk.id); setNoteText(mk.note ?? ""); }} className="text-muted-2 hover:text-foreground" title="What is happening here?">&#9998;</button>
                            <button data-act="swap" onClick={(e) => { e.stopPropagation(); setPicking({ shotId: shot.id, box: { x: mk.x, y: mk.y, w: mk.w, h: mk.h }, markId: mk.id }); }} className="text-muted-2 hover:text-foreground" title="Change which element this is">&#8635;</button>
                            <button data-act="del" onClick={(e) => { e.stopPropagation(); void post("dropMark", { dropMark: mk.id }); }} className="text-muted-2 hover:text-danger" title="Remove">&#215;</button>
                          </>
                        )}
                      </span>

                      {open && meas && (
                        <div className="mt-1.5 w-72 rounded-xl border border-border-strong bg-surface shadow-lg p-3.5">
                          <div className="text-[14px] font-bold leading-snug mb-2.5">{meas.label}</div>
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
