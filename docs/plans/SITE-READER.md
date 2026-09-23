# The site reader: an agent that interprets a site, and code that checks it

*Plan, 23 Sep 2026. Not built. Present to Bryan before building.*

Site onboarding (mockup: https://claude.ai/artifact/XppRLQaVkFjMpj7M8z6mNY) needs
something that reads a customer's site and says what it means: what it calls its
visitors, what it sells, the action it wants, who it is for, how it sounds.
**Nothing in the console does this today.** Firecrawl is used only to capture page
HTML for prototypes (`src/lib/capture/capture.ts`, v1 scrape). The test in
`docs/investigations/FIRECRAWL-SITE-READ-2026-09.md` was a one-off: Firecrawl's
hosted agent with a one-paragraph prompt and our schema, and the evidence check was
done by hand afterwards.

## The split

**The agent decides what the site means. Code decides what may be pre-filled.**

- **The agent** is a Claude call whose knowledge is a skill in the skill library,
  `opmc-site-reader`, loaded as the system prompt the same way `opmc-brief-author`
  drives the brief composer (`src/lib/ai/brief.ts` → `resolvedSystem`). Edit the
  skill in the console and the reader follows. Firecrawl is its tools.
- **Code** enforces the evidence rule. A model asked nicely to cite quotes will
  sometimes cite one that doesn't say what it claims. The investigation measured
  this: a single-page extraction proved 4 of 12 answers and presented the generic
  "visitor" as the customer's word. So every answer goes through a check the model
  cannot talk its way past (below).

## Business type: broad only (Bryan, 23 Sep)

The person confirms only the BROAD type: Hospitality, Retail, Software and
subscriptions, Services and lead generation, Non-profit, Media and publishing,
Something else. It is detected from a quick first look and confirmed, never asked
blank.

- The broad type selects which **knowledge section** of the skill the reader
  loads. That is its only job. It never supplies an answer.
- The **sub-type** ("vacation rentals, and rental management for owners") is found
  by the reader and comes back as an ordinary answer on the review screen, with
  its quote, refinable like every other answer.
- "Something else" loads the general section only.

## The skill: `opmc-site-reader`

One skill, `delivery: "console"`, with:

1. **General reading method** — applies to every site:
   - Use the site's own words, never a generic substitute (visitor, product,
     customer, user are defaults, not answers).
   - Every answer carries a short verbatim quote and the URL it came from.
   - When the site does not settle something, say so under `unsettled`; never
     guess.
   - Read beyond the home page: the page map says where the site's weight is
     (507 of the condo site's 762 pages sit under `/hawaii`).
   - Look for a second audience or a second action (the condo site recruits
     owners; a software site has trial and demo).
2. **One knowledge section per broad type** — what to look for, not what to
   answer. Hospitality: property versus unit naming, booking engines that live
   off-site, loyalty programmes, owner programmes, destinations as structure.
   Retail: catalogue shape, the `product` scrape format, cart versus enquiry.
   Software: plans, trials, demo requests, logged-in apps that can't be read.
   Services: enquiry and quote forms, offline completion. And so on.
3. **The answer shape** — a forced tool call (structured output, as the brief
   does), so the response is validated JSON.

## Its tools (Firecrawl v2)

| Tool | Firecrawl | Cost (measured) | Used for |
|---|---|---|---|
| `list_pages` | `map` | 1 credit per call | the inventory; where the site's weight is |
| `read_page` | scrape → markdown | 1 per page | reading for meaning |
| `read_look` | scrape → `branding` | 1 per page | colours, type, buttons, one page per template, aggregated |
| `read_products` | scrape → `product` | 1 per page | retail catalogues only; untested |

A page budget caps each read (start at 25 pages for meaning, 1 per template for
the look), so a large site can't run away with credits.

**Our loop, or Firecrawl's agent?** Firecrawl's hosted agent scored 10 of 12 in
the test, but its model, not our skill, would be doing the interpreting, and its
billing is unknown (both test runs billed 0). Recommended: our own Claude loop
(`claude-opus-4-8`, as the other console calls use) with the tools above, so the
knowledge lives in our skill library and can be edited there. Keep Firecrawl's
agent as the fallback if our loop reads worse on the same two sites.

## The check (code, not prompt)

For each answer, in `lib/site/` (the new-names rule from HANDOFF):

1. **Fetch the cited page's text** (already read, so no extra credit) and require
   the quote to appear in it, allowing only whitespace and punctuation
   differences.
2. **Require the quote to contain the answer's word** for vocabulary answers
   (the quote for `condo` must contain "condo").
3. **Flag neutral defaults** — visitor, product, customer, user, item — as
   unproven whatever the quote says.
4. **Sort into the four review groups:** proven → pre-filled; failed the check →
   "Found, not proven", the guess offered as an option; `unsettled` → "The site
   doesn't say"; fields no read can answer → "Only you know".

A failed check never deletes an answer. It only stops it being pre-filled.

**Proof is per field** (found on Patagonia and Linear, 23 Sep): a word check
proves a noun or verb, but it can't prove a place. "Where it completes" is proven
by its cited URL being on this site and being where the action finishes. It
failed the word check on all four sites while the agent had cited the right page.

## Where it runs

A read takes minutes and reads up to ~30 pages; a request can't hold it
(`maxDuration` is 300s at most on the routes that call Firecrawl today). The read
runs as a background job that saves its progress after each step. The "Reading
the site" screen shows those saved steps, the way the prototype setup page polls
for the first build. Its record keeps every page read and every quote. That is
what `SiteProfile.sources` was declared to hold.

## Refine

Refine on any answer is the brief's own `SectionHead` (BriefComposer.tsx): the
"Refine ✎" link, the inline box, "Refine this", rewritten in place. The rewrite
is a Claude call with the same skill, given the answer, its quotes and the
person's words. The result is stored as stated by the person, with the site's
quote kept as where it started. Each refinement is logged as a feedback signal,
as `brief.correction` is.

## Proving it before building the screens

Run the reader on three unlike sites and compare with the two Outrigger reads we
already have:

- the two Outrigger sites (hospitality; the test baseline);
- one retailer with a real catalogue;
- one software company with a trial and a demo.

**Done 23 Sep for Patagonia and Linear** — results in the investigation doc. Both
gaps are real: Patagonia's offering is a range ("clothing and gear"), not one
word, and its biggest section is activism, not the shop. The skill must look for
second actions on purpose; the answer shape must hold a range.

## Open

- Firecrawl agent billing (both test runs billed 0 at completion).
- Vercel's deployed `FIRECRAWL_API_KEY` — the local one was dead.
- Which knowledge sections to write first beyond Hospitality.
