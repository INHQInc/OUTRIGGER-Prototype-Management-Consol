# Executive summary readout

*Spec — 2026-08-20. Print and email each offer two outputs: the current **full
readout**, and an **executive summary**.*

## The reader

Someone who wasn't in the room, has thirty seconds, and has to decide whether to
act. They will not interpret a table. Anything they must interpret is a chance to
interpret it wrong, so the summary states conclusions, not evidence.

## What's in it

Four things. Nothing else.

**1 — Winning, or not.** The verdict in a sentence, with whether it is settled.
Three states only: winning · not winning · too early to say. Never a percentage
in this line; the number lives below it.

**2 — The number.** The decision metric, one figure, with what it means in
practice. "More people reached Rooms & Rates — up 8.3%." One metric, the one the
experiment was pre-registered to answer.

**3 — The biggest observation.** The single most interesting thing the run
surfaced, whether or not it relates to the verdict. Often this is the finding
that changes what gets tested next, and it is the part an executive actually
repeats to someone else. One observation — a list is a report, not a summary.

**4 — The biggest downside.** What this costs, or could cost, if shipped: the
guardrail that moved, the segment it hurt, the thing that got worse while the
headline got better. If genuinely nothing, it says so in those words. This line
is not optional — a summary with no downside reads as a sales pitch and gets
trusted less, not more.

Then the recommendation, if there is one: ship, stop, or keep running until when.


## What's deliberately out

The metrics index · per-variation tables · evidence · the measurement plan ·
windowed views · significance mathematics · anything with more than one number
on a line.

## Two rules that are not obvious

**If it isn't settled, say what settling would take.** "Needs about two more
weeks" belongs on the face of it. Without that, an undecided experiment reads as
a weak result and gets killed on noise.

**Never print a lift whose polarity is assumed.** The model already distinguishes
a declared `direction` from an absent one, and the full readout says "assumed"
when it is missing. The executive summary has no room for that caveat, so it must
not silently drop it: with no declared direction it says the metric moved and
refuses to call it good or bad. A confident "+8%" on a metric nobody set a
direction for is the worst thing this document could produce.

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
`Confidence`, the gate and `GuardrailSummary`. The executive summary is a
narrower projection of the same model — it must never compute its own verdict,
or the two documents can disagree about the same experiment.

**Open:** "biggest observation" has no field today. It is either the analyst's
existing reading, truncated to one sentence, or a new authored line. Decide
before building — deriving it heuristically would put words in the team's mouth.
