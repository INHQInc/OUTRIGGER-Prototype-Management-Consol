# The program board: too much gating, too much alerting

*Opened 2026-09-16. **Status: DIAGNOSED, not fixed.** A full simplification plan was
designed and then **rejected by two adversarial reviews**. This document records the
diagnosis, the plan, and — most importantly — **why it was rejected**, so nobody rebuilds
it.*

**Read the "Rejected, and why" section before proposing anything here.** Three of the
plan's moves look obviously right and are actively harmful.

---

## The complaint

Bryan, 16 Sep 2026, looking at the live board:

> *"all of these prototypes sitting in the experimenation column and none of them are
> active experiments"* · *"regional map display is not active either and its in the
> handofff column"* · *"same with room compare"* · *"its a workflow nightmare"* ·
> **"i just want to simplify everything all this gating and alerting seems like massive
> overkill"** · *"we dont want users messing anything up but it should also be much
> easier to manage these prototypes"*

## The board, as observed

Live at `prism.brandgraphai.com/prototypes`. Twelve cards.
**Brief 0 · Build 0 · Review 1 · Experimentation 8 · Handoff 3.**

| Column | Card | State | Amber |
|---|---|---|---|
| Review | property-overview-mockup-a | Next: Verify the pages | — |
| Exp | property-overview-mockup-**b** | `v1 ✓` · Next: Bind the experiment | — |
| Exp | property-overview-mockup-**c** | `v1 ✓` · Next: Bind the experiment | — |
| Exp | property-overview-mockup-**d** | `v4 ✓` · Next: Bind the experiment | QA stale |
| Exp | property-overview-mockup-**e** | `v2 ✓` · Next: Bind the experiment | QA stale |
| Exp | Destination Selector With Map | `v3 ✓` · pushed v2 · **not started** | running v2, latest v3 |
| Exp | hero-booking-bar | `v2 ✓` · Next: Cut a new version | brief drifted — re-sync |
| Exp | Home Page Hero No Offer | `v2 ✗` · **paused** · Next: Concluded | verdict unstamped |
| Exp | Home Page CTA Optimization | **paused**, no cut · Next: Concluded | verdict unstamped |
| Handoff | Room Detail Overlay | `v4` · paused · **Next: Cut a new version** | verdict unstamped |
| Handoff | Regional Map Display | `v1 ✓` · **Next: Cut a new version** | brief drifted |
| Handoff | Room Compare | `v1` · **Next: Cut a new version** | QA stale |

Nine ambers. **Six come from two rules** — *"QA is stale"* (×3) and *"the run ended but
its verdict isn't stamped"* (×3).

---

## The diagnosis

**`derivePipeline` runs two competing derivations of "is there work left."**

1. A **`primaryAction` ladder** that checks *"is this finished?"* **ninth**, at
   `pipeline.ts:299`, after seven other branches.
2. An **eight-rule alert block** (`pipeline.ts:151-159`) that re-states what the ladder
   already says, without the stop conditions the ladder is missing.

Consequences, both visible on the board above:

- **Six of the nine ambers are literal restatements of the card's own "Next:" line.**
- Because the finished-test is ninth, **all three Handoff cards advertise "Cut a new
  version"** — `!latest || !cutFresh` wins before `stageShipped` is ever consulted.

### The Handoff bug

`stageShipped = normalizeStage(proto.status) === "shipped"` (`pipeline.ts:135`) is **the
only input to `derivePipeline` that is not ground truth**, and
`ProgramBoard.markShipped()` (`ProgramBoard.tsx:179-193`) PATCHes `{status:"shipped"}`
on drag-drop **with no verification**. `board.ts`'s own docblock says *"A card's column
is DERIVED, not dragged."* True of four columns, false of the fifth.

Room Detail Overlay reached Handoff **legitimately** (it carries a real `handoff:<key>`
flag, written by HandoffPanel). **Regional Map Display and Room Compare were dragged** —
no flag exists. That distinction matters for any migration.

### A real bug found in passing

Re-syncing commits `.opmc/**`, which moves `headSha` **without touching
`dist/variation.js`** — so `cutFresh` goes false and the card demands *"Cut a new
version"* **the moment you do what it just asked**. A loop.

---

## Rejected, and why

A five-move plan was designed (kill six alert rules, derive `concluded`, earn the
terminal column, rename Handoff → Concluded, delete dead weight). **Two independent
adversarial reviews rejected it.** The three fatal findings:

### 1 · Deleting the push-behind alert silences a running experiment on stale code

`expDone = Boolean(running || stageShipped)` and the step is then `"done"` — so for a
**running** experiment the Experimentation step is already done, and the *"Optimizely is
running v2; the latest cut is v3"* amber was **the only thing marking it**. The plan
claimed "severity unchanged". It is not. **This rule stays.** It is a live-site signal.

### 2 · `concluded = handoffRecorded || verdictStamped` conflates two different things

Stamping a verdict on a **losing** experiment would set `concluded`, send the card to the
terminal column and set the Handoff step to `done` with its unchanged status string
**"winner in production code"**. False on its face. *Closed* and *shipped* are different
states and need different words.

### 3 · The proposed handoff 409 can permanently strand a prototype

Requiring a stamped verdict before recording a handoff deadlocks: stamping is refused
with 400 when `!bundle.results` (`results/route.ts:590`) and refused while the
experiment is still **running** (`:594`). A prototype can reach a state where it can
neither stamp nor hand off.

### And the honest finding about "simplification"

- **Relocating alerts into step statuses makes them invisible.** On a board card, step
  status renders *only* as the `title=` tooltip on a 1.5px dot
  (`ProgramBoard.tsx:28`) — hover-only, unavailable on touch. Six ambers would vanish
  and three would take real information with them.
- **The complaint does not go away.** Under the plan the four `property-overview-mockup`
  cards move from parking in Experimentation to parking in **Review**. The parking lot is
  renamed, not removed.
- **Counts that went UP**, against a brief that demanded they come down: `PipelineInputs`
  11 → 14, store reads per card 8 → 9, blocking rails 11 → 12 (the plan's arithmetic said
  "net zero"; it was wrong).

---

## What is safe to do

Ordered. Nothing below touches `src/lib/prototypes/ship.ts`, where the two rails that
protect a live site live (`:77-80` failed certification blocks a push; `:98-109` a
running experiment is immutable).

**Stage 1 — fixes the three Handoff cards, touches no column logic**
1. Hoist the "is this finished?" test to the **top** of the `primaryAction` ladder. This
   alone stops all three Handoff cards advertising "Cut a new version".
2. Suppress alerts on a finished card (`if (!concluded) { … }`) — removes 3 ambers.
3. Delete `markShipped` and the Experimentation→Handoff drag; refuse a hand-set
   `status:"shipped"` at `api/prototypes/route.ts`. Stops new bad writes.
4. Delete verified-dead code: `Pipeline.checklist`, `ChecklistItem`, the ROOMS table
   (`pipeline.ts:75-81, 302-317`) and `SEVERITY_TEXT` (`ui.tsx:14`). Zero consumers.

**Stage 2 — only after the `Next:` line carries the fact**
Deleting an amber is lossless **only** where the card already says the same thing.
- Safe now: *"running v2, latest v3"* (card already says "Push v3").
- Safe **only after** `primaryAction` gains a matching branch: the re-sync amber (needs
  `Next: Re-sync the branch`) and the verdict amber (needs `Next: Close out the results`).
- The plan had this ordering backwards.

**Stage 3 — needs a product decision, not an engineering one**
- What does a **losing** experiment become? Until that word exists, `concluded` cannot be
  derived safely (fatal #2).
- Should Handoff be renamed, and does an externally-built test ever "hand off"?
  (`page.tsx:522` renders `NaRoom` for external handoff and would need handling.)
- Do the four mockups belong in Review, or does binding deserve its own place?

---

## Unverified, and worth one read each before acting

- The QA state of `property-overview-mockup-b` and `-c`. The absence of an amber is
  equally consistent with a healthy gate and an *unreviewed* one — so "they have no QA
  spec" is an assumption, not a fact.
- The QA state of `Destination Selector With Map` decides whether it lands in
  Experimentation or Review. One `getCoverage()` call settles it.
- Whether `handoff:regional-map-display` and `handoff:room-compare` flags exist. The
  migration's shape depends on the answer.

---

## Also true, and separate

The console binds to **Outrigger Prep `24138040550`** (`OPTIMIZELY_PROJECT_ID`), which
holds **1 running and 11 `not_started`** experiments — five of them obvious throwaways
(`TEST`, `Thursday Test`, `Andy Test`, `Opti ID Testing`, `Test Room Price`) and three
named `DRAFT`. Some of the board's congestion is a faithful report of a mess that exists
in Prep. Archiving those in Optimizely would empty part of the column with no code change
at all.

---

*See also: [`../RUNBOOK.md`](../RUNBOOK.md),
[`../architecture/DECISIONS.md`](../architecture/DECISIONS.md) (D14 — one gate
definition).*
