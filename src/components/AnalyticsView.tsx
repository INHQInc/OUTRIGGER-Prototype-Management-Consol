"use client";

import { useEffect, useState } from "react";
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
            className={`px-3.5 py-2 text-[13.5px] font-semibold border-b-2 -mb-px transition-colors ${
              view === t.id ? "border-accent text-foreground" : "border-transparent text-muted-2 hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className={view === "plan" ? "" : "hidden"} id="measurement">
        <MeasurementPanel prototypeKey={prototypeKey} bound={bound} running={running} />
      </div>
      <div id="results">
        <ResultsPanel prototypeKey={prototypeKey} bound={bound} running={running} view={view === "numbers" ? "numbers" : "readout"} hidden={view === "plan"} />
      </div>
    </div>
  );
}
