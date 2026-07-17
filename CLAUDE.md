# Claude Context Guide — OUTRIGGER Prototype Management Console

*Last updated: 2026-07-17*

## What This Is

A web app (Next.js, hosted on Vercel) for cloning pages from **outrigger.com** and **hawaiivacationcondos.outrigger.com** into sanitized, versioned snapshots, building prototype features on top of them, and handing those features off to Outrigger's developers cleanly.

**Repo:** `INHQInc/OUTRIGGER-Prototype-Management-Consol` (GitHub)
**Local path:** `/Users/bryanhopkins/Projects/OUTRIGGER Prototypes/OUTRIGGER Prototype Managment Console`

## Core Concept

1. **Capture** — user adds a page by URL; pipeline pulls rendered HTML via Firecrawl, resolves and downloads every referenced asset (CSS/JS/images/fonts), rewrites URLs to local copies, and strips all tracking (GTM container, GA4/gtag snippets, dataLayer bootstraps, vendor pixels, consent managers).
2. **Version** — every capture is an immutable **PageVersion**. "Sync Content" captures a new version; it never mutates an old one. Assets are content-addressed (stored by hash) for dedupe across versions and across both sites.
3. **Prototype** — features are built as **overlays**: new, clearly-namespaced files (e.g. `/prototype/booking-widget.css`) plus declared injection points. The snapshot itself is read-only, always.
4. **Deploy** — each prototype deploys to Vercel as a working clone of the page(s) with the feature integrated.
5. **Handoff** — developers receive the overlay files + injection points + source-mapped integration notes referencing Outrigger's real source files.

## Hard Rules (Invariants)

- **`~/Projects/Outrigger_Website` (Azure DevOps clone) is READ-ONLY reference.** NEVER push, commit, or modify it. Pull only. Its purposes: source-mapping minified bundles to real source files, learning their coding conventions for overlay code, writing handoff patches referencing their real file paths, and understanding templating/tracking behavior the rendered HTML can't show.
- **Snapshots are immutable.** A PageVersion is never edited after capture. Changes go in overlays; re-capture creates a new version.
- **Prototypes pin to a specific PageVersion.** Sync Content never silently rebases a prototype onto a new version — the user sees the upstream diff and explicitly rebases.
- **Never edit captured/minified files directly.** All prototype code lives in namespaced overlay files so handoff diffs map to source, not minified output.
- **Every capture produces a sanitization report** — what scripts were removed, what domains are blocked. Must be provable that no tracking fires from a clone.
- **All Vercel deploys are protected:** password/deployment protection, `noindex` headers, `robots.txt` deny-all. Cloned brand pages must never be publicly crawlable.
- **Booking flows link out to the live site** — we do not attempt to make booking work against clones (v1 scope decision).
- **Parity claims are always against a snapshot, never against "live."** The live sites are dynamic; two scrapes differ.

## Architecture

- **Console:** Next.js on Vercel, password-protected. Browse sites/pages, trigger Sync Content, version history, prototype overlay management, diff view, deploy button.
- **Capture pipeline:** Firecrawl (rendered HTML) → asset resolver → URL rewriter → sanitizer (strip + tracking-domain blocklist + report).
- **Data:** Postgres (Neon) — sites, pages, page versions, prototypes, capture jobs, sanitization reports. Page bundles/assets in git or blob storage, content-addressed (decision pending real capture size).
- **Data model:** Site → Page → PageVersion (immutable) ; Prototype = pinned PageVersion + overlay files + injection points.

## Related Repos & Paths

| Path | What | Rules |
|---|---|---|
| `~/Projects/OUTRIGGER Prototypes/OUTRIGGER Prototype Managment Console` | This repo — the console | Normal dev; push to GitHub `main` |
| `~/Projects/Outrigger_Website` | Outrigger source (Azure DevOps, Rightpoint) | **READ-ONLY. Pull only. Never push.** |

## Build Order (Milestones)

1. Spec doc in repo (this file is the summary; full spec in `docs/`)
2. **M1:** Capture pipeline for a single outrigger.com page → sanitized, asset-complete local clone + sanitization report (scripts, no UI)
3. **M2:** Console UI — add page, Sync Content, version list
4. **M3:** Prototype overlays + diff view + deploy to protected Vercel URL
5. **Later:** Automated Azure DevOps source-mapping inside the console

## Open Items

- Firecrawl API key needed (user's subscription) before M1 capture runs
- Vercel token needed before M3 deploys
- Storage decision (git vs blob for assets) after first real page capture
