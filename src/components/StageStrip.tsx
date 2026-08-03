import { stepSeverity, type StepSeverity } from "@/lib/prototypes/severity";
import type { Pipeline } from "@/lib/prototypes/pipeline";

const SEG: Record<StepSeverity, string> = {
  critical: "bg-danger opacity-100",
  attention: "bg-warn opacity-100",
  good: "bg-ok opacity-100",
  pending: "bg-border-strong opacity-40",
  na: "bg-border opacity-25",
};
const WORD: Record<StepSeverity, string> = {
  critical: "blocked", attention: "needs attention", good: "done", pending: "not started", na: "n/a — built in Optimizely",
};

/**
 * The stage strip — ONE bar divided into the five lifecycle stages, each
 * segment colored by that stage's live severity. Same derivation as every
 * other status surface (stepSeverity over pipeline steps), so it can never
 * disagree with the chip, the rail dots, or the board. Hover a segment for
 * the stage name + its honest status line.
 */
export function StageStrip({ pipeline, labels = false, className = "" }: { pipeline: Pipeline; labels?: boolean; className?: string }) {
  return (
    <div className={className}>
      <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden">
        {pipeline.steps.map((s) => (
          <span key={s.id} title={`${s.title} — ${WORD[stepSeverity(s, pipeline.alerts)]}${s.status && s.status !== "—" ? ` · ${s.status}` : ""}`}
            className={`flex-1 ${SEG[stepSeverity(s, pipeline.alerts)]}`} />
        ))}
      </div>
      {labels && (
        <div className="flex gap-0.5 mt-1">
          {pipeline.steps.map((s) => (
            <span key={s.id} className="flex-1 text-center text-[9px] font-semibold uppercase tracking-wide text-muted-2 truncate">
              {s.id === "experiment" ? "Exp" : s.id === "handoff" ? "Ship" : s.title}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
