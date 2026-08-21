# Executive summary readout

*Spec — 2026-08-20. Print and email each offer two outputs: the current **full
readout**, and an **executive summary**.*

## The reader

Someone who wasn't in the room, has thirty seconds, and has to decide whether to
act. They will not interpret a table. Anything they must interpret is a chance to
interpret it wrong, so the summary states conclusions, not evidence.

## What's in it

Six lines, one screen, no tables.

1. **The answer.** Won / lost / undecided, in a sentence. Not "lift was +8.3%" —
   "more people reached Rooms & Rates."
2. **Confidence.** Settled or not settled. This is the line executives most often
   get wrong: an unsettled read acted on as a result. It is stated before any
   number, so the number is read in its light.
3. **The decision metric, one number.** The lift, its direction of good, and
   whether it cleared the bar. One metric only — the one the experiment was
   pre-registered to answer.
4. **What it means in practice.** The consequence in the reader's terms.
5. **Guardrails, one line.** "Nothing else moved" — or the name of the thing that
   broke and by how much. Never a list of everything that held.
6. **The recommendation.** Ship, stop, or keep running. If keep running, until
   when, in weeks.

## What's deliberately out

The metrics index · per-variation tables · evidence · the measurement plan ·
windowed views · significance mathematics · anything with more than one number
per line.

## Two rules that are not obvious

**If it isn't settled, say what settling would take.** "Needs about two more
weeks" belongs on the face of it. Without that, an undecided experiment reads as
a weak result and gets killed on noise.

**Never print a lift whose polarity is assumed.** The model already distinguishes
a declared `direction` from an absent one, and the full readout says "assumed"
when it's missing. An executive summary has no room for that caveat, so it must
not silently drop it: if direction of good was never declared, the summary says
the metric moved and refuses to call it good or bad. A confident "+8%" on a
metric nobody set a direction for is the single worst thing this document could
produce.

## Shape

`variant: "full" | "executive"` threaded through the existing renderer — not a
second report system. Print and email already converge on one builder.

- `src/lib/reports/build.ts` — `buildFor()` takes the variant
- `src/lib/reports/types.ts` — `Report.variant`, defaulting to `"full"` so every
  existing schedule is unchanged
- `src/app/reports/[id]/page.tsx` + `ReportDetail` — read `?variant=executive`
- `src/components/PrintReadoutButton.tsx` — offer both
- Reports UI sets it per report; the cron passes it through untouched

Content comes from `readout-model.ts`, which already carries the headline, the
`Confidence`, the gate, and `GuardrailSummary`. The executive summary is a
narrower projection of the same model — it must never compute its own verdict, or
the two documents can disagree about the same experiment.
