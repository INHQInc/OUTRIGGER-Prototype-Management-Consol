import Link from "next/link";
import { TimeAgo } from "@/components/ui";
import type { Pipeline } from "@/lib/prototypes/pipeline";
import type { PrototypeRecord, ArtifactVersion } from "@/lib/prototypes/types";
import type { PushResult } from "@/lib/prototypes/ship";

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
export function PrototypeOverview({ proto, pipeline, versions, push, activity }: {
  proto: PrototypeRecord;
  pipeline: Pipeline;
  versions: ArtifactVersion[];
  push: PushResult | null;
  activity: ActivityItem[];
}) {
  const b = proto.brief;
  const hasBrief = Boolean(b.change?.trim());
  const blocked = pipeline.steps.filter((s) => s.state === "blocked");
  const latest = versions[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-4 items-start">
      {/* ── The thing itself ── */}
      <div className="space-y-4 min-w-0">
        {/* What's missing — only when something is */}
        {(blocked.length > 0 || pipeline.alerts.length > 0) && (
          <div className="rounded-xl border border-warn/40 bg-[color-mix(in_srgb,var(--warn)_4%,transparent)] p-4">
            <div className="text-[13px] font-semibold uppercase tracking-wider text-warn mb-2">Needs attention</div>
            <div className="space-y-1.5">
              {blocked.map((s) => (
                <Link key={s.id} href={`?tab=${s.anchor}`} className="block text-[14px] text-danger hover:opacity-80">⚠ {s.title}: {s.status} →</Link>
              ))}
              {pipeline.alerts.map((a, i) => (
                <Link key={i} href={a.anchor ? `?tab=${a.anchor}` : "#"} className={`block text-[14px] hover:opacity-80 ${a.level === "danger" ? "text-danger" : "text-warn"}`}>{a.text} →</Link>
              ))}
            </div>
          </div>
        )}

        {/* The brief, as its document */}
        <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[13px] font-semibold uppercase tracking-wider text-muted-2">The brief</div>
            <Link href="?tab=brief" className="text-[14px] text-accent hover:text-accent-hover font-medium shrink-0">{hasBrief ? "Edit →" : "Write it →"}</Link>
          </div>
          {hasBrief ? (
            <>
              <p className="text-[15px] leading-relaxed">{b.change}</p>
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
            <p className="text-[14px] text-muted-2">No brief yet — it&apos;s the gate. Explain the experiment in your own words and Claude drafts the rest.</p>
          )}
        </div>

        {/* The parts, at a glance — each links to its room */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="?tab=build" className="rounded-xl border border-border bg-surface p-4 hover:border-border-strong transition-colors">
            <div className="text-[13px] font-semibold uppercase tracking-wider text-muted-2 mb-1">Build</div>
            <div className="text-[14px]">{pipeline.steps.find((s) => s.id === "build")?.status}</div>
            {pipeline.truth.claudeSeenAt && <div className="text-[13px] text-muted-2 mt-0.5">Claude engaged <TimeAgo iso={pipeline.truth.claudeSeenAt} /></div>}
          </Link>
          <Link href="?tab=pages" className="rounded-xl border border-border bg-surface p-4 hover:border-border-strong transition-colors">
            <div className="text-[13px] font-semibold uppercase tracking-wider text-muted-2 mb-1">Pages</div>
            <div className="text-[14px]">{pipeline.steps.find((s) => s.id === "review")?.status}</div>
            <div className="text-[13px] text-muted-2 mt-0.5">{proto.targets.length} target page{proto.targets.length === 1 ? "" : "s"}</div>
          </Link>
          <Link href="?tab=experiment" className="rounded-xl border border-border bg-surface p-4 hover:border-border-strong transition-colors">
            <div className="text-[13px] font-semibold uppercase tracking-wider text-muted-2 mb-1">Experiment</div>
            <div className="text-[14px]">{pipeline.steps.find((s) => s.id === "launch")?.status}</div>
            <div className="text-[13px] text-muted-2 mt-0.5 font-mono">
              {latest ? `v${latest.version}${latest.certification ? (latest.certification.passed ? " · certified ✓" : " · cert FAILED") : ""}` : "no version cut"}
              {push ? ` · pushed v${push.version}` : ""}
            </div>
          </Link>
          <Link href="?tab=handoff" className="rounded-xl border border-border bg-surface p-4 hover:border-border-strong transition-colors">
            <div className="text-[13px] font-semibold uppercase tracking-wider text-muted-2 mb-1">Handoff</div>
            <div className="text-[14px]">{proto.status === "shipped" ? "shipped to production" : "when the experiment wins"}</div>
            <div className="text-[13px] text-muted-2 mt-0.5">winner → production code</div>
          </Link>
        </div>
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
