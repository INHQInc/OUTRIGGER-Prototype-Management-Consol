# Metric context — what a metric captures, in the team's own words

*Spec written 22 Sep 2026, after finding that most of this already exists and
almost nothing fills it in.*

## The idea

Before an experiment starts, the team states — per metric — what it is and what
it captures. Not the event binding, which the planner already does: the meaning.

## It is already modelled. It is just not required.

`CompositeMetric` in `lib/prototypes/results.ts` carries a block commented
*"measurement-plan understanding (authored at the interview)"*:

```ts
definition?: string;                 // what this measures, in the team's own words
surfaces?: { arm; description }[];   // which UI surfaces express it, per arm
expectedOneArm?: "variation" | "baseline";
mdeRel?: number;                     // smallest lift worth shipping
```

And `MetricMap` carries the plan layer around it: `interview` (the Q&A trail),
`understanding` (0–100 planner confidence), `gaps`, `known`, `pendingQuestions`,
`pendingChoices`, `confirmed`.

**Every context field is optional.** That is the whole problem.

## What the data says

Staging, 22 Sep 2026 — three experiments, eleven metrics:

| metric map | metrics | with `definition` | with `surfaces` | `understanding` |
|---|---|---|---|---|
| home-page-cta-optimization | 1 | 0 | 0 | — |
| home-page-hero-no-offer | 6 | 0 | 0 | — |
| room-detail-overlay | 4 | 2 | 1 | 98 |

Two metrics out of eleven have a definition. One map has been through the
interview at all. So for nine metrics, `deepObservation()` is inventing "the
guest behaviour it counts" from the event binding and the brief, when a human
could have stated it in one line at planning time.

This is not a missing feature. It is a feature nobody is made to use.

## Why it matters more than it looks

**It removes a guess from customer-facing prose.** `captures` stops being model
output and becomes human input the model is told to respect. That is the house
rule — when model behaviour needs to be reliable, enforce it structurally rather
than writing a better prompt.

**It is sharper than the brand taxonomy.** The profile knows this customer says
"guests" and "rooms". It cannot know *"the booking engine's rooms and rates
step"* — that is this metric, on this site, and only a human has it. Org-level
vocabulary and per-metric context are different layers and both are needed.

**It largely dissolves the worked-examples problem** in
`docs/plans/VERTICAL-NEUTRAL-PROMPTS.md`. The hospitality examples in
`observation.ts` exist to teach the model the SHAPE of a good `captures` line.
If a human wrote the line, the shape needs no teaching.

**It fits the knowledge model already in use.** This is CHARACTERIZED knowledge
— a human asserting, not a crawl (OBSERVED) and not a measurement (EARNED). It
belongs to the experiment rather than the site, which is why it lives on the
metric map and not the brand profile.

## The actual decision: what gates start, and how hard

`understanding` is rendered in `MeasurementPanel.tsx` only while
`!plan.confirmed`, and gates nothing. `confirmed` is the human sign-off on the
map as a whole — it does not ask whether any metric was described.

Four options, increasing in friction:

**1. Advisory.** Show which metrics lack a definition; block nothing. Cheapest,
and on today's evidence it changes nothing — the fields are already optional and
already skipped.

**2. Gate on the planner's own confidence.** Require `understanding >= N` before
`confirmed` can be set. Uses a number that already exists, and asks the AI to
judge rather than the human to type. Weakness: the planner scoring its own
comprehension is exactly the thing that should not be self-graded.

**3. Require a definition on the PRIMARY metric only.** The decision metric is
the one that confirms or refutes the hypothesis and the one the readout leads
with. One sentence, on the one metric that carries the verdict. Guardrails and
info metrics stay optional.

**4. Require it on every metric.** Most rigorous, most friction, and the most
likely to be defeated by typing "clicks" eleven times.

**Recommendation: 3, with 1 alongside.** Block `confirmed` until the primary has
a definition; show the gaps for the rest without blocking. It puts the
requirement exactly where the consequence is, and a team that wants to describe
its guardrails still can.

## Sequencing against the vocabulary work

Metric context makes the prompt work *easier*, but the prompt work is not
blocked on it. Do them in this order:

1. Seed production, ship the `analystSkill` injection (Phase 1 of the prompt plan)
2. **This spec** — gate the primary's definition
3. Rewrite `observation.ts` prompts to prefer the human definition and fall back
   to generating one, which is where the examples question finally gets answered
4. Output validation (Phase 3), which now has two sources of truth to check
   against — the taxonomy and the human's own words

## Open questions

- **Does the definition override or inform?** If a human wrote `captures`, should
  the model still write its own, or print the human's verbatim? Verbatim is more
  honest and removes a whole class of drift; generating from it is more fluent.
- **Backfill.** Nine existing metrics have no definition. Do their readouts stay
  as they are, or does the gate apply retroactively and make live experiments
  unreadable until someone types?
- **Does this belong in the brief instead?** The brief already states the
  hypothesis and what done looks like. Metric context might be a section there
  rather than a per-metric field — one artifact rather than two.
