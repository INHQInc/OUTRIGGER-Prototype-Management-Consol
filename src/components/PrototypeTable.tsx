"use client";

import Link from "next/link";
import { Fragment, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { BOARD_COLUMNS, BOARD_SORTS, sortCards, armColor, type BoardCard, type BoardColumn, type SortId } from "@/lib/prototypes/board-model";
import { ScoreBadge } from "@/components/ScorePanel";
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
const HEADERS: { label: string; right?: boolean; sort?: SortId; hint?: string }[] = [
  { label: "Test" },
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
  { label: "Rank", right: true, sort: "priority", hint: "your hand-ordering on the board" },
];

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
                {rows.map((c) => <Row key={c.key} c={c} router={router} />)}
              </Fragment>
            )) : shown.map((c) => <Row key={c.key} c={c} router={router} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** An em dash in the muted tone — the table's one way of saying "nothing here". */
const Nil = () => <span className="text-muted-2">—</span>;

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
function Row({ c, router }: { c: BoardCard; router: ReturnType<typeof useRouter> }) {
  const d = c.score;
  const reach = REACH.find((r) => r.perMonth === d?.reachPerMonth);
  const impact = IMPACT.find((i) => i.factor === d?.impactFactor);
  const effort = EFFORT.find((e) => e.days === d?.effortDays);
  return (
    <tr onClick={() => router.push(`/prototypes/${c.key}`)}
      className="border-b border-border/60 last:border-0 hover:bg-surface-2/40 cursor-pointer transition-colors">
      {/* Test */}
      <td className="px-4 py-3.5 align-top whitespace-nowrap"
        style={c.arm ? { borderLeft: `3px solid ${armColor(c.arm.groupId)}` } : undefined}>
        {c.arm ? (
          <span title={`${c.arm.groupName ?? c.arm.groupId} — an A/B/n test of ${c.arm.count} arms, run as one experiment on one metric.`}>
            <span className="block text-[12.5px] font-semibold truncate max-w-[16ch]" style={{ color: armColor(c.arm.groupId) }}>
              {c.arm.groupName ?? c.arm.groupId}
            </span>
            <span className="block text-[12px] text-muted-2 tabular-nums">
              arm {c.arm.index}/{c.arm.count}{c.arm.split ? " ⚠" : ""}
            </span>
          </span>
        ) : <Nil />}
      </td>

      {/* Experiment */}
      <td className="px-4 py-3.5 align-top min-w-[16rem]">
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
      <td className="px-4 py-3.5 align-top text-muted-2 min-w-[22ch] max-w-[34ch] whitespace-normal leading-snug">
        {c.description ?? <Nil />}
      </td>

      {/* Website area */}
      <td className="px-4 py-3.5 align-top text-muted-2 min-w-[14ch] max-w-[22ch] whitespace-normal leading-snug">
        {c.where ?? <Nil />}
      </td>

      {/* Hypothesis */}
      <td className="px-4 py-3.5 align-top text-muted-2 min-w-[26ch] max-w-[40ch] whitespace-normal leading-snug">
        {hypothesisOf(c) || <Nil />}
      </td>

      {/* Primary KPI */}
      <td className="px-4 py-3.5 align-top min-w-[18ch] max-w-[28ch]">
        {c.metric
          ? <div className="text-foreground/90 whitespace-normal leading-snug">{c.metric}</div>
          : <span className="text-warn text-[13px]">needs a success metric</span>}
      </td>

      {/* Supporting KPIs */}
      <td className="px-4 py-3.5 align-top text-muted-2 min-w-[18ch] max-w-[30ch] whitespace-normal leading-snug">
        {c.guardrails?.length
          ? <ul className="space-y-0.5">{c.guardrails.map((g, i) => <li key={i}>· {g}</li>)}</ul>
          : <Nil />}
      </td>

      {/* Next step */}
      <td className="px-4 py-3.5 align-top text-muted min-w-[16ch] whitespace-normal leading-snug">
        {c.pipeline.primaryAction?.label ?? "—"}
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
      {/* Rank — the hand-ordering, shown as the seat number a person would
          recognise (1, 2, 3) rather than the 10/20/30 the board stores. */}
      <td className="px-4 py-3.5 align-top text-right tabular-nums text-muted"
        title={typeof c.priority === "number" ? "Where you dragged it in its board column." : "Never hand-ordered — it sits where the score puts it."}>
        {typeof c.priority === "number" ? c.priority / 10 : <Nil />}
      </td>
    </tr>
  );
}
