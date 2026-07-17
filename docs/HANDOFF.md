# Session Handoff — read this first

*Last updated: 2026-07-17*

Continuity doc for the next Claude instance. Read [`AGENTS.md`](../AGENTS.md) for invariants, then this for current state.

## ⚠️ Open in the right folder

Work happens in **`/Users/bryanhopkins/Projects/OUTRIGGER Prototypes/OUTRIGGER Prototype Managment Console`** (git remote `INHQInc/OUTRIGGER-Prototype-Management-Consol`). Earlier sessions were accidentally rooted in `~/AIChat/resort-ai-chatbot` (a *different* project, BrandGraph). Make sure the session is rooted here so this repo's `CLAUDE.md`/`AGENTS.md` load.

## What this project is

A local-first Next.js console that: **captures** sanitized, versioned clones of outrigger.com / hawaiivacationcondos.outrigger.com pages → lets you build **overlay features** on them → **deploys** demos → optionally **experiments** via Optimizely → **hands off** to devs in their block conventions. Full concept + invariants in `AGENTS.md`.

## Run it

```bash
cd "/Users/bryanhopkins/Projects/OUTRIGGER Prototypes/OUTRIGGER Prototype Managment Console"
npm install
npm run dev            # http://localhost:3000
npx tsc --noEmit       # typecheck before committing
```
- Capture a page: `npx tsx scripts/capture.ts <outrigger|hvc> <url>`
- Export a variation: `npx tsx scripts/export-variation.ts <feature-key>`
- Local auth test creds live in `.env.local` (admin@outrigger.local / changeme-local-dev).

## Built & working (verified)

- **Capture pipeline** (`src/lib/capture/`) — Firecrawl scrape → curl asset mirroring (beats their WAF TLS fingerprinting) → CSS/srcset rewrite → tracking sanitizer (GTM/GA4/OneTrust/Optimizely/pixels) + report + runtime clone-guard. 21 pages captured locally (2 homes + Waikiki property + 18 sub-pages).
- **Console UI** — Sites & Pages (site cards + page tables from the snapshot filesystem), Page detail (device-framed live preview, version timeline, sanitization report, Sync Content). `/snap` + `/snap-assets` serving routes.
- **Auth** (`src/lib/auth/`) — session-gate middleware (jose JWT, 365-day), admin sign-in + member one-time access links, `/settings/users` admin. Store seam: JSON local / Neon hosted. Verified: redirect, login, single-use links, role gating.
- **Feature/overlay model** (`src/lib/features/`) + **Optimizely exporter** (`src/lib/optimizely/export.ts`) — sample `features/trip-planner/`. Verified the exported variation renders integrated on the Waikiki clone.

## Storage seam (important pattern)

No database for content. Two seams already abstract persistence so hosted = swap one impl:
- **Pages/versions** → snapshot filesystem (`src/lib/registry.ts`).
- **Features/overlays** → git files (`src/lib/features/registry.ts`).
- **Auth users + (future) experiment bindings** → `src/lib/auth/store.ts` (JSON `.data/` local, Neon when `DATABASE_URL` set).

## Deployment

- Vercel project `outrigger-prototype-management-consol`, git-connected (`main` auto-deploys). URL: `outrigger-prototype-management-cons.vercel.app`.
- **Hosted console shows 0 pages** — snapshots are gitignored/local-only, and Vercel FS is read-only. Console is **local-first** for now; hosting real content needs the Neon+Blob work (deferred). This is expected, not a bug.

## Next milestones (in order)

1. **Optimizely draft-push** — create paused experiment in **Prep** (`24138040550`) via API. Blocked on `OPTIMIZELY_API_TOKEN`. See [`EXPERIMENT-INTEGRATION.md`](EXPERIMENT-INTEGRATION.md).
2. **Experiment area UI** — binding, lock-while-running, modify+sync, drift indicator.
3. **Features UI** — list/detail, injection-point picker (click element in preview).
4. **Deploys UI** — pages @ versions + feature toggles → protected Vercel URL.
5. **Handoff generator** — block-convention code + injection manifest + source-map notes (via read-only Azure clone) + git patch.
6. **Personalization mode**; later **hosted console** (Neon + Vercel Blob).

## Pending user actions (don't rebuild these — they're waiting on the user)

- **Vercel env vars** for hosted auth: `AUTH_SECRET`, `ADMIN_EMAILS`, `ADMIN_LOGIN_SECRET`, `DATABASE_URL`. (Claude never enters credentials — user pastes.)
- **Neon DB** — user to provide a `DATABASE_URL` (recommend a *separate* database from BrandGraph).
- **`OPTIMIZELY_API_TOKEN`** — scoped service-account PAT for the draft-push.
- Decide: keep console local-first, or do the Neon+Blob hosted-content work.

## Read-only reference (never push)

`~/Projects/Outrigger_Website` = Azure DevOps clone of Outrigger's real site source (ASP.NET + Optimizely CMS, block-per-folder architecture). **Pull only, never push** (push URL already disabled). Used for source-mapping handoffs and matching their conventions.
