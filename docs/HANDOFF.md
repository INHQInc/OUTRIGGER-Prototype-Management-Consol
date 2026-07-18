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

## Hosted deployment — LIVE & auth-gated (configured 2026-07-17)

- Production `outrigger-prototype-management-cons.vercel.app` is auth-gated; admin login + Neon-backed store verified end-to-end (successful admin login writes to Neon before issuing the session).
- Vercel env set: `AUTH_SECRET`, `ADMIN_EMAILS=inhqinc@gmail.com`, `ADMIN_LOGIN_SECRET`, `DATABASE_URL`. Admin login: `inhqinc@gmail.com`.
- **Neon:** dedicated project `outrigger-prototype-console` (id `delicate-frog-62798343`, US East), **separate from BrandGraph** (`hospitality-ai-bot`) and `shopgraph-ai`. Tables `console_user` / `access_code` auto-created on first login.
- Note: hosted console still shows **0 captured pages** (snapshots are local-only; needs Neon+Blob content work — deferred). Local-first for capture/prototyping remains the workflow.

## Pending user actions (don't rebuild these — they're waiting on the user)

- **`OPTIMIZELY_API_TOKEN`** — scoped service-account PAT for the draft-push (Prep project `24138040550`).
- **Small cleanups:** flip `ADMIN_LOGIN_SECRET` back to *Sensitive* in Vercel (left non-sensitive during debugging); optionally rotate the Neon DB password (its connection string was pasted in chat) via Neon → Reset password, then update the one Vercel value.
- Decide: keep console local-first, or do the Neon+Blob hosted-content work so the deployed console shows pages.
- Login-form autofill gotcha: the browser will autofill a stale saved password on `/login`; sign in via an Incognito window (or clear the saved credential).

## Read-only reference (never push)

`~/Projects/Outrigger_Website` = Azure DevOps clone of Outrigger's real site source (ASP.NET + Optimizely CMS, block-per-folder architecture). **Pull only, never push** (push URL already disabled). Used for source-mapping handoffs and matching their conventions.

---

## Session 2026-07-18 — locked decisions + handoff milestone

**Lifecycle (locked):** build prototype (console, HTML/CSS/JS) → internal **approval** → *optional* Optimizely **experiment** (test) → devs **integrate into the Optimizely CMS** as the shippable product.

**Directional decisions (locked):**
1. **Authoring = dev-only** — build prototypes in Claude Code/Desktop on the repo; the console manages/previews/hands-off. No in-app AI builder (removed).
2. **Live injection = Optimizely** — invite-only preview links via a paused Optimizely experiment; no homegrown loader (security). All-visitors = un-paused Opti campaign, needs Outrigger sign-off + human start.
3. **Console = local-first** — build/capture locally; **Deploys** publishes a self-contained, protected prototype URL for the agency (no Neon+Blob content migration needed).
4. **Handoff ships HTML/CSS/JS only — NOT C#.** We prototype front-end, so we hand off front-end mapped to their source. Making a feature an editor-managed CMS block (a C# content type) is the devs' call — the tool does not generate C#.

**Done this session:** Features area (list/detail, live preview, selector lint), injection authoring (click-to-pick, placement presets, persistence), Optimizely variation exporter, and the **Handoff compare viewer** (`src/lib/handoff/*`, `/handoff`): resolver maps a prototype's anchors → owning Razor views in the read-only Azure clone (confidence + candidate picker, choice persisted to `features/<key>/handoff.json`); origin↔integrated side-by-side diff; `git apply` patch download. No tokens needed.

**Pending (token-gated):**
- `VERCEL_TOKEN` → **Deploys** (protected prototype URL for the agency). Placeholder keys already in `.env.local`.
- `OPTIMIZELY_API_TOKEN` (+ `OPTIMIZELY_PROJECT_ID=24138040550`) → **Promote to Experiment** (paused draft + preview link in Prep).
- Small cleanups still open: flip `ADMIN_LOGIN_SECRET` back to Sensitive in Vercel; optionally rotate the Neon DB password.
