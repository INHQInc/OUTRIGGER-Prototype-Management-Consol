# BrandGraphAI's scan and graph — what to borrow for the site scan

*23 Sep 2026. Read-only study of BrandGraphAI (`INHQInc/hospitality-ai-bot`, local
`~/AIChat/resort-ai-chatbot`), asked for by Bryan. Input to Sites slice 4 (the
scan). The graph itself was **set aside** the same day (HANDOFF → "Considered and
set aside"); this records what to borrow if we build a scan, and what not to.*

BrandGraphAI maps EVERYTHING — every room, venue, amenity, policy — because its
chat must answer any guest question. Prism needs far less (see
`docs/plans/SITE-READER.md`). Borrow the machinery, not the scope.

## Worth copying

1. **One Firecrawl wrapper** (`src/lib/enrichment/firecrawl.ts`): `/v2/map` +
   `/v2/scrape` only in the live path; retries 429 (honours Retry-After) and 5xx
   with backoff; returns `[]`/`null` instead of throwing; counts credits. Make
   the credit counter **per job** (theirs is module-level and over-counts).
2. **Cheap signals first, in parallel:** `/map`, `llms.txt`, homepage JSON-LD,
   nav/index link harvesting. A `HEAD` (`redirect: "manual"`) before any paid
   scrape. Exact-host domain gate before anything expensive ("subdomains are
   different sites").
3. **Ground every model answer in what was crawled.** Any URL the model proposes
   must match a URL actually seen in `/map`, or it is dropped ("likely
   hallucinated"). Same shape as our evidence check: quotes must be on the page.
4. **Truncation-safe model output:** compact keys, split-the-batch-and-retry on
   `finish_reason === "length"`, JSON salvage of a truncated array, 429 retries
   sent in waves.
5. **Two database-backed jobs, polled by the client:** discovery, then the
   per-entity read, with a human `status_message`, numeric counters, JSON
   results, and a **review gate before the expensive step**.
6. **Resilience kit:** optimistic-lock "approve" (double-click safe), checkpointed
   batches, per-page retry then a dead-letter record, a circuit breaker with
   per-call timeouts, heartbeat (`updatedAt`) plus stale-job recovery, an event
   log.
7. **Soft-404 detection** (a 200 that is really "not found") and skip lists
   (careers, legal, login, cart, search, media files).
8. **Path-prefix scoping** so a brand-level page is never read into one entity.
9. **Code decides the structure; the model only fills it** — code-only types, a
   type whitelist + remap, a rule-based QA pass. Same principle as ours.

## Replace, don't copy

- **Background work as un-awaited promises on a web server.** Detection and crawl
  survive only while other requests keep the instance busy. Prism on Vercel needs
  a real job runner (Vercel background functions / a queue / cron-driven steps
  that save progress after each step — SITE-READER.md "Where it runs").
- **`process.env` set per request and module-level state** — concurrent scans on
  one instance switch each other's modes and mix credit counts.
- **Recovery that only runs when someone loads a page.** Recover on a schedule.
- **Stubs created before the person confirms** anything.

## Hotel-specific — leave behind

`SUB_PAGE_SEGMENTS` (~150 hospitality words), the exclusion and listing regexes,
Schema.org Hotel/LodgingBusiness checks, the `-by-outrigger` slug suffix, every
detection prompt ("bookable", "closed/sold/rebranded"), the 12 page types, menu
PDF scraping, the hotel graph taxonomy and its entity rules, Perplexity review
enrichment, city-derived destinations. If Prism ever needs any of it, it goes in
a per-industry section of the reader skill, not in code.

## Their bugs — do not port

- A categorisation step **overwrites the page type the user chose** in review.
- Re-imports overwrite items the user **pinned or edited**; `verified` is never
  checked before overwrite; `properties || existing` lets an empty `{}` wipe data.
- "Smart skip" never re-reads a page whose content changed (no content hash).
- A killed detection job is returned as "resuming" forever for that URL.
- No per-job credit budget; the crawl's page count is uncapped.
- Enterprise detection cannot find a single-property site whose property is the
  homepage.
- Several graph/crawl routes check login but not the customer (IDOR list:
  `SECURITY-IDOR-REMEDIATION.md` in that repo).
- **No quote is stored with a fact** — provenance is a list of source item ids,
  so "why do we believe this?" means re-reading whole pages. Prism stores the
  quote and the page with every answer.

## Their graph, if it ever comes back

Portable: source documents with vectors plus a typed graph (aliases, JSON
properties, source ids, confidence, soft delete) partitioned by one scope id;
the seeded skeleton; the dedup stack (normalised fuzzy names → post-pass merge →
model clustering with auto-merge at 0.9 → human review queue with remembered
dismissals → transactional merge with a snapshot log); pgvector handled by raw
SQL. Hotel-only: the EntityType/EdgeType enums. Fix before porting: a per-tenant
type registry instead of enums, evidence quotes on nodes and edges, locked fields
on re-extraction, customer checks on every route.
