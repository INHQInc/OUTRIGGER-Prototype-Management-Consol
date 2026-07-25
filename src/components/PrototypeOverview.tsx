import Link from "next/link";
import { TimeAgo, SEVERITY_DOT, SEVERITY_TEXT } from "@/components/ui";
import { Recommendations } from "@/components/Recommendations";
import type { Pipeline } from "@/lib/prototypes/pipeline";
import type { StepSeverity } from "@/lib/prototypes/severity";
import type { PrototypeRecord } from "@/lib/prototypes/types";
import type { Idea } from "@/lib/ideas/ideas";

const SEVERITY_WORD: Record<StepSeverity, string> = { critical: "Blocked", attention: "Needs attention", good: "Done", pending: "Not started" };

export interface ActivityItem { at: string; text: string; who?: string }

/** Split stored criteria back into checkable lines. */
function criteriaLines(s: string): string[] {
  return s.split(/\n+/).map((l) => l.replace(/^[-•]\s*/, "").trim()).filter(Boolean);
}

/**
 * Overview — the prototype as a living thing, not a list of steps.
 * What it IS (the brief, rendered), what's MISSING (the gates, linked to their
 * rooms), and what's HAPPENING (the activity feed — every heartbeat the system
 * already records, finally visible).
 */
export function PrototypeOverview({ proto, pipeline, activity, recommendations, canManage }: {
  proto: PrototypeRecord;
  pipeline: Pipeline;
  activity: ActivityItem[];
  recommendations: Idea[];
  canManage: boolean;
}) {
  const b = proto.brief;
  const hasBrief = Boolean(b.change?.trim());
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

        {/* The brief, as its document — only when there IS one (the checklist's
            Brief row guides an empty one). */}
        {hasBrief && (
          <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[13px] font-semibold uppercase tracking-wider text-muted-2">The brief</div>
              <Link href="?tab=brief" className="text-[14px] text-accent hover:text-accent-hover font-medium shrink-0">Edit →</Link>
            </div>
            <p className="text-[15px] leading-relaxed max-w-[70ch]">{b.change}</p>
            {b.doneLooksLike?.trim() && (
              <ul className="space-y-1">
                {criteriaLines(b.doneLooksLike).slice(0, 5).map((c, i) => (
                  <li key={i} className="text-[14px] text-muted leading-relaxed flex gap-2"><span className="text-ok shrink-0">✓</span><span>{c}</span></li>
                ))}
              </ul>
            )}
            <div className="flex items-center gap-1.5 flex-wrap">
              {proto.metrics.primary && <span className="text-[13px] px-2 py-1 rounded-md bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] font-medium">📊 {proto.metrics.primary}</span>}
              {proto.metrics.guardrails.slice(0, 3).map((g, i) => <span key={i} className="text-[13px] px-2 py-1 rounded-md bg-surface-2 text-muted-2">🛡 {g}</span>)}
            </div>
          </div>
        )}

        {/* No parts grid: the tab row directly above IS the map of the rooms,
            dots included. Restating it as cards was the tab bar said twice. */}

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
