# HANDOFF — Current State & Continuity

*Updated: 2026-07-23. Read AGENTS.md first (model + rules), then this (state + next moves). Debugging? `docs/RUNBOOK.md`.*

## Where we are (2026-07-23)

**A prototype went end-to-end for the first time.** `room-detail-overlay` (Outrigger, rooms-suites page) was authored by a Claude instance in the prototypes repo, is built and pushed, and is verified serving live off branch HEAD. Remaining on it: cut a version → Optimizely bundle.

### Shipped today

- **Provisioning derivations** (`lib/prototypes/derive.ts`) — per-target `data.md` (embedded data globals + DOM↔data join keys) and `design-tokens.md` (fonts, custom properties, overlay z-index ladder). `context.json` gained `referenceRepos` + `fonts`.
- **Loader truth** — `lib/prototypes/served.ts` (the 20s cache, now introspectable) and tokenless `GET /api/loader/status?key=`: served vs head commit, cache lag, `artifactProblem`. Loader payload carries `commit`.
- **First-provision `dist/` reset** so a fresh branch stops serving the inherited `starter` build.
- **GitHub token diagnosis** — `friendlyGitError()`, `canCreateBranch()` (bogus-SHA write probe), and a write indicator on Settings → Repositories. `GET /repos` `permissions.push` is NOT trustworthy for fine-grained PATs.
- **Skill library** (`/skills`, `lib/skills/`) — three tiers, full descriptions, in-app reader, built-ins seeded.
- **Ideas channel** (`/ideas`, `lib/ideas/`) — prototype instances POST improvements back via the org API token.
- **Init script** — required local-folder path (explicit Save + confirmation) and optional website-source checkout, symlinked into the clone as `source-site/`.
- **Repositories UI** simplified — role checkboxes / provider dropdown / advanced fields removed; added a Reference source tile.
- **`starter` branch** (`INHQInc/outrigger-prototypes`) — generalized font proxy (proxies stylesheets incl. CDN, rewrites font URLs; fixes CORS serif fallback), `?clean=1`, `PORT=`, `.claude/launch.json`, rewritten SKILL.md (empty-brief protocol, data-first, brand-fidelity, definition-of-done), flat hard rules in CLAUDE.md.

### Not wired yet (next moves)

1. **Skill delivery** — the library exists but selection UI + provision writing `.claude/skills/**` into the branch is not built. Until then `starter` still ships only `opmc-prototype`, so "choose which skills" has no effect. Note: skills on `starter` are inherited by every fork, so selection requires either provision removing unselected ones or the library becoming the only source.
2. **Cut a version** on `room-detail-overlay` → Optimizely bundle (the original goal).
3. **Reference source** not yet registered for Outrigger (Settings → Repositories → Reference source), so `referenceRepos` is empty in provisioned context.
4. **Ship/handoff layer is not portable** — `lib/sites.ts` + the patch generator encode Outrigger's CMS layout. Every new customer needs that rewritten; the build/preview layer is generic.

## Known-good state

- `INHQInc/outrigger-prototypes` — private. Branches: `main`, `starter`, `prototype/room-detail-overlay`, `prototype/favorites`, `prototype/trip-planner`.
- Outrigger GitHub connection: fine-grained PAT, write verified against the prototypes repo.
- Prototype `room-detail-overlay` serving from repo HEAD, `artifactProblem: null`, no version cut.

---

<!-- Historical detail below this line is retained for context; treat anything above as current. -->

## What the product is now

Multi-tenant **build-and-ship layer for web experiments**: author advanced prototypes in a repo (with Claude), review them **injected on the customer's real lower environment** via our loader, promote immutable versions, graduate winners into **paused Optimizely experiments**, ship via handoff. Live customer: OUTRIGGER (site key `prep-outrigger`, prep.outrigger.com).

## WIZARD + BRANCH PROVISIONING (built 2026-07-21, user-approved boundary reversal)

The console now **provisions the prototype's git branch** so `clone + claude` is build-ready with **zero token**. Model settled over several turns:
- **Loop decision (empirically proven):** design iteration happens on a **local asset-rewritten proxy** (dev.mjs curls the page + injects `<base href="prep">` so the REAL css/js/fonts load — near-pixel-perfect, instant reload). Proven: raw Firecrawl HTML renders as a black void (main.css is root-relative → 404s locally); one `<base>` tag → the real page. The Firecrawl snapshot is the *map* (offline selectors), the proxy is the *canvas*, prep `?opmc` is the *truth* (behavior + others' QA). **dev.mjs `<base>` upgrade is still TODO on the starter repo.**
- **Directory boundary (the load-bearing rule):** the console authors ONLY `.opmc/**`; Claude authors ONLY `src/**` + `dist/variation.js`. Disjoint trees → never clobber; ship-PR filter = "drop `.opmc/`".
- **Wizard** (`/prototypes/new`, `PrototypeWizard.tsx`): 4 steps — Target (name+pages) → The change (what/where/success-in-words) → Guardrails (constraints/reference, optional) → Review→Create. No mockups (design iterates with Claude); captures INTENT not a visual spec. `PrototypeBrief` gained `where/constraints/reference`. NewPrototype is now a link to it.
- **Provisioning** (`src/lib/prototypes/provision.ts`, `POST /api/prototypes/provision`, `ProvisionButton` on Setup tab): forks branch off starter if absent → Firecrawl-captures each target (`captureRawHtml` = scrape+sanitize, WAF-bypassing) → derives `skeleton.html` + `selectors.md` (cheerio; flags the page's hashed classes do-not-use) → renders `.opmc/brief.md` + `.opmc/context.json` (carries consoleUrl, NEVER the token) + per-target `page.html`/`meta.json` → commits ONLY `.opmc/**` as ONE **compare-and-swap** commit (`commitFiles` gained `force?` — provisioning passes `force:false`, re-reads HEAD, retries once → can NEVER rewind Claude's pushes). Idempotent (contentHash no-op), capture-failure degrades gracefully (brief still commits), session-only (read-scoped token can't provision), audited (`prototype.provision`/`prototype.resync`).
- **starter repo changes (live via gh):** added `.gitignore` (was missing — .env safety); SKILL.md step 1 is now **tree-first** (read `.opmc/context.json`+`brief.md`+`targets/**` from the tree, no token; API pull demoted to a token'd freshness/drift check; NEVER write `.opmc/`).
- **Dependency:** snapshots need `FIRECRAWL_API_KEY` set in Vercel (the pipeline predates this — `src/lib/capture/capture.ts`). Without it, provisioning still commits the brief+context; `meta.json` marks `captureOk:false`.
- **NEXT in the roadmap (user-sequenced):** discuss the deploy/handoff methods. Two of three already exist — **inject-into-live** (loader ✓) and **Opti experiment** (promote → paused draft ✓). The net-new one is **HANDOFF → integrate into the site's source code** ("local compute, hosted record": Claude generates the production diff locally against the read-only Outrigger_Website clone → console stores/reviews → PR; ADO connector parked).

## Verified live (do not re-litigate)

- **Loader is deployed on prep.outrigger.com** (tag in CMS, republished). Full chain proven in-browser: script loads (**prep has NO CSP**), reads `?opmc=<key>`, fetches `/api/loader` cross-origin (200/CORS), **injects into the live DOM** (proven with the legacy trip-planner overlay: `script[data-opmc]`, `#opmc-<key>-css`, `[data-opmc-<key>-block-0]` markers). Inert without the token.
- Loader tag (canonical public domain — the team-scoped `…-bryan-hopkins-projects` URL is Vercel-SSO-blocked, never use it for the tag):
  `<script src="https://outrigger-prototype-management-cons.vercel.app/loader/prep-outrigger" async></script>`
- Optimizely brand connection works (9 projects listed; default = Outrigger Prep `24138040550`).
- Git deploys to `INHQInc/outrigger-prototypes` work (Git Data API, one commit per bundle).

## SITES ARE GONE (e556c3a)

Customer → Environments → Prototypes. /environments (Configuration) = env CRUD + per-env loader tag + heartbeat status. Prototype stub = Name (+ optional targets, env URLs suggested). All guards/promotions/git-client resolution run on prototype.orgId (lazy back-fill). Deleted: /sites tree, /api/sites, AddSite*/SiteActions/SiteTabs/DeleteSite/EnvironmentsManager/LoaderSnippet/PagesTable/PageRowActions/AddPages. Pages/capture UI cut (data + /pages,/snap*,/features legacy routes remain). Environment "kind" editing still queued (prep env is kind=production from the old origin-seed; label/kind edit UI not built).

## WALKTHROUGH STATE (user live-tested the flow 07-21)

- User's pushback shaped the flow, now built: **capture is free, execution is guided, nothing discovered by error.** Dashboard leads with a sequenced **Customer setup checklist** (Add environment → Connect GitHub → Register prototype repo → Connect Optimizely+project → Install loader tag — SELF-VERIFYING: the loader beacons /api/loader/heartbeat once per browser session (sendBeacon, public route, flag `loader:seen:<envId>`, legacy `<siteKey>` still matched); checklist auto-completes on first beacon (manual "Mark installed" remains as fallback); /environments shows "Loader verified · last seen Xm ago"). Hides at 5/5. Needs-attention = operational alerts only.
- Prototype now has its OWN setup checklist (Setup tab) → generates the same clone/branch/`claude` command block at 4/4. Build tab holds code location (branch-missing → "Get started" block in SourcePanel). ALL branch/repo fields everywhere are GitHub-fed dropdowns — no typed git fields remain.
- Current live state: GitHub **Connected · INHQInc**; API-access tile live; **registry still EMPTY** (register `INHQInc/outrigger-prototypes` — checklist step 3); prototype **"Room Overlays"** (`room-overlays`) has NO repo attached (attach via its Build tab post-registration). Loader installed on prep → heartbeat will auto-verify checklist step 5 on first page view after deploy.
- Rejected by user (do not rebuild): hard-gating stub creation on setup; console writing READMEs/commands into the repo; skill prompting for a local folder.

## IN FLIGHT: Favorites — first real end-to-end prototype

1. DONE — code extracted from the standalone demo (`INHQInc/outriggerprojects` → `outrigger-demo-2/favorites.{js,css}`) and adapted for live injection (demo nav/logo-rewrite stripped, `inte.outrigger.com` → same-origin, corals webp inlined, view-all → tray, late-injection retry, **global-scope** execution for 50 inline onclick handlers).
2. DONE — pushed: branch **`prototype/favorites`** on `INHQInc/outrigger-prototypes` with **`dist/variation.js`** (200KB, self-contained) + `src/` + `build.mjs` (rebuild: `node build.mjs`).
3. TODO (user, in the app) — Settings → Repositories: connect GitHub (env fallback also works) and **register `INHQInc/outrigger-prototypes`** (registry is currently EMPTY — this blocks everything); then on a prototype (e.g. "Room Overlays") **Build tab** → pick the repo, branch `prototype/favorites` (or stub a new prototype named **Favorites** → key `favorites` matches the branch by convention).
4. TODO — **Build tab** shows "✓ Built variation present" → **Cut version from repo** → open `https://prep.outrigger.com/hawaii/oahu/outrigger-reef-waikiki-beach-resort/rooms-suites?opmc=favorites` → Claude verifies injection in the browser (hearts on room-card sliders, tray on the native Trip Planner header button).

## Core model (docs/LIFECYCLE-ARCHITECTURE.md is canonical)

- **Repo = the code.** Prototype code is built in its repo branch and committed as a self-contained `dist/variation.js` (does its OWN DOM targeting/selectors). **The console pulls it — it never authors or pushes code.** (`resolveRepoSource` → branch HEAD artifact; loader serves repo HEAD (20s cache) → latest cut version's frozen code → legacy feature fallback.)
- **Console = lifecycle**: stub → version (immutable, SHA-pinned, carries its code snapshot) → promote (append-only, per-env, staging=loader / production=paused Optimizely draft via the brand connection) → ship. Audit trail on everything.
- **Pipeline is a map, not a track** — every step skippable; promote auto-nudges stage forward, manual stage select always available.
- **Local dev** = repo dev-harness concern (clone a page locally or proxy the lower env), never a console feature. Clones/capture in the console are legacy/optional (Pages tab).

## Current IA (all recent, user-driven)

- **Nav:** WORK (Dashboard `/` · Prototypes `/prototypes` · Handoff) · CONFIGURATION (Environments `/environments`) · SETTINGS (Experimentation · Repositories · Users=/settings/members · Activity) · OPERATOR (Customers · Console users). Customer switcher top; "Settings" entry in its dropdown.
- **Dashboard `/`** = default landing: Needs-attention (no sites / GitHub not connected / no repo registered / Opti not connected / no default project / failed promotions — each links to the fix), stage counts, active prototypes, live-on-environments, recent activity.
- **Prototype workspace** `/prototypes/[key]` — 5 real-route tabs, setup-driven (reworked 07-21 per user: "each proto needs a dashboard + tabs, like the org 1-2-3-4 checklist"):
  - **Setup** (default): `PrototypeSetup` — a **"Ready to build" checklist** (mirrors org SetupChecklist) computed by `src/lib/prototypes/setup.ts`: (1) code location, (2) **build brief** [the thing Claude's skill reads — was the missing piece], (3) test pages, (4) injection-script-live-on-env (heartbeat). Inline build-brief editor (problem/change/done → PATCH brief). When 4/4 → **auto-generated copy-paste command block** (env exports → clone → `git checkout -b <branch> origin/starter` → `claude`) + build status (from resolveRepoSource).
  - **Pages**: `TargetPages` — add/remove many target URLs; each row = Open ↗ (`?opmc` pre-set) + Copy link + **live red/green injection check** via `GET /api/prototypes/check-injection?key=&url=` (SSRF-guarded server-fetch for the `/loader/<key>` `<script>`; falls back to env heartbeat when the site blocks bots). Top of tab: per-env loader tag + "place once in the site template" instructions.
  - **Build**: `RepoBranchSettings` (code location, registry+GitHub-fed dropdowns) + `SourcePanel` (built-variation status, Cut version from repo, version history).
  - **Experiment**: `PromotePanel` (Send to Optimizely → paused draft; matrix+history disclosure).
  - **Settings**: `DetailsEditor` (slimmed to hypothesis/metrics/owner/ticket — the experiment definition; brief+targets removed, now owned by Setup+Pages) + `DeletePrototype`.
  - Stage = `StageSelect` dropdown in the header (resyncs with server stage; surfaces PATCH errors). Old Pipeline/Details tabs, PipelineHeader, ArtifactVersions, PreviewPanel — deleted.
- **Creation is a minimal stub**: Name (+ optional target URLs, environment URLs suggested); default prototypes-repo auto-attaches server-side (`prototype/<key>`); everything else edited later.
- **Connectors (Optimizely pattern everywhere):** per-customer **GitHub connection** (validated via /user, stored server-side, env `GITHUB_TOKEN` = console-default fallback) → **repo registry** (roles: `prototypes`|`source`; providers github/azure-devops/external; per-role defaults; prototypes-role must be GitHub) → **prototype picks repo+branch** (selection-only UI; errors link to Settings → Repositories). Optimizely: brand token + default project (explicit Save), service-account guidance on tile; **paused drafts only, ever**.

## Gotchas / rules for future sessions

- **User runs `git push`** — the agent's push is blocked by the environment classifier. Always hand them the command; verify deploys after via Vercel MCP (`get_runtime_errors`, `list_deployments`) — project `prj_k2NQb2qYTAN2rlgHwW7D4KLOIONx`, team `team_VYlQ8CLTxGgRpafO8hbu5Gmz`.
- **Schema changes only via the race-safe `ddl()`** in store-neon (catalog-race 23505). Neon auto-migrates on first request.
- **Any fetch of a caller-supplied URL MUST go through `safeFetchPage()`** (`src/lib/net/safe-fetch.ts`) — SSRF-hardened (DNS-resolve + private-IP reject + IP-pin against rebinding + no redirect follow). `/api/prototypes/check-injection` uses it. Never hand-roll a string-only host check (a 3-pass review proved that class of guard is bypassable via public-name→private-IP, redirects, and bracketed IPv6).
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
