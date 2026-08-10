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

## Open questions the inventory is answering

1. Can the trend sentence be computed server-side? It needs daily snapshots —
   where do those live, and is that reachable outside React?
2. What determines metric ORDER, and where does that ordering live?
3. Which `MetricMap` fields does each surface actually read — `roles`,
   `directions`, `directionHistory`, `unfeatured`, `observed`?
4. Where do the two implementations *silently* disagree today?
5. Which page derivations depend on optimistic local state and therefore cannot
   move unchanged?

## Decisions log

*Filled in as each is settled — every entry states what was chosen and what it
replaces on both surfaces.*

| Decision | Chosen | Replaces |
|---|---|---|
| Win direction is disclosed when assumed | `PreRegistration.directionAssumed`, surfaced as a caveat naming the metric | email printed a flat verdict; the engine's caveat was discarded |
| Action on an adjudicated run comes from the verdict, not a gate | `nextStep()` answers confirmed/refuted/breach/invalid directly | first-failing-gate lookup, which produced "Hold the call" on a refuted run |
| The hypothesis includes its rationale | `composeHypothesis()` in `verdict.ts` | three of four brief parts; the "because" was dropped everywhere |
