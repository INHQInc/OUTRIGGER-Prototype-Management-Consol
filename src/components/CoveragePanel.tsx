"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TimeAgo } from "@/components/ui";
import { coverageStale, type CoverageSpec, type CoverageDevice, type CheckResult } from "@/lib/prototypes/coverage";

const DEVICES: CoverageDevice[] = ["desktop", "tablet", "mobile"];
const DEVICE_ICON: Record<CoverageDevice, string> = { desktop: "🖥", tablet: "▭", mobile: "📱" };
/** Click cycles: unreviewed → pass → fail → n/a → unreviewed. */
const CYCLE: Record<string, CheckResult | ""> = { "": "pass", pass: "fail", fail: "na", na: "" };
const CELL: Record<CheckResult | "", string> = {
  "": "border-border text-muted-2 bg-background",
  pass: "border-ok/50 text-ok bg-[color-mix(in_srgb,var(--ok)_10%,transparent)]",
  fail: "border-danger/50 text-danger bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]",
  na: "border-border text-muted-2 bg-surface-2/60",
};
const CELL_LABEL: Record<CheckResult | "", string> = { "": "—", pass: "✓", fail: "✗", na: "n/a" };

/**
 * The Coverage room — scenarios (use cases) each with checkable acceptance
 * tests and a device matrix, derived from the brief + the BUILT code. Review =
 * walk each scenario on the real ?opmc URL and click the device cells:
 * unreviewed → pass → fail → n/a. Gaps (scenarios the code doesn't handle) are
 * flagged loudest. Unreviewed core coverage makes the Optimizely push demand
 * an acknowledged override.
 */
export function CoveragePanel({ prototypeKey, initial, currentSha, buildAvailable }: {
  prototypeKey: string;
  initial: CoverageSpec | null;
  currentSha?: string | null;
  buildAvailable: boolean;
}) {
  const router = useRouter();
  const [spec, setSpec] = useState<CoverageSpec | null>(initial);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function generate() {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/prototypes/coverage", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: prototypeKey, generate: true }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? "Generation failed"); return; }
      setSpec(data.coverage);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Generation failed");
    } finally { setBusy(false); }
  }

  // Saves are SERIALIZED: the server's save is a read-modify-write over the
  // whole spec, so two in-flight requests would drop one result (last write
  // wins). The queue chains them; the seq check makes only the NEWEST
  // response touch state, so a slow stale reply can't revert a later tick.
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const seqRef = useRef(0);
  const inflightRef = useRef(0);

  function cycle(sid: string, device: CoverageDevice) {
    if (!spec) return;
    const cur = spec.results[sid]?.[device] ?? "";
    const next = CYCLE[cur];
    // Optimistic — the review flow should feel like ticking a checklist.
    const optimistic: CoverageSpec = { ...spec, results: { ...spec.results, [sid]: { ...spec.results[sid], [device]: next || undefined } as CoverageSpec["results"][string] } };
    if (!next) delete optimistic.results[sid]?.[device];
    setSpec(optimistic);
    const seq = ++seqRef.current;
    inflightRef.current++;
    setSaving(true);
    queueRef.current = queueRef.current.then(async () => {
      try {
        const res = await fetch("/api/prototypes/coverage", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: prototypeKey, results: { [sid]: { [device]: next } } }),
        });
        const data = await res.json();
        if (!res.ok) { setErr(data.error ?? "Couldn't save the review result"); return; }
        if (seq === seqRef.current) { setSpec(data.coverage); router.refresh(); }
      } catch {
        setErr("Couldn't save the review result — check the connection and click the cell again.");
      } finally {
        if (--inflightRef.current === 0) setSaving(false);
      }
    });
  }

  const stale = coverageStale(spec, currentSha);

  if (!spec) {
    return (
      <div className="rounded-xl border border-border bg-surface px-4 py-4 space-y-3">
        <p className="text-[14px] text-muted-2 max-w-[75ch]">
          No QA spec yet. Generation reads the brief AND the built code and derives every scenario — core flows, edge states, device behaviors, interaction hygiene — each with checkable acceptance tests. Scenarios the code <b>doesn&apos;t</b> handle get flagged as gaps.
        </p>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-danger min-w-0">{err}</span>
          <button onClick={generate} disabled={busy || !buildAvailable} title={buildAvailable ? "" : "Build first — the QA spec derives from the built code"}
            className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[15px] font-semibold hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
            {busy ? "Deriving from the build…" : "Generate QA spec"}
          </button>
        </div>
      </div>
    );
  }

  const gaps = spec.scenarios.filter((s) => s.gap);
  return (
    <div className="space-y-3">
      {stale && (
        <div className="rounded-lg border border-warn/50 bg-[color-mix(in_srgb,var(--warn)_6%,transparent)] px-3.5 py-2.5 flex items-center gap-3 text-[13.5px] text-warn">
          <span className="min-w-0">The build has moved past this QA spec (derived vs <span className="font-mono">{spec.builtSha?.slice(0, 7)}</span>, branch at <span className="font-mono">{currentSha?.slice(0, 7)}</span>) — regenerate to re-derive from the current code.</span>
          <button onClick={generate} disabled={busy} className="ml-auto h-8 px-3 rounded-lg bg-warn text-accent-fg text-[13.5px] font-semibold hover:opacity-90 disabled:opacity-40 shrink-0">{busy ? "Regenerating…" : "Regenerate"}</button>
        </div>
      )}

      <div className="flex items-center gap-3 text-[12.5px] text-muted-2 flex-wrap">
        <span>{spec.scenarios.length} scenarios · generated <TimeAgo iso={spec.generatedAt} />{spec.builtSha ? <> · vs <span className="font-mono">{spec.builtSha.slice(0, 7)}</span></> : null}</span>
        {gaps.length > 0 && <span className="text-danger font-semibold">{gaps.length} gap{gaps.length === 1 ? "" : "s"} — the build doesn&apos;t handle these</span>}
        <span className="ml-auto flex items-center gap-2">
          {saving && <span>saving…</span>}
          {!stale && <button onClick={generate} disabled={busy} className="text-accent hover:text-accent-hover font-medium">{busy ? "Regenerating…" : "Regenerate"}</button>}
        </span>
      </div>
      {err && <div className="text-[13px] text-danger">{err}</div>}

      {spec.scenarios.map((s) => (
        <div key={s.id} className={`rounded-xl border bg-surface overflow-hidden ${s.gap ? "border-danger/50" : "border-border"}`}>
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2.5 flex-wrap">
            <span className="text-[14px] font-semibold">{s.title}</span>
            <span className={`text-[11px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${s.priority === "core" ? "text-accent bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]" : "text-muted-2 bg-surface-2"}`}>{s.priority}</span>
            {s.gap && <span className="text-[11px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded text-danger bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]">gap — not handled by the build</span>}
            <span className="ml-auto flex items-center gap-1.5">
              {s.devices.map((d) => {
                const r = spec.results[s.id]?.[d] ?? "";
                return (
                  <button key={d} onClick={() => cycle(s.id, d)} title={`${d}: ${r || "unreviewed"} — click to change`}
                    className={`h-7 min-w-[3.4rem] px-1.5 rounded-lg border text-[12px] font-semibold flex items-center justify-center gap-1 transition-colors ${CELL[r]}`}>
                    <span aria-hidden>{DEVICE_ICON[d]}</span>{CELL_LABEL[r]}
                  </button>
                );
              })}
            </span>
          </div>
          <div className="px-4 py-3 text-[13.5px] space-y-1.5">
            <div><span className="text-muted-2">Given</span> <span className="text-muted">{s.given}</span> <span className="text-muted-2">· when</span> <span className="text-muted">{s.when}</span></div>
            <ul className="space-y-1">
              {s.then.map((t, i) => (
                <li key={i} className="flex gap-2 text-foreground/90 leading-relaxed"><span className="text-muted-2 shrink-0">→</span><span>{t}</span></li>
              ))}
            </ul>
            {s.deviceNotes && <div className="text-[12.5px] text-muted-2 pt-0.5">Device behavior: {s.deviceNotes}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
