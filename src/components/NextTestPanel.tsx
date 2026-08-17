"use client";

import type { NextTest } from "@/lib/prototypes/next-test";
import { TARGET_REL } from "@/lib/prototypes/next-test";

/**
 * WHAT TO TEST NEXT — the computed half, rendered.
 *
 * Every figure here comes from `deriveNextTest`. This component performs no
 * arithmetic and writes no explanation of its own: where it shows a reason, the
 * reason is a string the derivation produced. A panel that could phrase its own
 * rationale would eventually phrase one the numbers don't support, which is the
 * failure mode the readout model already exists to prevent.
 *
 * It appears only once a run is adjudicated. Recommending the next test off an
 * unstamped verdict would be building on a result nobody has agreed to.
 */
const pct = (x?: number, dp = 1) => (x === undefined ? "—" : `${x > 0 ? "+" : ""}${(x * 100).toFixed(dp)}%`);
const abs = (x?: number, dp = 1) => (x === undefined ? "—" : `${(x * 100).toFixed(dp)}%`);

const K = "text-[11px] font-semibold tracking-[.08em] uppercase text-muted-2";
const CARD = "rounded-xl border border-border bg-surface p-4";

export function NextTestPanel({ next }: { next: NextTest }) {
  const { primary, traffic } = next;
  if (!primary && !next.ruleOuts.length && !next.transfer) return null;

  return (
    <div id="next-test" className="space-y-3">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h3 className="text-[15px] font-semibold tracking-tight">What to test next</h3>
        <span className="text-[12.5px] text-muted-2">
          computed from this run — {traffic.perArmN.toLocaleString()}/arm over {traffic.days} days
          {traffic.perArmPerDay > 0 && <> · {Math.round(traffic.perArmPerDay).toLocaleString()}/arm/day</>}
        </span>
      </div>

      {primary && (
        <div className={`${CARD} border-l-[3px] border-l-accent`}>
          <div className={K}>Recommended primary metric</div>
          <div className="text-[15px] font-semibold mt-1.5">{primary.label}</div>
          <div className="text-[13px] text-muted mt-1">
            Baseline {abs(primary.baselineRate, 2)}
            {primary.lift !== undefined && <> · moved {pct(primary.lift)} in this run</>}
            {primary.ci && <> ({pct(primary.ci.lo)} … {pct(primary.ci.hi)})</>}
          </div>

          {primary.resolvability.days !== undefined && (
            <div className="text-[13px] mt-2.5">
              <span className="text-muted-2">Resolves {Math.round(TARGET_REL * 100)}% in </span>
              <span className="font-semibold tabular-nums">~{primary.resolvability.days} days</span>
              <span className="text-muted-2"> at this traffic
                {primary.resolvability.needPerArm !== undefined &&
                  <> — needs {primary.resolvability.needPerArm.toLocaleString()}/arm</>}</span>
            </div>
          )}

          {primary.reasons.length > 0 && (
            <ul className="mt-2.5 space-y-1">
              {primary.reasons.map((r, i) => (
                <li key={i} className="text-[12.5px] text-muted-2 flex gap-2">
                  <span className="text-accent shrink-0">·</span><span>{r}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {next.excluded.length > 0 && (
        <div className={CARD}>
          <div className={K}>Ruled out as a primary</div>
          <div className="mt-2 space-y-1.5">
            {next.excluded.slice(0, 4).map((c) => (
              <div key={c.key} className="text-[13px] flex gap-2 flex-wrap">
                <span className="font-medium">{c.label}</span>
                {c.lift !== undefined && <span className="text-muted-2 tabular-nums">{pct(c.lift)}</span>}
                <span className="text-warn">— {c.ineligible}</span>
              </div>
            ))}
          </div>
          <p className="text-[12px] text-muted-2 mt-2.5">
            A metric that can&apos;t resolve in a sane window can be watched, never decided on.
          </p>
        </div>
      )}

      {next.funnelPairs.length > 0 && (
        <div className={CARD}>
          <div className={K}>Steps whose conversion moved</div>
          {next.funnelPairs.map((p) => (
            <div key={`${p.upKey}-${p.downKey}`} className="mt-2">
              <div className="text-[13.5px]">
                <span className="font-medium">{p.downLabel}</span>
                <span className="text-muted-2"> per </span>
                <span className="font-medium">{p.upLabel}</span>
              </div>
              <div className="text-[13px] tabular-nums mt-0.5">
                {abs(p.baseRatio)} → {abs(p.focusRatio)}
                <span className={`ml-2 font-semibold ${p.deltaRel > 0 ? "text-ok" : "text-danger"}`}>{pct(p.deltaRel)}</span>
              </div>
            </div>
          ))}
          <p className="text-[12px] text-warn mt-2.5">
            Unconfirmed — whether these sit on one path is an analytics question, not one this can answer.
          </p>
        </div>
      )}

      {next.transfer && (
        <div className={CARD}>
          <div className={K}>Where the actions went</div>
          <div className="text-[13.5px] mt-1.5">
            <span className="font-medium">{next.transfer.lostLabel}</span>
            <span className="text-muted-2"> gave up </span>
            <span className="font-semibold tabular-nums">{Math.abs(next.transfer.lost).toLocaleString()}</span>
            <span className="text-muted-2"> actions. Net across the other measures: </span>
            <span className="font-semibold tabular-nums">{next.transfer.net > 0 ? "+" : ""}{next.transfer.net.toLocaleString()}</span>
            <span className="text-muted-2"> ({(next.transfer.coverage * 100).toFixed(0)}% of what was lost).</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {next.transfer.contributors.slice(0, 8).map((c) => (
              <span key={c.key} className="text-[12.5px] text-muted-2">
                {c.label} <span className={`tabular-nums font-medium ${c.delta > 0 ? "text-ok" : "text-danger"}`}>
                  {c.delta > 0 ? "+" : ""}{c.delta}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {next.ruleOuts.length > 0 && (
        <div className={CARD}>
          <div className={K}>Directions ruled out</div>
          <div className="mt-2 space-y-1">
            {next.ruleOuts.slice(0, 6).map((r) => (
              <div key={r.key} className="text-[13px]">
                <span className="font-medium">{r.label}</span>
                <span className="text-muted-2"> — an effect larger than ±{abs(r.bound)} is ruled out</span>
              </div>
            ))}
          </div>
          <p className="text-[12px] text-muted-2 mt-2.5">
            A tight interval around zero is a settled answer, not a missing one. Changing these further
            has nothing to find.
          </p>
        </div>
      )}

      {next.guardrails.length > 0 && (
        <div className={CARD}>
          <div className={K}>Carry forward as guardrails</div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {next.guardrails.slice(0, 8).map((g) => (
              <span key={g.key} className="text-[12.5px]">
                {g.label}
                {g.lift !== undefined && <span className="text-muted-2 tabular-nums ml-1.5">{pct(g.lift)}</span>}
              </span>
            ))}
          </div>
          <p className="text-[12px] text-muted-2 mt-2.5">
            What this run gained, plus the guardrails it already carried. The next test must not give
            them back.
          </p>
        </div>
      )}
    </div>
  );
}
