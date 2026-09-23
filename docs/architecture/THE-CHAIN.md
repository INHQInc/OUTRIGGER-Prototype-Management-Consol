# THE CHAIN — customer onboarding to readout, and back

*Written 22 Sep 2026. Supersedes nothing; `CONTEXT-INGESTION.md` is the knowledge
model and `plans/BUILDER-CONTEXT.md` is the builder's requirement list. This is the
whole flow, the contracts between its stages, and the order to build them in.*

## How this was produced, and what you can trust

Twenty agents read the code — ten mapping stages, ten examining the boundaries
between them. Four independent designs, four judges, three critics. **Every
load-bearing claim below was then verified by hand**, because the docs in this
repo have been wrong three times in one day and agent reports were wrong twice.

Where a claim is not marked verified, treat it as a lead, not a fact.

## ⚠ Corrected 23 Sep 2026 — after reading `beta-2`

This document was written without knowing the `beta-2` branch existed. That
branch is OLDER and a reference, not the plan (Bryan, 23 Sep) — it is a pure UI
mock on fixtures, with no API calls in any of its 21 console files — but it holds
the onboarding thinking this document lacked, and it overturns two conclusions
below:

1. **`ObservedFacts`, `SiteProfile.corrections` and `sources` are KEPT, not cut.**
   Every design deleted them because nothing writes them. Beta-2's site interview
   is built *out of* them: fonts, palette and button labels are what a read sees
   and the questions are about; `Correction` is the Correct step's record; `sources`
   is the provenance a revision needs. They are unbuilt, not dead — rule 1 applied
   without knowing the consumer existed on another branch.
2. **⚠ SUPERSEDED 23 Sep 2026 — see § Onboarding: the site holds everything; the
   customer is a wrapper with no vocabulary.** The original rule, kept for its
   reasoning:
   **Brand is onboarding STEP ONE, at customer creation — not a Settings page.**
   And understanding is split by WHO SUPPLIES IT: the customer tier holds what a
   person STATES about the brand (vocabulary, voice, audience, what it sells),
   captured first with no crawl and no model; the site tier holds what a read
   SEES and the interview SETTLES, inheriting from the customer where silent.
   Beta-2 put everything on the site ("the brand is just a container"); this
   document put everything on the customer. Both were half right.

The onboarding design that follows from this is in § Onboarding, below.

## The state today, in numbers

| | |
|---|---|
| Fields mapped across the chain | **292** |
| Declared in a type, never written | **77** |
| A consumer needs it, no source exists | **19** |
| Breaks at the ten stage boundaries | **107** |
| Seams where information survives intact | **0** |

Four findings decide everything else. All four verified by grep, by hand:

**The brand knowledge the product is named for does not exist.** `ObservedFacts`
— palette, fonts, brand variables, CTA labels, headlines, components, pages found
— is declared in full and has **zero writers**. So do `SiteProfile.corrections`
and `SiteProfile.sources`.

**The loop is open.** `BrandFact` has no writer; `earnedDigest()` and
`baselineFor()` have no callers. Nothing a concluded experiment learns becomes
knowledge a future build reads. The Nth prototype starts where the first did.

**Customer onboarding captures one field: a free-text name.** `Org` is
`{id, name, createdAt}`. `Org.id` is a slug of the name, frozen at creation. The
five-step setup checklist has no brand step, while the brand profile is the thing
that now hard-blocks provisioning.

**The measurement seam is inverted.** `getMetricMap` has 16 call sites and
provision, ship and certify are not among them — the plan never reaches the
branch. Meanwhile the *planner* reads the built artifact automatically. BUILD →
METRICS is a code channel; METRICS → BUILD is a clipboard button a human clicks.

## The rules

1. **Every captured field has a named consumer.** Nothing reads it → cut it, don't document it.
2. **Every consumer has a source.** A consumer with no source is a capture requirement at a named point.
3. **Capture where the fact is stable.** Customer facts once; site facts at site onboarding; page facts when the target is set.
4. **One derivation per fact.**
5. **Refuse rather than degrade** — and *no gate ships before the screen that clears it*.
6. **The loop must close.**

Rule 5's second clause is the one this codebase learned today: provisioning was
made to refuse without a brand profile, and the only remedy is a CLI script whose
allowlist has one customer.

## THE CHAIN

```
CUSTOMER ──────────► SITE ──────────► SOURCE ──────────► PROTOTYPE ──────────► METRICS
 name                environments      repos              brief                decision metric
 taxonomy (7)        loader tag        branch             hypothesis           guardrails
 voice               compat posture    template           targets              
 audience                                                 arm / parent         
   │                    │                 │                   │                   │
   └────────────────────┴─────────────────┴───────────────────┴───────────────────┘
                                          ▼
                               PROVISION — the one channel
                        .opmc/{customer,brief,context,targets}  .claude/skills
                                          ▼
                              BUILD ──► CUT ──► CERTIFY ──► SHIP
                                          ▼
                                    RUN ──► VERDICT
                                          ▼
                    READOUT ──► EARNED FACTS ──┐
                                               │
        ◄──────────────────────────────────────┘
        the digest, read by the next build on the same surface
```

The bottom arrow is the one that does not exist today. Everything else is wired
to some degree; that one is schema with no plumbing at either end.

### What each stage must capture, and who reads it

Only fields with a named live consumer appear. **R** = the pipeline refuses without it.

**CUSTOMER** — captured once, by a person, as the FIRST step of creating the customer.
No crawl, no model: these are things only the customer can state.

| Field | Consumer | R |
|---|---|---|
| name | `vocabularyFor` → the analyst's identity, `customer.md` | ✓ |
| taxonomy ×7 | `requireTaxonomy` → every prompt, branch, readout, UI, email | ✓ |
| voice | `customer.md` § How it speaks — read before any copy | |
| audience | `customer.md` § Who it serves | |
| business | `customer.md` § What it does | |

**SITE / ENVIRONMENT** — mostly computed; the human supplies a URL.

| Field | Consumer | R |
|---|---|---|
| label · url · kind | target→env resolution, review links | ✓ |
| loader tag (derived) | Pages tab Copy button **and** the branch, beside the injection verdict | |
| compat posture | badge on the env row **and** `context.json.targets[].env` | |
| page signals | `data.md` — what the page already fires | |

**SOURCE** — the least-built tier; deliberately last.

**PROTOTYPE** — brief, hypothesis, targets, arm, parent. Already captured.

**METRICS** — a typed `DecisionMetric {label, eventName, provenance, direction}`
captured at the brief gate, not after binding. Provenance distinguishes *already in
the registry* from *the agent must fire it* — which is the pair the certification
rule has to be able to tell apart.

**AT VERDICT** — the deposit. `won`, `ruled-out`, `baseline`, each annotated with
the skeleton hash of the page it was measured on, keyed by surface.

## The contracts

Each stage guarantees the next a typed object provisioning refuses to build
without — delivered through the one carrier that already works: `context.json` +
`customer.md` + `contentHashOf`. Ten seams, ten contracts, each enforced by the
mechanism the taxonomy already proves: **a required parameter, one derivation, a
refusal with words, folded into the hash, pinned by a ratchet.**

## What gets CUT

All four designs deleted largely the same schema. **Three of their cuts are
reversed** (see the correction at the top): `ObservedFacts`, `Correction` and
`SiteProfile.sources` are the site interview's raw material and record. What
remains:

`SectionKey "market"` ·
`Environment.siteKey` · `SiteRepoBinding` and `deployPrototypeToGit` ·
`planMeasurement.reportingNames` · `SiteConfig` · `ArtifactVersion.notes` ·
`PushResult` fields nothing reads · `PrototypeArm.addedAt/addedBy` ·
`VerdictRecord.observedAt/experimentStatus/skillRef`.

`ObservedFacts` was the contested one and the cut is reversed. The concern was
real — per-target `design-tokens.md` already carries fonts and custom properties,
and two homes for one fact is how they disagree — so the rule is: `ObservedFacts`
is the SITE-level, approved record the interview is conducted over, and
`design-tokens.md` is the per-page, per-provision snapshot. One is what the
customer confirmed; the other is what this page looks like today.

**And a ratchet so it cannot re-accumulate.** A `reachability-smoke` with a
per-file budget that may only fall, in the exact shape of the vocabulary ratchet
that now holds at zero across 275 files. Without it, 77 dead fields becomes 90.

## The order

1. **Brand, as step one of creating a customer** (see § Onboarding). It writes a
   `SiteProfile` revision at the customer default. The same component edits it
   afterwards — one editor, not a wizard plus a settings page. Every consumer
   is already live, already strict, already refusing — `addSiteProfile` has zero
   production callers, `customerContextFor` already maps sections into
   `customer.md`, and `brandRev` is already in the content hash, so a correction
   stales every branch the day it lands. It retires the one-customer CLI and makes
   customer number two onboardable without a TypeScript edit. **It pays back on
   100% of builds and adds no refusal.**
2. **`earn.ts` — close the loop.** ~200 lines, no migration: `brand_fact` and its
   indexes exist in both backends. A stamped verdict deposits facts; the next
   provision reads the digest. Advisory forever, with exactly one numeric
   exception — `baselineFor` feeding the power gate, replacing a rate a human
   currently retypes from a number the console measured. Backfill the existing
   stamps: `frozenStats` is persisted, so nothing is lost by not being first.
3. **Compat, wired end to end** — as *delivered context and a badge, never a gate*.
   Re-label it honestly: it answers "can the loader inject here", not "can an
   experiment run here".
4. **The cut + the reachability ratchet**, in one commit, each deletion with its reason.
5. **The measurement contract** — after the decision below.

Staleness for earned facts is **surface-scoped and monotonic** — a deposit
counter, never wall-clock expiry inside the content hash. Expiry belongs at render
time. A hash whose meaning is "a person changed something" must not flip at
midnight with no diff.

## Onboarding

Taken from `beta-2` where it holds up, adapted to the console that exists.

**Customer tier — ships first, needs no crawl and no model.**
Create a customer → name → **Brand**. The questions are the seven vocabulary
nouns asked in plain words, then voice, audience and what the business sells.
The profile is written as a draft from the first save, so leaving loses nothing,
and approved as a new revision on finish. `requireTaxonomy` completeness is the
real readiness signal — not an invented percentage. The setup checklist gains
"Describe the brand" as its first step; done means provisioning would succeed.

**Site tier — later, and this is where beta-2's interview lives.** The read is
now TESTED, not assumed: `docs/investigations/FIRECRAWL-SITE-READ-2026-09.md`.
Firecrawl's agent found "condos" for the condo site on its own and proved 10 of
12 vocabulary answers with its own quotes, against 4 of 12 for a single-page
extraction — which also presented the generic "visitor" as the customer's word.
The rule that came out of it: pre-fill only what an answer's own quote proves.
Read (real: `deriveDesignTokens` feeding an `ObservedFacts` writer) → Ask
(questions generated from what the read could see but not decide, recorded in
`ObservedFacts.unsettled`) → Correct (approve / edit / hand back with a note,
kept as a `Correction`) → a new revision. The source repo shortens it.

**Designed 23 Sep with Bryan — proposals until he has reacted to the mockup.**
Site is a real entity again: Customer → Site → Environment, one site per
experiment, picked from a sidebar selector with no "All sites".

**Decided 23 Sep, after the mockup — two levels, no brand layer.** Bryan: "what
if we dont really care too much about brand and everything really pivotes around
each site", then "exp are per site / brand is generi wrapper". So beta-2 was
right that the brand is a container. The customer holds users and connectors
only. The SITE holds its words (who it serves, main offering, main action, where
that finishes), voice, look and never-rules. The BRIEF holds what one experiment
is trying to sell, that offering's words and action, where it finishes, and so
its metric and readout: a spa test on a rooms page names "spa" there. Nothing
inherits. Onboarding is ONE flow, for a site: "onboardin is one flow for a site not a brand, adding a brand is a name continer for us to organize our customers". Adding a site may COPY another site's answers once ("start from
outrigger.com's answers"), and an edit may be applied to other sites once;
neither is a live link.

The flow as first proposed, still the shape: Site onboarding then runs: business type
(detected and confirmed; it picks which questions are asked, never an answer) →
the read → the evidence check → an interview in four kinds (proven, found but
unproven, unsettled, only you know), each answer refinable with AI as a
was → now diff → approve as a new revision. The offering noun resolves
page → site → brand, in one of three shapes: one offering, a portfolio of kinds,
or a catalogue. Rules, traps and the mockup: `docs/HANDOFF.md` → "IN FLIGHT — SITE".

**Kept from beta-2:** a question carries a *because* line saying why it is being
asked; options show a hint before the click; every question offers "I don't
know — record it as unknown"; three rounds at most, then whatever is open is
written as unknown and the agent must ask rather than assume; saving makes a new
revision and a re-read never rewrites an approved one; one readiness derivation
behind one card.

**Dropped from beta-2:** every fixture; the understanding meter (its numbers are
authored, not measured); in-memory state; the owner-invite step (no invite
system exists); a forward-locked wizard (`DESIGN-PRINCIPLES.md` §3 requires every
step to be openable); and D10's "nothing at the customer level".

**Built in this console's own UI grammar, not shadcn.** Beta-2 was built on
shadcn; this branch has no shadcn layer at all, and `DESIGN-PRINCIPLES.md`
requires one card grammar. A second component system arriving mid-release is
exactly what that rule exists to prevent.

## Decisions that are yours

**1 · May a variation fire an event?** The design work converged: **yes, exactly
one sanctioned form** — `window.optimizely.push({type:'event', eventName})`, plus
copying the site's own tracking-hook attribute onto new nodes, which is what all
three shipped prototypes already do. The certify rule then means *no new analytics
vendor*, not *no measurability*. Recommended. Until it is answered, the measurement
chain cannot be designed, and the safe move still produces undecidable experiments.

**2 · Does the brief gate require a connected Optimizely project?** A commercial
sequencing question, not an engineering one. Capture the decision metric's
*structure* at brief time either way; only the picker needs the connection.

**3 · The three ResultsPanel kill switches** — `SHOW_ATTENTION`, `SHOW_EXPLORATORY`,
`SHOW_PROOF`. Restore, or delete with their dependencies?

## Bugs found on the way, each verified by hand

- **The weekly email computes different statistics from the page.**
  `reports/build.ts:66` passes neither `history` nor `weights`; the results route
  passes both. So the email has no SRM check and every "how much longer" figure in
  it is computed from no history at all. A customer can read one instruction in the
  email and a different one on the page, about the same run.
- **Daily snapshots are written only when a human opens the results panel.**
  `recordDailySnapshot` has one caller. The history powering trends and power
  projections has a hole on every day nobody looked.
- **`slugForUrl` drops the origin**, so `staging/home` and `production/home`
  collide into one snapshot directory — last write wins.
- **`baseBranch` is not the template branch.** Three designs proposed repointing
  it; it defaults to `main` in two places and there are ten `starter` literals, so
  the repoint would fork every registered repo off main. Add `templateBranch`.
- **An apex that 301s to www reads as "incompatible."** `safeFetchPage` sets
  `redirect: "manual"`, `compat.ts` calls any 3xx incompatible. One more reason
  compat is context and never a gate.
