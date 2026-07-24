# Claude Context Guide — OUTRIGGER Prototype Management Console

*Last updated: 2026-07-24 (pipeline + program board + gates + AI brief composer; 07-23: skills library, ideas channel, provisioning derivations, loader status)*

> **Read first:** [`docs/LIFECYCLE-ARCHITECTURE.md`](docs/LIFECYCLE-ARCHITECTURE.md) (locked lifecycle model) then [`docs/HANDOFF.md`](docs/HANDOFF.md) (**current state, in-flight work — authoritative for "where are we"**). Touching ANY UI? [`docs/DESIGN-PRINCIPLES.md`](docs/DESIGN-PRINCIPLES.md) first — say-it-once, one card grammar, rooms-not-steps; every rule there is a past user correction.
>
> **Debugging anything?** [`docs/RUNBOOK.md`](docs/RUNBOOK.md) — every failure mode that has cost real time (token scopes, stale artifacts, CORS fonts, cache lag) with the check that settles it. Read it BEFORE theorising about a bug.

## Seeing live state (never assume it from these docs)

Prototypes, customers, environments and versions are **database state**. Any list written into a doc is wrong within a day — this file has been stale before. Look it up:

| Question | How |
|---|---|
| What's actually being served for a prototype? | `GET /api/loader/status?key=<key>` — tokenless; served vs head commit, cache lag, artifact problems |
| Does the build exist at HEAD? | `GET /api/prototypes/source?key=<key>` |
| Which customers / environments / prototypes exist? | the store: `listOrgs()`, `listOrgEnvironments(orgId)`, `store.listPrototypes()` — or just open the console |
| Can the token do what I'm asking? | the write probe on Settings → Repositories (`probeRepoWrite`) |

**Live truth beats this document.** If they disagree, the system is right.

## What This Is

A **multi-tenant "build-and-ship layer"** for advanced web experiments — the piece the experimentation platforms (Optimizely, VWO) are weakest at: **authoring prototypes beyond the visual-editor ceiling**, previewing/getting them approved, running them as experiments, and **codifying the winner back into production source**. The operator is an agency running experiments for multiple **customer brands**.

**Repo:** `INHQInc/OUTRIGGER-Prototype-Management-Consol` (GitHub) · **Stack:** Next.js 16 (App Router, TS, Tailwind 4) on Vercel · Neon (hosted) / filesystem (local).

## Domain model (current)

```
THREE NOUNS ONLY — Customer (who) · Environment (where) · Prototype (what).
There is NO Site entity anymore (eliminated 07-21; legacy data self-heals).

Customer (Org)   ← tenant; cookie opmc_org; per-customer CONNECTORS:
 ├─ GitHub connection (env GITHUB_TOKEN = console-default fallback)
 ├─ Repo registry (roles prototypes|source; providers github/azure-devops/external; per-role defaults)
 ├─ Optimizely connection (token + default project; paused drafts only)
 ├─ Environments  ← WHERE: {orgId, url, kind dev|staging|production, label}; each carries its
 │    own loader tag (/loader/<id>) + heartbeat verification (loader:seen:* flags)
 └─ Prototypes  ← WHAT: {orgId, targets[url, live|clone], repo ref, stage draft→review→live→shipped→archived}
      ├─ minimal stub = Name (+ optional target URLs; env URLs suggested); repo auto-attaches from registry default
      ├─ CODE LIVES IN THE REPO: self-contained dist/variation.js at branch HEAD; console PULLS, never authors
      ├─ ArtifactVersions (immutable, SHA-pinned, carry the code snapshot)
      └─ Promotions (version → environment; append-only, governed, audited)

Legacy (kept compiling, no UI, don't expand): lib/sites.ts + site store rows, Pages/capture
(/pages, /snap*, /api/{pages,capture,discover}), /features + file-based features, repo_binding.
Lazy migrations: env.orgId adopted from its old site's org on first listOrgEnvironments; prototype
orgId back-filled via prototypes/org.ts resolver. Old loader tags (/loader/<siteKey>) keep working.
```

- **IA:** Dashboard (`/`, default landing: setup checklist → needs-attention/pipeline/live-where/activity) · Prototypes board (`/prototypes`) · workspace `/prototypes/[key]` tabs Pipeline/Details/Settings · Configuration → **Environments** (`/environments`) · Settings section (Experimentation/Repositories/Users/Activity). See HANDOFF for full nav.
- **Canvas: live-injection-first.** Review = the real lower env via the token-gated loader (`?opmc=<key>`) — VERIFIED WORKING on prep.outrigger.com (no CSP there). Clones/local = repo dev-harness concern or legacy Pages, never required.

## The four lifecycle principles (see LIFECYCLE-ARCHITECTURE.md)

1. **Build once, promote immutably** — a version pins a git SHA and carries its compiled code snapshot; the same bytes move staging→production.
2. **Decouple deploy from release** — exposure via flag/experiment; production promotion = a PAUSED Optimizely draft (no traffic).
3. **Govern every gate** — role-checked promotions + append-only audit trail (Brand settings → Activity).
4. **Trace end-to-end** — hypothesis → commit → experiment → shipped PR.

**Integrate, don't duplicate** — never rebuild Optimizely's stats engine / flags / targeting. Promote *into* their platform.

## Persistence — ContentStore seam

`getContentStore()` picks the backend by `DATABASE_URL` (mirrors the auth store):
- **Neon** (hosted): tables `org, org_member, site, environment, git_connection, org_repo, page_version, asset, repo_binding (legacy), prototype, prototype_overlay (orphaned), artifact_version, promotion, audit_event, experimentation_config, content_meta`.
- **Filesystem** (local, no `DATABASE_URL`): `snapshots/` tree + `_*.json` maps.

Schema **auto-migrates** on first request via a **race-safe `ddl()` helper** (create-if-not-exists / alter-add-column-if-not-exists, swallowing duplicate-object races 23505/42P07/42710). Do NOT do bare `create table if not exists` outside `ddl()` — concurrent cold starts collide on `pg_catalog`.

## Optimizely (Web Experimentation)

- **Brand-level connection** (Brand settings → Experimentation): the customer's PAT + selected project, stored server-side, **never returned to the client**. Pluggable `ExperimentationProvider` seam (Optimizely first; VWO/others slot in).
- Production promotion builds an `OptimizelyClient` from the **brand config** and creates a **paused draft** experiment pinned to the version, shipping the version's compiled overlay as custom code. Env-var path (`OPTIMIZELY_API_TOKEN`/`OPTIMIZELY_PROJECT_ID`) kept only as CLI/legacy fallback.
- **Safety rail:** experiments are created paused/draft only — a human starts them. The console NEVER turns on production traffic.
- Prep project `24138040550` (prep.outrigger.com) · Prod `21089662478` (www.outrigger.com).

## Git (connector → registry → prototype)

- Per-customer **GitHub connection** (`getGitClientForOrg`; env `GITHUB_TOKEN` = console-default fallback) feeds the **repo registry** (roles `prototypes`|`source`, providers github/azure-devops/external, per-role defaults). Each **prototype picks repo + branch** (`prototype/<key>` by convention); `resolveRepoSource` pulls the built `dist/variation.js` at branch HEAD. Console reads code; it never writes it.
- **Source role** = the brand's production codebase (Outrigger = Azure DevOps, **READ-ONLY**, `external` provider). Winners ship as a reviewed PR (GitHub sources) or a handoff bundle (external) — never an automated push. Ship step + source read-on-demand not built yet.

## Skills + ideas (2026-07-23)

- **Skill library** (`lib/skills/`, `/skills`) — the instructions prototype-building Claude instances load, in three tiers: `global` (generic) · `brand` (one customer) · `prototype` (one build). Effective set = global + brand + own, **default-on**; once a selection is stored it's explicit, so adding a global skill can't retroactively change in-flight prototypes. Built-ins in `lib/skills/builtins.ts` (`opmc-system`, `opmc-ideas`); `opmc-prototype` seeds from the prototypes repo's `starter` branch. Delivery into `.claude/skills/**` on the branch is **not wired yet**.
- **Ideas** (`lib/ideas/`, `/ideas`) — prototype-building instances POST improvements back via `/api/ideas` using the org API token (`guardPrototypeAccess`). Triage inbox: new/planned/done/declined.
- **This repo's own skills** live in `.claude/skills/` — `opmc-prototype-triage`, `opmc-skill-authoring`.

## Provisioning derivations (2026-07-23)

`lib/prototypes/derive.ts` runs at capture and writes, per target:
- **`data.md`** — embedded JSON data globals (shape + sample) and inferred DOM↔data join keys. CMS pages embed their data, so this is static parsing — no headless browser.
- **`design-tokens.md`** — `@font-face`, CSS custom properties, overlay z-index ladder, pulled from the page's own stylesheets (same-origin **and** CDN).

`context.json` also carries `referenceRepos` (read-only production source: identity + notes only — the local path is machine-specific and lives in the init command) and `fonts`.

## Loader truth (2026-07-23)

`lib/prototypes/served.ts` holds the loader's 20s cache and makes it introspectable. `GET /api/loader/status?key=` reports `served` vs `head` commit, `cacheAgeMs`, `stale`, `staleForMs`, and `artifactProblem` (`starter-build` | `placeholder`). The loader payload now carries `commit` so what's served self-identifies.

## The pipeline & program board (2026-07-24)

- **One vocabulary, one derivation**: `lib/prototypes/pipeline.ts` → Brief · Build · Review · Launch · Testing · Shipped, computed from stored truth (provision flag, artifactProblem, injection verifications, cut-vs-HEAD, certification, push read-back, live experiment status). The workspace stepper (`PipelineHeader` + StepCards), the program board, the list view, and dashboard alerts ALL render this one function — never invent a second status dialect.
- **First-gate rule**: position holds at the first blocked gate (missing brief, failed certification). Requirements block; they never teleport position backwards.
- **The brief is the gate**: `provisionBranch()` and `pushToOptimizely()` both refuse without `brief.change`. No brief → no build → no launch.
- **Program board** (`/prototypes`, Board|List tabs via `?view=`): columns derived (`lib/prototypes/board.ts`), Testing locked by LIVE Optimizely status, drag only where judgment lives (priority reorder; Launch→Shipped), wrong drags bounce with the reason. `board-model.ts` is the client-safe module — value imports from `board.ts` in client components pull the server graph and break the build.
- **Ship rails** (`lib/prototypes/ship.ts`): certification gates the push (recorded override only); a RUNNING experiment refuses pushes (pause in Optimizely = the sign-off); read-back verifies every push byte-for-byte.

## The console's API-side Claude (2026-07-24)

- **Draft-with-AI brief composer**: `BriefComposer` → `POST /api/prototypes/brief-draft` → `lib/ai/brief.ts` (`@anthropic-ai/sdk`, `claude-opus-4-8`, forced-tool structured output). Read view renders the brief as a document; acceptance criteria are an array.
- **Skill `delivery` scopes**: `"branch"` (default — materialized into prototype repos) vs `"console"` (system prompt for API-side Claude, never delivered to branches). `opmc-brief-author` is the first console skill — edit it in /skills and the drafting behavior follows. One library initializes every Claude in the product.
- Requires `ANTHROPIC_API_KEY` (Vercel env; set 2026-07-24). Env vars only apply to NEW deployments — see RUNBOOK.

## Hard rules (invariants)

- **Never hardcode a brand or site.** Everything is per-tenant/per-site config from the store. (Known debt: `lib/sites.ts` and the handoff patch generator still encode Outrigger specifics — the *ship* layer is not yet portable.)
- **Never trust `GET /repos` `permissions.push`** for a fine-grained PAT — it reflects the account's role, not the token's grant. Use `canCreateBranch()` (bogus-SHA probe: 403 = no write, 422 = write).
- **`~/Projects/Outrigger_Website` (Azure DevOps clone) is READ-ONLY.** Pull only; never push/commit/modify.
- **Snapshots are immutable** (PageVersion never edited; re-capture = new version). **ArtifactVersions are immutable** (append-only; carry a fixed code snapshot).
- **Brand-level config, not env vars** for new integrations (Optimizely token/project live on the org).
- **Schema changes go through `ddl()`** (race-safe).
- **Vercel deploys of cloned pages are protected** (password + noindex + robots deny) — brand clones must never be publicly crawlable.
- **Serverless constraints:** no writable FS (use the store), no `curl` binary, 300s max on capture. NOTE: plain Node `fetch` with a browser UA DOES reach prep.outrigger.com from Vercel (verified in prod — derive.ts fetches its CSS + SSR HTML this way). Firecrawl is still needed for a RENDERED snapshot (JS executed); raw `fetch` gets the SSR HTML, which is where embedded data islands live.

## Build order — current state (2026-07)

- ✅ Capture pipeline · Console UI · Auth
- ✅ **Multi-tenancy** — Brand (Org) → Sites, members + isolation, Customers management
- ✅ **ContentStore** — hosted content on Neon (was local-first)
- ✅ **Environments** · **brand-level Optimizely** · **immutable ArtifactVersions** (git-auto-pin + code snapshot)
- ✅ **Repo-sourced variations** (overlay editor removed) → loader (verified on prep) + Optimizely (production)
- ✅ **Promotion** + governance + audit · per-customer **GitHub connector** + repo registry (roles/providers)
- ✅ **Dashboard** (setup checklist + get-started commands) · prototype-first IA · workspace tabs · minimal stub
- ✅ **Sites ELIMINATED** — Customer→Environments→Prototypes; per-env loader tag + heartbeat self-verification
- ✅ **Claude Code skill** (prototypes repo `starter` branch) + per-customer console API token (OPMC_URL/OPMC_API_TOKEN)
- ⏳ Favorites E2E (see HANDOFF "IN FLIGHT") · starter repo scaffold · Ship step (PR/handoff via source-role repo)
- ⏳ Source read-on-demand (Azure DevOps) · env editing · multi-URL Opti targeting · version-pinned loader

## Environment variables

| Var | For |
|---|---|
| `DATABASE_URL` | Neon (hosted store) — absent → local filesystem |
| `AUTH_SECRET` / `ADMIN_EMAILS` / `ADMIN_LOGIN_SECRET` | auth |
| `FIRECRAWL_API_KEY` | capture |
| `GITHUB_TOKEN` | git deploy / auto-pin / source reads |
| `OPTIMIZELY_API_TOKEN` / `OPTIMIZELY_PROJECT_ID` | legacy/CLI fallback (brand config preferred) |
| `ANTHROPIC_API_KEY` | the console's API-side Claude (brief drafting) |

Claude never enters credentials — the user pastes them into Vercel / the app's Brand settings.

## Docs

| Doc | For |
|---|---|
| [`docs/LIFECYCLE-ARCHITECTURE.md`](docs/LIFECYCLE-ARCHITECTURE.md) | the locked lifecycle model (read first) |
| [`docs/DESIGN-PRINCIPLES.md`](docs/DESIGN-PRINCIPLES.md) | **UI layout laws — read before touching any screen** |
| [`docs/CONSOLE-UI-SPEC.md`](docs/CONSOLE-UI-SPEC.md) | UI spec |
| [`docs/HANDOFF.md`](docs/HANDOFF.md) | CURRENT STATE + in-flight work (read on session start) |
| [`docs/EXPERIMENT-INTEGRATION.md`](docs/EXPERIMENT-INTEGRATION.md) | experiment binding/drift |
| [`docs/PRODUCT-ROADMAP.md`](docs/PRODUCT-ROADMAP.md) | product positioning + roadmap |
| [`docs/RUNBOOK.md`](docs/RUNBOOK.md) | **failure modes + diagnosis — read before debugging** |
