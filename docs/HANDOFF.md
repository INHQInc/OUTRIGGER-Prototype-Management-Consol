# HANDOFF — Current State & Continuity

*Updated: 2026-07-21 late (post Sites-elimination). Read AGENTS.md first (model + rules), then this (state + next moves).*

## ⚠ UNPUSHED + UNVERIFIED (handle first)

- Unpushed commits at handoff: `20a8543` (loader heartbeat self-verification), `e556c3a` (**Sites elimination** — the big refactor), + docs. **User runs `git push`.**
- A 4-lens adversarial verification workflow over `9e45c4e..HEAD` was IN FLIGHT at handoff (migration/dead-refs/authz/flows). If its confirmed findings were never triaged: re-review that range (or push, then watch Vercel runtime errors and click-test: Dashboard checklist → /environments → stub → workspace → promote). Known prod data that must survive: env `prep-outrigger-production` (site_key=prep-outrigger, empty org_id → lazily adopted), prototype `room-overlays` (no orgId → lazily back-filled), heartbeat flag `loader:seen:prep-outrigger` (matched via env.siteKey).

## What the product is now

Multi-tenant **build-and-ship layer for web experiments**: author advanced prototypes in a repo (with Claude), review them **injected on the customer's real lower environment** via our loader, promote immutable versions, graduate winners into **paused Optimizely experiments**, ship via handoff. Live customer: OUTRIGGER (site key `prep-outrigger`, prep.outrigger.com).

## Verified live (do not re-litigate)

- **Loader is deployed on prep.outrigger.com** (tag in CMS, republished). Full chain proven in-browser: script loads (**prep has NO CSP**), reads `?opmc=<key>`, fetches `/api/loader` cross-origin (200/CORS), **injects into the live DOM** (proven with the legacy trip-planner overlay: `script[data-opmc]`, `#opmc-<key>-css`, `[data-opmc-<key>-block-0]` markers). Inert without the token.
- Loader tag (canonical public domain — the team-scoped `…-bryan-hopkins-projects` URL is Vercel-SSO-blocked, never use it for the tag):
  `<script src="https://outrigger-prototype-management-cons.vercel.app/loader/prep-outrigger" async></script>`
- Optimizely brand connection works (9 projects listed; default = Outrigger Prep `24138040550`).
- Git deploys to `INHQInc/outrigger-prototypes` work (Git Data API, one commit per bundle).

## SITES ARE GONE (e556c3a)

Customer → Environments → Prototypes. /environments (Configuration) = env CRUD + per-env loader tag + heartbeat status. Prototype stub = Name (+ optional targets, env URLs suggested). All guards/promotions/git-client resolution run on prototype.orgId (lazy back-fill). Deleted: /sites tree, /api/sites, AddSite*/SiteActions/SiteTabs/DeleteSite/EnvironmentsManager/LoaderSnippet/PagesTable/PageRowActions/AddPages. Pages/capture UI cut (data + /pages,/snap*,/features legacy routes remain). Environment "kind" editing still queued (prep env is kind=production from the old origin-seed; label/kind edit UI not built).

## WALKTHROUGH STATE (user live-tested the flow 07-21)

- User's pushback shaped the flow, now built: **capture is free, execution is guided, nothing discovered by error.** Dashboard leads with a sequenced **Customer setup checklist** (Add site → Connect GitHub → Register prototype repo → Connect Optimizely+project → Install loader tag — SELF-VERIFYING: the loader beacons /api/loader/heartbeat once per browser session (sendBeacon, public route, flag `loader:seen:<siteKey>`); checklist auto-completes on first beacon (manual "Mark installed" remains as fallback); site settings shows "Loader verified · last seen Xm ago"). Hides at 5/5. Needs-attention = operational alerts only.
- Source panel: branch-missing state = **"Get started" copy-paste block** (clone → `git checkout -b prototype/<key> origin/starter` → push → `claude`); no-repo error links to the prototype's Settings tab. ALL branch/repo fields everywhere are GitHub-fed dropdowns (registry Base-branch included) — no typed git fields remain.
- Current live state: GitHub **Connected · INHQInc**; API-access tile live; **registry still EMPTY** (register `INHQInc/outrigger-prototypes` — checklist step 3); prototype **"Room Overlays"** (`room-overlays`) has NO repo attached (attach via its Settings tab post-registration). Loader installed on prep → heartbeat will auto-verify checklist step 5 on first page view after deploy.
- Rejected by user (do not rebuild): hard-gating stub creation on setup; console writing READMEs/commands into the repo; skill prompting for a local folder.

## IN FLIGHT: Favorites — first real end-to-end prototype

1. DONE — code extracted from the standalone demo (`INHQInc/outriggerprojects` → `outrigger-demo-2/favorites.{js,css}`) and adapted for live injection (demo nav/logo-rewrite stripped, `inte.outrigger.com` → same-origin, corals webp inlined, view-all → tray, late-injection retry, **global-scope** execution for 50 inline onclick handlers).
2. DONE — pushed: branch **`prototype/favorites`** on `INHQInc/outrigger-prototypes` with **`dist/variation.js`** (200KB, self-contained) + `src/` + `build.mjs` (rebuild: `node build.mjs`).
3. TODO (user, in the app) — Settings → Repositories: connect GitHub (env fallback also works) and **register `INHQInc/outrigger-prototypes`** (registry is currently EMPTY — this blocks everything); then on a prototype (e.g. "Rooms Overlay") Settings → Code location → pick the repo, branch `prototype/favorites` (or stub a new prototype named **Favorites** → key `favorites` matches the branch by convention).
4. TODO — Source panel shows "✓ Built variation present" → **Cut version from repo** → open `https://prep.outrigger.com/hawaii/oahu/outrigger-reef-waikiki-beach-resort/rooms-suites?opmc=favorites` → Claude verifies injection in the browser (hearts on room-card sliders, tray on the native Trip Planner header button).

## Core model (docs/LIFECYCLE-ARCHITECTURE.md is canonical)

- **Repo = the code.** Prototype code is built in its repo branch and committed as a self-contained `dist/variation.js` (does its OWN DOM targeting/selectors). **The console pulls it — it never authors or pushes code.** (`resolveRepoSource` → branch HEAD artifact; loader serves repo HEAD (20s cache) → latest cut version's frozen code → legacy feature fallback.)
- **Console = lifecycle**: stub → version (immutable, SHA-pinned, carries its code snapshot) → promote (append-only, per-env, staging=loader / production=paused Optimizely draft via the brand connection) → ship. Audit trail on everything.
- **Pipeline is a map, not a track** — every step skippable; promote auto-nudges stage forward, manual stage select always available.
- **Local dev** = repo dev-harness concern (clone a page locally or proxy the lower env), never a console feature. Clones/capture in the console are legacy/optional (Pages tab).

## Current IA (all recent, user-driven)

- **Nav:** WORK (Dashboard `/` · Prototypes `/prototypes` · Handoff) · CONFIGURATION (Environments `/environments`) · SETTINGS (Experimentation · Repositories · Users=/settings/members · Activity) · OPERATOR (Customers · Console users). Customer switcher top; "Settings" entry in its dropdown.
- **Dashboard `/`** = default landing: Needs-attention (no sites / GitHub not connected / no repo registered / Opti not connected / no default project / failed promotions — each links to the fix), stage counts, active prototypes, live-on-environments, recent activity.
- **Prototype workspace** `/prototypes/[key]` with tabs (real routes): **Pipeline** (stepper + Build:Source/Versions + Review:token links + Promote), **Details** (editable: targets/hypothesis/metrics/brief/owner), **Settings** (Code location + delete).
- **Creation is a minimal stub**: Name (+ optional target URLs, environment URLs suggested); default prototypes-repo auto-attaches server-side (`prototype/<key>`); everything else edited later.
- **Connectors (Optimizely pattern everywhere):** per-customer **GitHub connection** (validated via /user, stored server-side, env `GITHUB_TOKEN` = console-default fallback) → **repo registry** (roles: `prototypes`|`source`; providers github/azure-devops/external; per-role defaults; prototypes-role must be GitHub) → **prototype picks repo+branch** (selection-only UI; errors link to Settings → Repositories). Optimizely: brand token + default project (explicit Save), service-account guidance on tile; **paused drafts only, ever**.

## Gotchas / rules for future sessions

- **User runs `git push`** — the agent's push is blocked by the environment classifier. Always hand them the command; verify deploys after via Vercel MCP (`get_runtime_errors`, `list_deployments`) — project `prj_k2NQb2qYTAN2rlgHwW7D4KLOIONx`, team `team_VYlQ8CLTxGgRpafO8hbu5Gmz`.
- **Schema changes only via the race-safe `ddl()`** in store-neon (catalog-race 23505). Neon auto-migrates on first request.
- **No redirects-as-patches; real routes only. No free-text where a connector can supply a picker.** UX is prototype-first — never make Sites/config the spine.
- tsc + `next build` before every commit; one concern per commit; user pushes batches.
- `gh` CLI is authed (INHQInc) for repos the fine-grained `.env.local` token can't reach.
- Legacy still present intentionally: `/features` + file-based features (trip-planner), FeatureStatus, site `mode`, per-site repo_binding (fallback), capture/Pages. Don't expand them; migrate away when touched.

## Queued next (rough priority)

1. Finish Favorites E2E (user steps above + browser verification on prep).
2. **DONE — starter branch + Claude Code skill + console API token.** `starter` branch on `INHQInc/outrigger-prototypes`: `.claude/skills/opmc-prototype/SKILL.md` (self-orients from branch → key → pulls brief via `GET $OPMC_URL/api/prototypes?key=`, knows the dist/variation.js contract, build/verify loops, cut-version POST), CLAUDE.md, `src/` template, `build.mjs` (guard+CSS+global-scope wrap), `dev.mjs` (curl-based live-page preview — Node fetch is WAF-blocked). Console: per-org API token `opmc_<orgId>_<hex>` (content_meta flag; lib/api-token.ts), bearer-gated on /api/prototypes GET(single-key)/source/versions only, middleware pass-through for `Bearer opmc_`; ApiAccessTile on Settings → Repositories ("copy as env exports": OPMC_URL/OPMC_API_TOKEN — user sets these in their shell). New-prototype dev flow: stub in app → `git checkout -b prototype/<key> origin/starter` → `claude` → skill does the rest. STILL QUEUED: "Create branch from starter" console button + push webhook (status reflection).
3. **Ship step — "local compute, hosted record" (USER-CONFIRMED MODEL).** Source access happens ONLY on the user's machine: Claude + the read-only local clone (`~/Projects/Outrigger_Website`; `git pull` for freshness) generates the handoff package (patch/diff mapping the winner onto their source). The CONSOLE never reads Azure DevOps — it stores the handoff package as an artifact (like versions) and hosts the review/compare + audit; Rightpoint receives the patch. GitHub-source customers get a PR instead. Outrigger source coordinates (reference registry entry only, provider azure-devops): `rightpoint.visualstudio.com/DefaultCollection/OUT-%20Reimagined%20Digital%20Experience%20project/_git/Outrigger_Website`.
4. **Azure DevOps connector — PARKED.** Only needed if: hosted users without a local clone must generate handoffs, automated source-drift alerts are wanted, or a customer has no local-clone operator. Design if revived: read-only client (Code:Read PAT, no write methods).
5. Environment editing (rename/kind — prep is mislabeled `production` from origin-seed); version-pinned loader serving; multi-URL Optimizely page targeting; auto-cut version on branch push (webhook).
6. GitHub App/OAuth connector + Optimizely OAuth (multi-customer polish). Custom domain for the console (loader tag stability).
7. Hygiene: user should rotate the GitHub PAT pasted in an early chat; move the Opti token to a service account (guidance now on the tile).
