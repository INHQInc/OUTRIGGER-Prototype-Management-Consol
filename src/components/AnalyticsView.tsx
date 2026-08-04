"use client";

import { useCallback, useEffect, useState } from "react";
import { MeasurementPanel } from "./MeasurementPanel";
import { ResultsPanel } from "./ResultsPanel";

type View = "readout" | "numbers" | "plan";

/**
 * Analytics as a DASHBOARD, not a scroll: one segmented control, three
 * views — the readout (the investor screen), the numbers (the analyst
 * workbench), and the measurement plan (visited rarely once confirmed).
 * All views stay mounted (hidden, not unmounted) so switching never
 * refetches or loses in-progress state; #measurement / #results deep
 * links land on the right view.
 */
export function AnalyticsView({ prototypeKey, bound, running }: {
  prototypeKey: string;
  bound: boolean;
  running: boolean;
}) {
  const [view, setView] = useState<View>("readout");
  const [planPending, setPlanPending] = useState(0);
  const onPending = useCallback((n: number) => setPlanPending(n), []);

  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.replace("#", "");
      if (h === "measurement") setView("plan");
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
    { id: "plan", label: "Measurement plan", sub: "how this experiment is judged" },
  ];

  return (
    <div className="space-y-4">
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

      <div className={view === "plan" ? "" : "hidden"} id="measurement">
        <MeasurementPanel prototypeKey={prototypeKey} bound={bound} running={running} onPending={onPending} />
      </div>
      <div id="results">
        <ResultsPanel prototypeKey={prototypeKey} bound={bound} running={running} view={view === "numbers" ? "numbers" : "readout"} hidden={view === "plan"} />
      </div>
    </div>
  );
}
