# Understanding the customer and the site

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
Customer ── profile (observed) · skill (characterized) · evidence (earned)
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
