import Link from "next/link";
import { TimeAgo, SEVERITY_DOT, SEVERITY_TEXT } from "@/components/ui";
import { Recommendations } from "@/components/Recommendations";
import type { Pipeline } from "@/lib/prototypes/pipeline";
import type { StepSeverity } from "@/lib/prototypes/severity";
import type { PrototypeRecord } from "@/lib/prototypes/types";
import type { Idea } from "@/lib/ideas/ideas";

const SEVERITY_WORD: Record<StepSeverity, string> = { critical: "Blocked", attention: "Needs attention", good: "Done", pending: "Not started" };

export interface ActivityItem { at: string; text: string; who?: string }

/**
 * Overview — the prototype's status home: the flow checklist (what's done /
 * what's next), the recommendations raised against it, and the activity feed.
 * The brief itself lives in its own tab, not here.
 */
export function PrototypeOverview({ proto, pipeline, activity, recommendations, canManage }: {
  proto: PrototypeRecord;
  pipeline: Pipeline;
  activity: ActivityItem[];
  recommendations: Idea[];
  canManage: boolean;
}) {
  // PIPELINE ORDER, always — the checklist IS the flow (Brief → Build → Review →
  // Experimentation → Handoff). Status is the dot's color, never the position;
  // reordering by urgency destroys the one thing a checklist is for.
  const checklist = pipeline.checklist;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_23rem] gap-4 items-start">
      {/* ── The thing itself ── */}
      <div className="space-y-4 min-w-0">
        {/* The progress checklist — every room, colored by urgency, each a link
            to the tab that resolves it. This is the single "what's my status /
            what do I do next" home; it absorbs the old Needs-attention block. */}
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border text-[13px] font-semibold uppercase tracking-wider text-muted-2">Checklist</div>
          <div>
            {checklist.map((item) => (
              <Link key={item.tab} href={`?tab=${item.tab}`} className="flex items-start gap-3 px-4 py-3 border-b border-border/60 last:border-0 hover:bg-surface-2/40 transition-colors group/row">
                <span className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${SEVERITY_DOT[item.severity]}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-medium">{item.label}</span>
                    <span className={`text-[12px] font-semibold uppercase tracking-wide ${SEVERITY_TEXT[item.severity]}`}>{SEVERITY_WORD[item.severity]}</span>
                  </div>
                  <div className={`text-[13px] leading-snug mt-0.5 ${item.severity === "critical" ? "text-danger" : item.severity === "attention" ? "text-warn" : "text-muted-2"}`}>{item.description}</div>
                </div>
                <span className="text-[13px] text-muted-2 opacity-0 group-hover/row:opacity-100 transition-opacity mt-0.5 shrink-0">Open →</span>
              </Link>
            ))}
          </div>
        </div>

        {/* The brief has its own tab AND a checklist row above — no third copy
            here. Overview = status (checklist) + recommendations + activity. */}

        {/* Recommendations for this prototype — agent build-friction, triaged here. */}
        <Recommendations prototypeKey={proto.key} initial={recommendations} canManage={canManage} />
      </div>

      {/* ── The heartbeat ── */}
      <div className="rounded-xl border border-border bg-surface p-4 lg:sticky lg:top-4">
        <div className="text-[13px] font-semibold uppercase tracking-wider text-muted-2 mb-3">Activity</div>
        {activity.length === 0 ? (
          <p className="text-[14px] text-muted-2">Nothing yet — activity appears as the work happens.</p>
        ) : (
          <div className="space-y-3">
            {activity.map((a, i) => (
              <div key={i} className="flex gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-border-strong mt-2 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[14px] leading-snug">{a.text}</div>
                  <div className="text-[12.5px] text-muted-2"><TimeAgo iso={a.at} />{a.who ? ` · ${a.who}` : ""}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
