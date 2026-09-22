# Understanding the customer and the site

*Ported to `main`'s line 22 Sep 2026 from `beta-2`, where it had been stranded
even though `src/lib/brand/profile.ts` cites it by name. Extended the same day
with the source-code half and the capture inventory below.*

*The proposal: use onboarding to ingest the brand and its sites so the builder
agent always has design, UX, audience, voice and behaviour context. Yes — with
one correction that decides whether it works or quietly poisons every build.*

---

## The correction: three kinds of knowledge, never one blob

The tempting version is "scrape everything into a Customer Skill." That fails,
because the three things we would put in it have different epistemic status,
different refresh rules and different failure modes. An agent that cannot tell
them apart will build something wrong and cite us as its source.

| | **Observed** | **Characterized** | **Earned** |
|---|---|---|---|
| What | type scale, palette, components, selectors, page inventory, the booking widget's real class names | who this brand is, who it serves, voice, tone, what it never does | what we have actually measured about these visitors |
| Source | crawl + derive | a model reading the observed | our own stamped Decisions |
| Status | **fact**, re-derivable | **inference**, needs a human to approve it | **measured**, immutable |
| Refresh | on demand; goes stale when the site ships | when the brand changes | accrues on its own, forever |
| If wrong | build doesn't match the page | build feels off-brand | we mislead ourselves |

**Only the middle one is a Skill.** Voice and tone are prose instructions a human
should read and correct — that is exactly what a skill is. The observed layer is
DATA: exact hex values, selectors and a page inventory belong in files the agent
reads, not in prose it interprets (`.opmc/**` already does this per page — it is
the right container in the wrong scope). The earned layer is a QUERY, injected as
a short digest with a pointer to the decisions behind it.

`DESIGN-PRINCIPLES.md §9 — ground truth only` already forbids presenting
inference as fact. This is that rule applied to what the agent is told.

---

## The layer nobody else can build

Observed and characterized context is what a brand-knowledge product does, and
any competitor with a crawler can match it.

**Earned context cannot be scraped, because it did not exist until we ran the
experiment.** Every stamped Decision is a measured fact about how *these*
visitors behave on *this* site:

> Tested here 14 times. Removing a call to action that competes with the primary
> booking action has won 4 of 6 attempts (+2.4% to +11.3%). Offer badges in the
> hero have never won. Guests do not scroll past the third property tile on mobile.

That is the flywheel the architecture already names — a Discovery from one
Decision becomes the pre-registered primary of the next — and it makes Prism's
context compound while a crawler's decays. It should be the loudest thing in the
builder's context, and the first thing a readout cites.

---

## Governance: the context is part of the record

If the agent builds from ingested context, then **what the agent knew is part of
the pre-registration story.** A buyer will ask it in the first hour: *what did
the AI know when it built this, and can you prove it hasn't changed since?*

So context is versioned like everything else in Prism, and a Build pins a context
revision exactly as it already pins a Brief revision (`versions.ts`). Re-ingesting
a site creates Context r4; it does not overwrite r3, and it does not retroactively
apply to a Build that was cut against r3. Same immutable-chain grammar, no new
concepts to explain.

---

## Where it hangs

Requires the Site entity that USE-CASES.md already reinstates:

```
Customer ── a container: sites, people, connections (see DECISIONS.md D10 — nothing derived lives here)
   └── Site ── profile (observed) · skill (characterized) · evidence (earned)
         └── Environment (dev / prep / prod — customer's own words)
               └── Experiment
```

Resolution for a build is the existing rule, one tier deeper: global + customer +
site + prototype, default-on, later tiers win. `Skill.scope` already carries
`orgId` and `prototypeKey`; this adds `siteId` between them.

---

## What has to be built (and what already exists)

**Exists.** `firecrawlScrape()` (single page, rawHtml, 3s settle);
`deriveSkeleton` / `deriveSelectors` / `deriveDataGlobals` / design-token
derivation; the skill tiers, resolution and default-on semantics; delivery into
`.claude/skills/**` on the branch.

**Missing.**
1. **Breadth.** Firecrawl is `v1/scrape` on one URL. Ingesting a site needs a map
   step then a bounded crawl — and a cost ceiling, because a hospitality site is
   hundreds of pages and most of them teach us nothing. *Verify the map/crawl
   endpoints and their pricing before designing the flow around them.*
2. **Durability.** Derivation currently runs per prototype and lands on a branch.
   Site profiles must outlive any one experiment and be re-derivable on demand.
3. **Staleness.** A profile derived in March and used in September is a liability.
   Every profile carries source URLs and a derived-at stamp, and the site is
   re-checked cheaply (a few key pages) rather than trusted indefinitely.
4. **Human approval of the inference.** The characterized layer is generated, so
   it is a draft until a human accepts it. That is a UX moment, not a background
   job.
5. **The earned digest.** A query over stamped Decisions, rendered as sentences
   with links to the decisions behind them.

---

## The onboarding payoff

This turns site onboarding from a form into the moment the product proves itself:

> **We read 24 pages of outrigger.com.**
> Your type scale, your palette, your eleven repeated components, and the way you
> talk about properties. Here is what we think your voice is — correct anything
> that is wrong.

It earns the human review of the characterized layer *for free*, because
correcting a draft is easier than writing one — and the corrections are the most
valuable content in the system.


---

# Decided 22 Sep 2026: onboarding takes the SOURCE CODE too, up front

Everything above is a crawl. A crawl sees what a site **says** — its CTA
labels, its headlines, its palette, the words a visitor reads. It cannot see
what the site **is**: the components, the directory layout, the framework, the
place a change would actually be made.

Connecting the source later was the assumed shape. It is the wrong one.

**The two halves check each other.** The crawl finds a CTA reading "Check
Availability"; the source shows the component that renders it. Characterizing
from rendered HTML alone means inferring structure and being confidently wrong
about it. `ObservedFacts.components` is inferred from the DOM today; with the
source connected those become real file paths and real component names, which
is the difference between a builder guessing at a component and naming one.

**A half-onboarded site is the ordering trap again.** The console already
learned this one from `requireTaxonomy`: refusing is better than degrading. A
site is not onboarded until both halves exist, so nothing downstream has to
cope with half a profile — the same reason the strict resolver throws rather
than quietly returning "visitors".

**Get as much as possible at onboarding.** Every fact not captured there
becomes a hardcoded guess somewhere downstream. That is not a prediction; it is
what the sweep below found, in every case.

## Two questions this leaves open

**1. Is a site's source exactly one repo?** Outrigger is one .NET site in one
repo, and a data model shaped around that breaks on the second customer. A
monorepo can serve several sites; one site can be assembled from several repos.
The FLOW can require source up front while the MODEL still allows many-to-one —
keep `OrgRepo` as the registry it already is, and have the site profile
reference one or more source repos plus a subtree path rather than own them.

**2. Does requiring source block onboarding?** A crawl needs no permission; repo
access on day one is a real barrier. Either source is genuinely required, or a
profile may be approved crawl-only and marked as lacking its source half — with
the builder refusing to work from one, rather than silently building worse. A
product call, not a technical one. NOT YET DECIDED.

---

# What onboarding must capture — derived from what the code hardcodes

This table is not a wish list. Every row is a string found in `src/` by the
classification sweep of 22 Sep, and the right-hand column is the honest answer
to "where does that specificity come back from if we delete it?".

The rule it enforces: **a hardcoded specific becomes a RESOLVED specific, never
a generic.** Replacing "Guests who reach the booking engine's rooms and rates
step" with "Visitors who reach the checkout" is not neutrality, it is amnesia —
worse for the customer who had it and no better for the one who did not.

| Hardcoded in `src/` today | What it actually is | Where it must come from | Exists? |
|---|---|---|---|
| "guest" / "guests" | visitor noun | `Taxonomy.visitorNoun` | ✅ |
| "booking engine" | conversion surface | `Taxonomy.conversionSurface` | ✅ |
| "room" / "rooms" (as the offering) | offering noun | `Taxonomy.offeringNoun` | ✅ |
| **"hospitality"** | the customer's VERTICAL | customer onboarding | ❌ no field |
| **"hotel executives"**, "the hotel's team" | WHO READS the readout | customer onboarding | ❌ no field |
| **"a hotel marketer would use"** | the voice to write in | customer onboarding | ❌ no field |
| "the booking engine's **rooms and rates step**" | a named step in the funnel | metric `definition` | ⚠️ specced, unbuilt |
| "**Razor views, SCSS, JS, C# backend/API**" | the source stack and its file kinds | site onboarding (source) | ❌ |
| "**Azure DevOps**", "read-only from here" | where the source lives, who may write | site onboarding (source) | ❌ |
| `OUT.Website/Features/Outrigger/Blocks/` | the component directory | site onboarding (source) | ❌ |
| `wwwroot/assets/scss` | the style directory | site onboarding (source) | ❌ |

**Three findings worth stating plainly.**

The taxonomy is not enough. It carries vocabulary — seven fields — and three of
the rows above are not vocabulary at all. A vertical, a reader and a voice are
customer-level facts with nowhere to live, which is why `results.ts` still says
"hospitality" and why deleting that word makes the prompt worse rather than
more neutral.

The ship layer is not taxonomy-shaped. Not one of its ~30 hardcoded strings is
replaceable by a `Taxonomy` field, because that layer writes to developers and
to git, not to a business reader. What it needs is a recorded SOURCE LAYOUT,
which is the same fact the UI copy and the `opmc-integration-package` skill are
both guessing at independently — and would drift on the moment either is
changed alone.

The UI copy was never UI copy. "Razor views, SCSS, JS, C# backend/API" reads
like chrome. It is an unrecorded field on the source repo, leaking into a view
because there was nowhere to put it.

---

# What has to be built — the source half

Adds to the five items above.

6. **Source ingestion at onboarding.** Read the connected repo well enough to
   record its layout: framework, file kinds, component directory, style
   directory, script directory, subtree root. Drafted from the repo, confirmed
   by a human — the same observed → characterized → approved path the crawl
   already uses, because a guess about a codebase is a draft like any other.
7. **One reader, two consumers.** The UI copy and the integration-package skill
   must read the SAME recorded layout. Today they hardcode the same .NET stack
   in two places; genericise one and the console describes one thing while the
   agent produces another.
8. **Customer-level facts with no home yet** — vertical, audience, voice. Small,
   and blocking: three `results.ts` strings cannot be converted without them.

---

# What must NOT be swept

Recorded because a regex pass over this repo would break all three, and the
words look exactly like the ones being removed.

- `outriggerhospitalityassets.com` (`lib/sites.ts`) — a real CDN host the asset
  capture pipeline matches URLs against.
- `thehotelsnetwork.com`, `sojern.com`, `cendyn.com`, `triptease.io`
  (`lib/capture/sanitize.ts`) — entries in a tracker BLOCKLIST. Deleting a
  hospitality-sounding entry lets that pixel phone home from a clone: a privacy
  regression dressed as a vocabulary fix.
- Every occurrence of "room" in `src/components/` and `src/app/` — Prism's own
  screen noun from `docs/DESIGN-PRINCIPLES.md` ("rooms not steps"), not a hotel
  room. The sweep found it a false positive 36 times out of 41, and the
  ratchet's own header records 106 false positives against 44 real problems.
