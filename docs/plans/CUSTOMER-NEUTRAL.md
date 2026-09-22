# Making Prism customer-neutral

*The approach, the decisions and the reasoning — written 22 Sep 2026 so the next
session does not have to reconstruct any of it. Supersedes
`VERTICAL-NEUTRAL-PROMPTS.md`, which this file was renamed from; that plan was
about prompts, and the problem turned out to be larger than prompts.*

**Read this before touching any prompt, any profile field, or anything in the
ship layer.** `AGENTS.md` carries the enforceable invariants; this file carries
the WHY behind them, which invariants cannot hold.

---

## The goal, as the product owner stated it

> "We need to be fully vertical neutral. And customer neutral."
>
> "We cannot fall back to generic language — we need the app to be fully aware of
> everything about the brand, the site, the products, the repo, the stack, the
> brand palette, and on and on."

Two different problems wearing one name.

**Vertical-neutral** — no hotel words. "guest" → `visitorNoun`, "booking engine"
→ `conversionSurface`. Mechanical once the taxonomy is in scope.

**Customer-neutral** — no *Outrigger*. Their repo layout, their .NET/Optimizely
CMS stack, their CDN host, their site origins. No taxonomy field fixes any of
it; it is configuration that has to move into the store.

The second is the bigger job and it is barely started.

---

## THE ONE RULE

**A hardcoded specific becomes a RESOLVED specific. Never a generic.**

Replacing *"Guests who reach the booking engine's rooms and rates step"* with
*"Visitors who reach the checkout"* is not neutrality. It is amnesia: worse for
the customer who had the detail, no better for the one who never did.

Everything else in this document follows from that rule. When a conversion would
lose specificity, the answer is never to flatten it — it is either

1. resolve it from something the system records, or
2. **record it**, at whichever capture point can know it, or
3. leave it hardcoded and log it as debt.

Deletion is the one option that is never correct.

### The corollary: no generic fallback, anywhere a customer can see

Decided 22 Sep. A half-described customer gets **no prose at all** rather than
confident generic prose. `requireTaxonomy()` throws unless every field resolves.
The second, degrading resolver was **deleted** rather than documented — one that
degrades is a careless import away from a customer surface, and "use the strict
one" is not a rule a file can enforce about itself.

The cost is deliberate and was chosen with eyes open: **onboarding becomes a
hard gate.** Nothing works until the customer is described. That is the same
trade the strict resolver already made, applied consistently.

---

## The architecture

### Three kinds of knowledge, never one blob

From `docs/architecture/CONTEXT-INGESTION.md` (ported from `beta-2` on 22 Sep —
it had been stranded there while `src/lib/brand/profile.ts` cited it by name).

| Kind | What it is | Who settles it |
|---|---|---|
| OBSERVED | crawl and source facts: fonts, palette, CTAs, components, layout | re-read, never approved |
| CHARACTERIZED | prose inferred from the observed | a human accepts it |
| EARNED | what this site's own experiments proved | measurement |

`SiteProfile` is a **pinned revision**, immutable once approved. Re-reading makes
r2 and never rewrites r1 — which is what makes "what did the AI know when it
built this" answerable a year later.

### Three capture points

Every fact the system needs comes from exactly one of these. A fact captured
nowhere becomes a hardcoded guess somewhere — that is not a prediction, it is
what both sweeps found, every time.

| Capture point | What it learns | State |
|---|---|---|
| **Customer onboarding** | org-default taxonomy; the vertical; who reads the output; the voice | hand-seeded for one customer, no UI |
| **Site onboarding** | per-site taxonomy, characterized sections, observed design facts, **and the source code** | model exists, nothing writes it |
| **Prototype / metric build** | per-metric `definition` — what this measures, in the team's words | specced (`docs/specs/metric-context.md`), unbuilt |

**Decided 22 Sep: site onboarding ingests the SOURCE CODE up front**, not as a
later "connect your repo" step. A crawl sees what a site *says*; the source shows
what it *is*. Together they cross-check — the crawl finds a CTA reading "Check
Availability", the source shows the component that renders it. `ObservedFacts.components`
is inferred from the DOM today; with source connected they become real file paths.

Open, and needing a human: whether a site's source is exactly one repo (it is for
Outrigger, which is precisely why the model must not assume it), and whether
missing source blocks onboarding entirely or merely blocks the builder.

---

## Decisions, with the reasoning that will not survive in a diff

**The unit of characterization is the SITE, not the customer.** A crawl is of a
site and two sites of one customer do not share a voice. The customer level holds
inherited defaults only, at the sentinel `siteId = "*"`.

**Stored taxonomy is SPARSE (`Partial<Taxonomy>`).** Storing a fully populated
object per site silently overwrites every inherited value with a default. Store
only what this site actually says; resolution fills from the customer default —
and now refuses rather than filling from neutral.

**Worked examples in prompts are resolved, not deleted.** An example like
*"Guests who reach the booking engine"* teaches the model the SHAPE of a good
line, not merely which nouns to use. Deleting it costs quality; keeping it hands
every other customer someone else's vertical to imitate. Resolving it is the only
option that stays concrete for all of them. This is why `observation.ts` builds
its tool schema per call (`toolFor(taxonomy)`) — a module-level constant cannot
interpolate.

**The taxonomy resolves ONCE per request and is handed down.** `analystSkill()`
resolves it and returns it; `deepObservation` receives it. Re-resolving downstream
would let one request write half its prose in one revision's vocabulary and half
in another's.

**The profile revision is part of the cache basis.** Correcting a customer's
vocabulary used to leave every cached readout standing in the old words — which
made a working fix read as a broken one on 22 Sep. `taxonomyRevision()` now joins
the basis for both the reading and the per-metric observation.

---

## Where it stands (branch `phase1/taxonomy-injection`, 22 Sep)

**`main` is frozen** for a batch release next week. Everything below is on the
branch and on `staging`. `main` auto-deploys production, so a push to `main` IS a
production release whatever the commit message says.

Eleven commits. The substantive ones:

| | |
|---|---|
| `b31538e` | Phase 1 — the vocabulary reaches `analystSkill()`, both branches |
| `49d6ec1` | the seed was written under an org id that does not exist |
| `38903a9` | the readout printed one metric's figure above another metric's words |
| `2b222a4` | an upstream failure now says whose it was |
| `f8858b8` | Phase 4 — a vocabulary change retires the words it was made of |
| `80b07cb` | Phase 2 — `observation.ts` is clean; **48 → 34** |
| `9fca11a` | a resolved word that never resolved, and the test that rewarded it |
| `5898b25` | one resolver, refusing per FIELD |

### The ratchet today: 34

```
lib/ai/results.ts          19    the readout prose — the big one
lib/skills/builtins.ts      7    seeded skill bodies
lib/ai/next-test.ts         2
lib/prototypes/results.ts   2    derivations, not prompts
lib/prototypes/stats.ts     2
lib/prototypes/verdict.ts   1
lib/prototypes/next-test.ts 1
```

`lib/ai/observation.ts` is **off the list entirely** — converted, not merely
under budget. It is the worked example for every remaining file.

---

## What the sweeps found

Two multi-agent classification passes, 22 Sep.

**`src/app` is clean.** 95 files, 42 hits, **zero** hotel assumptions.

**"room" is a false positive 36 times out of 41** in `src/components`. It is
Prism's own screen noun from `docs/DESIGN-PRINCIPLES.md` ("rooms not steps"). An
earlier estimate of "131 booking/room occurrences" was badly inflated and should
not be quoted.

**The ship layer is not taxonomy-shaped at all.** ~30 occurrences, **zero**
replaceable by any `Taxonomy` field, because that layer writes to developers and
to git rather than to a business reader. It needs a recorded SOURCE LAYOUT —
which the UI copy and the `opmc-integration-package` skill are independently
guessing at today and would drift on the moment either is changed alone.

**Three `results.ts` strings have no home in any type.** "hospitality",
"hotel executives", "the hotel's team" name a vertical, an audience and a team.
None is vocabulary, so the taxonomy cannot hold them, and deleting them makes the
prompt worse rather than more neutral. They need customer-level fields that do
not exist.

---

## The builder is brand-blind — see `BUILDER-CONTEXT.md`

Everything above concerns the READOUT. A second trace on 22 Sep asked the other
half: what does the engine that BUILDS prototypes receive? The answer reframes
the whole effort.

**`src/lib/prototypes/provision.ts` imports nothing from `../brand`.** Verified
by hand. The entire three-layer context model — Taxonomy, SiteProfile,
ObservedFacts, BrandFact — reaches exactly one consumer: the readout.

So the inversion we have built, without meaning to:

> The surface that writes prose **about** the page now refuses to run without the
> customer's vocabulary. The surface that writes words **onto** the customer's
> live page gets none of it.

The readout can say "room" while the variation it describes says "accommodation",
and nothing would notice.

**Onboarding captures almost nothing about the customer as a subject.**
`Org` is `{id, name, createdAt}`. `Environment` is `{label, url, kind}`. A
customer can be fully onboarded and the system will not know what business they
are in, who visits, what they call their visitors, or what their site is built
out of. Every one of those is then guessed by the builder, per prototype, from
whichever page it happens to target.

**`earnedDigest()` has zero callers** — the function whose own docstring says it
"should be the loudest thing in the builder's context".

### Two live contradictions, not gaps

Both verified by hand, both shipped today.

**The builder is told to instrument and blocked for instrumenting.**
`MeasurementPanel.tsx:122` hands the human a line to paste at the builder —
*"Instrument these in the variation…"* — when the measurement plan has gaps.
`certify.ts:87-90` FAILS the certification and blocks the push if the artefact
contains `dataLayer.push(`, `gtag(`, `_satellite` or `adobeDataLayer`: *"A
variation must never add measurement the platform doesn't know about."* The two
instructions cannot both be followed. The safe move is not to instrument, which
guarantees the primary composite has no both-arms event — so the experiment gets
built, bound, run, and is **undecidable**.

**The builder cannot see whether the page is even tagged.** `TargetInjection`
records per page whether the loader is present (`types.ts:57-63`). The context
mapper at `provision.ts:286-290` emits `{url, source, reviewUrl, env, snapshot}`
and drops it. On an untagged environment the review URL shows nothing, status
looks healthy, and the builder debugs its own correct code. The console knew.

### The recommended first cut

Customer tier first, because every prototype ships copy and the taxonomy half is
already finished — but **the first commit is the delivery seam, not a field**:
`provision.ts` must import from `../brand`, write the context to the branch, and
add it to `contentHashOf()` — otherwise the branch never learns the context
changed and the console reports it current forever.

Full reasoning, the three-tier table, the counter-argument and the
already-modelled-and-unused ranking are in `docs/plans/BUILDER-CONTEXT.md`.

---

## What is left, in order

1. **`results.ts` (19).** The customer-facing readout. Threading is cheap —
   `analystSkill()` already resolves the taxonomy and all three AI entry points
   call it and throw the result away. Two module-level tool constants need the
   `toolFor()` treatment. `proposeMetricMap` is the outlier: no orgId, no
   `analystSkill`, hardcoded system prompt.
2. **Customer-level fields** — vertical, audience, voice. Small, and blocking:
   three `results.ts` strings cannot be converted without them.
3. **`builtins.ts` (7).** Blocked on a structural fact: `seedBuiltins()` takes no
   orgId and upserts at scope `"global"`, one row read by every tenant. Per-customer
   words cannot be interpolated at seed time without moving where skills live.
4. **The derivations (6).** Words baked here reach the reasoning chain the analyst
   builds from, so they cannot be fixed by editing a prompt later. Threading reaches
   `ResultsPanel.tsx`, a client component that cannot call `requireTaxonomy`.
5. **Source layout on the repo registry** — the customer-neutral half. `OrgRepo`
   records WHERE the source is and nothing about WHAT it is.
6. **The legacy handoff generator** — freeze or delete. **Needs a human decision
   before anyone ports it.** `lib/handoff/**` reads `process.env.HOME` and shells
   out to `grep` against a local clone; it cannot run on Vercel at all, and its
   replacement (the Integration Package) is already portable. Converting Razor and
   SCSS strings in code scheduled for deletion is the most expensive possible
   outcome.

---

## Traps

### What must NOT be swept

A regex pass over this repo breaks all three, and the words look exactly like the
ones being removed.

- `outriggerhospitalityassets.com` (`lib/sites.ts`) — a live CDN host the asset
  capture pipeline matches URLs against.
- `thehotelsnetwork.com`, `sojern.com`, `cendyn.com`, `triptease.io`
  (`lib/capture/sanitize.ts`) — a tracker **blocklist**. Deleting a
  hospitality-sounding entry lets that pixel phone home from a clone: a privacy
  regression dressed as a vocabulary fix.
- Every "room" in `src/components/` and `src/app/` — Prism's own screen noun.

### The ratchet's blind spots

It scans only `lib/ai`, `lib/skills`, `lib/prototypes`, `lib/email`, and its
pattern does not contain "outrigger" at all. So `lib/sites.ts`, `lib/capture/**`,
`lib/handoff/**`, `lib/git/**`, `lib/deploy/**`, `src/app/**` and
`src/components/**` are **unmeasured** — nothing there can regress-fail today.

Widening the scope or the pattern will immediately light up files with no budget
entry and turn the suite red. **Extend the pattern and the scope in the same
commit that adds the budgets**, or the ratchet stops being trusted.

### Counting a word's absence is not checking a substitution works

Converting `observation.ts`, one line came out as
`parts.push("... ${t.visitorNoun} ...")` — **double quotes**. Valid TypeScript,
so `tsc` was silent. The word "guest" was gone, so the ratchet counted it as a
fix and the suite went green while the model received the literal characters
`${t.visitorNoun}`.

`vocabulary-smoke` now fails on any taxonomy interpolation inside a quoted
string. Two independent readers found that bug; no test did.

---

## How to verify a conversion

**The pass condition is an EMPTY DIFF for Outrigger.** Their resolved words equal
the hardcoded ones, so a correct conversion changes nothing they see. If their
readout starts reading differently — and especially if it reads blander — the
conversion is wrong, not progress.

The exceptions are known and listed: the four vertical/audience phrases have no
field to resolve to, and a handful of ship-layer strings are correct-for-Outrigger
today. Those WILL change visibly. Flag them rather than letting them pass as
noise.

Before any push: `npx tsc --noEmit`, then all fifteen suites under `docs/dev/`.
`vocabulary`, `brand-profile` and `outward` are the three that matter most here.

A readout can be regenerated on staging without the UI:

```js
await fetch('/api/prototypes/results', { method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ key: '<prototype>', reading: true, force: true }) })
```

`force: true` bypasses the basis cache. Without it you will read a cached readout
and conclude the change did nothing — which cost an hour on 22 Sep.
