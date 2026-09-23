# Firecrawl Alexandria — what it is, and whether Prism needs it

*23 Sep 2026. Asked by Bryan. Discovery calls only; no paid tool was run (0 credits).*

## The answer

**Not for site setup.** Alexandria gives an agent other people's data (ready-made
tools for other websites, company databases, public indexes). Site setup reads the
customer's own website, which the scan already does with `map`, `scrape`,
`branding` and the agent. Two later uses are worth a look (below); neither is in
the current plan.

## What it is

Launched 22 Sep 2026 with Firecrawl's Series B. A library of data tools an agent
can find and call through Firecrawl:

- **Tools for specific websites** — e.g. Trip.com hotel pages, Google Maps business
  listings, the Wayback Machine, eBay, SeatGeek.
- **Company data** — Particle (what a company sells, its competitors), BBB
  profiles, SEC filings, UK Companies House.
- **Firecrawl's own indexes** — research papers, developer docs, government
  regulations — plus Wikipedia via Wikimedia Enterprise.

Firecrawl's claim: agents using it scored 21% higher on answer quality than with
built-in web tools (845 tasks, same models and prompts).

## How it works

1. **Find a tool** — `POST /v2/search` with `"sources": ["alexandria"]`
   (optionally `"domainTools": true` to match tools to a website). **Free.**
   Returns `provider`, `capability`, `description` per tool.
2. **Inspect it** — inputs, response shape and price. The docs show this through the
   SDK (`findTools`), CLI (`firecrawl find-tools`) and MCP; its HTTP path is not in
   the public docs (four guessed paths returned 404).
3. **Run it** — `POST /v2/scrape` with
   `{"alexandria": {"provider", "capability", "options"}}`. **Paid per tool**, at
   the price shown when inspecting. Some providers need an org admin to accept
   their data terms first (`THIRD_PARTY_DATA_TERMS_REQUIRED`).

## What we tested (free discovery, 0 credits)

Eight searches. Raw results: session scratchpad `fc/alexandria/`.

| Search | Closest tools found |
|---|---|
| outrigger.com (domain tools) | none for Outrigger — generic matches only (Trip.com hotels, parking, events) |
| hawaiivacationcondos.outrigger.com | none |
| hotel rates in Hawaii | Trip.com hotel pages: rooms, property facts, policies, amenities |
| hotel reviews | Trip.com hotel facts; review tools for other industries |
| company information | Particle company profile and competitors, SEC, BBB |
| a company's brand colors, logo, fonts | nothing that reads brand identity; company records only |
| website technology | nothing relevant; the Wayback Machine turned up |
| search traffic and rankings | nothing relevant; Google Maps business search |

## Where it could help later

1. **Readouts: did the page change during the test?** The Wayback Machine tool
   returns an archived page's text by date. A readout could check whether a target
   page changed mid-experiment, which would muddy the result.
2. **Site summary or test ideas: what the company sells and who it competes with.**
   Particle's `companies/products` and `companies/competitors`. Coverage of a
   private company like Outrigger is unknown; one paid call would settle it.

Neither is needed for anything decided so far.
