"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  REACH, IMPACT, EFFORT, EVIDENCE, BAND_LABEL, MAX_RUNNABLE_WEEKS,
  derivePriority, formatRice, formatWeeks,
  type PrototypeScore, type ReachBand, type ImpactBand, type EffortBand,
} from "@/lib/prototypes/score";

/**
 * PRIORITY — the RICE inputs, and nothing else.
 *
 * It sits in the Brief room because prioritising IS part of saying what to
 * build and why: reach, effect size and evidence are claims about the problem,
 * not facts about the code. Putting it anywhere else would mean writing the
 * justification for a test in one room and the case for running it in another.
 *
 * Three things this panel refuses to do, each for the same reason — a score
 * people can talk themselves into is worth less than no score at all:
 *
 *   · Confidence has no control. It is a count of the evidence boxes below it,
 *     shown as a result. There is no field to set it to 90%.
 *   · The score is never typed. It is computed here and on the server from the
 *     same function, so the board, the table, the CSV and this panel cannot
 *     disagree about it.
 *   · Weeks-to-decide appears only when a real baseline rate is given. A run
 *     length computed from a guessed conversion rate would be believed.
 */
export function ScorePanel({ prototypeKey, initial, arms }: {
  prototypeKey: string;
  initial: PrototypeScore | null;
  /** Arms of this A/B/n test — traffic splits across them, so it changes the maths. */
  arms: number;
}) {
  const router = useRouter();
  const [score, setScore] = useState<PrototypeScore>(initial ?? {});
  const [baselineText, setBaselineText] = useState(
    initial?.baselineRate ? String(+(initial.baselineRate * 100).toFixed(2)) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const d = useMemo(() => derivePriority(score, { arms }), [score, arms]);

  async function save(next: PrototypeScore) {
    setScore(next); setBusy(true); setErr(null); setSaved(false);
    const r = await fetch("/api/prototypes", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: prototypeKey, score: next }),
    }).catch(() => null);
    setBusy(false);
    if (!r?.ok) {
      // Put the old inputs back rather than leave a score on screen that the
      // board will never show — a panel disagreeing with the board about the
      // number is the exact failure this whole file exists to prevent.
      setScore(score);
      setErr("Couldn't save that — the score on the board is still the old one.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  const toggleEvidence = (id: string) => {
    const have = new Set(score.evidence ?? []);
    if (have.has(id)) have.delete(id); else have.add(id);
    void save({ ...score, evidence: [...have] });
  };

  function commitBaseline() {
    const pct = parseFloat(baselineText.replace("%", "").trim());
    const rate = isFinite(pct) && pct > 0 && pct < 100 ? pct / 100 : undefined;
    if (rate === score.baselineRate) return;
    void save({ ...score, baselineRate: rate });
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-5">
      {/* THE ANSWER FIRST. Everything under it is the working. */}
      <div className="flex items-start gap-4 flex-wrap">
        <ScoreBadge d={d} large />
        <div className="min-w-[14rem] flex-1 text-[12.5px] leading-snug">
          {d.scored ? (
            <>
              <div className="text-muted">
                <span className="tabular-nums font-medium text-foreground">{(d.reachPerMonth! / 1000).toFixed(0)}k</span> reach
                {" × "}<span className="tabular-nums font-medium text-foreground">{d.impactFactor}</span> impact
                {" × "}<span className="tabular-nums font-medium text-foreground">{Math.round(d.confidence * 100)}%</span> confidence
                {" ÷ "}<span className="tabular-nums font-medium text-foreground">{d.effortDays}</span> {d.effortDays === 1 ? "day" : "days"}
              </div>
              <div className="text-muted-2 mt-1">
                Ranks against every other prototype on the board. Drag a card to override it.
              </div>
            </>
          ) : (
            <div className="text-muted-2">
              Unscored — pick {listMissing(d.missing)} below and this prototype joins the ranking.
              Until then it sorts last, because &ldquo;not judged yet&rdquo; is not the same as &ldquo;scored badly&rdquo;.
            </div>
          )}
          {err && <div className="text-danger mt-1.5">{err}</div>}
          {!err && saved && !busy && <div className="text-ok mt-1.5">Saved.</div>}
        </div>
      </div>

      <Choice label="Reach" hint="How many people a month meet this change, on the area it targets."
        options={REACH.map((r) => ({ id: r.id, label: r.label, hint: r.hint }))}
        value={score.reach} onPick={(v) => void save({ ...score, reach: v as ReachBand })} busy={busy} />

      <Choice label="Impact" hint="How much you expect it to move the primary metric, if it works."
        options={IMPACT.map((i) => ({ id: i.id, label: i.label, hint: i.hint }))}
        value={score.impact} onPick={(v) => void save({ ...score, impact: v as ImpactBand })} busy={busy} />

      <Choice label="Effort" hint="Build plus review, in person-days. The denominator — this is what makes the score value-per-day."
        options={EFFORT.map((e) => ({ id: e.id, label: e.label, hint: e.hint }))}
        value={score.effort} onPick={(v) => void save({ ...score, effort: v as EffortBand })} busy={busy} />

      {/* CONFIDENCE IS A RESULT, NOT A CONTROL. */}
      <div>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[13px] font-semibold">Evidence</span>
          <span className="text-[12.5px] text-muted-2">
            What we can point at. Confidence is the count of these —
            {" "}<span className="text-foreground font-medium tabular-nums">{d.evidenceCount}</span> ticked →
            {" "}<span className="text-foreground font-medium tabular-nums">{Math.round(d.confidence * 100)}%</span>. There is no box to type it in.
          </span>
        </div>
        <div className="grid sm:grid-cols-2 gap-1.5 mt-2">
          {EVIDENCE.map((e) => {
            const on = (score.evidence ?? []).includes(e.id);
            return (
              <button key={e.id} type="button" disabled={busy} onClick={() => toggleEvidence(e.id)}
                className={`text-left rounded-lg border px-2.5 py-2 transition-colors disabled:opacity-60 ${
                  on ? "border-accent bg-[color-mix(in_srgb,var(--accent)_7%,transparent)]" : "border-border hover:border-border-strong"}`}>
                <div className="flex items-center gap-1.5">
                  <span className={`w-3.5 h-3.5 rounded-[4px] border shrink-0 grid place-items-center text-[10px] leading-none ${
                    on ? "border-accent bg-accent text-white" : "border-border-strong"}`}>{on ? "✓" : ""}</span>
                  <span className="text-[12.5px] font-medium">{e.label}</span>
                </div>
                <div className="text-[12.5px] text-muted-2 leading-tight mt-0.5 pl-5">{e.hint}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── CAN IT EVEN BE DECIDED? ──────────────────────────────────────────
          The question every prioritisation model forgets. A score ranks how
          much you WANT the answer; this asks whether the traffic can give you
          one. An idea that cannot reach significance is not low priority — it
          is not an A/B test, and it should leave the queue rather than sit in
          it forever. */}
      <div className="rounded-lg border border-border/70 bg-surface-2/40 px-3 py-2.5">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[13px] font-semibold">Can it reach a decision?</span>
          <label className="text-[12.5px] text-muted-2 flex items-center gap-1.5 ml-auto">
            Current rate on the primary metric
            <input value={baselineText} onChange={(e) => setBaselineText(e.target.value)} onBlur={commitBaseline}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              inputMode="decimal" placeholder="3.2" disabled={busy}
              className="w-16 rounded border border-border bg-surface px-1.5 py-0.5 text-right tabular-nums text-foreground" />
            %
          </label>
        </div>
        <div className="text-[12.5px] leading-snug mt-1.5">
          {d.weeksToDecide !== null ? (
            <span className={d.underpowered ? "text-warn" : "text-ok"}>
              {d.underpowered ? "⚠ " : "✔ "}
              {formatWeeks(d.weeksToDecide)} to a readable result
              {arms > 2 && <span className="text-muted-2"> across {arms} arms</span>}
              {!d.underpowered && <span className="text-muted-2"> — inside the {MAX_RUNNABLE_WEEKS}-week limit.</span>}
            </span>
          ) : d.underpowered ? (
            <span className="text-warn">⚠ {d.powerNote}</span>
          ) : (
            <span className="text-muted-2">
              Add the rate above to get a run length. 95% confidence, 80% power, traffic split evenly across {Math.max(2, arms)} arms
              {score.impact ? <> and an effect of {Math.round((IMPACT.find((i) => i.id === score.impact)?.mde ?? 0) * 100)}%</> : null}.
            </span>
          )}
          {d.underpowered && d.weeksToDecide !== null && <div className="text-muted-2 mt-0.5">{d.powerNote}</div>}
        </div>
      </div>
    </div>
  );
}

function listMissing(missing: string[]): string {
  if (missing.length <= 1) return missing[0] ?? "the inputs";
  return `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
}

function Choice({ label, hint, options, value, onPick, busy }: {
  label: string; hint: string;
  options: { id: string; label: string; hint: string }[];
  value: string | undefined;
  onPick: (id: string) => void;
  busy: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[13px] font-semibold">{label}</span>
        <span className="text-[12.5px] text-muted-2">{hint}</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {options.map((o) => (
          <button key={o.id} type="button" disabled={busy} onClick={() => onPick(o.id)} title={o.hint}
            className={`rounded-lg border px-2.5 py-1.5 text-[12.5px] transition-colors disabled:opacity-60 ${
              value === o.id
                ? "border-accent bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] font-semibold"
                : "border-border hover:border-border-strong text-muted"}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * THE SCORE, ONE WAY, EVERYWHERE — this panel, the board card and the table
 * row all render this component, so the chip cannot mean one thing in one
 * place and another somewhere else.
 *
 * NO NEW COLOUR. The board already spends its two colour channels: severity
 * (red/amber/green, §1b) and the arm hue that ties an A/B/n test together. A
 * third ramp would collide with both, so priority reads as WEIGHT — a fill
 * that deepens with the band — and the numeral does the rest. The only part of
 * priority that takes a warning colour is "underpowered", because that is a
 * fact about whether the test can run, not a preference about whether it should.
 */
export function ScoreBadge({ d, large, className = "" }: {
  d: ReturnType<typeof derivePriority>; large?: boolean; className?: string;
}) {
  const weight: Record<string, string> = {
    now:     "bg-[color-mix(in_srgb,var(--foreground)_15%,transparent)] text-foreground border-[color-mix(in_srgb,var(--foreground)_28%,transparent)]",
    next:    "bg-[color-mix(in_srgb,var(--foreground)_9%,transparent)] text-foreground border-[color-mix(in_srgb,var(--foreground)_18%,transparent)]",
    later:   "bg-[color-mix(in_srgb,var(--foreground)_5%,transparent)] text-muted border-border",
    someday: "bg-transparent text-muted-2 border-border",
  };
  const cls = d.band ? weight[d.band] : "bg-transparent text-muted-2 border-dashed border-border";
  const title = d.scored
    ? `RICE ${formatRice(d.rice)} — ${BAND_LABEL[d.band!]}. (${(d.reachPerMonth! / 1000).toFixed(0)}k reach × ${d.impactFactor} impact × ${Math.round(d.confidence * 100)}% confidence) ÷ ${d.effortDays} days.${d.powerNote ? `\n\n⚠ ${d.powerNote}` : ""}`
    : `Unscored — no ${d.missing.join(", ")} set yet. Sorts last.`;
  return (
    <span title={title}
      className={`inline-flex items-center gap-1.5 rounded-lg border shrink-0 tabular-nums ${cls} ${
        large ? "px-3 py-2" : "px-1.5 py-0.5"} ${className}`}>
      <span className={large ? "text-[22px] font-semibold leading-none" : "text-[12.5px] font-semibold leading-none"}>
        {d.scored ? formatRice(d.rice) : "—"}
      </span>
      {d.band && (
        <span className={`${large ? "text-[12.5px]" : "text-[11px]"} uppercase tracking-wide opacity-70 leading-none`}>
          {BAND_LABEL[d.band]}
        </span>
      )}
      {d.underpowered && (
        <span className="text-warn leading-none" title={d.powerNote ?? undefined} aria-label="may not reach a decision">⚠</span>
      )}
    </span>
  );
}
