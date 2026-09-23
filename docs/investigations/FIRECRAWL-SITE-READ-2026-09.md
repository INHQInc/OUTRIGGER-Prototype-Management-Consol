# Firecrawl as the site's first read — tested on Outrigger's two sites

*23 Sep 2026. The question: which Firecrawl features can do the heavy lifting
of a site's first-pass read, so site onboarding pre-fills as much as possible.
Answered from the docs (read as raw markdown, not summarised) and then tested
live on outrigger.com and hawaiivacationcondos.outrigger.com. The whole test
cost 15 credits.*

## The answer in one paragraph

**`map` for the inventory, `branding` across a handful of pages for the look,
and the `agent` with our own schema for the meaning** — then a mechanical check
that every answer is proven by the quote it cites. Only proven answers pre-fill;
everything else becomes an interview question with the guess offered as an
option. The agent found "condos" for the condo site on its own, from a prompt
that never mentioned condos or hotels. For outrigger.com it declined to pick a
product noun and said why — the brand site sells hotels, resorts, vacation
rentals and experiences and never names one word for all of them. That is the
right outcome: for the brand site the product noun is the customer's decision,
not a fact on the page.

## Account

Standard plan: 100,000 credits a month (resets on the 28th), 50 concurrent
browsers. Credit costs are the same on every plan.

## The features that matter, and what they cost

| Feature | Credits | What it returns | Fills |
|---|---|---|---|
| `map` | **1 per call**, however many URLs | Every URL — sitemap, search results, prior crawls | page inventory; one page per template to read |
| scrape → `branding` | 1 per page *(measured)* | palette, fonts, type scale, spacing, button/input styles, logo, layout, `personality` | the site's visual layer (`ObservedFacts`) |
| scrape → `json` | 5 per page *(measured)* | our schema, answered from one page | the meaning — weakly (see below) |
| `agent` | billed 0 so far; docs' examples ≈15 | our schema, answered by browsing as many pages as it needs, with an execution trace and a live view | the meaning — well |
| scrape → `product` | 1 per page | title, price, variants, availability — deterministic, from JSON-LD / schema.org / embedded state; fails closed | a retail catalogue. **Not tested**; hotel pages carry schema.org `Hotel`, not `Product`, so expect it to return nothing here |
| monitor / change tracking | per check | when a page changes | later: telling a profile it has gone stale |

The console calls Firecrawl's **v1** scrape (`src/lib/capture/capture.ts`).
`branding`, `product` and the agent are **v2** — onboarding is built on v2.

## The test

A deliberately NEUTRAL prompt — it never says hotel, condo or hospitality, or
the test would only prove the model can repeat what it was told — asking for the
site's own words for its visitors and product, the main action and where it
completes, how the content is organised, the voice, the audience and the
business. Every answer had to carry a verbatim quote and the URL it came from,
and anything the site does not settle had to be listed as `unsettled`.

### What each approach answered

| | outrigger.com | hawaiivacationcondos.outrigger.com |
|---|---|---|
| Pages mapped | 1,819 | 762 |
| JSON, home page only | guest · **vacation** · book | **visitor** (the neutral default) · vacation rental · book |
| **Agent** | guest · **experience** — and flagged the product noun as unsettled | guest · **condo** · book |

### The evidence check — the design rule this test produced

For each vocabulary answer: does the quote it cites actually contain the word?
A neutral default (visitor, product, customer, user) is flagged as the generic
it is.

| | Answers proven by their own quote |
|---|---|
| Single-page JSON | **4 of 12** — including "visitor", the generic, twice — and `unsettled` left EMPTY on both sites |
| Agent | **10 of 12** — every quote linked to its page; honest `unsettled` lists on both |

The two the agent fails are both the conversion surface — correctly, because
Outrigger's booking engine is off-site and the content pages never name it. The
agent said so itself.

**The rule:** extract → check each answer against its own quote → pre-fill only
what is proven → turn the rest into interview questions, with the guess offered
as a labelled option. A single-page extraction presented "visitor" as the
customer's word with nothing to flag it — the exact generic-fallback failure the
vocabulary work exists to remove. The check catches it by construction.

### What the agent found that a home page never would

- **The condo site serves two audiences**: holidaymakers, and *condo owners
  considering rental management* — from its `/rental-management` page.
- **A real voice read**: "warm, invitational, sensory and aspirational… foregrounds
  caring, aloha, local culture and discovery rather than sounding clinical or
  corporate". Compare `branding`'s personality, below.
- **The brand site's structure**: "5 Destinations, 16 hotels & resorts", offers,
  Signature Experiences, the loyalty programme.

## `branding`: trust the inventory, not the roles

From a March crawl of ten outrigger.com pages (free to re-read in the playground):

- **Reliable in aggregate** — the palette (`#0078CD`, `#004561`, sand
  `#F1EFED`, `#252525`) and the font inventory (Duplicate Sans, Duplicate Ionic,
  Montserrat) match what a hand-run read of the stylesheet found.
- **Unreliable per page** — which colour is "primary" flips between three blues;
  the heading face flips between Montserrat Light, Duplicate Ionic, Duplicate Sans
  and, on the resort home page, Arial (it read the fallback before the webfonts
  loaded); h2 is reported larger than h1 everywhere.
- **`personality` is useless as a voice draft** — "Tone: Professional, Energy:
  Medium" on all ten pages.

So: run it across several pages and AGGREGATE. Where pages agree it is a fact;
where they disagree, the disagreement IS the interview question ("your pages
disagree on the heading face — Montserrat Light on six, Duplicate Ionic on three").
That is beta-2's interview idea with the questions generated from the real read
instead of hand-written for a demo.

## The pipeline this points to

1. `map` the site — 1 credit.
2. Choose one page per template from the map.
3. `branding` on those pages → aggregate → the visual layer; disagreements →
   questions.
4. The **agent**, with our schema, for the meaning — capped with `maxCredits`.
5. The evidence check → pre-fill what is proven; neutral defaults, unproven
   answers and the agent's own `unsettled` list → interview questions.
6. A person approves on `/brand`, per site, with the evidence beside each answer.

The agent's execution trace records which pages said what — the provenance
`SiteProfile.sources` is declared to hold. Its live view is a real "reading your
site" screen, where beta-2 had a timed animation.

## Two unlike sites: Patagonia (retail) and Linear (software), 23 Sep

Same read: `map`, `branding` on the home page, the agent with the same neutral
prompt and schema, then the evidence check (now a script, run on all four sites).
Cost: 4 credits (map and branding); both agent runs billed 0 again.

| | Pages | Biggest folders | Vocabulary proven by its own quote |
|---|---|---|---|
| hawaiivacationcondos | 762 | /hawaii 507 | **5 of 6** |
| Linear | 1,405 | /integrations 325, /changelog 256, /docs 159 | **3 of 6** |
| Patagonia | 4,513 | **/actionworks 1,752**, /product 1,289, /shop 1,079 | **1 of 6** |

**What the agent answered, and what the check did with it:**

- **Patagonia:** customer · product · shop. The agent fell back to the generic
  words; the check refused all four nouns. Its own quotes show the site's word is
  "gear" ("Shop outdoor clothing and gear that's built to last") — a range, not
  one noun. Only "shop" was proven.
- **Linear:** user · tool · sign up. "user" came from "$10 per user/month" and
  was refused as generic. "tool" was proven ("A new species of product tool"),
  but the agent itself flagged that Linear calls itself a "product development
  system". The entity kinds were excellent: issues, projects, cycles,
  initiatives — the product's own objects.

**What this proves about the design:**

1. **The check earns its place.** On the site least like a hotel it stopped four
   generic answers from being pre-filled. Without it, Patagonia's builder would
   have been told to write "products" for "customers".
2. **One offering noun doesn't fit retail.** Patagonia sells clothing and gear
   across 2,000+ product pages. The answer shape needs the portfolio/catalogue
   case (see THE-CHAIN § Onboarding), not a better single word.
3. **Second jobs are big, not edge cases.** Patagonia's largest folder is
   Action Works (activism: petitions, volunteering, grassroots groups) — more
   pages than the shop — plus Worn Wear (secondhand). Linear sells enterprise
   through a sales contact beside self-serve sign-up; the agent put that in
   `business` but did not name it as a second action. The reader has to look for
   second actions on purpose.
4. **"Where it completes" fails on all four sites, for a structural reason.** The
   agent cites the right page ("Add to Bag" on a product page; "Create your
   workspace" on /signup), but the word check can't prove a place. That field
   needs its own proof: the cited URL, on this site, is where the action
   finishes. Proof rules have to be per field.
5. **Locales appear:** Patagonia's map has /mx and /no. A site in several
   languages will need its vocabulary per locale, or a rule that the read uses
   one.
6. **`branding` roles are wrong again:** Linear's background and body text both
   came back #08090A (a dark site); Patagonia's "primary" is a light blue from
   one element. The earlier rule stands: trust the inventory, aggregate across
   pages, ask where they disagree.

## Found on the way

- **The console's local `FIRECRAWL_API_KEY` was dead** (rejected as an invalid
  token) and was not the account's current key. If Vercel holds the same dead
  key, every page snapshot the builder receives — `page.html`, the skeleton, the
  selectors, the design tokens — has been failing SILENTLY, because capture is
  best-effort and never blocks provisioning. Check the deployed value.
- **Open:** the two agent runs billed 0 credits at completion. Billing can lag;
  do not plan on the agent being free.

Raw responses from the test (not committed): the session scratchpad `fc/`
directory — `map_*.json`, `brand_*.json`, `json_*.json`, `agent_*.json`.
