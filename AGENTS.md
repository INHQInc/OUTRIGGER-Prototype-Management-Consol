# Claude Context Guide — OUTRIGGER Prototype Management Console

*Last updated: 2026-07-17*

> **New session? Read [`docs/HANDOFF.md`](docs/HANDOFF.md) first** for current state and how to continue.

## What This Is

A web app (Next.js, hosted on Vercel) for cloning pages from **outrigger.com** and **hawaiivacationcondos.outrigger.com** into sanitized, versioned snapshots, building prototype features on top of them, and handing those features off to Outrigger's developers cleanly.

**Repo:** `INHQInc/OUTRIGGER-Prototype-Management-Consol` (GitHub)
**Local path:** `/Users/bryanhopkins/Projects/OUTRIGGER Prototypes/OUTRIGGER Prototype Managment Console`

## Core Concept

1. **Capture** — user adds a page by URL; pipeline pulls rendered HTML via Firecrawl, resolves and downloads every referenced asset (CSS/JS/images/fonts), rewrites URLs to local copies, and strips all tracking (GTM container, GA4/gtag snippets, dataLayer bootstraps, vendor pixels, consent managers).
2. **Version** — every capture is an immutable **PageVersion**. "Sync Content" captures a new version; it never mutates an old one. Assets are content-addressed (stored by hash) for dedupe across versions and across both sites.
3. **Prototype** — features are built as **overlays**: new, clearly-namespaced files (e.g. `/prototype/booking-widget.css`) plus declared injection points. The snapshot itself is read-only, always.
4. **Deploy** — each prototype deploys to Vercel as a working clone of the page(s) with the feature integrated.
5. **Experiment (optional, before handoff)** — a feature can be promoted to an Optimizely **Web Experimentation** variation (same overlay → custom JS/CSS) to A/B test on the *live* site, or a Personalization experience to target a segment. Validates lift before committing devs to permanent integration.
6. **Handoff** — developers receive the overlay files + injection points + source-mapped integration notes referencing Outrigger's real source files.

## Optimizely (Web Experimentation)

Same account: **OUHH Outrigger Hotels Hawaii** → Experimentation. Snippet is dynamic-website aware (MutationObservers), so live-DOM variation re-application works.

| Env | Project | Site | Snippet |
|---|---|---|---|
| **Prep (sandbox)** | `24138040550` | prep.outrigger.com | `cdn.optimizely.com/js/24138040550.js` |
| **Prod** | `21089662478` | www.outrigger.com | `cdn.optimizely.com/js/21089662478.js` |

- **Prove all pushes against Prep first**, then flip project ID to Prod once trusted.
- **Safety rail:** the console only ever creates experiments/experiences in a **paused/draft** state via API. A human starts them in Optimizely — the console NEVER turns on production traffic.
- Auth: `OPTIMIZELY_API_TOKEN` (Personal Access Token, ideally a scoped service account), `OPTIMIZELY_PROJECT_ID`. User provides; Claude never handles the token in plaintext.
- Our overlay = the variation. Exporter emits self-contained variation JS (CSS-inject + robust wait-for-element HTML insertion + overlay JS) because the live DOM is dynamic; brittle selectors are linted before promotion.

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

- **Console:** Next.js 16 (App Router, TS, Tailwind 4) on Vercel. Auth-gated. Browse sites/pages, Sync Content, version history, overlay features, deploys, experiments, handoff.
- **Capture pipeline:** Firecrawl (rendered HTML) → asset resolver (curl-based; Node fetch is WAF-blocked by TLS fingerprint) → URL rewriter → sanitizer (strip + tracking-domain blocklist + report + runtime clone-guard).
- **Persistence = seams, NOT a content database (v1 local-first):**
  - Pages/versions → snapshot filesystem, `src/lib/registry.ts` (`meta.json` per version is the source of truth).
  - Features/overlays → git files, `src/lib/features/registry.ts`.
  - Auth users + experiment bindings → `src/lib/auth/store.ts` seam: JSON `.data/` local, **Neon** when `DATABASE_URL` set (hosted). This is the ONLY place a DB is used.
  - Snapshot bytes stay on the filesystem now; go to blob storage when the console is hosted with real content (deferred).
- **Data model:** Site → Page → PageVersion (immutable). Feature = overlay files + injection points, targeting pinned PageVersions. Deploy = (pages@versions) + (features on/off). Experiment = feature bound to an Optimizely variation.

## Environment variables

| Var | For | Notes |
|---|---|---|
| `FIRECRAWL_API_KEY` | capture | set (local `.env.local` + Vercel) |
| `AUTH_SECRET` | session signing | required; generate random |
| `ADMIN_EMAILS` | admin login allowlist | comma-separated |
| `ADMIN_LOGIN_SECRET` | admin login | admin master secret |
| `DATABASE_URL` | Neon (hosted auth/bindings) | absent → JSON `.data/` store (local) |
| `OPTIMIZELY_API_TOKEN` | Optimizely draft-push | scoped service-account PAT; Claude never handles it in plaintext |
| `OPTIMIZELY_PROJECT_ID` | Optimizely target | Prep `24138040550` first, then Prod `21089662478` |

Claude never enters credentials — the user pastes them into Vercel / `.env.local`.

## Related Repos & Paths

| Path | What | Rules |
|---|---|---|
| `~/Projects/OUTRIGGER Prototypes/OUTRIGGER Prototype Managment Console` | This repo — the console | Normal dev; push to GitHub `main` |
| `~/Projects/Outrigger_Website` | Outrigger source (Azure DevOps, Rightpoint) | **READ-ONLY. Pull only. Never push.** |

## Build Order (Milestones)

- ✅ **M1 Capture pipeline** — sanitized, asset-complete clones + report. 21 pages captured.
- ✅ **M2 Console UI** — Sites & Pages, Page detail (preview/versions/report), Add Pages, Sync Content.
- ✅ **Auth** — session gate, admin login, member one-time links, users admin.
- ✅ **Feature model + Optimizely exporter** — overlay → variation JS/CSS + lint; verified rendering on the clone.
- ⏳ **Optimizely draft-push** — create paused experiment in Prep via API (needs `OPTIMIZELY_API_TOKEN`).
- ⏳ **Experiment area UI** — binding, lock-while-running, modify+sync, drift ([`docs/EXPERIMENT-INTEGRATION.md`](docs/EXPERIMENT-INTEGRATION.md)).
- ⏳ **Features UI** — list/detail, injection-point picker.
- ⏳ **Deploys UI** — pages@versions + feature toggles → protected Vercel URL.
- ⏳ **Handoff generator** — block-convention code + injection manifest + source-map notes + git patch.
- ⏳ **Personalization mode**; later **hosted console** (Neon + Vercel Blob).

**Current state & continuity:** see [`docs/HANDOFF.md`](docs/HANDOFF.md).

## Open Items / pending user actions

- Vercel env vars for hosted auth: `AUTH_SECRET`, `ADMIN_EMAILS`, `ADMIN_LOGIN_SECRET`, `DATABASE_URL`.
- Neon `DATABASE_URL` (recommend a database separate from BrandGraph).
- `OPTIMIZELY_API_TOKEN` (scoped service-account PAT) for the draft-push.
- Decision: keep console local-first, or do Neon+Blob hosted-content work so the deployed console shows pages.
