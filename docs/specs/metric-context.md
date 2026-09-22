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

## The window is narrow, and it is not the brief

The brief is authored **well in advance of the build**. The metrics do not exist
then — not in Prism and not in Optimizely. They appear only after the experiment
is integrated and someone adds them in Optimizely, and Prism learns them by
reading the API back:

```
"No experiment bound yet — bind it in the Ship section first."
"No events found on the experiment or in the project registry —
 add metrics to the experiment in Optimizely first."
```
— `lib/ai/measurement.ts`, `api/prototypes/measurement/route.ts`

**So metric context cannot live in the brief.** The brief describes something
that does not have metrics yet; by the time metrics exist the brief is long
written. That answers an open question this spec previously left open, and it
answers it by timing rather than by preference.

The real window is between two events:

```
metrics exist in Optimizely and read back through the API
          ↓
   [ THE WINDOW — context must be captured here ]
          ↓
        experiment goes live
```

That is a genuinely awkward moment: late enough that the team is close to
launching, early enough that nothing has been measured. It is also the only
moment when the question "what does this metric capture?" can be both asked and
answered, so the gate belongs at **go-live**, not at brief completion and not at
map confirmation.

Which sharpens the recommendation above: block **starting the experiment** until
the primary metric has a definition — not `confirmed`, which a team may set
while still iterating on the binding. Arming is the last responsible moment.

### The window CLOSES. That is what makes the guarantee total.

**Metrics cannot be added once the experiment is live.** A prototype under test
is locked. So the window does not merely narrow at go-live — it shuts.

The codebase already enforces the identical principle one layer down, for code:

> "This experiment is RUNNING. Pushing would change the live variation mid-test
> and corrupt results — pause it in Optimizely first, then push."
> — `lib/prototypes/ship.ts`, under the comment *"a running experiment is
> immutable. No override."*

Metrics deserve the same rule for the same reason: a measure introduced
mid-flight has no data before the moment it was added, so it cannot be compared
across the whole test without lying about the denominator.

Three consequences, and they are the reason this gate is worth building:

1. **The guarantee is assertable, not aspirational.** "Every metric in this
   experiment was described by a human before anything was measured" becomes a
   property of the system rather than a habit people are asked to keep.
2. **There is no late-addition case to design for.** An earlier draft of this
   spec asked whether a metric appearing mid-flight should be marked exploratory
   and kept out of the verdict. The question is void: it cannot appear.
3. **The drift audit's signal gets stronger.** A results name absent from `known`
   stops being ambiguous between "someone added a metric later" and "something
   is wrong upstream". Only the second remains, so the audit can say so plainly
   rather than hedging.

The one thing the gate cannot fix is the past: the nine existing metrics with no
definition are already live and therefore already locked. They are not a
migration, they are a cohort — grandfathered, and worth labelling as such so a
readout never implies a human described something nobody did.

## Decided: the definition INFORMS, and the taxonomy catches legacy

### Precedence

```
1. the human's definition for THIS metric   — informs the model's wording
2. the site/customer taxonomy               — fallback, LEGACY ONLY
3. (nothing)                                — requireTaxonomy refuses; no prose
```

There is no fourth tier. A customer with no brand profile does not get generic
prose, it gets a refusal — that is what `requireTaxonomy` is for.

### "Informs", not "verbatim"

The human's sentence is given to the model as the authority on MEANING, and the
model still writes the line. It may tighten the phrasing, fit the 140-character
cap and match the surrounding prose — it may not contradict the definition,
widen it, or introduce a mechanism the human did not describe.

Verbatim was the alternative and it was rejected: a definition typed in a hurry
at planning time reads like a form field, and the readout is a document someone
shows an executive. Informing keeps the prose readable while keeping the meaning
owned by a person.

That makes the definition behave like every other CHARACTERIZED fact here: a
human settles it, the machine renders it, and the machine may not quietly
disagree. The existing repair round-trip in `observation.ts` is the enforcement
point — output that contradicts the definition is rejected and re-asked, exactly
as output containing digits is today.

### The fallback is a closed set, and must stay closed

The taxonomy fallback exists for metrics that went live before the gate — the
nine with no definition, already locked, unreachable by any gate.

**It must not be reachable by a new metric.** If a metric created after the gate
can quietly fall back to org-level vocabulary, the gate stops being a gate: a
team blocked at arming would learn that waiting produces the same readout
without the typing. The fallback serves what is already behind the closed door;
it is never a way around it.

Mechanically that means the fallback keys on something a new metric cannot
satisfy — the metric map predating the gate's release — rather than simply
"definition is absent". "Absent" is the condition the gate exists to prevent, so
it cannot also be the condition that excuses it.

### Disclose which tier was used

A readout written from a human definition and one written from org vocabulary
are not the same claim, and this system distinguishes CHARACTERIZED from
inferred everywhere else. The observation should record which tier produced it,
alongside the profile revision from Phase 4 of the prompt plan.

That answers grandfathering without a banner on every historical readout: the
provenance is recorded and available where someone asks how a line was arrived
at, rather than announced over prose nobody is questioning.

## How the gate presents

Decided against `docs/DESIGN-PRINCIPLES.md` rather than invented, and the
principles overrule the obvious instinct in one place.

**It is a queue item, not a modal.** Principle 1 puts gates and problems in the
command rail — "THE RAIL IS THE CHECKLIST … the queue replaced the single CTA +
gate line, its first item IS the gate, with its why." A dialog in front of the
arm button would be a second place where a gate lives, and there is only one.

**It holds position; it does not send you backwards.** Principle 5: gates block,
they never teleport. Arming stays where it is, blocked and badged. The work does
not get moved back to the measurement plan as though it were unfinished.

**It links to its fix.** Principle 6: status you cannot act on from where you see
it is decoration. The queue item deep-links (`?tab=…`) to the room that owns the
metric, which is where the edit happens — the same shape as a drift refusal
resolving in the Brief room wherever it surfaced.

**It arrives pre-filled, and this is the important part.** Principle 15 —
compute the caveat, never ask for it. The planner already inferred what the
metric captures; making a human compose a sentence from nothing, at the moment
they are trying to launch, is how a gate becomes a thing people learn to resent
and then to game. So the field is presented already containing the planner's
inference, attributed as such, and the human's job is to accept or correct it.
One reading, one keystroke if it is right.

That is also what keeps the CHARACTERIZED claim honest. Accepting an inference
is a human settling it — the same act as typing it, and recorded the same way.
What must never happen is the inference being used without anyone looking, which
is exactly what the gate prevents.

**No bypass.** Principle 5 again: "A running experiment locks the prototype — no
UI may offer a bypass." The same holds here. There is no "skip for now", because
after go-live the window is shut and the skip would be permanent.

Open for tweaking later: the wording of the queue line itself, and whether
guardrail metrics get the same pre-filled treatment or only the primary.
