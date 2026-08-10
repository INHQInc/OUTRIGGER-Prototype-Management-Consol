# The Readout Model — one derivation, two skins

*Started 2026-08-10. Status: **design in progress**. Read this before touching
`ResultsPanel.tsx` or `lib/email/readout.ts`.*

## Why this exists

The console renders an experiment readout in two places:

| Surface | File | Technology |
|---|---|---|
| The page | `src/components/ResultsPanel.tsx` | React + Tailwind |
| The email | `src/lib/email/readout.ts` | tables + inline styles, rendered server-side |

**The maths has one home. The meaning had two.** Every number is already shared —
`computeStatsReport()`, `getVerdict()`, the metric semantics in `results.ts`, and
the analyst's words from `getReading()`. But the *interpretation layer* on top of
those numbers was written twice, independently, and drifted.

That drift was not theoretical. Found by a human reading his own weekly email,
one defect at a time:

- **A correct prediction reported as a failure.** The brief predicted *fewer*
  hero clicks. Clicks fell 56.9%, settled. The readout said REFUTED — because
  nothing declared which way a win looks, the engine assumed UP, and the email
  printed the resulting verdict as a flat "It didn't work" while discarding the
  engine's own "(assumed — no direction was declared)" caveat.
- **"Hold the call" on an adjudicated run**, because the action was read off the
  first failing gate even when the verdict already *was* the answer.
- **Everything grey**, because the email made grey mean "not settled" — the
  ordinary state of a running experiment — so the whole document drained of hue
  while the page used colour differently.
- **The trend sentence and composite flags** exist only on the page; the
  **plain-words verdict and the vitals tiles** exist only in the email. Neither
  surface can show what the other computes.

Two implementations of the same idea will always drift. The fix is not more
discipline; it is one derivation.

## The shape

```
        stats · verdict · reading · map · results
                          │
                    buildReadout()          ← all interpretation happens here
                          │
                   ReadoutModel             ← presentation-ready, colourless
                    ╱          ╲
        ResultsPanel            renderReadoutEmail
        (Tailwind tokens)       (inline hex, tables)
```

## Commitments

These are the rules the design has to satisfy. They are here so they can be
argued with before there is code to defend.

**1. The model carries no colour and no markup.** It emits enums — a role, a
tone, a settled-state. Each skin maps those to its own palette: Tailwind tokens
on the page, hex in email. A model that knows about `#0B7A4B` has let the email's
constraints leak into the page.

**2. Every field is presentation-ready.** A value the renderer prints or switches
on — never something it must compute. If a skin is doing arithmetic or applying a
threshold, that logic belongs in the builder. This is the test for whether the
extraction is real or cosmetic.

**3. The model is pure and server-computable.** The email renders in a cron job:
no React, no browser, no client fetch. Anything the page currently derives from
component state (optimistic pins, role edits, hidden metrics) or from
client-loaded data becomes an **input** to the builder, not a fork of it. Purity
is what makes the two paths provably identical rather than hopefully similar.

**4. Degrade, never invent.** Where an input is unavailable on one path — daily
snapshots for the trend sentence, an `executive` field on a reading cached before
it existed — the model returns absence and the skin omits the element. It does
not synthesise a plausible substitute. A silent computed fallback once turned a
validator bug into what looked like a quality problem for an entire session.

**5. Where the two implementations disagree, the correct one wins — explicitly.**
Unifying by picking whichever was written first would launder a bug into the
architecture. Each disagreement gets resolved on the merits and recorded below.

**6. The page must not regress.** It is in daily use. Migration order is chosen
so each step is verifiable, and the page is cut over incrementally rather than
in one rewrite.

## What stays surface-specific

Deliberately not in the model:

- **Markup and layout.** Email has no flexbox, no grid, no CSS classes — and
  Outlook renders through Word, which silently discards the CSS `font` shorthand
  along with every size and weight in it. These are not shared problems.
- **Interaction.** Pinning, hiding, role editing, the analyst composer, the
  improvement chart's hover crosshair. The email has no events.
- **Print.** `@page`, the repeating ownership footer, opening `<details>` before
  `window.print()`.

## What the inventory found

A 7-agent audit (run `wf_1c751d83-d96`) read both surfaces and the shared libs,
then ran three adversarial passes over the result. The full model interface and
migration plan are in **[`READOUT-MODEL-DESIGN.md`](READOUT-MODEL-DESIGN.md)**.

It found more duplication than expected, and — more importantly — **several live
bugs that the extraction must fix rather than freeze in place.** Unifying by
picking whichever implementation was written first would have laundered these
into the architecture.

### Live defects, in severity order

| # | Defect | Who is right |
|---|---|---|
| 1 | **The page reads the STORED map, the email the RESOLVED one.** Direction-of-good on the page (`beatFor` L1283, `observationFor` L1468) looks up `map.composites[].direction` on a map that has neither the `directions` overlay nor the synthesized opti-primary — so the page is direction-blind for every console-declared direction. | Neither. Both need the resolved interpretation. |
| 2 | **The direction toggle is write-once and the page never reflects it.** `setDirection` writes only `map.directions[key]`, never `composites[].direction`, and the GET deliberately returns the stored map. Click ↑ on a bounce metric: the server records it, the glyph never changes, and the second click posts the same value back. | Live bug. One `directions[key] ?? composite.direction` helper, called by the toggle, the model and the API. |
| 3 | **"Settled" is a third statistical test the verdict does not use.** Both surfaces test whether `liftCi` excludes zero — a Katz log rate-ratio interval — while the verdict adjudicates on `cell.p < alpha`, a pooled z-test on the risk difference. Two different tests on the same counts disagree in a band around α, so a readout can print "settled" beside a verdict that says not significant. | The verdict engine, because it is what the call was made on. |
| 4 | **Valence is answered by five rules, three of which contradict.** `toneOf` is direction-blind and paints an exactly-zero or undefined settled lift green; `liftClass` ignores significance entirely; `beatFor`/`observationFor` use a different, direction-aware rule; the email uses a fifth. | The email's three-state rule, extended with guardrail state. |
| 5 | **`actionChip` re-implements `nextStep()` and contradicts it.** Gate-first with no adjudicated short-circuit, no `prereg` entry, a hardcoded `7` where `nextStep` uses `VERDICT_THRESHOLDS.minRuntimeDays`. This duplication was created *today* by extracting `nextStep` without rewiring the page. | `nextStep()`. Keep only `actionChip`'s href map, keyed off the `gateId` it already returns. |
| 6 | **Beyond-luck ignores the FDR correction the engine already computed.** `stats.ts` runs Benjamini-Hochberg over every non-decision, non-guardrail row and stores `q`; both surfaces then label those rows settled at raw α. On a twelve-row readout the engine itself expects ~0.6 false movers — and the page prints that sentence elsewhere on the same screen. | The engine. Gate the claim on `q <= discoveryQ` for anything that is not the decision metric or a guardrail. |
| 7 | **Guardrail rows take tone from raw lift** instead of `GuardrailVerdict.state`, which already normalises direction and applies the 2% non-inferiority margin. "Did it go the right way" is not the guardrail question; "is it proven inside tolerance" is. `at_risk` is computed and rendered nowhere. | `guardrailVerdict()`. |
| 8 | **Composite rates are action-totals printed in a conversion-rate column.** A multi-event composite is scored with a Poisson rate-ratio; `rate` is actions-per-visitor and legitimately exceeds 100%. The page discloses this with the Σ chip; the email prints `118.3%` under "Variant". | The page. The unit must travel with the value. |
| 9 | **One-arm (`featureOnly`) metrics are handled on the page and ignored in the email**, where a blanked lift renders as a 20px "—". | The page. These are adoption rows: a rate, no lift, no settled claim, no valence. |
| 10 | **The frozen-snapshot fallback is page-only** — a stamped experiment whose Optimizely fetch fails renders on the page and hard-fails the email. | The page. |
| 11 | **The day count differs by one** and the email quotes two clocks in one document: the page renders `power.observationDays + 1`, the email recomputes from `startTime` and prints Day 0 for a run the page calls Day 1. | The page's 1-based convention. |

### Structural constraints the design must respect

- **Two map inputs, never one.** The API deliberately sends the page the STORED
  map — feeding it the resolved one would make `post("confirm", …)` persist
  Optimizely's synthesized composite into the team's authored plan, irreversibly.
  The model takes `plan` (stored, the only thing writes may touch) and
  `interpretation` (resolved, read-only).
- **Optimistic state is a parameter, not a fork.** `observedLocal`, `rolesLocal`,
  `orderLocal` are pending writes held in component state so a click answers on
  the same frame. The builder takes `(observed, roles, order)` explicitly: the
  page passes its optimistic values, the server passes the stored ones. This is
  the one derivation that cannot be pure, and making it a parameter is what keeps
  the rest of the model pure.
- **No hooks.** The page's derivations sit between five conditional returns; a
  `useMemo` at that site changes the hook count between renders and throws. The
  builder is a plain synchronous function called where the derivations are today.
- **Valence and confidence are orthogonal fields.** The two surfaces hold
  opposite, documented positions on grey-for-unsettled — "chroma is earned" on
  the page, "hue always carries direction" in the email. A single `tone` field
  picks a winner by accident. The model owns the semantics; each skin owns the
  hue. No surface may express confidence by absence alone: where the colour is
  muted, the word must be present.

## Decisions log

*Filled in as each is settled — every entry states what was chosen and what it
replaces on both surfaces.*

| Decision | Chosen | Replaces |
|---|---|---|
| Win direction is disclosed when assumed | `PreRegistration.directionAssumed`, surfaced as a caveat naming the metric | email printed a flat verdict; the engine's caveat was discarded |
| Action on an adjudicated run comes from the verdict, not a gate | `nextStep()` answers confirmed/refuted/breach/invalid directly | first-failing-gate lookup, which produced "Hold the call" on a refuted run |
| The hypothesis includes its rationale | `composeHypothesis()` in `verdict.ts` | three of four brief parts; the "because" was dropped everywhere |
| Settledness comes from the verdict's own test | `p < VERDICT_THRESHOLDS.alpha`, FDR `q` for supporting rows | four textual variants of a CI-excludes-zero test that the verdict never used |
| Valence is three-state and direction-aware | `favourable / unfavourable / neutral`, guardrails from `GuardrailVerdict.state` | `toneOf`, `liftClass`, `sigClass`, and two more rules that disagreed |
| The model emits tokens, the skins own the palette | orthogonal `valence` + `confidence` fields | a single tone field would silently settle a live design disagreement |
| Two map inputs | `plan` (writable) + `interpretation` (read-only) | one `map`, which on the page would persist Optimizely's composite into the plan |
