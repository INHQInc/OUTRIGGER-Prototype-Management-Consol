"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "./ui";
import { DAY_NAMES } from "@/lib/reports/types";
import type { Person, Report } from "@/lib/reports/types";

interface Covered { key: string; name: string; bound: boolean }

const CARD = "rounded-xl border border-border bg-surface px-5 py-4 space-y-3";
const ZH = "text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted-2";

export function ReportDetail({ id }: { id: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [covered, setCovered] = useState<Covered[]>([]);
  const [nextSendAt, setNextSendAt] = useState<string | null>(null);
  const [mailUnavailable, setMailUnavailable] = useState<string | null>(null);
  const [mailFrom, setMailFrom] = useState<string | null>(null);
  const [sweepHour, setSweepHour] = useState(13);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [draftPeople, setDraftPeople] = useState("");

  const load = async () => {
    const res = await fetch(`/api/reports/${id}`);
    const data = await res.json();
    if (!res.ok) { setErr(data.error ?? "Couldn't load it."); return; }
    setReport(data.report);
    setPeople(data.people ?? []);
    setCovered(data.covered ?? []);
    setNextSendAt(data.nextSendAt ?? null);
    setMailUnavailable(data.mailUnavailable ?? null);
    setMailFrom(data.mailFrom ?? null);
    setSweepHour(data.sweepHourUtc ?? 13);
    setDraftPeople((data.people ?? []).map((p: Person) => p.email).join(", "));
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const post = async (body: unknown, label: string) => {
    setBusy(label); setErr(null); setNote(null);
    try {
      const res = await fetch(`/api/reports/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? "That didn't work."); return null; }
      if (data.warning) setNote(data.warning);
      await load();
      return data;
    } catch { setErr("Network hiccup — try again."); return null; }
    finally { setBusy(null); }
  };

  if (!report) return <div className="h-40 rounded-xl bg-surface-2/60 animate-pulse max-w-[900px]" />;

  const scopeKeys = report.scope.mode === "selected" ? report.scope.keys : [];
  const receivingCount = people.filter((p) => p.state === "receiving").length;
  const canSchedule = receivingCount > 0 && scopeKeys.length > 0;
  const run = report.run;

  return (
    <div className="space-y-4 max-w-[900px]">
      <Link href="/reports" className="text-[13px] text-accent hover:text-accent-hover">&larr; All reports</Link>

      {err && <p className="text-[13px] text-danger">{err}</p>}
      {note && <p className="text-[13px] text-warn">{note}</p>}

      {/* ── HEADER: what this is, and one line of status ── */}
      <div className={CARD}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <input
              defaultValue={report.name}
              onBlur={(e) => { if (e.target.value.trim() && e.target.value !== report.name) void post({ name: e.target.value }, "name"); }}
              className="w-full bg-transparent text-[19px] font-bold tracking-[-0.01em] focus:outline-none focus:ring-1 focus:ring-accent rounded px-1 -ml-1"
            />
            {/* SAY IT ONCE, AND SAY IT COMPUTED. The subject is the name; the
                reader should not have to be told twice or work it out. */}
            <p className="text-[12.5px] text-muted-2 mt-1">
              Arrives with this as the subject line{mailFrom ? `, from ${mailFrom}` : ""}.
            </p>
          </div>
          <Badge tone={report.enabled ? "ok" : "neutral"}>
            {report.enabled ? "Scheduled" : report.cadence.kind === "weekly" ? "Paused" : "Manual only"}
          </Badge>
        </div>
        {mailUnavailable && <p className="text-[13px] text-warn">Sending isn&rsquo;t configured — {mailUnavailable} Everything here still saves.</p>}
      </div>

      {/* ── AUDIENCE ── */}
      <div className={CARD}>
        <div className={ZH}>Audience</div>
        <textarea
          value={draftPeople}
          onChange={(e) => setDraftPeople(e.target.value)}
          rows={2}
          placeholder="sarah@outrigger.com, mark@outrigger.com"
          className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <div className="flex items-center gap-3">
          <button onClick={() => void post({ people: draftPeople.split(/[,\n]/).map((s) => s.trim()).filter(Boolean) }, "people")}
            disabled={busy !== null}
            className="h-7 px-2.5 rounded-md bg-accent text-accent-fg text-[12.5px] font-semibold hover:bg-accent-hover disabled:opacity-40">
            {busy === "people" ? "Saving…" : "Save audience"}
          </button>
          <span className="text-[12.5px] text-muted-2">
            {receivingCount} receiving{people.length > receivingCount ? ` · ${people.length - receivingCount} not` : ""}
          </span>
        </div>
        {/* Unsubscribed rows stay visible, struck through. Deleting them loses
            WHY, and the next person to edit adds them straight back. */}
        {people.some((p) => p.state !== "receiving") && (
          <ul className="text-[12.5px] text-muted-2 space-y-0.5">
            {people.filter((p) => p.state !== "receiving").map((p) => (
              <li key={p.email}><span className="line-through">{p.email}</span> — {p.state}{p.unsubscribedAt ? ` ${p.unsubscribedAt.slice(0, 10)}` : ""}</li>
            ))}
          </ul>
        )}
      </div>

      {/* ── COVERAGE ── */}
      <div className={CARD}>
        <div className={ZH}>Coverage</div>
        <p className="text-[12.5px] text-muted-2">
          One experiment per report for now. The multi-experiment digest needs its own email layout, which is next.
        </p>
        <div className="space-y-1.5">
          {covered.length === 0 && scopeKeys.length === 0 && (
            <p className="text-[13px] text-muted-2">Nothing chosen yet.</p>
          )}
          {covered.map((c) => (
            <label key={c.key} className="flex items-center gap-2 text-[13px]">
              <input type="radio" name="scope" checked={scopeKeys.includes(c.key)}
                onChange={() => void post({ scope: { mode: "selected", keys: [c.key] } }, "scope")} />
              <span>{c.name}</span>
              {!c.bound && <span className="text-[11px] text-warn">no experiment bound</span>}
            </label>
          ))}
        </div>
        <ScopePicker current={scopeKeys[0] ?? null} onPick={(key) => void post({ scope: { mode: "selected", keys: [key] } }, "scope")} />
      </div>

      {/* ── CADENCE ── */}
      <div className={CARD}>
        <div className={ZH}>When</div>
        <div className="flex items-center gap-2 flex-wrap text-[13px]">
          <select
            value={report.cadence.kind === "weekly" ? String(report.cadence.day) : "manual"}
            onChange={(e) => void post({ cadence: e.target.value === "manual" ? { kind: "manual" } : { kind: "weekly", day: Number(e.target.value) } }, "cadence")}
            className="h-8 rounded-md border border-border bg-background px-2 text-[13px]">
            <option value="manual">Manual only</option>
            {DAY_NAMES.map((d, i) => <option key={d} value={i}>Every {d}</option>)}
          </select>
          <button
            onClick={() => void post({ enabled: !report.enabled }, "enabled")}
            disabled={busy !== null || (!report.enabled && !canSchedule)}
            title={!report.enabled && !canSchedule ? "Needs an audience and an experiment first" : undefined}
            className="h-8 px-3 rounded-md border border-border text-[13px] font-semibold hover:border-accent disabled:opacity-40">
            {report.enabled ? "Pause" : "Turn on"}
          </button>
        </div>
        {/* THE CAVEAT IS COMPUTED, never asked for. There is one send window a
            day and the schedule names a day, not a time — saying so here stops
            anyone expecting 9am. */}
        <p className="text-[12.5px] text-muted-2">
          {report.enabled && nextSendAt
            ? `Next: ${new Date(nextSendAt).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}, in the daily window around ${String(sweepHour).padStart(2, "0")}:00 UTC.`
            : `Sends go out in one daily window around ${String(sweepHour).padStart(2, "0")}:00 UTC, so a report names a day rather than a time.`}
        </p>
      </div>

      {/* ── LAST RUN ── */}
      {(run || report.lastManual) && (
        <div className={CARD}>
          <div className={ZH}>Last run</div>
          {run && (
            <div className="text-[13px] space-y-1">
              <p className={run.state === "failed" ? "text-danger" : "text-muted"}>
                {run.state === "sent" ? "Sent" : run.state === "failed" ? "Failed" : "In flight"} {new Date(run.at).toLocaleString()} {run.late && <span className="text-warn">(late)</span>}
              </p>
              {run.error && <p className="text-danger">{run.error}</p>}
              {/* A partial is its own line, beneath the delivery — not instead
                  of it. Four of five delivered is not a failed report. */}
              {!!run.failures?.length && (
                <p className="text-warn">{run.failures.length} didn&rsquo;t go out — {run.failures.map((f) => `${f.to}: ${f.error}`).join("; ")}</p>
              )}
              {!!run.deliveredTo?.length && <p className="text-muted-2">To {run.deliveredTo.join(", ")}</p>}
              {/* Explained silence: why an experiment is missing has to be
                  answerable from the record. */}
              {!!run.entries?.length && (
                <ul className="text-[12.5px] text-muted-2">
                  {run.entries.map((e) => <li key={e.key}>{e.name} — {e.state}{e.reason ? `: ${e.reason}` : ""}</li>)}
                </ul>
              )}
            </div>
          )}
          {report.lastManual && (
            <p className="text-[12.5px] text-muted-2">
              Sent by hand {new Date(report.lastManual.at).toLocaleString()} by {report.lastManual.by} to {report.lastManual.to.length} recipient(s).
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 pb-8">
        <button onClick={() => void post({ sendNow: true }, "send")} disabled={busy !== null || !receivingCount || !scopeKeys.length}
          className="h-8 px-3 rounded-md bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40">
          {busy === "send" ? "Sending…" : "Send now"}
        </button>
        {report.enabled && report.cadence.kind === "weekly" && new Date().getUTCDay() === report.cadence.day && (
          <span className="text-[12.5px] text-warn">This report is also scheduled to go out today.</span>
        )}
      </div>
    </div>
  );
}

/** Choose the experiment this report covers. Lists the org's prototypes; the
 *  server re-checks every key against the org on save, so this is convenience
 *  rather than the boundary. */
function ScopePicker({ current, onPick }: { current: string | null; onPick: (key: string) => void }) {
  const [options, setOptions] = useState<{ key: string; name: string }[] | null>(null);
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/prototypes");
        const data = await res.json();
        setOptions((data.prototypes ?? []).map((p: { key: string; name: string }) => ({ key: p.key, name: p.name })));
      } catch { setOptions([]); }
    })();
  }, []);
  if (!options?.length) return null;
  return (
    <select
      value={current ?? ""}
      onChange={(e) => e.target.value && onPick(e.target.value)}
      className="h-8 rounded-md border border-border bg-background px-2 text-[13px]">
      <option value="">Choose an experiment…</option>
      {options.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
    </select>
  );
}
