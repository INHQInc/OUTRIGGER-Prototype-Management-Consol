"use client";

import Link from "next/link";
import { Fragment, useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { BOARD_COLUMNS, BOARD_SORTS, sortCards, armColor, type BoardCard, type BoardColumn, type SortId } from "@/lib/prototypes/board-model";
import { ScoreBadge, PriorityDot } from "@/components/ScorePanel";
import { REACH, IMPACT, EFFORT, BAND_LABEL, formatRice, formatWeeks } from "@/lib/prototypes/score";
import { StageStrip } from "@/components/StageStrip";

type Filter = "all" | "blocked" | BoardColumn;

const STAGE_ORDER = BOARD_COLUMNS.map((c) => c.id);
const stageLabel = (id: BoardColumn) => BOARD_COLUMNS.find((x) => x.id === id)?.label ?? id;
const isBlocked = (c: BoardCard) => c.pipeline.steps.some((s) => s.state === "blocked");

/**
 * THE EXPORT IS THE TABLE'S CONTENT, NOT A SUBSET OF IT. A row on screen is a
 * summary — five cells — but the thing a person wants in a spreadsheet is the
 * whole story: where it is, what is holding it, what to do next, and what it is
 * measured on. So the CSV carries every field the card knows, in pipeline
 * order, rather than mirroring the five visible columns.
 */
const CSV_COLUMNS: { header: string; cell: (c: BoardCard, origin: string) => string }[] = [
  { header: "Test", cell: (c) => (c.arm ? `${c.arm.groupName ?? c.arm.groupId} (arm ${c.arm.index}/${c.arm.count})` : "") },
  { header: "Stage", cell: (c) => stageLabel(c.column) },
  { header: "Stage detail", cell: (c) => c.pipeline.stage.status ?? "" },
  { header: "Blocked", cell: (c) => (isBlocked(c) ? "yes" : "no") },
  { header: "Next action", cell: (c) => c.pipeline.primaryAction?.label ?? "" },
  { header: "Alerts", cell: (c) => c.pipeline.alerts.map((a) => `[${a.level}] ${a.text}`).join(" | ") },
  { header: "Name", cell: (c) => c.name },
  { header: "Key", cell: (c) => c.key },
  { header: "Description", cell: (c) => c.description ?? "" },
  { header: "Website area", cell: (c) => c.where ?? "" },
  { header: "Hypothesis", cell: (c) => hypothesisOf(c) },
  { header: "Primary metric", cell: (c) => c.metric ?? "" },
  { header: "Supporting KPIs", cell: (c) => (c.guardrails ?? []).join(" · ") },
  { header: "Files", cell: (c) => (c.attachmentCount ? String(c.attachmentCount) : "") },
  { header: "Versions", cell: (c) => (c.versionCount ? String(c.versionCount) : "0") },
  { header: "Experiment", cell: (c) => c.experimentStatus?.replace("_", " ") ?? "not bound" },
  { header: "Locked", cell: (c) => (c.locked ? "yes" : "no") },
  { header: "Owner", cell: (c) => c.owner ?? "" },
  // PRIORITY, AS INPUTS AND AS A RESULT. A spreadsheet that carried only the
  // score would be a column of numbers nobody could argue with or correct; the
  // four inputs beside it are what make the ranking reviewable away from the app.
  { header: "Score (RICE)", cell: (c) => (c.score?.rice != null ? formatRice(c.score.rice) : "") },
  { header: "Band", cell: (c) => (c.score?.band ? BAND_LABEL[c.score.band] : "") },
  { header: "Reach / month", cell: (c) => (c.score?.reachPerMonth != null ? String(c.score.reachPerMonth) : "") },
  { header: "Impact", cell: (c) => (c.score?.impactFactor != null ? String(c.score.impactFactor) : "") },
  { header: "Confidence", cell: (c) => (c.score ? `${Math.round(c.score.confidence * 100)}%` : "") },
  { header: "Evidence", cell: (c) => (c.score ? String(c.score.evidenceCount) : "") },
  { header: "Effort (days)", cell: (c) => (c.score?.effortDays != null ? String(c.score.effortDays) : "") },
  { header: "Run time (weeks)", cell: (c) => (c.score?.weeksToDecide != null ? String(c.score.weeksToDecide) : "") },
  { header: "Can decide?", cell: (c) => (!c.score?.scored ? "" : c.score.underpowered ? "at risk" : "yes") },
  { header: "Queue rank", cell: (c) => (typeof c.priority === "number" ? String(c.priority / 10) : "") },
  { header: "URL", cell: (c, origin) => `${origin}/prototypes/${c.key}` },
];

/** The hypothesis as one sentence, the way the plan and the tracker state it. */
function hypothesisOf(c: BoardCard): string {
  if (!c.hypothesis && !c.outcome) return "";
  return `We believe ${c.hypothesis || "[change]"}${c.audience ? ` for ${c.audience}` : ""}${c.outcome ? ` will cause ${c.outcome}` : ""}.`;
}

/**
 * THE TRACKER'S SHAPE. This view is the SharePoint Pipeline Tracker's columns
 * against live data — Description, Website area, Hypothesis and Supporting
 * KPIs are the substance people actually read, and keeping them out meant the
 * console could not answer a question the spreadsheet could.
 *
 * It is deliberately wide and scrolls sideways: prose columns wrap to a width
 * cap rather than truncating, because a hypothesis cut off at one line is worse
 * than no hypothesis. The board stays the scanning view; this is the reading one.
 *
 * Tracker columns Prism has no field for — Effort, Target Qtr., Start and Est.
 * End Date — are absent rather than faked. Still not here: key and URL (the row
 * is a link), stage detail and blocked (the Status chip says both).
 */
// NO "TEST" COLUMN. A/B/n membership is a flag on a handful of rows, not a
// dimension of every row — as a column it reserved the leftmost, most prominent
// width in the table and spent it on an em dash for everything ungrouped. It
// rides on the Experiment cell now, exactly as the board card renders it: same
// dot, same colour, same "arm 2/5". One grammar in both views. The CSV keeps
// its Test column, because a spreadsheet DOES want it as a field.
const HEADERS: { label: string; right?: boolean; sort?: SortId; hint?: string }[] = [
  { label: "#", right: true, sort: "priority", hint: "position in this list under the current sort — your hand-ordering where you set one" },
  { label: "Experiment", sort: "name" },
  { label: "Status" },
  { label: "Score", right: true, sort: "score", hint: "RICE — (reach × impact × confidence) ÷ effort" },
  { label: "Description" },
  { label: "Website area" },
  { label: "Hypothesis" },
  { label: "Primary KPI" },
  { label: "Supporting KPIs" },
  { label: "Next step" },
  { label: "Alerts", sort: "alerts" },
  { label: "Reach", right: true, hint: "visitors a month on the area it targets" },
  { label: "Impact", right: true, hint: "expected size of the effect" },
  { label: "Confidence", right: true, hint: "counted from the evidence ticked on the brief" },
  { label: "Effort", right: true, sort: "effort", hint: "build + review, person-days" },
  { label: "Run time", right: true, hint: "weeks to a readable result at this reach" },
  { label: "Versions", right: true },
  { label: "Optimizely" },
  { label: "Files", right: true },
  { label: "Owner" },
];

/**
 * THE ROW'S PROSE, IN ONE LIST. Every long-text column reads from here, and so
 * does the overlay — so the cell you clicked and the panel that opens cannot
 * disagree about what the field is called or where its text comes from.
 */
const PROSE: { id: string; label: string; get: (c: BoardCard) => string }[] = [
  { id: "description", label: "Description", get: (c) => c.description ?? "" },
  { id: "where", label: "Website area", get: (c) => c.where ?? "" },
  { id: "hypothesis", label: "Hypothesis", get: (c) => hypothesisOf(c) },
  { id: "metric", label: "Primary KPI", get: (c) => c.metric ?? "" },
  { id: "guardrails", label: "Supporting KPIs", get: (c) => (c.guardrails ?? []).join(" · ") },
  { id: "next", label: "Next step", get: (c) => c.pipeline.primaryAction?.label ?? "" },
];

/** Past this many characters a cell cannot show its text on one line, so it
 *  gets the "more" affordance. A length test, not a measurement: it is stable
 *  across zoom and column resize, and it never flickers on a re-render. */
const LONG = 58;

const chipTone = (c: BoardCard) =>
  isBlocked(c) ? "border-danger/40 text-danger bg-[color-mix(in_srgb,var(--danger)_6%,transparent)]"
  : c.locked || c.column === "handoff" ? "border-ok/40 text-ok bg-[color-mix(in_srgb,var(--ok)_7%,transparent)]"
  : "border-warn/40 text-warn bg-[color-mix(in_srgb,var(--warn)_7%,transparent)]";
const dotTone = (c: BoardCard) => (isBlocked(c) ? "bg-danger" : c.locked || c.column === "handoff" ? "bg-ok" : "bg-warn");
const statusLabel = (c: BoardCard) => {
  const col = stageLabel(c.column);
  if (isBlocked(c)) return `Blocked at ${col}`;
  return c.locked ? `${col} · LIVE \u{1F512}` : col;
};

/** RFC 4180: quote anything containing a comma, quote or newline; double the quotes. */
const csvCell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/**
 * The Prototypes table — Optimizely's Optimizations grammar, our ground truth.
 * Rows are GROUPED BY STAGE in pipeline order rather than listed flat, because
 * "where is everything?" is the question this view exists to answer; a flat
 * list sorted by priority answers a question nobody asked. Within a stage the
 * order is priority, then name. One row = the whole story; clicking opens it.
 */
export function PrototypeTable({ cards }: { cards: BoardCard[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  /** THE SAME SORT DEFINITIONS THE BOARD USES — imported, not re-declared, so
   *  "Score" cannot come to mean one thing on the board and another here. */
  const [sort, setSort] = useState<SortId>("priority");
  /** Grouped by stage answers "where is everything?"; flat answers "what is
   *  worth doing next?". Both are real questions and they want different
   *  shapes, so this is a toggle rather than a decision made for you. */
  const [grouped, setGrouped] = useState(true);
  /** Which row's prose is open, and which field it was opened from. */
  const [peek, setPeek] = useState<{ card: BoardCard; field: string } | null>(null);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const matched = cards
      .filter((c) => (filter === "all" ? true : filter === "blocked" ? isBlocked(c) : c.column === filter))
      // Search the whole row's prose, not two fields of it. Description now
      // carries the PROBLEM rather than the change, so a filter that only read
      // name + description would stop matching the words people actually
      // remember a test by — which are the words of the change.
      .filter((c) => !needle || [c.name, c.description, c.hypothesis, c.outcome, c.where, c.metric]
        .some((v) => (v ?? "").toLowerCase().includes(needle)));
    // sortCards keeps arms of one test adjacent and in arm order whatever the
    // sort — a test split across four non-adjacent rows is not "tied together".
    const inOrder = sortCards(matched, sort);
    return grouped
      ? [...inOrder].sort((a, b) => STAGE_ORDER.indexOf(a.column) - STAGE_ORDER.indexOf(b.column))
      : inOrder;
  }, [cards, q, filter, sort, grouped]);

  const groups = useMemo(
    () => BOARD_COLUMNS.map((col) => ({ col, rows: shown.filter((c) => c.column === col.id) })).filter((g) => g.rows.length),
    [shown]);

  function downloadCsv() {
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    const body = [
      CSV_COLUMNS.map((c) => c.header),
      ...shown.map((card) => CSV_COLUMNS.map((c) => c.cell(card, origin))),
    ].map((row) => row.map(csvCell).join(",")).join("\r\n");
    // BOM first: without it Excel reads the file as the local codepage and the
    // stage names, arrows and quotes in the alert text arrive as mojibake.
    const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prototypes-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      {/* Toolbar — search · status · export */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-2.5 flex-wrap">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name, problem, hypothesis, area or metric"
          className="flex-1 min-w-[200px] max-w-sm rounded-lg bg-background border border-border px-3 py-2 text-[14px] text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none" />
        <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}
          className="rounded-lg bg-surface border border-border px-2.5 py-2 text-[13.5px] text-muted focus:border-accent focus:outline-none">
          <option value="all">Stage · All</option>
          <option value="blocked">⚠ Blocked</option>
          {BOARD_COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <span className="text-[12.5px] text-muted-2 tabular-nums">{shown.length} of {cards.length}</span>
        <label className="text-[12.5px] text-muted-2 flex items-center gap-1.5 cursor-pointer select-none"
          title="Grouped answers &ldquo;where is everything?&rdquo;. Ungrouped answers &ldquo;what is worth doing next?&rdquo; — sort by Score and read the top of the list.">
          <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} className="accent-[var(--accent)]" />
          Group by stage
        </label>
        <button type="button" onClick={downloadCsv} disabled={shown.length === 0}
          title="Download the rows shown, with every field — stage, next action, alerts, metric, experiment, owner and link."
          className="ml-auto rounded-lg border border-border bg-surface px-3 py-2 text-[13px] font-semibold text-muted hover:text-foreground hover:border-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          ↓ Export CSV
        </button>
      </div>

      <div className="px-4 py-2 border-b border-border flex items-center gap-1.5 flex-wrap">
        <span className="text-[12.5px] text-muted-2 shrink-0">Sort</span>
        {BOARD_SORTS.map((s) => (
          <button key={s.id} type="button" onClick={() => setSort(s.id)} title={s.hint}
            className={`rounded-md px-2 py-0.5 text-[12.5px] transition-colors ${
              sort === s.id ? "bg-surface-2 text-foreground font-semibold" : "text-muted-2 hover:text-foreground"}`}>
            {s.label}
          </button>
        ))}
        <span className="text-[12.5px] text-muted-2 ml-1.5 min-w-0 truncate">
          — {BOARD_SORTS.find((x) => x.id === sort)?.hint}{grouped ? ", within each stage" : ""}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px] border-collapse">
          <thead>
            <tr className="border-b border-border">
              {HEADERS.map((h) => {
                const active = h.sort && sort === h.sort;
                return (
                  <th key={h.label} title={[h.hint, h.sort ? "Click to sort by this." : null].filter(Boolean).join(" ")}
                    aria-sort={active ? "descending" : undefined}
                    className={`px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider whitespace-nowrap ${
                      h.right ? "text-right" : "text-left"} ${active ? "text-foreground" : "text-muted-2"} ${
                      h.sort ? "cursor-pointer hover:text-foreground transition-colors" : ""}`}
                    onClick={h.sort ? () => setSort(h.sort!) : undefined}>
                    {h.label}{active ? " ↓" : ""}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={HEADERS.length} className="px-4 py-10 text-center text-[14px] text-muted-2">No prototypes match{q ? ` “${q}”` : ""}.</td></tr>
            ) : grouped ? groups.map(({ col, rows }) => (
              <Fragment key={col.id}>
                <tr className="bg-surface-2/40 border-y border-border">
                  <td colSpan={HEADERS.length} className="px-4 py-2">
                    <span className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">{col.label}</span>
                    <span className="ml-2 text-[11.5px] tabular-nums text-muted-2">{rows.length}</span>
                    <span className="ml-3 text-[12px] text-muted-2 hidden sm:inline">{col.hint}</span>
                  </td>
                </tr>
                {rows.map((c, i) => <Row key={c.key} c={c} n={i + 1} router={router} onPeek={(f) => setPeek({ card: c, field: f })} />)}
              </Fragment>
            )) : shown.map((c, i) => <Row key={c.key} c={c} n={i + 1} router={router} onPeek={(f) => setPeek({ card: c, field: f })} />)}
          </tbody>
        </table>
      </div>

      {peek && <ProsePeek card={peek.card} field={peek.field} onClose={() => setPeek(null)} />}
    </div>
  );
}

/** An em dash in the muted tone — the table's one way of saying "nothing here". */
const Nil = () => <span className="text-muted-2">—</span>;

/**
 * ONE LINE, AND AN HONEST WAY TO SEE THE REST.
 *
 * These cells used to wrap to their full height. A single Description carrying
 * an audit quotation made one row 600px tall, which pushed every other row off
 * screen and cost the grid the only thing it is for — comparing rows at a
 * glance. Wrapping was a deliberate earlier choice ("a hypothesis cut off at
 * one line is worse than no hypothesis"); the answer to that is not to wrap,
 * it is to make the full text one click away and obviously so.
 *
 * The "more" chip is ALWAYS visible, never hover-only: the row is itself a link
 * to the prototype, so without a permanent marker there is nothing to
 * distinguish a cell that opens a panel from one that navigates away. It is
 * shown on a character count rather than a measured overflow — stable across
 * zoom and column width, and it cannot flicker during a re-render.
 */
function Prose({ text, onOpen }: { text: string; onOpen: () => void }) {
  if (!text.trim()) return <Nil />;
  if (text.length <= LONG) return <span className="leading-snug">{text}</span>;
  return (
    <button type="button"
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
      title="Show the full text"
      className="group w-full text-left flex items-baseline gap-1.5 min-w-0 rounded hover:bg-surface-2/60 -mx-1 px-1 py-0.5 transition-colors">
      <span className="truncate min-w-0 flex-1 group-hover:text-foreground transition-colors">{text}</span>
      <span className="shrink-0 text-[11px] font-semibold rounded px-1 py-0.5 border border-accent/40 text-accent group-hover:bg-accent group-hover:text-accent-fg transition-colors">
        more
      </span>
    </button>
  );
}

/**
 * The whole row's prose, opened from whichever cell you clicked.
 *
 * It shows the clicked field first and the rest beneath it, because the
 * question behind "what does that say?" is almost never about one cell — you
 * noticed something in the Description and now you want the hypothesis and the
 * metric next to it. One click, the whole story, without losing your place in
 * the table.
 */
function ProsePeek({ card, field, onClose }: { card: BoardCard; field: string; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const first = PROSE.find((f) => f.id === field);
  const rest = PROSE.filter((f) => f.id !== field && f.get(card).trim());
  return (
    <div role="dialog" aria-modal="true" aria-label={`${card.name} — ${first?.label ?? "details"}`}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8 overflow-y-auto bg-background/70 backdrop-blur-[2px]">
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl my-auto rounded-xl border border-border-strong bg-surface shadow-lg">
        <div className="flex items-start gap-3 px-5 py-3.5 border-b border-border">
          <div className="min-w-0">
            <div className="text-[12.5px] uppercase tracking-wider font-semibold text-muted-2">{first?.label}</div>
            <div className="text-[15px] font-semibold leading-snug truncate">{card.name}</div>
          </div>
          <button onClick={onClose} aria-label="Close"
            className="ml-auto shrink-0 h-7 w-7 rounded-lg border border-border text-muted-2 hover:text-foreground hover:border-border-strong transition-colors">✕</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <p className="text-[14px] leading-relaxed whitespace-pre-wrap">
            {first?.get(card).trim() || <span className="text-muted-2">Nothing written here yet.</span>}
          </p>
          {rest.length > 0 && (
            <div className="pt-3 border-t border-border/60 space-y-3">
              {rest.map((f) => (
                <div key={f.id}>
                  <div className="text-[12.5px] uppercase tracking-wider font-semibold text-muted-2 mb-0.5">{f.label}</div>
                  <p className="text-[13.5px] text-muted leading-snug whitespace-pre-wrap">{f.get(card)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-border">
          <Link href={`/prototypes/${card.key}`} className="text-[13.5px] font-semibold text-accent hover:text-accent-hover">
            Open {card.name} →
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * ONE ROW, IN HEADER ORDER.
 *
 * It is a component rather than inline JSX because the table renders rows from
 * two places now — grouped under stage headings, and flat when you sort the
 * whole programme by score — and two copies of twenty-one cells would drift
 * apart on the first edit. Extracting it also surfaced a real defect: the cells
 * used to run description → hypothesis → ALERTS → metric → guardrails → next
 * step while the headers read … → Primary KPI → Supporting KPIs → Next step →
 * Alerts. Four columns were sitting under the wrong headings, so the alert
 * count was labelled "Primary KPI". The order below matches HEADERS exactly.
 */
function Row({ c, n, router, onPeek }: { c: BoardCard; n: number; router: ReturnType<typeof useRouter>; onPeek: (field: string) => void }) {
  const d = c.score;
  const reach = REACH.find((r) => r.perMonth === d?.reachPerMonth);
  const impact = IMPACT.find((i) => i.factor === d?.impactFactor);
  const effort = EFFORT.find((e) => e.days === d?.effortDays);
  return (
    <tr onClick={() => router.push(`/prototypes/${c.key}`)}
      className="border-b border-border/60 last:border-0 hover:bg-surface-2/40 cursor-pointer transition-colors">
      {/* # — WHERE THIS ROW SITS, not what is stored against it.
          The stored `priority` is only written when somebody drags a card on
          the board, so printing it here would have made the new first column a
          wall of em dashes for everything nobody has hand-ordered — exactly the
          problem the Test column had. The position is always true, always
          present, and it is the same numeral the board puts on its queue. The
          stored rank is still the thing a mark and the tooltip talk about. */}
      <td className="px-4 py-3.5 align-top w-[4ch]">
        {/* The same coloured seat the board draws, so the two views read alike. */}
        <PriorityDot d={c.score} n={n}
          title={typeof c.priority === "number"
            ? `${n} here. You hand-ordered this one on the board (seat ${c.priority / 10} in its column).`
            : `${n} here, by the current sort. Never hand-ordered — it sits where the score puts it.`} />
      </td>

      {/* Experiment — and, above the name, the test it is an arm of. */}
      <td className="px-4 py-3.5 align-top min-w-[16rem]"
        style={c.arm ? { borderLeft: `3px solid ${armColor(c.arm.groupId)}` } : undefined}>
        {c.arm && (
          <div className="flex items-center gap-1.5 text-[11.5px] font-semibold leading-none mb-1"
            title={`${c.arm.groupName ?? c.arm.groupId} — an A/B/n test of ${c.arm.count} arms, run as one experiment and judged on one metric.`}>
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: armColor(c.arm.groupId) }} />
            <span className="truncate max-w-[14ch]" style={{ color: armColor(c.arm.groupId) }}>{c.arm.groupName ?? c.arm.groupId}</span>
            <span className="text-muted-2 shrink-0 tabular-nums">arm {c.arm.index}/{c.arm.count}</span>
            {c.arm.split && <span className="text-danger shrink-0" title="These arms are bound to DIFFERENT Optimizely experiments — that is not one test.">⚠</span>}
          </div>
        )}
        <Link href={`/prototypes/${c.key}`} onClick={(e) => e.stopPropagation()} className="text-[14.5px] font-semibold text-accent hover:text-accent-hover">{c.name}</Link>
        <StageStrip pipeline={c.pipeline} className="mt-2 max-w-[150px]" />
      </td>

      {/* Status */}
      <td className="px-4 py-3.5 align-top whitespace-nowrap">
        <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-[12.5px] font-semibold ${chipTone(c)}`}>
          <span className={`w-2 h-2 rounded-full ${dotTone(c)}`} />{statusLabel(c)}
        </span>
        {c.deployedAt && <div className="text-[12px] text-ok mt-1">live {c.deployedAt.slice(0, 10)}</div>}
        {c.held && <div className="text-[12px] text-muted-2 mt-1">held · facts say {stageLabel(c.derivedColumn)}</div>}
      </td>

      {/* Score — the same chip the board draws, from the same derivation. */}
      <td className="px-4 py-3.5 align-top text-right whitespace-nowrap">
        {d ? <ScoreBadge d={d} /> : <Nil />}
      </td>

      {/* Description */}
      <td className="px-4 py-3.5 align-top text-muted-2 w-[30ch] max-w-[30ch]">
        <Prose text={c.description ?? ""} onOpen={() => onPeek("description")} />
      </td>

      {/* Website area */}
      <td className="px-4 py-3.5 align-top text-muted-2 w-[22ch] max-w-[22ch]">
        <Prose text={c.where ?? ""} onOpen={() => onPeek("where")} />
      </td>

      {/* Hypothesis */}
      <td className="px-4 py-3.5 align-top text-muted-2 w-[32ch] max-w-[32ch]">
        <Prose text={hypothesisOf(c)} onOpen={() => onPeek("hypothesis")} />
      </td>

      {/* Primary KPI */}
      <td className="px-4 py-3.5 align-top w-[24ch] max-w-[24ch]">
        {c.metric
          ? <div className="text-foreground/90"><Prose text={c.metric} onOpen={() => onPeek("metric")} /></div>
          : <span className="text-warn text-[13px]">needs a success metric</span>}
      </td>

      {/* Supporting KPIs — joined on one line; the panel shows them apart. */}
      <td className="px-4 py-3.5 align-top text-muted-2 w-[24ch] max-w-[24ch]">
        <Prose text={(c.guardrails ?? []).join(" · ")} onOpen={() => onPeek("guardrails")} />
      </td>

      {/* Next step */}
      <td className="px-4 py-3.5 align-top text-muted w-[20ch] max-w-[20ch]">
        <Prose text={c.pipeline.primaryAction?.label ?? ""} onOpen={() => onPeek("next")} />
      </td>

      {/* Alerts */}
      <td className="px-4 py-3.5 align-top whitespace-nowrap">
        {(() => {
          const as = c.pipeline.alerts;
          if (!as.length) return <Nil />;
          const bad = as.some((a) => a.level === "danger");
          return (
            <span title={as.map((a) => `${a.level === "danger" ? "✗" : "⚠"} ${a.text}`).join("\n\n")}
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[12px] font-semibold tabular-nums ${bad ? "border-danger/40 text-danger" : "border-warn/40 text-warn"}`}>
              {bad ? "✗" : "⚠"} {as.length}
            </span>
          );
        })()}
      </td>

      {/* ── THE SCORE'S WORKING ─────────────────────────────────────────────
          Four inputs, shown as inputs. A spreadsheet holding only the result
          is a column nobody can check or argue with, and a ranking you cannot
          argue with is one people quietly route around. */}
      <td className="px-4 py-3.5 align-top text-right tabular-nums text-muted whitespace-nowrap" title={reach?.hint}>
        {d?.reachPerMonth != null ? `${(d.reachPerMonth / 1000).toFixed(0)}k` : <Nil />}
      </td>
      <td className="px-4 py-3.5 align-top text-right tabular-nums text-muted whitespace-nowrap" title={impact?.hint}>
        {impact ? impact.label : <Nil />}
      </td>
      <td className="px-4 py-3.5 align-top text-right tabular-nums text-muted whitespace-nowrap"
        title={d ? `${d.evidenceCount} of 6 evidence boxes ticked on the brief.` : undefined}>
        {d?.scored || d?.evidenceCount ? `${Math.round((d?.confidence ?? 0) * 100)}%` : <Nil />}
      </td>
      <td className="px-4 py-3.5 align-top text-right tabular-nums text-muted whitespace-nowrap" title={effort?.hint}>
        {d?.effortDays != null ? `${d.effortDays}d` : <Nil />}
      </td>
      {/* Run time — the question the score never asks: can this test actually
          produce an answer? Warn-coloured because it is a fact about the
          traffic, not a preference about the idea. */}
      <td className="px-4 py-3.5 align-top text-right tabular-nums whitespace-nowrap" title={d?.powerNote ?? undefined}>
        {d?.weeksToDecide != null
          ? <span className={d.underpowered ? "text-warn font-semibold" : "text-muted"}>{formatWeeks(d.weeksToDecide).replace("~", "").replace(" weeks", "w").replace(" week", "w")}</span>
          : d?.underpowered ? <span className="text-warn" title={d.powerNote ?? undefined}>⚠</span>
          : <Nil />}
      </td>

      <td className="px-4 py-3.5 align-top text-right tabular-nums font-semibold">{c.versionCount ?? "—"}</td>
      <td className="px-4 py-3.5 align-top whitespace-nowrap">
        {c.experimentStatus
          ? <Link href={`/prototypes/${c.key}?tab=optimizely`} onClick={(e) => e.stopPropagation()}
              className={`text-[13px] font-medium ${c.experimentStatus === "running" ? "text-ok" : "text-accent"} hover:opacity-80`}>
              {c.experimentStatus === "running" ? "running — results ↗" : c.experimentStatus.replace("_", " ")}
            </Link>
          : <span className="text-muted-2 text-[13px]">not bound</span>}
      </td>
      <td className="px-4 py-3.5 align-top text-right tabular-nums text-muted" title="supporting files committed to the branch">
        {c.attachmentCount ? `📎 ${c.attachmentCount}` : <Nil />}
      </td>
      <td className="px-4 py-3.5 align-top whitespace-nowrap text-muted">{c.owner ?? <Nil />}</td>
    </tr>
  );
}
