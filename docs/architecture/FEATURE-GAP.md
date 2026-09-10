# What the mock is missing

*From a six-agent inventory of Beta 1: **223 user-facing capabilities**, 44 of them
AI-assisted, 25 flagged as dead code. Every claim below was cited to file:line.*

**The verdict, verbatim:** *"The mock covers the workflow and drops the
epistemology, which is the part of this product nobody else has."*

The mock represents the SHAPE of every stage and the SUBSTANCE of almost none.
It was designed from architecture docs, and it shows.

---

## The five whose absence would be felt first

**1 · The typed verdict.** `verdict.ts` maps the frozen brief, the confirmed
metric map and the stats onto **seven states through nine ordered gates** —
confirmed · refuted · guardrail_breach · keep_running · underpowered · invalid ·
not_adjudicable — with validity gates running *before* significance is
consulted. The mock's two buttons make two of seven reachable, so an
underpowered null, a broken traffic split and an unadjudicable one-arm metric
all collapse into "It didn't win" — precisely the null-as-refutation mistake the
gate order exists to prevent. It also loses `nextStep()`, the one derived
sentence telling you what to do.
→ **Experiment · Decision**

**2 · The readout document.** `readout-model.ts` is pure and synchronous *so the
cron path and the browser path are provably identical rather than hopefully
similar*. The mock subscribes six people to an artifact that exists nowhere in
it. You cannot design a distribution room around a document you have not
designed.
→ **A document surface, opened from Decision and from Readouts**

**3 · Brief authoring.** `BriefComposer` + `ai/brief.ts` is where briefs are
actually written: AI drafts the whole structured brief from plain language,
scores its own readiness *honestly* (allowed to go DOWN when an answer reveals
more work), asks at most two questions on the first pass only, and supports
per-section "this is wrong because…" refinement — which is the only place the
system records a human disagreeing with the AI. The mock's brief card is
read-only and has no editor at all; six wizard textareas produce a structured
brief by magic.
→ **Experiment · Brief**

**4 · QA with gaps.** `CoveragePanel` generates scenarios from the brief AND the
compiled `dist/variation.js` — real triggers, selectors, breakpoints — and the
loud output is the **gaps**: scenarios the brief implies but the build does not
handle. Test cases carry `scenarioId` as a literal ENUM of real ids so an
invented parent is impossible at the API. One person eyeballing a preview
produces no QA record and no evidence that survives a re-cut.
→ **Experiment · Review**

**5 · Certification.** Eight static checks, each encoding a bug that actually
shipped — the idempotency guard, early-injection body safety, and the killer:
*dependency-gated init MUST retry*, because `init()` that bails once works fine
through the late-injecting loader and is silently dead in the real experiment.
A `fail` blocks the push; the override is a checkbox written into the audit log.
The mock collapses eight into one green tick.
→ **Experiment · Build**

## Also missing and essential

Immutable version cuts + rollback + push with **read-back byte verification** ·
the **brief↔build drift audit** that fires unprompted and blocks the cut · the
metric index and MetricBuilder (the direction toggle is the most
verdict-inverting control in the product) · handoff and the native integration
package · power/MDE/days-to-decision · guardrail adjudication by
**non-inferiority, four states** · the analyst's reading with Ask/Challenge ·
the headline contradiction detector · the evidence board · the signed public
link · the skill library (three built-ins ARE the product's own prompts) ·
externally-built experiments · promote-to-next-test · the setup checklist ·
the agent handshake · GitHub write-probe · per-page injection proof ·
reference repos · re-plan with disclosure · recommendations · SRM.

## What the mock got right, and should survive

Nine flat rooms with configuration promoted to first-class rather than hidden
behind a gear. A five-stage rail where only the current stage carries an action.
And its single best idea — **the frozen hypothesis inside the same card as the
buttons that adjudicate it** — which is exactly what Beta 1 computes and then
hides behind `SHOW_CALL=false`.

Four inventions are genuine advances Beta 1 does not have: separation of duties,
an org-level guardrail policy, multi-site-per-customer, and an approvable
brand-voice profile.

## Three warnings, two already acted on

**Compute-and-hide, reproduced in miniature.** `PLAN.understanding = 0.82` was
computed and rendered nowhere — the same habit that put five whole readout zones
behind `SHOW_*` constants. **Fixed:** it is on screen.

**A second definition of "brief complete."** The mock had its own inline rule
beside Beta 1's single `isBriefComplete` that every gate imports. **Fixed:** one
exported function. Kept stricter than Beta 1 — a guardrail is required — because
a brief with nothing that can veto a win cannot be adjudicated honestly.

**Three commitments Beta 1 cannot honour.** Per-recipient open tracking ("5 of 6
opened"), the multi-experiment digest (fenced at the API today), and an
immediately-triggered guardrail-breach readout (cadence is weekly-only). Decide
these on purpose rather than inheriting them from a mockup.

## The unanswered product question

The mock states there is no terminal, but never says who runs the agent. Either
the redesign commits to hosted agents — a real product change with real
consequences for the provision / re-sync / check-in loop — or that loop needs a
home in Build and Sites.
