"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, EmptyState } from "./ui";
import { DAY_NAMES } from "@/lib/reports/types";

interface Row {
  id: string; name: string; enabled: boolean;
  scope: { mode: "selected"; keys: string[] } | { mode: "all-live" };
  cadence: { kind: "weekly"; day: number } | { kind: "manual" };
  audienceCount: number; audienceTotal: number;
  nextSendAt: string | null;
  run?: { state: string; at: string; deliveredTo?: string[]; failures?: unknown[]; error?: string };
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : "—";

export function ReportsList() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [mailUnavailable, setMailUnavailable] = useState<string | null>(null);
  const [mailFrom, setMailFrom] = useState<string | null>(null);
  const [sweepHour, setSweepHour] = useState(13);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [migration, setMigration] = useState<string | null>(null);

  // The fetch is started INSIDE the effect and every setState is guarded by a
  // liveness flag: this mount can be torn down before the request lands (the
  // migration runs on this endpoint, so the first call is the slow one), and
  // writing state into a dead component is a warning nobody acts on.
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await fetch("/api/reports");
        const data = await res.json();
        if (!live) return;
        if (!res.ok) { setErr(data.error ?? "Couldn't load reports."); setRows([]); return; }
        setRows(data.reports ?? []);
        setMailUnavailable(data.mailUnavailable ?? null);
        setMailFrom(data.mailFrom ?? null);
        setSweepHour(data.sweepHourUtc ?? 13);
        if (data.migration) setMigration(data.migration.reconciled ? data.migration.detail : `Migration held back — ${data.migration.detail}`);
      } catch { if (live) { setErr("Network hiccup — try again."); setRows([]); } }
    })();
    return () => { live = false; };
  }, []);

  const create = async () => {
    const name = prompt("Name this report. It becomes the subject line, so write it the way you want it to read in an inbox.");
    if (!name?.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? "Couldn't create it."); return; }
      window.location.href = `/reports/${data.report.id}`;
    } finally { setBusy(false); }
  };

  // ONE SENDING LINE FOR THE WHOLE SCREEN, computed. Which address a leadership
  // digest arrives from, and the fact that there is a single daily window, are
  // facts about every row — repeating them per row would say it five times.
  const local = new Date(Date.UTC(2000, 0, 1, sweepHour, 0)).toLocaleTimeString(undefined, { hour: "numeric" });
  const sendingLine = mailUnavailable
    ? `Sending isn't configured on this deployment — ${mailUnavailable} Reports and schedules can still be saved.`
    : `Reports go out in the daily window around ${String(sweepHour).padStart(2, "0")}:00 UTC (about ${local} your time)${mailFrom ? `, from ${mailFrom}` : ""}.`;

  return (
    <div className="space-y-4 max-w-[1100px]">
      <p className={`text-[13px] leading-snug ${mailUnavailable ? "text-warn" : "text-muted-2"}`}>{sendingLine}</p>
      {migration && <p className="text-[13px] text-muted-2">{migration}</p>}
      {err && <p className="text-[13px] text-danger">{err}</p>}

      <div className="flex items-center gap-3">
        <button onClick={() => void create()} disabled={busy}
          className="h-8 px-3 rounded-md bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40">
          New report
        </button>
      </div>

      {rows === null ? (
        <div className="h-24 rounded-lg bg-surface-2/60 animate-pulse" />
      ) : rows.length === 0 ? (
        <EmptyState title="No reports yet" hint="A report is a name, an audience and a day. Experiments flow through it — the name becomes the subject line." />
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted-2">
              <th className="pb-2 pr-3">Report</th>
              <th className="pb-2 pr-3">Audience</th>
              <th className="pb-2 pr-3">Cadence</th>
              <th className="pb-2 pr-3">Last sent</th>
              <th className="pb-2">Next</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const failed = r.run?.state === "failed" || (r.run?.failures?.length ?? 0) > 0;
              return (
                <tr key={r.id} className="border-t border-border/40 align-top">
                  <td className="py-2.5 pr-3">
                    <Link href={`/reports/${r.id}`} className="font-semibold text-foreground hover:text-accent">{r.name}</Link>
                    <div className="text-[12px] text-muted-2">
                      {r.scope.mode === "all-live" ? "every live experiment" : `${r.scope.keys.length} experiment${r.scope.keys.length === 1 ? "" : "s"}`}
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 text-muted">
                    {r.audienceCount}
                    {r.audienceTotal > r.audienceCount && <span className="text-muted-2"> of {r.audienceTotal}</span>}
                  </td>
                  <td className="py-2.5 pr-3">
                    {r.cadence.kind === "weekly"
                      ? <span className={r.enabled ? "text-foreground" : "text-muted-2"}>{DAY_NAMES[r.cadence.day]}{!r.enabled && " (paused)"}</span>
                      : <span className="text-muted-2">Manual only</span>}
                  </td>
                  <td className="py-2.5 pr-3">
                    {r.run
                      ? <span className={failed ? "text-danger" : "text-muted"}>
                          {failed && "⚠ "}{new Date(r.run.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                        </span>
                      : <span className="text-muted-2">never</span>}
                  </td>
                  <td className="py-2.5">
                    {/* Manual is not paused. A report with no schedule was
                        never turned off — it was never given a day. */}
                    {r.enabled && r.nextSendAt
                      ? <span className="text-muted">{fmtDate(r.nextSendAt)}</span>
                      : <Badge tone="neutral">{r.cadence.kind === "manual" ? "on request" : "paused"}</Badge>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
