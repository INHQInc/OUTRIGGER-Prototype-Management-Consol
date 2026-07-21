# Claude Context Guide — OUTRIGGER Prototype Management Console

*Last updated: 2026-07-20*

> **Architecture of record:** [`docs/LIFECYCLE-ARCHITECTURE.md`](docs/LIFECYCLE-ARCHITECTURE.md) — the locked prototype lifecycle model. Read it first.

## What This Is

A **multi-tenant "build-and-ship layer"** for advanced web experiments — the piece the experimentation platforms (Optimizely, VWO) are weakest at: **authoring prototypes beyond the visual-editor ceiling**, previewing/getting them approved, running them as experiments, and **codifying the winner back into production source**. The operator is an agency running experiments for multiple **customer brands**.

**Repo:** `INHQInc/OUTRIGGER-Prototype-Management-Consol` (GitHub) · **Stack:** Next.js 16 (App Router, TS, Tailwind 4) on Vercel · Neon (hosted) / filesystem (local).

## Domain model (current)

```
Brand (Org = customer)              ← tenant; active via cookie opmc_org; managed in Customers
 ├─ Sites (web properties)          ← setup: environments, repo, pages, integrations
 │    ├─ Environments (dev/staging/production)   ← origin seeds "production"; promotion targets
 │    ├─ Repo binding (feature repo + source mode)
 │    └─ Pages (clone snapshots)     ← OPTIONAL; capture on demand (live-injection-first)
 └─ Prototypes  ← THE primary object; belongs to ONE site, targets page(s)
      ├─ brief + hypothesis + metrics + lifecycle stage (draft→review→live→shipped→archived)
      ├─ Overlay code (css/js/HTML blocks, inline) → compiled to injectable variation JS
      ├─ ArtifactVersions (immutable, git-SHA-pinned; carry a compiled-code snapshot)
      └─ Promotions (version → environment; append-only, governed, audited)
```

- **Prototype-driven IA.** Home (`/`) is the **Prototypes board** (grouped by stage, filter by site). **Sites** (`/sites`) is setup. Left rail groups: Prototype Management · Site Management (Sites + current-site tabs nested) · Brand Settings (Experimentation, Members) · Operator (Customers, Users).
- A prototype **references** one site + page(s); the site is shared infrastructure across many prototypes.
- **Canvas: live-injection-first.** Prototypes author/preview against the live (lower-env) DOM via the loader; **clones are an opt-in fallback** (client blocks scripts / hard-to-reach state / frozen review URL).

## The four lifecycle principles (see LIFECYCLE-ARCHITECTURE.md)

1. **Build once, promote immutably** — a version pins a git SHA and carries its compiled code snapshot; the same bytes move staging→production.
2. **Decouple deploy from release** — exposure via flag/experiment; production promotion = a PAUSED Optimizely draft (no traffic).
3. **Govern every gate** — role-checked promotions + append-only audit trail (Brand settings → Activity).
4. **Trace end-to-end** — hypothesis → commit → experiment → shipped PR.

**Integrate, don't duplicate** — never rebuild Optimizely's stats engine / flags / targeting. Promote *into* their platform.

## Persistence — ContentStore seam

`getContentStore()` picks the backend by `DATABASE_URL` (mirrors the auth store):
- **Neon** (hosted): tables `org, org_member, site, environment, page_version, asset, repo_binding, prototype, prototype_overlay, artifact_version, promotion, audit_event, experimentation_config, content_meta`.
- **Filesystem** (local, no `DATABASE_URL`): `snapshots/` tree + `_*.json` maps.

Schema **auto-migrates** on first request via a **race-safe `ddl()` helper** (create-if-not-exists / alter-add-column-if-not-exists, swallowing duplicate-object races 23505/42P07/42710). Do NOT do bare `create table if not exists` outside `ddl()` — concurrent cold starts collide on `pg_catalog`.

## Optimizely (Web Experimentation)

- **Brand-level connection** (Brand settings → Experimentation): the customer's PAT + selected project, stored server-side, **never returned to the client**. Pluggable `ExperimentationProvider` seam (Optimizely first; VWO/others slot in).
- Production promotion builds an `OptimizelyClient` from the **brand config** and creates a **paused draft** experiment pinned to the version, shipping the version's compiled overlay as custom code. Env-var path (`OPTIMIZELY_API_TOKEN`/`OPTIMIZELY_PROJECT_ID`) kept only as CLI/legacy fallback.
- **Safety rail:** experiments are created paused/draft only — a human starts them. The console NEVER turns on production traffic.
- Prep project `24138040550` (prep.outrigger.com) · Prod `21089662478` (www.outrigger.com).

## Git (two-repo model)

- **Feature repo** (deploy): prototypes live as `prototype/<key>` branches → per-branch Vercel preview. `deployOverlayToGit` commits the compiled variation + overlay as one commit and **auto-cuts a version**; "Pin latest from repo" resolves the branch HEAD.
- **Source repo** (integrate): the brand's production source (Outrigger = Azure DevOps, **READ-ONLY**). Winners go back as a reviewed **PR via handoff** — never an automated push. (Source read-on-demand via provider API is designed but not yet built — see the source-control discussion.)

## Hard rules (invariants)

- **Never hardcode a brand or site.** Everything is per-tenant/per-site config from the store.
- **`~/Projects/Outrigger_Website` (Azure DevOps clone) is READ-ONLY.** Pull only; never push/commit/modify.
- **Snapshots are immutable** (PageVersion never edited; re-capture = new version). **ArtifactVersions are immutable** (append-only; carry a fixed code snapshot).
- **Brand-level config, not env vars** for new integrations (Optimizely token/project live on the org).
- **Schema changes go through `ddl()`** (race-safe).
- **Vercel deploys of cloned pages are protected** (password + noindex + robots deny) — brand clones must never be publicly crawlable.
- **Serverless constraints:** no writable FS (use the store), no `curl` (best-effort asset mirror; WAF TLS-blocks Node fetch for outrigger.com), 300s max on capture.

## Build order — current state (2026-07)

- ✅ Capture pipeline · Console UI · Auth
- ✅ **Multi-tenancy** — Brand (Org) → Sites, members + isolation, Customers management
- ✅ **ContentStore** — hosted content on Neon (was local-first)
- ✅ **Environments** · **brand-level Optimizely** · **immutable ArtifactVersions** (git-auto-pin + code snapshot)
- ✅ **Overlay authoring** → loader (staging) + Optimizely (production)
- ✅ **Promotion** + governance + audit · **git deploy for prototypes**
- ✅ **Prototype-driven IA** · full CRUD (sites/pages/prototypes; re-sync pages)
- ⏳ **Source-control read-on-demand** (Azure DevOps + GitHub source providers) → hosted, always-current handoff
- ⏳ Multi-URL Optimizely targeting · version-pinned staging injection · prep CSP verification

## Environment variables

| Var | For |
|---|---|
| `DATABASE_URL` | Neon (hosted store) — absent → local filesystem |
| `AUTH_SECRET` / `ADMIN_EMAILS` / `ADMIN_LOGIN_SECRET` | auth |
| `FIRECRAWL_API_KEY` | capture |
| `GITHUB_TOKEN` | git deploy / auto-pin / source reads |
| `OPTIMIZELY_API_TOKEN` / `OPTIMIZELY_PROJECT_ID` | legacy/CLI fallback (brand config preferred) |

Claude never enters credentials — the user pastes them into Vercel / the app's Brand settings.

## Docs

| Doc | For |
|---|---|
| [`docs/LIFECYCLE-ARCHITECTURE.md`](docs/LIFECYCLE-ARCHITECTURE.md) | the locked lifecycle model (read first) |
| [`docs/CONSOLE-UI-SPEC.md`](docs/CONSOLE-UI-SPEC.md) | UI spec |
| [`docs/HANDOFF.md`](docs/HANDOFF.md) | handoff engine |
| [`docs/EXPERIMENT-INTEGRATION.md`](docs/EXPERIMENT-INTEGRATION.md) | experiment binding/drift |
| [`docs/PRODUCT-ROADMAP.md`](docs/PRODUCT-ROADMAP.md) | product positioning + roadmap |
