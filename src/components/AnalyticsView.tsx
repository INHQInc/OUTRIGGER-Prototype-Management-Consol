"use client";

import { useCallback, useEffect, useState } from "react";
import { MeasurementPanel } from "./MeasurementPanel";
import { EvidencePanel } from "./EvidencePanel";
import { ResultsPanel } from "./ResultsPanel";

type View = "readout" | "numbers" | "evidence" | "plan";

/**
 * Analytics as a DASHBOARD, not a scroll: one segmented control, three
 * views — the readout (the investor screen), the numbers (the analyst
 * workbench), and the measurement plan (visited rarely once confirmed).
 * All views stay mounted (hidden, not unmounted) so switching never
 * refetches or loses in-progress state; #measurement / #results deep
 * links land on the right view.
 */
export function AnalyticsView({ prototypeKey, bound, running, experimentName, experimentId, variationName, boundAt, experimentStatus }: {
  prototypeKey: string;
  bound: boolean;
  running: boolean;
  /** Identity of the experiment these numbers come from — the one thing that
   *  is true in every view here, and is stated nowhere else in the room. */
  experimentName?: string;
  experimentId?: string;
  variationName?: string;
  boundAt?: string;
  experimentStatus?: string;
}) {
  const [view, setView] = useState<View>("readout");
  const [planPending, setPlanPending] = useState(0);
  const onPending = useCallback((n: number) => setPlanPending(n), []);

  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.replace("#", "");
      if (h === "measurement") setView("plan");
      else if (h === "evidence") setView("evidence");
      else if (h === "numbers") setView("numbers");
      else if (h === "results") setView("readout");
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const TABS: { id: View; label: string; sub: string }[] = [
    { id: "readout", label: "Readout", sub: "the verdict and the story — presentation-ready" },
    { id: "numbers", label: "The numbers", sub: "every metric, interval, and check" },
    { id: "evidence", label: "Evidence", sub: "the screens, with each tracked element's number on it" },
    { id: "plan", label: "Measurement plan", sub: "how this experiment is judged" },
  ];

  const statusTone =
    experimentStatus === "running" ? "border-ok/40 text-ok"
    : experimentStatus === "paused" ? "border-warn/50 text-warn"
    : experimentStatus ? "border-border-strong text-foreground" : "border-border text-muted-2";

  return (
    <div className="space-y-4">
      {bound ? (
        <div className="flex items-center gap-2.5 flex-wrap text-[13px] text-muted -mt-1">
          <span className="font-semibold text-foreground">{experimentName ?? "Bound experiment"}</span>
          {experimentStatus && (
            <span className={`text-[11px] font-bold uppercase tracking-[0.07em] border rounded px-1.5 ${statusTone}`}>{experimentStatus}</span>
          )}
          {variationName && <span>judging <span className="text-foreground/80">{variationName}</span> against control</span>}
          {boundAt && <span className="text-muted-2">bound {boundAt.slice(0, 10)}</span>}
          {experimentId && (
            <a href={`https://app.optimizely.com/v2/projects/_/experiments/${encodeURIComponent(experimentId)}`}
              target="_blank" rel="noopener noreferrer"
              className="ml-auto text-[12.5px] font-semibold text-accent hover:text-accent-hover">
              Open in Optimizely &#8599;
            </a>
          )}
        </div>
      ) : (
        <p className="text-[13px] text-muted-2 -mt-1">
          No experiment is bound yet — bind one in the Experiment room and these views fill in.
        </p>
      )}
      <div className="flex items-center gap-1 border-b border-border print:hidden">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setView(t.id)} title={t.sub}
            className={`px-3.5 py-2 text-[13.5px] font-semibold border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
              view === t.id ? "border-accent text-foreground" : "border-transparent text-muted-2 hover:text-foreground"}`}>
            {t.label}
            {t.id === "plan" && planPending > 0 && (
              <span title={`${planPending} question${planPending === 1 ? "" : "s"} to answer before the plan can be confirmed`}
                className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-accent text-accent-fg text-[10.5px] font-bold tabular-nums">
                {planPending}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className={view === "evidence" ? "" : "hidden"} id="evidence">
        <EvidencePanel prototypeKey={prototypeKey} bound={bound} />
      </div>
      <div className={view === "plan" ? "" : "hidden"} id="measurement">
        <MeasurementPanel prototypeKey={prototypeKey} bound={bound} running={running} onPending={onPending} />
      </div>
      <div id="results">
        <ResultsPanel prototypeKey={prototypeKey} bound={bound} running={running} view={view === "numbers" ? "numbers" : "readout"} hidden={view === "plan" || view === "evidence"} />
      </div>
    </div>
  );
}
