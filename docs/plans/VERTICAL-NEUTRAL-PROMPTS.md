# Making the prompts vertical-neutral

*Plan written 22 Sep 2026. The measure of progress is the budget list in
`docs/dev/vocabulary-smoke.mts` going down. It starts at **48**.*

Prism is for any website in the world; the profile learns a vertical and the
product never assumes one. The prompts do not know that yet — they were written
for a hotel group, so "guest", "hotel executive" and "a hospitality A/B testing
program" are spelled out in the files that generate customer-facing prose.

## What is already in place

| Piece | State |
|---|---|
| `src/lib/brand/` — types, resolution, `taxonomyPrompt()` | shipped, **no callers** |
| Outrigger's org-default taxonomy | seeded on **staging** only |
| `requireTaxonomy()` — refuses rather than degrades | shipped, no callers |
| `vocabulary-smoke.mts` — the ratchet | shipped, green at 48 |

## The debt, which is also the work list

```
lib/ai/results.ts         19     the readout prose
lib/ai/observation.ts     14     the per-metric reasoning
lib/skills/builtins.ts     7     the seeded analyst/builder skills
lib/ai/next-test.ts        2
lib/prototypes/results.ts  2     derivations, not prompts
lib/prototypes/stats.ts    2     derivations
lib/prototypes/verdict.ts  1     derivation
lib/prototypes/next-test.ts 1
```

Two of these numbers moved while the plan was being written, which is the point
of having the ratchet: 44 became 48 when "hospitality" was added to the word
list, and `lib/prototypes/next-test.ts` appeared as a file nobody had counted.

---

## Phase 1 — Inject the vocabulary at the one seam

`analystSkill(orgId)` in `lib/ai/results.ts` already takes an org and already
feeds `deepObservation` plus three call sites inside `results.ts`. Appending
`taxonomyPrompt()` there reaches all of them at once.

Both branches need it: the seeded-skill path **and** `FALLBACK_SYSTEM`. A
seeding failure must not silently drop the vocabulary — that is the same class
of bug as the guard that was set but never armed.

**The hard ordering constraint.** `requireTaxonomy` throws. Production is not
seeded. Shipping the injection before seeding production turns every readout
into an error. So: **seed production first, verify, then ship the injection.**

**The refusal must become a product message, not a 500.** An unseeded customer
should be told "this site has not been characterised yet — run onboarding",
caught at the API layer. Refusing is right; a stack trace is not.

## Phase 2 — Neutralise the prose, file by file

Order by value and by containment:

1. `observation.ts` (14) — self-contained, and it is what the customer reads.
2. `results.ts` (19) — three times the size; do it once the pattern is proven.
3. `builtins.ts` (7) — code-canonical, so `seedBuiltins()` re-asserts the stored
   rows automatically. **No migration to write** — verified: all seven built-ins
   are `builtIn: true` on staging, none forked, so none is protected from update.
4. `next-test.ts` (2), then the four derivation files (6).

**The pass condition is an empty diff.** Outrigger's readout should come out
identical, because the resolved words equal the hardcoded ones. Any change means
the resolution is wrong. This only works because the seed exists first.

Derivations are different from prompts: `readoutStructure()` writes vocabulary
into the reasoning chain the analyst is told to build from, so a word baked in
there cannot be fixed by editing a prompt. They need the resolved taxonomy
passed in, not a prompt edit.

## Phase 3 — Enforce it in the output, not just the prompt

`observation.ts` already has the mechanism: `DIGITS`, `STATS`, `clean()`, and a
one-shot re-ask quoting the rule that broke. Extend it so output containing a
vertical noun that is **not** in this org's taxonomy is rejected and re-asked.

This is the house rule — when model behaviour misbehaves, fix it structurally
rather than adding another sentence to the prompt.

## Phase 4 — Provenance

`SiteProfile` has `rev`, and the pinned-revision design exists so "what did the
AI know when it wrote this" stays answerable. Record the profile rev alongside
`basisKey` in the cached observation. That is the difference between a tool and
something auditable.

---

## Open decisions — these want a human

**1. Worked examples inside prompts.** Today: *"e.g. 'Guests who reach the
booking engine's rooms and rates step'"*. That example is doing real work — it
shows the model the SHAPE of a good line, not just the vocabulary. Three options:

- make it generic ("Visitors who reach the checkout") — safe, blander, probably
  worse guidance
- resolve it from the taxonomy — stays concrete for every customer, but that is
  template machinery inside a prompt, with its own failure modes
- keep a hospitality example and label it as an example of form, not content

**2. "booking" — 14 references, genuinely mixed.** Some are the hardcoded
assumption; others name Outrigger's conversion surface where that IS the data.
Needs reading one at a time. Deliberately excluded from the ratchet rather than
guessed at.

**3. Branch-delivered skills.** `opmc-prototype` is `delivery: branch` — it is
written into the customer's git repo. Injecting per-tenant vocabulary into a
file that lands in a repo is a leakage surface. Recommendation: console-delivered
skills only; the building agent reads the taxonomy at runtime instead.

## Scope note

Onboarding is **not** a prerequisite for any of this. Taxonomy is seven fields
and the org-default sentinel exists for exactly this case. Onboarding produces
much more — the characterized sections, voice, design, competitors — which feed
the *builder*, not the readout prose. Build it after, when there is a known-good
target to automate towards rather than a guess.
