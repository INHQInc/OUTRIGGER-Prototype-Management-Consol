# Claude Context Guide — Prism (OUTRIGGER prototype management console)

*Last updated: 2026-09-22 (deployment tiers; branch/preview/schema working rules; brand site-profile store landed). Previously 2026-08-06 (analytics second pass: per-version composites, the metric builder, observations + deep reads, the analyst drawer, scoped reset, Evidence; 08-04: board-page readout, verdict engine, measurement plan)*

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

### Supporting files on the brief (2026-09-17)

`brief.attachments[]` — a PDF, a spreadsheet, a content doc. Bytes go into the
content-addressed asset store (`putAsset`, the shelf evidence screenshots use)
and are committed to **`.opmc/attachments/<name>`** on the next Re-sync.

- **No server-side text extraction, deliberately.** The agent has its own tools
  for a PDF or a sheet; an extracted copy is a second version of the truth that
  goes stale the moment the file is replaced. Hand over the real file.
- **Named in `brief.md` with their note.** "Read everything in that folder" is
  the instruction that gets ignored on a busy branch. `a.note` is the one field
  here written for the agent, not the human.
- **In `contentHashOf`** (asset + filename), so adding or removing one marks the
  branch out of sync exactly as editing the brief does. They are build inputs.
- 15 MB cap — these bytes go into git and git never forgets them. Allow-list of
  types: an executable or an archive in a build input is a supply-chain problem.
- **DELETE detaches, never erases.** Content-addressed and shared: another
  prototype may hold the same file.
- `POST|GET|DELETE /api/prototypes/brief-files`. The POST writes the record
  itself, so any client holding a local brief must take the returned
  `attachments` — otherwise its next save drops the file just added.

`context.json` also carries `referenceRepos` (read-only production source: identity + notes only — the local path is machine-specific and lives in the init command) and `fonts`.

## Loader truth (2026-07-23)

`lib/prototypes/served.ts` holds the loader's 20s cache and makes it introspectable. `GET /api/loader/status?key=` reports `served` vs `head` commit, `cacheAgeMs`, `stale`, `staleForMs`, and `artifactProblem` (`starter-build` | `placeholder`). The loader payload now carries `commit` so what's served self-identifies.

## The pipeline & program board (rewritten 2026-09-17)

- **One vocabulary, one derivation**: `lib/prototypes/pipeline.ts` → Brief · Build · Review · Experimentation · Handoff, computed from stored truth (provision flag, artifactProblem, injection verifications, compiled-code comparison, certification, push read-back, live experiment status). The workspace stepper, the program board, the table, and dashboard alerts ALL render this one function — never invent a second status dialect.
- **Board columns ≠ pipeline steps.** `BOARD_COLUMNS` is Backlog · Build · Review · Experimentation · Handoff · Deployed · Archived. The first is the `brief` step relabelled — a column is a *queue*, a step is the thing you write, and the room/tab/checklist still say **Brief**. The last two are NOT steps: `derivePipeline` knows nothing about them and must not grow one. They are decided in `board.ts`.
- **ONLY THE GATE SPEAKS.** A card holds at one step; alerts anchored past that gate are filtered off the card (`GATE_ORDER` in pipeline.ts). Firing them all at once is what turned one brief edit into four tabs going orange in sequence.
- **PROVE STALENESS OR STAY QUIET.** `cutFresh`, `coverageStale` and `testCasesStale` compare the *compiled code*, never the commit. The old sha fallbacks meant re-syncing — which writes `.opmc/**` and commits without touching the variation — instantly demanded a new cut, then fresh QA. When a stored artifact predates code-hash keying we cannot know, and "cannot know" must never be reported as "stale".
- **THE DERIVED COLUMN IS A CEILING, NOT A POSITION.** The pipeline cannot tell "built" from "still being worked on". A human may park a card at or behind `derivedColumn`; the placement is stored (flag `hold:<key>`), clamped on every read so it can only pull back, evaporates if the work falls behind it, ignored while an experiment is live, and audited. Dropping a card on its derived column releases it — the release is the same gesture.
- **Drag = the moves that are decisions.** Reorder within a column (priority) · anywhere at or behind the ceiling · Experimentation → Handoff (we picked a winner, writes `status: shipped`) · Handoff → Deployed (the dev team shipped it) · anything → Archived. A refused drop names how far the facts reach and what would move it on.
- **Deployed is a claim, not an observation** (`deployed:<key>` = ISO date, `POST /api/prototypes/deployed`). Handoff is *our* decision; whether another team shipped it happens on another release train weeks later and the console cannot see it. Only reachable from Handoff, clears both ways, audited.
- **Archived is the `archived` stage, shown.** The board used to filter it out and report "N hidden". It is the exit a LOSING experiment never had. Collapsed to a 52px spine by default (it grows without bound and holds nothing that needs doing) but still takes a drop. Reopening does not guess the prior stage — that was never recorded; the pipeline re-places it.
- **Certification is loud, not a wall** (D14, one gate one place). `pushToOptimizely()` refuses an uncertified push and owns the recorded override; the Experimentation step no longer blocks as well. A failed cert is BUILD work — only the agent changes code, so "Fix and re-cut" was an instruction nobody could carry out.
- **A cut freezes code, so identical code is the same cut.** `cutArtifactVersionFromRepo` refuses a re-cut when the build has not moved (room-compare held v2/v3/v4 at one sha before this).
- **`board-model.ts` is the client-safe module** — value imports from `board.ts` in client components pull the server graph and break the build.
- **Table view** (`?view=table`): grouped by stage in pipeline order, priority then name inside a group; `Export CSV` writes 17 columns (stage, stage detail, blocked, next action, every alert, description, hypothesis, metric, guardrails, versions, experiment, locked, owner, priority, URL) for the rows currently filtered, RFC 4180 quoted, BOM-prefixed for Excel.
- **Promote carries the surface, not the story** (`/api/prototypes/promote`): the child gets its OWN branch (`prototype/<key>` — copying `parent.repo` handed it the parent's shipped branch), inherits `where` + `constraints`, and gets `problem` + `doneLooksLike` BLANK. A follow-up exists because the problem moved; inheriting the parent's problem and acceptance criteria tells the agent to rebuild the parent.
- **Ship rails** (`lib/prototypes/ship.ts`): certification gates the push (recorded override only); a RUNNING experiment refuses pushes (pause in Optimizely = the sign-off); read-back verifies every push byte-for-byte.

## The console's API-side Claude (2026-07-24)

- **Draft-with-AI brief composer**: `BriefComposer` → `POST /api/prototypes/brief-draft` → `lib/ai/brief.ts` (`@anthropic-ai/sdk`, `claude-opus-4-8`, forced-tool structured output). Read view renders the brief as a document; acceptance criteria are an array.
- **Skill `delivery` scopes**: `"branch"` (default — materialized into prototype repos) vs `"console"` (system prompt for API-side Claude, never delivered to branches). `opmc-brief-author` is the first console skill — edit it in /skills and the drafting behavior follows. One library initializes every Claude in the product.
- Requires `ANTHROPIC_API_KEY` (Vercel env; set 2026-07-24). Env vars only apply to NEW deployments — see RUNBOOK.

## Which platform built it — ground truth, never the checkbox (2026-08-06)

`buildMode: "console" | "external"` still governs the REPO machinery (provision,
cut, push, brief-drift). It must NEVER decide what the analyst reads, because it
is a checkbox someone has to remember to tick — and when it was wrong the
console handed the analyst the repo's starter stub for an Optimizely-authored
experiment, which then correctly reported that the variation changes nothing and
made every mechanism read off it worthless.

**Ask Optimizely what is actually live.** `OptimizelyClient.liveVariationBuild()`
returns the variation's custom code AND its visual-editor changes. The deep-read
path resolves in this order:

1. live custom code in Optimizely → `codeSource: "optimizely"` (what guests got)
2. no custom code but visual-editor changes → those edits ARE the build, and are
   the only thing the analyst may reason from
3. nothing in Optimizely and the prototype is console-built → the console's own
   pushed artifact → `codeSource: "console"`
4. nothing anywhere → the analyst must say the mechanism can't be read, not
   invent one

`codeSource` is part of the deep read's cache key, so a read taken from the repo
stub cannot survive once Optimizely's live code becomes available.

**`inertVariation`** is computed alongside it: code that touches no DOM API is
flagged in danger tone on the read, because either the experiment measures a
no-op or the console is looking at the wrong artifact. Both are worth
interrupting for.

## Emailed readouts (2026-08-10)

HTML email, no attachment: `window.print()` hands its PDF to the browser and
the app never sees the file, so "email the printed PDF" is not a thing that
can exist without a headless renderer. The body is built by
`lib/email/readout.ts` from the SAME resolved data the page uses — the analyst
names a metric key, the code resolves the value, here as everywhere.

- `lib/email/send.ts` — the provider seam, THREE implementations behind one
  function. **Mailgun** (`MAILGUN_API_KEY` + `MAILGUN_DOMAIN` +
  `REPORT_FROM_EMAIL`) and **Resend** (`RESEND_API_KEY` + `REPORT_FROM_EMAIL`)
  are domain senders. **Gmail over SMTP** (`GMAIL_USER` +
  `GMAIL_APP_PASSWORD`) is the fallback, and the only honest way to send FROM a
  @gmail.com address: verifying a sending domain means publishing DNS for it and
  nobody controls gmail.com's, so no HTTP provider will ever allow it.
  - **Precedence: mailgun → resend → gmail.** A provider that authenticates the
    DOMAIN can put the brand in the From line; Gmail can only ever be one
    person's personal account, because Google rewrites any other address.
  - `MAIL_PROVIDER` pins one. If the named provider isn't fully configured,
    sending is UNAVAILABLE and says which vars are missing — it never falls
    through to a different sender. A readout arriving from an address nobody
    expected is worse than one that doesn't arrive.
  - **ONE MESSAGE PER RECIPIENT on every path** — not BCC. A leadership digest
    must not publish everyone's address to everyone else, and BCC needs an
    address in the visible To: the only one available is the sender, which is
    frequently undeliverable. That is how the first readout bounced. Per-
    recipient sending keeps the list private more thoroughly than BCC and makes
    partial failure attributable to a person.
  - Mailgun is REGIONAL: a US key against the EU host returns 401 and reads
    exactly like a bad key. `MAILGUN_REGION=eu` (or `MAILGUN_BASE_URL`) names it,
    and the 401 message says so rather than leaving you to guess.
  - `activeProvider()` / `fromAddress()` are surfaced by `/api/prototypes/report`
    so the dialog shows the real sending identity instead of assuming it.
  - FAILS LOUD when none is configured: a mailer that silently no-ops reports
    "sent" to a room that received nothing.
- `lib/prototypes/report.ts` — recipients + opt-in weekly schedule per prototype
  (`report:<key>`, CAS). `lastSentAt` is the idempotence guard.
- `lib/email/report-run.ts` — ONE send path for the button and the sweep, so
  they cannot drift. Uses the CACHED reading and never generates one: a
  scheduled job that can trigger an Opus call per prototype is a job that
  quietly spends money at 6am.
- `/api/cron/reports` runs HOURLY (so a schedule can name an hour);
  `scheduleDue()` means the job can run sixty times and the report leaves once.
  One prototype's failure never stops the sweep.

## Working on this repo (branches, previews, schema)

**Branches are for preview URLs and a review point. They are NOT rollback.**
Rollback is Vercel promoting a previous immutable deployment, plus `git revert`.
Saying "we branched" and meaning "we can undo it" is how a team discovers, during
an incident, that the thing they actually needed was a deploy history.

- **One short-lived branch per stage, merged within days.** `beta-2` is the
  cautionary tale: ~20k insertions across 107 files, diverged far enough that it
  became something to read ideas from rather than something to merge. A branch
  that outlives the work stops being a branch and becomes a fork.
- **RELEASE FREEZE — do not push to `main` (decided 22 Sep 2026).** Staging is
  the build environment until the batch release NEXT WEEK; everything lands there
  first and ships to production together. `main` auto-deploys production, so a
  push to `main` is a production release whatever the commit message says — that
  is the whole reason this rule is written down rather than remembered.
  Work goes to a feature branch and to `staging`; the release candidate is
  `phase1/taxonomy-injection`. Lift this line when the release ships.
  - The push rights below still stand for every other branch. The freeze is
    about `main` only, and about timing, not trust.
- **The agent commits, pushes and merges — including to `main`.** Granted
  22 Sep 2026, replacing "you push, I don't". Do not stage a command and wait to
  be told to run it; that habit turned a day's work into a queue of round trips.
  Push, then say what was pushed and what it deploys.
  - **Before any push to `main`, run `tsc --noEmit` and the three smoke suites**
    (`vocabulary`, `brand-profile`, `outward`) and state that they passed. A push
    to `main` deploys to the console people do real customer work in, so the
    check is the price of not asking.
  - **Still stop for anything a revert cannot undo**: force-push, history
    rewrite, deleting a remote branch, dropping or truncating data. That is not
    permission-seeking — those are simply not recoverable, and the ownership
    guard exists because the schema case already bit once.
- **Docs-only changes, and additive code with no callers, go straight to `main`.**
  Wrapping a README edit in a PR buys nothing and trains everyone to skim.
- **A branch that touches `ensureSchema()` gets a database of its own** before it
  is ever deployed. See the invariant below — this is the one mistake that a
  redeploy cannot undo.

## Deployment tiers (decided 2026-09-22 — only Production exists today)

**Status: all three tiers run.** Verified 22 Sep 2026 by behaviour, not by
reading the config: each deployment CAS-writes its own claim into whatever
database it actually reaches, and `content_meta.db-owner` reads `prod`,
`staging` and `preview` on the three Neon branches respectively.

Staging is fully live — its own Neon branch, its own eight environment
variables, its own workspace-scoped `ANTHROPIC_API_KEY`, and readouts that
generate against real Optimizely data. `docs/STAGING-CHECKLIST.md` carries the
detail, including the two Vercel traps and the fact that **pushing the `staging`
branch does not deploy to the staging environment** — that needs an explicit
`target: "staging"` deployment.

An earlier version of this section said staging had never deployed and had no
`DATABASE_URL`. It was stale for half a day and would have sent a session
looking for a problem that no longer existed. Check Vercel and Neon before
believing any status written here.

| Tier | Trigger | Database | Acts on |
|---|---|---|---|
| **Production** | `main` | live Neon | real customer repos · Optimizely prod `21089662478` |
| **Staging** (persistent) | long-lived branch | own Neon branch, kept seeded | test repo · Optimizely prep `24138040550` |
| **Preview** (ephemeral) | any feature branch | one shared `preview` Neon branch, disposable | test repo · Optimizely prep |

**Why Staging exists as well as Preview.** A preview database starts EMPTY, and
everything in the brand-profile work is accumulated state — profile revisions,
corrections, earned facts. You cannot judge whether a site profile is any good
against a database with no history in it. Staging is the one non-production
console that keeps realistic data between branches.

**The database is not the biggest risk.** The console holds live credentials and
acts on other people's systems. A non-production console carrying production
tokens can create a real experiment in a customer's Optimizely project and write
to their repo, and no amount of database separation prevents that. A tier is only
separated when all three of these are:

1. **Database** — its own Neon branch.
2. **Credentials** — its own GitHub PAT, Optimizely PAT and `ANTHROPIC_API_KEY`.
   (The separate Anthropic key also gives per-tier cost attribution, which the
   console has none of today.)
3. **Blast radius** — which Optimizely project and which repo it can reach.
   Staging points at prep and must never hold a token that reaches prod.

**Naming:** never call these "environments" in code or UI. `Environment` is
already a domain noun here meaning the CUSTOMER's own dev/staging/production
websites (`listEnvironmentsByOrg`). These are *tiers* or *deployments*.

## Hard rules (invariants)

- **A preview deployment must never share the production database.**
  `ensureSchema()` runs DDL on the first request against whatever `DATABASE_URL`
  the deployment was handed, and a Vercel env var not scoped to Production only
  is handed to previews too. Set `PRISM_DB_OWNER` on production — unset is
  "legacy" and deliberately unguarded (`lib/content/db-owner.ts`) — and give each
  preview its own Neon branch.
- **Pushing `staging` does not deploy to staging.** The push builds, goes READY,
  and lands as an ordinary preview — `branchMatcher` is configured correctly and
  does not route. Only a `POST /v13/deployments` with `target: "staging"` is
  assigned the staging alias, which is the URL anyone actually opens. After
  pushing the branch, trigger the deployment and confirm the **alias**, not just
  the `target` field. Exact call in `docs/STAGING-CHECKLIST.md`. It went
  unnoticed through twelve commits on 22 Sep because every signal looked green.
- **Schema changes are additive and forward-only.** New tables, new nullable
  columns. NEVER drop or repurpose a column in the release that stops writing it;
  split it across two releases with the read removed first. Code rolls back in
  seconds and a dropped column does not roll back at all.

- **Never hardcode a brand or site.** Everything is per-tenant/per-site config
  from the store. Vocabulary comes from `lib/brand/` — `taxonomyPrompt()` for
  what to say, never a literal "guest" or "hotel". The debt is **ratcheted, not
  aspirational**: `docs/dev/vocabulary-smoke.mts` holds a per-file budget that
  may only go down, and a new file with hardcoded vocabulary fails the suite.
  (Known debt beyond that: `lib/sites.ts` and the handoff patch generator still
  encode Outrigger specifics — the *ship* layer is not yet portable.)
- **There is ONE resolver and it refuses: `requireTaxonomy()`.** It throws
  unless EVERY taxonomy field is recorded — not merely when the profile row is
  missing. `SiteProfile.taxonomy` is `Partial<Taxonomy>` by design and the merge
  used to spread the gaps from `DEFAULT_TAXONOMY`, so a profile recording only a
  visitor noun silently served "product", "convert" and "checkout" to a customer
  who had described none of them. The total resolver beside it was **deleted**
  22 Sep 2026 rather than documented: a resolver that degrades is one careless
  import away from a customer surface, and "use the strict one" is not a rule a
  file can enforce about itself. Never wrap the strict path in a try/catch —
  `vocabulary-smoke` fails if you do. `DEFAULT_TAXONOMY` is for seeding a DRAFT
  a human corrects; it is never resolved from and never served.
- **Provisioning refuses too, and BEFORE it touches git.** `provisionBranch`
  resolves the customer through `customerContextFor()` (`prototypes/customer-context.ts`)
  ahead of every git call and throws when the profile is missing or incomplete.
  A prototype writes copy onto a real page under the customer's name, so
  building it in a template's voice is the same failure as writing a readout in
  one. The gate sits before `createBranch` on purpose: refusing afterwards
  leaves a half-provisioned branch behind. An UNCHARACTERIZED section still
  ships an instruction pointing at the page's own evidence — silence reads as
  freedom, and a model with freedom and no voice description writes generic
  marketing copy.
- **A tier that enforces the profile must be SEEDED BEFORE the code that
  enforces it serves that tier.** Provisioning refuses without a brand profile
  and the content hash changed, so on an unseeded tier every prototype shows
  "Re-sync" and every Re-sync 400s — an unclearable warning on a build loop
  that cannot run. The constraint is on the DATABASE, not on a branch: no
  deployment route escapes it. It was written for readouts ("shipping the
  injection before seeding production turns every readout into an error") and
  now governs provisioning too. Staging is seeded; production is not. See the
  CUTOVER STEP at the top of `docs/HANDOFF.md` — the plan is to keep
  building on staging and cut over in one deployment with downtime, and the
  seed is step 1 of that window, before the deploy.
- **`contentHashOf(proto, brandRev)` — the second argument is required, and
  there is ONE derivation of it (`brandBasis()`).** Four surfaces compare this
  hash (provision, the prototype page, the board, `/api/prototypes/sync-status`).
  Two of them deriving it two ways means two hashes for one branch, which shows
  as a "Re-sync" warning that clicking Re-sync cannot clear. Optional would have
  let a fifth surface omit it silently; required makes TypeScript find it.
- **No generic fallback, anywhere a customer can see.** Decided 22 Sep 2026: a
  half-described customer gets NO prose rather than confident generic prose.
  Onboarding is the gate. A hardcoded specific becomes a RESOLVED specific and
  never a generic — replacing "guests who reach the booking engine" with
  "visitors who reach the checkout" is not neutrality, it is amnesia: worse for
  the customer who had it, no better for the one who did not.
- **`attribution.ts` is ownership; `brand/` is the customer's vocabulary.** Two
  different things, one word. Do not add `src/lib/brand/index.ts` — `@/lib/brand`
  resolves to the attribution file only because that directory has none, and an
  index would silently redirect both importers and drop the copyright notice off
  the readout PDF with nothing failing to compile.
- **When something is true of the design, assert it in a file, not a comment.**
  Four bugs in one day shared this shape: `code-write` declared and never called,
  the ownership guard set but never armed, `brand.ts` one `index.ts` from silent
  failure, `FALLBACK_SYSTEM` invisible to a vocabulary check. Each was
  correct-looking configuration with no mechanism proving it. The three smoke
  suites are that mechanism; extend them rather than adding another header note.
- **A dev script that writes must declare its backend, not inherit it.**
  `getContentStore()` picks Neon or the filesystem from `DATABASE_URL`, so any
  script under `docs/dev/` that writes rows can hit a live tenant just by being
  run in the wrong shell. A *test* refuses outright — `brand-profile-smoke.mts`
  exits 2 if `DATABASE_URL` is set, and sandboxes its cwd so it cannot even see
  the dev snapshots tree. A *seeding tool* targets the real database on purpose,
  so it prints which backend it resolved and offers `--dry`
  (`seed-taxonomy.mts`). One or the other, never silence.
- **Never trust `GET /repos` `permissions.push`** for a fine-grained PAT — it reflects the account's role, not the token's grant. Use `canCreateBranch()` (bogus-SHA probe: 403 = no write, 422 = write).
- **`~/Projects/Outrigger_Website` (Azure DevOps clone) is READ-ONLY.** Pull only; never push/commit/modify.
- **Snapshots are immutable** (PageVersion never edited; re-capture = new version). **ArtifactVersions are immutable** (append-only; carry a fixed code snapshot).
- **Brand-level config, not env vars** for new integrations (Optimizely token/project live on the org).
- **Schema changes go through `ddl()`** (race-safe).
- **The analyst reads what is LIVE, not what a flag says.** Never gate the
  variation code the analyst sees on `buildMode` — resolve it from Optimizely
  first (see above).
- **Compute the caveat; never ask a model for it.** Action-total composites,
  one-armed surfaces, unreported plan events, an unsettled gap — all derived in
  code. A caveat that depends on the model remembering it will go missing, and
  two sections asked for "the caveats" write the same sentence twice.
- **Never silently substitute a computed fallback.** Mark it (`ledeComputed`),
  or a validator bug reads as a quality problem for a whole session.
- **A hold can never push a card forward.** `hold:<key>` is clamped to the derived column on every read. The board may lag the facts; it must never lead them.
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
| `MAIL_PROVIDER` + one provider's vars, `REPORT_FROM_EMAIL` | emailed readouts (see above; absent → sending disabled, and the app says so) |
| `CRON_SECRET` | guards `/api/cron/reports` |

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
