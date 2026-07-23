import type { Pipeline, StepState } from "@/lib/prototypes/pipeline";

const DOT: Record<StepState, string> = {
  done: "bg-ok border-ok",
  current: "bg-accent border-accent",
  todo: "bg-transparent border-border-strong",
  blocked: "bg-danger border-danger",
};
const TITLE: Record<StepState, string> = {
  done: "text-foreground",
  current: "text-foreground font-semibold",
  todo: "text-muted-2",
  blocked: "text-danger font-semibold",
};

/**
 * The prototype's spine: where it is, what's true, what's next. Everything on
 * it is derived from stored ground truth (lib/prototypes/pipeline.ts) — the
 * page below is organized around these steps, and the one CTA is always the
 * next action.
 */
export function PipelineHeader({ pipeline }: { pipeline: Pipeline }) {
  const { steps, primaryAction, alerts, truth } = pipeline;

  return (
    <div className="space-y-3">
      {/* Stepper + CTA */}
      <div className="rounded-xl border border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-start gap-0 flex-1 min-w-0 overflow-x-auto py-1">
            {steps.map((s, i) => (
              <div key={s.id} className="flex items-start shrink-0">
                <a href={`#${s.anchor}`} className="group flex flex-col items-start min-w-[7.2rem] pr-2">
                  <div className="flex items-center w-full">
                    <span className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ${DOT[s.state]} ${s.state === "done" ? "shadow-[0_0_0_3px_color-mix(in_srgb,var(--ok)_15%,transparent)]" : s.state === "current" ? "shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_18%,transparent)]" : ""}`} />
                    {i < steps.length - 1 && <span className={`h-px flex-1 ml-1.5 mr-0.5 ${s.state === "done" ? "bg-ok/50" : "bg-border"}`} />}
                  </div>
                  <span className={`text-[12px] mt-1.5 group-hover:text-foreground ${TITLE[s.state]}`}>{s.title}</span>
                  <span className={`text-[10px] leading-tight ${s.state === "blocked" ? "text-danger" : "text-muted-2"}`}>{s.status}</span>
                </a>
              </div>
            ))}
          </div>
          <a href={`#${primaryAction.anchor}`} className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover transition-colors flex items-center shrink-0">
            {primaryAction.label}
          </a>
        </div>
      </div>

      {/* Ground truth: one green line, or specific problems */}
      {alerts.length === 0 ? (
        <div className="rounded-lg border border-ok/25 bg-[color-mix(in_srgb,var(--ok)_4%,transparent)] px-3 py-1.5 text-[11px] text-muted flex items-center gap-3 flex-wrap">
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
            <a key={i} href={a.anchor ? `#${a.anchor}` : undefined} className={`block rounded-lg border px-3 py-2 text-[12px] hover:opacity-90 ${a.level === "danger" ? "border-danger/40 bg-[color-mix(in_srgb,var(--danger)_6%,transparent)] text-danger" : "border-warn/40 bg-[color-mix(in_srgb,var(--warn)_6%,transparent)] text-warn"}`}>
              {a.text}{a.anchor ? " →" : ""}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
