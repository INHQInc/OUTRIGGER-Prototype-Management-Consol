"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TimeAgo } from "@/components/ui";
import { testCasesStale, type CoverageSpec, type CoverageDevice, type TestStatus } from "@/lib/prototypes/coverage";

const DEVICE_ICON: Record<CoverageDevice, string> = { desktop: "🖥", tablet: "▭", mobile: "📱" };
/** Click cycles: not run → pass → fail → blocked → n/a → not run. */
const CYCLE: Record<string, TestStatus | ""> = { "": "pass", pass: "fail", fail: "blocked", blocked: "na", na: "" };
const CELL: Record<TestStatus | "", string> = {
  "": "border-border text-muted-2 bg-background",
  pass: "border-ok/50 text-ok bg-[color-mix(in_srgb,var(--ok)_10%,transparent)]",
  fail: "border-danger/50 text-danger bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]",
  blocked: "border-warn/50 text-warn bg-[color-mix(in_srgb,var(--warn)_10%,transparent)]",
  na: "border-border text-muted-2 bg-surface-2/60",
};
const CELL_LABEL: Record<TestStatus | "", string> = { "": "—", pass: "✓", fail: "✗", blocked: "⊘", na: "n/a" };

/**
 * The Test Cases room — the traditional, step-scripted layer under the
 * scenarios. One results record, two executors: the building agent runs the
 * cases on the review URL and posts results by token (🤖), and humans walk
 * the same scripts and click the same cells (👤). Every result carries its
 * attribution. Failures feed the QA gate and (agent runs) auto-file
 * Recommendations.
 */
export function TestCasesPanel({ prototypeKey, initial, currentSha, currentCodeHash, buildAvailable }: {
  prototypeKey: string;
  initial: CoverageSpec | null;
  currentSha?: string | null;
  /** Content hash of the current built code — staleness key (sha is display). */
  currentCodeHash?: string | null;
  buildAvailable: boolean;
}) {
  const router = useRouter();
  const [spec, setSpec] = useState<CoverageSpec | null>(initial);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<{ tid: string; device: CoverageDevice } | null>(null);
  const [noteText, setNoteText] = useState("");

  async function generate() {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/prototypes/coverage", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: prototypeKey, generateTests: true }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? "Generation failed"); return; }
      setSpec(data.coverage);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Generation failed");
    } finally { setBusy(false); }
  }

  // Serialized saves + newest-response-wins — same defense as the scenario
  // cells: the server save is a whole-spec read-modify-write.
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const seqRef = useRef(0);
  const inflightRef = useRef(0);

  function post(tid: string, device: CoverageDevice, value: { status: TestStatus; note?: string } | "") {
    const seq = ++seqRef.current;
    inflightRef.current++;
    setSaving(true);
    queueRef.current = queueRef.current.then(async () => {
      try {
        const res = await fetch("/api/prototypes/coverage", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: prototypeKey, testResults: { [tid]: { [device]: value } } }),
        });
        const data = await res.json();
        if (!res.ok) { setErr(data.error ?? "Couldn't save the run"); return; }
        if (seq === seqRef.current) { setSpec(data.coverage); router.refresh(); }
      } catch {
        setErr("Couldn't save the run — check the connection and click the cell again.");
      } finally {
        if (--inflightRef.current === 0) setSaving(false);
      }
    });
  }

  function cycle(tid: string, device: CoverageDevice) {
    if (!spec) return;
    // A pending fail-note must not be silently lost by clicking elsewhere —
    // flush it first (the fail itself was already posted note-less).
    if (noteFor && (noteFor.tid !== tid || noteFor.device !== device) && noteText.trim()) {
      post(noteFor.tid, noteFor.device, { status: "fail", note: noteText.trim() });
    }
    const cur = spec.testResults?.[tid]?.[device]?.status ?? "";
    const next = CYCLE[cur];
    // Optimistic tick with local attribution; the server response replaces it
    // with the stamped record.
    const optimistic: CoverageSpec = {
      ...spec,
      testResults: {
        ...spec.testResults,
        [tid]: { ...spec.testResults?.[tid], [device]: next ? { status: next, by: "you", mode: "human" as const, at: new Date().toISOString() } : undefined } as NonNullable<CoverageSpec["testResults"]>[string],
      },
    };
    if (!next) delete optimistic.testResults?.[tid]?.[device];
    setSpec(optimistic);
    if (next === "fail") { setNoteFor({ tid, device }); setNoteText(""); }
    else { setNoteFor(null); }
    post(tid, device, next ? { status: next } : "");
  }

  function saveNote() {
    if (!noteFor) return;
    post(noteFor.tid, noteFor.device, { status: "fail", note: noteText.trim() || undefined });
    setNoteFor(null);
  }

  const cases = spec?.testCases ?? [];
  const stale = testCasesStale(spec, currentSha, currentCodeHash);

  if (!spec || !spec.scenarios.length) {
    return (
      <div className="rounded-xl border border-border bg-surface px-4 py-4">
        <p className="text-[14px] text-muted-2 max-w-[75ch]">
          Test cases derive from the QA scenarios — generate the QA spec first (QA → Scenarios), then come back here.
        </p>
      </div>
    );
  }

  if (!cases.length) {
    return (
      <div className="rounded-xl border border-border bg-surface px-4 py-4 space-y-3">
        <p className="text-[14px] text-muted-2 max-w-[75ch]">
          No test cases yet. Generation expands each scenario into traditional step-scripts — concrete preconditions, numbered steps, an expected result per step — grounded in the built code. Your agent runs them on the review URL and posts results here; you can walk the same scripts by hand.
        </p>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-danger min-w-0">{err}</span>
          <button onClick={generate} disabled={busy || !buildAvailable} title={buildAvailable ? "" : "Build first — test cases are grounded in the built code"}
            className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[15px] font-semibold hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
            {busy ? "Deriving from the scenarios…" : "Generate test cases"}
          </button>
        </div>
      </div>
    );
  }

  const scenarioTitle = new Map(spec.scenarios.map((s) => [s.id, s.title]));
  const grouped = spec.scenarios
    .map((s) => ({ scenario: s, cases: cases.filter((t) => t.scenarioId === s.id) }))
    .filter((g) => g.cases.length);

  return (
    <div className="space-y-3">
      {stale && (
        <div className="rounded-lg border border-warn/50 bg-[color-mix(in_srgb,var(--warn)_6%,transparent)] px-3.5 py-2.5 flex items-center gap-3 text-[13.5px] text-warn">
          <span className="min-w-0">{spec.testsStale
            ? <>The scenarios were regenerated since these cases were derived — surviving cases may no longer match their parents. Regenerate to re-align.</>
            : <>The build has moved past these test cases (derived vs <span className="font-mono">{spec.testsBuiltSha?.slice(0, 7)}</span>, branch at <span className="font-mono">{currentSha?.slice(0, 7)}</span>) — regenerate to re-ground them in the current code.</>}</span>
          <button onClick={generate} disabled={busy} className="ml-auto h-8 px-3 rounded-lg bg-warn text-accent-fg text-[13.5px] font-semibold hover:opacity-90 disabled:opacity-40 shrink-0">{busy ? "Regenerating…" : "Regenerate"}</button>
        </div>
      )}

      <div className="flex items-center gap-3 text-[12.5px] text-muted-2 flex-wrap">
        <span>{cases.length} test cases · {grouped.length} scenarios{spec.testsGeneratedAt ? <> · generated <TimeAgo iso={spec.testsGeneratedAt} /></> : null}{spec.testsBuiltSha ? <> · vs <span className="font-mono">{spec.testsBuiltSha.slice(0, 7)}</span></> : null}</span>
        <span className="ml-auto flex items-center gap-2">
          {saving && <span>saving…</span>}
          {!stale && <button onClick={generate} disabled={busy} className="text-accent hover:text-accent-hover font-medium">{busy ? "Regenerating…" : "Regenerate"}</button>}
        </span>
      </div>
      {err && <div className="text-[13px] text-danger">{err}</div>}

      <div className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-[13px] text-muted-2">
        <span className="font-semibold text-muted">Run them with your agent:</span> tell your running Claude <span className="font-mono text-foreground/80">“run the QA test cases and report results”</span> — it fetches the cases from the console, drives the review URL, and the cells below fill in with 🤖 attribution. Failures auto-file Recommendations. Click any cell to record a manual run (👤): pass → fail → blocked → n/a.
      </div>

      {grouped.map(({ scenario, cases: group }) => (
        <div key={scenario.id} className="space-y-2">
          <div className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-2 pt-1">{scenarioTitle.get(scenario.id)}</div>
          {group.map((t) => (
            <div key={t.id} className="rounded-xl border border-border bg-surface overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border flex items-center gap-2.5 flex-wrap">
                <span className="font-mono text-[11px] text-muted-2">{t.id}</span>
                <span className="text-[14px] font-semibold">{t.title}</span>
                <span className={`text-[11px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${t.priority === "core" ? "text-accent bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]" : "text-muted-2 bg-surface-2"}`}>{t.priority}</span>
                <span className="ml-auto flex items-center gap-1.5">
                  {t.devices.map((d) => {
                    const r = spec.testResults?.[t.id]?.[d];
                    const s = r?.status ?? "";
                    return (
                      <button key={d} onClick={() => cycle(t.id, d)}
                        title={r ? `${d}: ${r.status} · ${r.mode === "agent" ? "🤖" : "👤"} ${r.by} — click to change` : `${d}: not run — click to record`}
                        className={`h-7 min-w-[3.4rem] px-1.5 rounded-lg border text-[12px] font-semibold flex items-center justify-center gap-1 transition-colors ${CELL[s]}`}>
                        <span aria-hidden>{DEVICE_ICON[d]}</span>{CELL_LABEL[s]}
                      </button>
                    );
                  })}
                </span>
              </div>
              <div className="px-4 py-3 text-[13.5px] space-y-2">
                {t.preconditions.length > 0 && (
                  <div className="text-muted"><span className="text-muted-2">Preconditions:</span> {t.preconditions.join(" · ")}</div>
                )}
                <ol className="space-y-1">
                  {t.steps.map((s, i) => (
                    <li key={i} className="flex gap-2 leading-relaxed">
                      <span className="text-muted-2 shrink-0 font-mono text-[12px] pt-0.5">{i + 1}.</span>
                      <span className="text-foreground/90">{s.action} <span className="text-muted-2">→</span> <span className="text-muted">{s.expect}</span></span>
                    </li>
                  ))}
                </ol>
                {/* Latest runs with attribution — the shared record both executors write. */}
                {t.devices.some((d) => spec.testResults?.[t.id]?.[d]) && (
                  <div className="pt-1 space-y-0.5">
                    {t.devices.map((d) => {
                      const r = spec.testResults?.[t.id]?.[d];
                      if (!r) return null;
                      return (
                        <div key={d} className="text-[12.5px] text-muted-2">
                          {DEVICE_ICON[d]} {d}: <span className={r.status === "fail" ? "text-danger font-semibold" : r.status === "blocked" ? "text-warn font-semibold" : ""}>{r.status}</span>
                          {" · "}{r.mode === "agent" ? "🤖" : "👤"} {r.by} · <TimeAgo iso={r.at} />
                          {r.note ? <span className="text-muted"> — {r.note}</span> : null}
                        </div>
                      );
                    })}
                  </div>
                )}
                {noteFor?.tid === t.id && (
                  <div className="flex items-center gap-2 pt-1">
                    <input autoFocus value={noteText} onChange={(e) => setNoteText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveNote(); if (e.key === "Escape") setNoteFor(null); }}
                      placeholder={`What actually happened on ${noteFor.device}? (observed vs expected)`}
                      className="flex-1 h-8 px-2.5 rounded-lg border border-danger/50 bg-background text-[13px]" />
                    <button onClick={saveNote} className="h-8 px-3 rounded-lg bg-danger text-accent-fg text-[13px] font-semibold hover:opacity-90">Save note</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
