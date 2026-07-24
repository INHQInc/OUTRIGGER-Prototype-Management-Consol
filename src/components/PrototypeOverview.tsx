import Link from "next/link";
import { TimeAgo } from "@/components/ui";
import type { Pipeline } from "@/lib/prototypes/pipeline";
import type { PrototypeRecord } from "@/lib/prototypes/types";

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
export function PrototypeOverview({ proto, pipeline, activity }: {
  proto: PrototypeRecord;
  pipeline: Pipeline;
  activity: ActivityItem[];
}) {
  const b = proto.brief;
  const hasBrief = Boolean(b.change?.trim());
  const blocked = pipeline.steps.filter((s) => s.state === "blocked");
  // A blocked step and its alert say the same thing — say it once.
  const blockedAnchors = new Set(blocked.map((s) => s.anchor));
  const extraAlerts = pipeline.alerts.filter((a) => !a.anchor || !blockedAnchors.has(a.anchor));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_23rem] gap-4 items-start">
      {/* ── The thing itself ── */}
      <div className="space-y-4 min-w-0">
        {/* What's missing — only when something is */}
        {(blocked.length > 0 || extraAlerts.length > 0) && (
          <div className="rounded-xl border border-warn/40 bg-[color-mix(in_srgb,var(--warn)_4%,transparent)] p-4">
            <div className="text-[13px] font-semibold uppercase tracking-wider text-warn mb-2">Needs attention</div>
            <div className="space-y-1.5">
              {blocked.map((s) => (
                <Link key={s.id} href={`?tab=${s.anchor}`} className="block text-[14px] text-danger hover:opacity-80">⚠ {s.title}: {s.status} →</Link>
              ))}
              {extraAlerts.map((a, i) => (
                <Link key={i} href={a.anchor ? `?tab=${a.anchor}` : "#"} className={`block text-[14px] hover:opacity-80 ${a.level === "danger" ? "text-danger" : "text-warn"}`}>{a.text} →</Link>
              ))}
            </div>
          </div>
        )}

        {/* The brief, as its document. When it's missing AND blocked, Needs
            Attention above already says so — repeating it here was noise. The
            empty-state card renders only for a fresh prototype (nothing blocked). */}
        {(hasBrief || blocked.length === 0) && (
          <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[13px] font-semibold uppercase tracking-wider text-muted-2">The brief</div>
              <Link href="?tab=brief" className="text-[14px] text-accent hover:text-accent-hover font-medium shrink-0">{hasBrief ? "Edit →" : "Write it →"}</Link>
            </div>
            {hasBrief ? (
              <>
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
              </>
            ) : (
              <p className="text-[14px] text-muted-2">Explain the experiment in your own words — Claude drafts the rest.</p>
            )}
          </div>
        )}

        {/* No parts grid: the tab row directly above IS the map of the rooms,
            dots included. Restating it as cards was the tab bar said twice. */}
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
