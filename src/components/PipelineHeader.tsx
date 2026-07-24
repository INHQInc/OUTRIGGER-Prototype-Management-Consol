import type { Pipeline } from "@/lib/prototypes/pipeline";

/**
 * The prototype's status, said ONCE: a stage chip (the exact same word as its
 * board column), that stage's honest one-liner, and the single next action.
 * Per-part detail lives on the room tabs' dots — not here. Below: ground truth
 * when everything is healthy, or the specific problems when it isn't.
 */
export function PipelineHeader({ pipeline }: { pipeline: Pipeline }) {
  const { stage, primaryAction, alerts, truth } = pipeline;

  const chip = stage.blocked
    ? "border-danger/50 text-danger bg-[color-mix(in_srgb,var(--danger)_7%,transparent)]"
    : stage.live
      ? "border-ok/50 text-ok bg-[color-mix(in_srgb,var(--ok)_8%,transparent)]"
      : stage.id === "shipped"
        ? "border-ok/50 text-ok bg-[color-mix(in_srgb,var(--ok)_8%,transparent)]"
        : "border-accent/50 text-accent bg-[color-mix(in_srgb,var(--accent)_7%,transparent)]";
  const dot = stage.blocked ? "bg-danger" : stage.live || stage.id === "shipped" ? "bg-ok" : "bg-accent";

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-3 flex-wrap">
        <span className={`inline-flex items-center gap-2 h-8 px-3 rounded-full border text-[14px] font-semibold ${chip}`}>
          <span className={`w-2 h-2 rounded-full ${dot} ${stage.live ? "animate-pulse" : ""}`} />
          {stage.blocked ? `Blocked at ${stage.label}` : stage.label}
        </span>
        <span className="text-[14px] text-muted min-w-0">{stage.status}</span>
        <a href={`?tab=${primaryAction.anchor}`} className="ml-auto h-9 px-4 rounded-lg bg-accent text-accent-fg text-[15px] font-semibold hover:bg-accent-hover transition-colors flex items-center shrink-0">
          {primaryAction.label}
        </a>
      </div>

      {/* Ground truth: one green line, or specific problems */}
      {alerts.length === 0 ? (
        <div className="rounded-lg border border-ok/25 bg-[color-mix(in_srgb,var(--ok)_4%,transparent)] px-3 py-1.5 text-[13px] text-muted flex items-center gap-3 flex-wrap">
          <span className="text-ok font-semibold">Ground truth ✓</span>
          {truth.headSha && <span>serving <span className="font-mono">{truth.headSha.slice(0, 7)}</span>{truth.built ? " = HEAD" : ""}</span>}
          <span>{truth.synced ? "synced" : "drift"}</span>
          {truth.latestVersion != null && <span>v{truth.latestVersion}{truth.certified === true ? " certified" : truth.certified === false ? " FAILED" : ""}</span>}
          {truth.pushedVersion != null && <span>v{truth.pushedVersion} pushed{truth.pushVerified ? " ✓" : ""}</span>}
          {truth.claudeSeenAt && <span>Claude engaged</span>}
        </div>
      ) : (
        <div className="space-y-1.5">
          {alerts.map((a, i) => (
            <a key={i} href={a.anchor ? `?tab=${a.anchor}` : undefined} className={`block rounded-lg border px-3 py-2 text-[14px] hover:opacity-90 ${a.level === "danger" ? "border-danger/40 bg-[color-mix(in_srgb,var(--danger)_6%,transparent)] text-danger" : "border-warn/40 bg-[color-mix(in_srgb,var(--warn)_6%,transparent)] text-warn"}`}>
              {a.text}{a.anchor ? " →" : ""}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
