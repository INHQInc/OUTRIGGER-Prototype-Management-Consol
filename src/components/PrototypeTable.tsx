"use client";

import Link from "next/link";
import { Fragment, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { BOARD_COLUMNS, armColor, type BoardCard, type BoardColumn } from "@/lib/prototypes/board-model";
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
  { header: "Priority", cell: (c) => (typeof c.priority === "number" ? String(c.priority) : "") },
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
const HEADERS: { label: string; right?: boolean }[] = [
  { label: "Test" },
  { label: "Experiment" },
  { label: "Status" },
  { label: "Description" },
  { label: "Website area" },
  { label: "Hypothesis" },
  { label: "Primary KPI" },
  { label: "Supporting KPIs" },
  { label: "Next step" },
  { label: "Alerts" },
  { label: "Versions", right: true },
  { label: "Optimizely" },
  { label: "Files", right: true },
  { label: "Owner" },
  { label: "Priority", right: true },
];

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

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return cards
      .filter((c) => (filter === "all" ? true : filter === "blocked" ? isBlocked(c) : c.column === filter))
      .filter((c) => !needle || c.name.toLowerCase().includes(needle) || (c.description ?? "").toLowerCase().includes(needle))
      // Inside a stage, arms of one test sit together and in arm order — a test
      // split across four rows that are not adjacent is not "tied together".
      .sort((a, b) =>
        STAGE_ORDER.indexOf(a.column) - STAGE_ORDER.indexOf(b.column)
        || (a.arm?.groupId ?? "~").localeCompare(b.arm?.groupId ?? "~")
        || (a.arm ? a.arm.index - (b.arm?.index ?? 0) : 0)
        || (a.priority ?? 1e9) - (b.priority ?? 1e9)
        || a.name.localeCompare(b.name));
  }, [cards, q, filter]);

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

  const chipTone = (c: BoardCard) =>
    isBlocked(c) ? "border-danger/40 text-danger bg-[color-mix(in_srgb,var(--danger)_6%,transparent)]"
    : c.locked || c.column === "handoff" ? "border-ok/40 text-ok bg-[color-mix(in_srgb,var(--ok)_7%,transparent)]"
    : "border-warn/40 text-warn bg-[color-mix(in_srgb,var(--warn)_7%,transparent)]";
  const dotTone = (c: BoardCard) => (isBlocked(c) ? "bg-danger" : c.locked || c.column === "handoff" ? "bg-ok" : "bg-warn");
  const label = (c: BoardCard) => {
    const col = stageLabel(c.column);
    if (isBlocked(c)) return `Blocked at ${col}`;
    return c.locked ? `${col} · LIVE 🔒` : col;
  };

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      {/* Toolbar — search · status · export */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-2.5 flex-wrap">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name or description"
          className="flex-1 min-w-[200px] max-w-sm rounded-lg bg-background border border-border px-3 py-2 text-[14px] text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none" />
        <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}
          className="rounded-lg bg-surface border border-border px-2.5 py-2 text-[13.5px] text-muted focus:border-accent focus:outline-none">
          <option value="all">Stage · All</option>
          <option value="blocked">⚠ Blocked</option>
          {BOARD_COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <span className="text-[12.5px] text-muted-2 tabular-nums">{shown.length} of {cards.length}</span>
        <button type="button" onClick={downloadCsv} disabled={shown.length === 0}
          title="Download the rows shown, with every field — stage, next action, alerts, metric, experiment, owner and link."
          className="ml-auto rounded-lg border border-border bg-surface px-3 py-2 text-[13px] font-semibold text-muted hover:text-foreground hover:border-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          ↓ Export CSV
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px] border-collapse">
          <thead>
            <tr className="border-b border-border">
              {HEADERS.map((h) => (
                <th key={h.label} className={`px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-muted-2 whitespace-nowrap ${h.right ? "text-right" : "text-left"}`}>{h.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr><td colSpan={HEADERS.length} className="px-4 py-10 text-center text-[14px] text-muted-2">No prototypes match{q ? ` “${q}”` : ""}.</td></tr>
            ) : groups.map(({ col, rows }) => (
              <Fragment key={col.id}>
                <tr className="bg-surface-2/40 border-y border-border">
                  <td colSpan={HEADERS.length} className="px-4 py-2">
                    <span className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">{col.label}</span>
                    <span className="ml-2 text-[11.5px] tabular-nums text-muted-2">{rows.length}</span>
                    <span className="ml-3 text-[12px] text-muted-2 hidden sm:inline">{col.hint}</span>
                  </td>
                </tr>
                {rows.map((c) => (
                  <tr key={c.key} onClick={() => router.push(`/prototypes/${c.key}`)}
                    className="border-b border-border/60 last:border-0 hover:bg-surface-2/40 cursor-pointer transition-colors">
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
                      ) : <span className="text-muted-2">—</span>}
                    </td>
                    <td className="px-4 py-3.5 align-top min-w-[16rem]">
                      <Link href={`/prototypes/${c.key}`} onClick={(e) => e.stopPropagation()} className="text-[14.5px] font-semibold text-accent hover:text-accent-hover">{c.name}</Link>
                      <StageStrip pipeline={c.pipeline} className="mt-2 max-w-[150px]" />
                    </td>
                    <td className="px-4 py-3.5 align-top whitespace-nowrap">
                      <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-[12.5px] font-semibold ${chipTone(c)}`}>
                        <span className={`w-2 h-2 rounded-full ${dotTone(c)}`} />{label(c)}
                      </span>
                      {c.deployedAt && <div className="text-[12px] text-ok mt-1">live {c.deployedAt.slice(0, 10)}</div>}
                      {c.held && <div className="text-[12px] text-muted-2 mt-1">held · facts say {stageLabel(c.derivedColumn)}</div>}
                    </td>
                    <td className="px-4 py-3.5 align-top text-muted-2 min-w-[22ch] max-w-[34ch] whitespace-normal leading-snug">
                      {c.description ?? <span className="text-muted-2">—</span>}
                    </td>
                    <td className="px-4 py-3.5 align-top text-muted-2 min-w-[14ch] max-w-[22ch] whitespace-normal leading-snug">
                      {c.where ?? <span className="text-muted-2">—</span>}
                    </td>
                    <td className="px-4 py-3.5 align-top text-muted-2 min-w-[26ch] max-w-[40ch] whitespace-normal leading-snug">
                      {hypothesisOf(c) || <span className="text-muted-2">—</span>}
                    </td>
                    <td className="px-4 py-3.5 align-top whitespace-nowrap">
                      {(() => {
                        const as = c.pipeline.alerts;
                        if (!as.length) return <span className="text-muted-2">—</span>;
                        const bad = as.some((a) => a.level === "danger");
                        return (
                          <span title={as.map((a) => `${a.level === "danger" ? "✗" : "⚠"} ${a.text}`).join("\n\n")}
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[12px] font-semibold tabular-nums ${bad ? "border-danger/40 text-danger" : "border-warn/40 text-warn"}`}>
                            {bad ? "✗" : "⚠"} {as.length}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3.5 align-top min-w-[18ch] max-w-[28ch]">
                      {c.metric
                        ? <div className="text-foreground/90 whitespace-normal leading-snug">{c.metric}</div>
                        : <span className="text-warn text-[13px]">needs a success metric</span>}
                    </td>
                    <td className="px-4 py-3.5 align-top text-muted-2 min-w-[18ch] max-w-[30ch] whitespace-normal leading-snug">
                      {c.guardrails?.length
                        ? <ul className="space-y-0.5">{c.guardrails.map((g, i) => <li key={i}>· {g}</li>)}</ul>
                        : <span className="text-muted-2">—</span>}
                    </td>
                    <td className="px-4 py-3.5 align-top text-muted min-w-[16ch] whitespace-normal leading-snug">
                      {c.pipeline.primaryAction?.label ?? "—"}
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
                    <td className="px-4 py-3.5 align-top text-right tabular-nums text-muted" title="supporting files committed to the branch">{c.attachmentCount ? `📎 ${c.attachmentCount}` : <span className="text-muted-2">—</span>}</td>
                    <td className="px-4 py-3.5 align-top whitespace-nowrap text-muted">{c.owner ?? <span className="text-muted-2">—</span>}</td>
                    <td className="px-4 py-3.5 align-top text-right tabular-nums text-muted">{typeof c.priority === "number" ? c.priority : <span className="text-muted-2">—</span>}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
