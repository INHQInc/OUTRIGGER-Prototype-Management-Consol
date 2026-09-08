# Diligence read — what would not survive

*Beta 2. The adversarial half of the architecture pass: every governance claim
the product makes, tested against where it is actually enforced, plus what
breaks at scale. Written to be uncomfortable; a flattering version is worthless.*

*The target architecture in TARGET-ARCHITECTURE.md is the answer to this
document. Read them together.*

---

Read the code. Findings below; everything is cited to what is actually in the repo. Short calibration first: the statistical core, the SSRF hardening, the CAS discipline on shared blobs, and the certification/read-back gates are real engineering and better than most of what ships in this category. The problem is that none of that is what a diligence team tests first, and the things they do test first are the weakest parts of the system.

---

# 1. Governance claims that would not survive technical diligence

**a) "Govern every gate — role-gated promotion with an approver." The promotion feature is dead code.**
`docs/LIFECYCLE-ARCHITECTURE.md:27-28` calls this non-negotiable principle 3. In the app: `POST /api/promotions` requires only org access, with no role check and no approver field (`src/app/api/promotions/route.ts:18-30`); `actor` is an audit string (`src/lib/promotions/index.ts:48`). Worse — the only caller of that endpoint anywhere in the codebase is `src/components/PromotePanel.tsx:47`, and **nothing imports `PromotePanel`**. The dashboard still *reads* promotions to render "what's live where," but the product can no longer *create* one. The centrepiece of the locked architecture doc is unreachable from the UI.

**b) The RBAC model is decorative.**
Every `admin` gate reads the **console-global** role off the JWT — `src/app/api/orgs/members/route.ts:16`, `skills/route.ts:22`, `git/connection/route.ts:8`, `orgs/api-token/route.ts:10`, `experimentation/route.ts:14` — and a console admin can access **every** org (`src/lib/active-org.ts:16`). `OrgMember.role` is written (`src/lib/orgs.ts:73`, `store-neon.ts:436`) and rendered as a badge (`src/components/MembersManager.tsx:65`) and is read by **zero** permission gates. There are exactly two privilege levels in the system: global superuser, and "member of some orgs." An org admin has no more authority inside their org than any member. Reviewer, approver, and read-only roles do not exist.

**c) "Immutable audit log" is a mutable table the app itself mass-deletes.**
`ContentStore` exposes only `listAuditEvents`/`addAuditEvent` (`src/lib/content/store.ts:111-112`) — but that is an interface convention, not a property of the data. `store-neon.ts:427` runs `delete from audit_event where org_id = ...` inside `deleteOrg`. No hash chain, no WORM storage, no external sink, no export, no tamper evidence. `listAuditEvents` defaults to `limit 100` (`store-neon.ts:314`) with no pagination or time filter, so the trail is not even fully *readable*. And the write is non-transactional and inline: `src/lib/prototypes/ship.ts:128` awaits the audit *after* the Optimizely write and *before* the verification throw — a failed audit insert leaves a completed push with no record.

**d) "A running experiment is immutable" is enforced in two places out of many.**
Enforced: the push (`ship.ts:101-105`) and the stamp (`results/route.ts:593-598`). Not enforced: `PATCH /api/prototypes` rewrites brief, hypothesis, metrics, targets, repo and stage mid-run with no status check (`src/app/api/prototypes/route.ts:163-223`); a new version can be cut mid-run (`versions.ts`); `experimentRunning()`, the helper written for this rail (`board.ts:89-94`), has **no server-side caller**. And the push gate **fails open** — `ship.ts:106-108` catches any error from `getExperiment` and proceeds unless the message happens to contain "RUNNING". An Optimizely 429 or timeout lets you overwrite a live variation mid-test.

**e) Pre-registration and lineage survive only by accident of routing.**
`POST /api/prototypes` with an existing key rebuilds the record (`route.ts:122-149`) and silently drops `experiment` (the Optimizely binding), `parentKey` (lineage), and each target's `injection` proof. `PATCH` explicitly preserves injection (`route.ts:196-203`); `POST` does not, and nothing rejects a POST-with-key. This holds today only because every editing component happens to use PATCH.

**f) A stamped verdict is not immutable.**
Any org member can unstamp it, discarding `frozenResults` and `frozenStats` (`results/route.ts:627-638`), or reset it behind a **client-supplied** `confirmStamped` boolean (`:783-790`) — a self-declaration, not an authority check. `clearVerdict` writes with plain `setFlag`, not CAS (`verdict.ts:147`). The "immutable record of a decision" is a JSON string in a key/value row that any member can blank.

**g) The two "proof" signals are unauthenticated writes with no rate limiting.**
`/api/loader/checkin` (`route.ts:12-16`) and `/api/loader/heartbeat` (`route.ts:21-29`) are public, `Access-Control-Allow-Origin: *`, fail-silent, and write a caller-chosen key into `content_meta`. There is **no rate limiting anywhere in the codebase** (grep for rateLimit/throttle returns one unrelated comment). "Agent engaged" and "the tag is installed" are assertions any anonymous caller can make, and the same endpoints are an unauthenticated row-injection and Neon-cost vector.

**h) "The agent never writes `.opmc/`"** is stated four times in the skill body delivered to the branch (`src/lib/skills/builtins.ts:102`, `:242`, `:267`) and enforced nowhere — no branch protection, no CODEOWNERS, no server-side path check.

**i) Lifecycle principle 2 — "decouple deploy from release… gradual ramp and an instant kill switch" — has no implementation.**
`OptimizelyClient` exposes `createPage`, `createDraftExperiment`, `getExperiment`, `getExperimentResults`, `setVariationCustomCode` (`src/lib/optimizely/api.ts:117-307`). There is no traffic-allocation write and no stop/pause. Prism cannot say what share of traffic saw the variation and cannot kill it. `stats.ts:582` concedes it frequently lacks real allocation weights and runs SRM against an *assumed* equal split.

**j) Zero tests. Zero CI.**
No `*.test.ts`, no `__tests__`, no `.github/`. `verdict.ts` (642 lines) and `stats.ts` (878 lines) — the moat — have not one regression test. Every genuinely-enforced invariant in this system is enforced by code no one has pinned. This is the first thing a technical diligence team asks for, and it is the finding that reframes all the others: the claims may be true today, but nothing prevents the next commit from making them false.

**What would survive:** the single `isBriefComplete` definition and its five call sites; the forced brief↔build audit at cut, failing closed (`versions.ts:79-108`); certification frozen at cut, gating the push, with a recorded override (`ship.ts:76-80, 124-130`); byte read-back verification (`ship.ts:111-113`); the decision-metric invariants; the verdict engine's gate ordering (validity before significance) and permanent discovery quarantine; the ISO-week claim inside the CAS (`reports/store.ts:99-128`); `src/lib/net/safe-fetch.ts` in full; the deliberate secret separation for readout links (`reports/link.ts:28-35`).

---

# 2. The five extensibility axes

**Genuinely pluggable (2 of 5):**

| Axis | Verdict | Evidence |
|---|---|---|
| **Persistence** | Real | `ContentStore` is a complete interface (`store.ts:23-127`) with two full implementations and one memoized entry point (`:135-148`). *Caveat:* schema is auto-DDL with no migration framework — nine accumulated `alter table … if not exists` statements run inside `ensureSchema` (`store-neon.ts:59-162`) on every cold start, with no version table, no rollback, no down path. And `FsContentStore.compareAndSetFlag` admits it is single-process — a dev store, not a deployment target. |
| **Skills / agent instructions** | Real | Three scopes, default-on-until-explicitly-chosen, rename-forward mapping so a built-in rename never drops a selection, materialized to the branch with deselected ones deleted (`skills/skills.ts`, `provision.ts`). Best-built extension point in the repo. |

**Hardcoded wishful thinking (3 of 5):**

| Axis | Verdict | Evidence |
|---|---|---|
| **Experimentation provider** | Comment, not a seam | `ExperimentationProvider` has exactly **one** method — `listProjects()` (`experimentation/types.ts:44-48`) — and `ExperimentationProviderId = "optimizely"` is a single-member union (`:8`). Every operation that matters bypasses it via `getOptimizelyClientForOrg` → concrete `OptimizelyClient`, called from `ship.ts:62`, `board.ts:32,91`, `results/route.ts:122,855`, `measurement/route.ts:33`, `reports/build.ts:46`, `prototypes/[key]/page.tsx:198`. Adding VWO means writing the abstraction from zero and touching all of them. |
| **Git / SCM provider** | The type lies | `RepoProvider = "github" \| "azure-devops" \| "external"` (`git/types.ts:58`). `azure-devops` appears in the entire codebase exactly twice — in that union and in a comment. There is no `GitProvider` interface; `getGitClientForOrg` returns a concrete `GitHubClient` (`connection.ts:58`), and `addOrgRepo` hard-refuses non-GitHub for the prototypes role (`org-repos.ts:62`). Separately: `getOrgGitToken` falls back to a **console-wide** `process.env.GITHUB_TOKEN` (`connection.ts:54`) — a tenant with no connection provisions using the vendor's GitHub account. That is a cross-tenant credential in a multi-tenant deployment. |
| **Agent runtime (LOCAL / MANAGED)** | MANAGED does not exist | No sandbox, no job runner, no queue, no per-tenant execution isolation anywhere in `src/`. The whole build path is "a human runs `clone + claude` on their laptop; git is the transport" (`provision.ts:1-7`). The adjacent LLM axis is one global `ANTHROPIC_API_KEY` with `model: "claude-opus-4-8"` hardcoded across six files (`ai/brief.ts:149`, `ai/coverage.ts:58,169`, `ai/measurement.ts:125`, `ai/next-test.ts:151`) — no per-tenant key, no metering, no quota, no cost attribution, no model config. And `runBriefAudit` fires from `after()` on **every workspace page view** (`prototypes/[key]/page.tsx:158`), throttled only by a best-effort 3-minute TTL flag with no CAS (`brief-audit.ts:141-150`). |

Two of five is a defensible answer to "is this a platform?" — but the two that are real are the two that don't appear in the pitch, and the three that are fake are the differentiator (provider-agnostic), the enterprise wedge (Azure DevOps), and half the business model (MANAGED).

---

# 3. What breaks first at 50 tenants

**1. The program board — and it breaks for everyone at once.**
`buildBoard(orgId)` loads **every prototype of every tenant** (`board.ts:28`), then filters in memory after an async `resolvePrototypeOrg` per row (`:29`) that can also *write* (`org.ts:15`). Per surviving card it then issues 8 store round-trips (`:38-47`) plus a GitHub contents fetch (`resolveRepoSource`) plus an Optimizely `getExperiment` (`:51`). No caching, no batching, `force-dynamic` on 24 pages, and **no `loading.tsx` anywhere in the app** — so navigation just blocks on a blank screen. At 50 tenants × 20 prototypes, a tenant who owns 20 prototypes pays to decode 1,000 JSON blobs plus ~160 network calls per board render.

**2. The weekly report sweep starves the same tenants every week.**
One serverless invocation, 300s ceiling (`cron/reports/route.ts:10`), looping orgs × reports **sequentially** (`:63-64`) with a 240s bail-out that increments a `deferred` counter (`:65-70`). The loop order is `listOrgs()` → `order by created_at` (`store-neon.ts:409`). The tenants at the end of that ordering are *always* the ones skipped — a deterministic starvation bug keyed to signup date. And the Hobby-plan one-cron-per-day constraint is baked into the **domain model**: a cadence names a day and can never name an hour (`reports/cadence.ts`).

**3. Tenant-id reuse resurrects a deleted customer inside a new one.**
Nothing deletes `content_meta` on org delete — not `orgs.ts:57-66`, not `store-neon.ts:422-428`, not the FS store's `deleteOrg`. And `addOrg` uniquifies against *live* orgs only (`orgs.ts:37-41`), so a deleted org's slug is free again. Delete "Acme," recreate "Acme," and you inherit:
- `api-token:acme` — the old tenant's still-valid, never-expiring, **plaintext**, unrevocable bearer token now authenticates as the new tenant (`api-token.ts:49-50`, compared with `===`, not constant-time);
- `ideas:acme`, `refrepos:acme`, `skills:org:acme`, `notebook:org:acme`;
- `reports:index:acme` and every `report:v2:acme:<id>` with its recipient names, emails and unsubscribe state — and `guardReport` passes, because it reads the org off the record and the record says "acme" (`reports/guard.ts:32`).

The same gap is a flat right-to-erasure failure independent of reuse: nothing in the product deletes a tenant's verdicts, metric maps, evidence screenshots or readings.

**4. The flag plane has no operational story.**
~30 namespaces (`api-token`, `verdict`, `metricmap`, `coverage`, `evidence`, `reading`, `notebook`, `observations`, `resultshistory`, `provision`, `optipush`, `briefdrift`, `briefaudit`, `skills:*`, `ideas`, `report:*`, `reports:index`, `loader:seen`, `claude:seen`, `setupdone`, …) in one untyped `content_meta (key text, val text)` table (`store-neon.ts:195`). Whole-blob read-modify-write with 3-5 CAS retries; `resultshistory` holds 180 days per prototype in a single row. There is no prefix scan — which is precisely why reports need a hand-maintained index flag — no TTL, no size cap, no per-tenant quota. Per-tenant backup, export and deletion are all unimplementable against this shape.

**5. Prototype keys are a global namespace.** Uniquified against *all* prototypes (`route.ts:113-116`). Tenant B naming an experiment `checkout-banner` silently gets `checkout-banner-2` because tenant A already has one — a cross-tenant existence oracle, a customer-visible artifact, and the root reason every flag key is a global string.

**6. No tenant column on the governance tables.** `artifact_version` and `promotion` carry `prototype_key` and `site_key`, never `org_id` (`store-neon.ts:148-182`); new prototypes get `siteKey: ""` (`route.ts:125`). Isolation for the two append-only tables exists only as app-code `resolvePrototypeOrg` calls. No RLS, no schema-per-tenant, no query that proves isolation to an auditor.

**7. Auth has no revocation.** 365-day stateless JWT (`config.ts:25`), verified on signature and expiry only (`session.ts:16-28`); `currentUser` never re-reads the store (`current.ts:7-11`). `ConsoleUser.status: "disabled"` (`auth/types.ts:7`) is enforced nowhere at request time. Disabling a user, deleting a user, or demoting an admin takes up to a year to take effect. No SSO/SAML/OIDC/SCIM. Fifty tenants is fifty IT departments asking for exactly those.

Also, quietly: `/r/[token]` runs `listPrototypes()` then `.find()` on a **public, unauthenticated** route (`r/[token]/page.tsx:34`) — a full cross-tenant table scan per anonymous readout view.

---

# 4. Surfaces that exist because of how it grew

- **`/handoff` — a single customer's laptop path, in the primary nav.** `Sidebar.tsx:165`. It renders the legacy Feature system and resolves against a hardcoded `~/Projects/Outrigger_Website/OUT.Website` (`handoff/resolve.ts:13-14`), reads `Features/Outrigger/Blocks` (`:119`), and its subtitle names Outrigger out loud (`handoff/page.tsx:15`). It cannot work on serverless at all. This is the single most damaging thing in a diligence walkthrough.
- **`/features`, `/pages/[siteKey]/[slug]`** — the clone-first era. `listFeatures()` reads `node:fs` under `process.cwd()/features` (`features/registry.ts:6-7`) — dead on Vercel.
- **`/deploys`** — a route whose entire body is the sentence "Deploys arrive after Features." (`deploys/page.tsx:9`). A placeholder shipped as a page.
- **The whole Site / PageVersion / Asset layer**, which the locked doc says was eliminated, still owns cascades, a `repo_binding` table and the evidence-image asset path.
- **Dead components:** `PromotePanel`, `PrototypeBoard`, `ProvisionButton`, `FeaturePreview` — nothing imports any of them. `PromotePanel` being dead is not cosmetic; see §1a.
- **Five overlapping program views:** `ProgramBoard`, `PrototypeTable`, `PrototypeCard`, `PrototypeGroups`, `PrototypeBoard` — plus `/prototypes/[key]/settings` existing as a page *and* as `?tab=settings`.
- **Per-prototype history is string-matched against the prototype's name** (`prototypes/[key]/page.tsx:235`), so a rename erases the record. That exists because `AuditEvent` has no subject id, which exists because audit was bolted on after the entities were designed.
- **`MetricMap` carries the UI's presentation state** — `roles`, `observed`, `unfeatured`, `hiddenMeasures`, `measureOrder`, `acknowledged`, `directions` — inside the pre-registration artifact. That is why two routes contend over one CAS blob: view preferences and the measurement contract share a row.

Designed today: one prototype workspace, one program view, promotion as a first-class governed action with an approver, handoff as a repo-side artifact only, no Site entity, and audit rows keyed to entity ids rather than display names.

---

# 5. The five things that must be true before this is sellable, ranked

**1. A real authorization model.**
Every governance claim in the pitch reduces to "who was allowed to do this," and today the answer is "anyone in the org, or any global admin, in any org." Work: a `can(user, org, action)` resolver that actually reads `OrgMember.role`; route the ~25 sites currently reading `user.role` through it; add approver fields to `Promotion`, `PushResult` and `VerdictRecord` with a distinct-from-actor requirement on production promotion and on the stamp; replace the 365-day stateless JWT with a short-lived session plus server-side revocation and an `active`-status check; then SSO/SCIM. **6-10 weeks.** Nothing else matters first.

**2. Tests and CI for the moat.**
Table-driven golden cases over `verdict.ts` and `stats.ts` — SRM, FDR/q, power, CI/p, guardrail veto, gate ordering, `focusFallback`, every pre-registration disclosure flag — plus the ship/cut gates and the tenancy guards; snapshot the verdict for a fixed results payload; a GitHub Actions job on every PR. **3-4 weeks.** Without it an acquirer cannot verify a single deterministic claim, and you cannot safely refactor for items 1, 3 or 4 without breaking exactly the thing you are selling.

**3. Provable tenant isolation and working tenant deletion.**
`org_id` on `prototype`, `artifact_version`, `promotion` and every flag key; org-scoped queries replacing the four `listPrototypes()`-then-filter call sites (`board.ts:28`, `page.tsx:54`, `r/[token]/page.tsx:34`, `reports/guard.ts:45`); a cascade that actually removes `content_meta` rows and assets; never re-issue a retired org slug; hash, scope, expire and revoke the API token. **3-4 weeks**, one migration. This converts §3's findings and the GDPR question from blockers into non-issues.

**4. Make the promotion gate exist, and close the fail-open holes.**
Either re-land the promotion surface or delete `Promotion`, `Environment` and the vehicle model and stop claiming the lifecycle — but do not demo a lifecycle the software cannot perform. Then: the running-experiment check must fail closed (`ship.ts:106-108`); `PATCH` must refuse edits to a bound prototype whose experiment is running; `POST`-with-key must be rejected outright rather than silently rebuilding the record; the audit write must be transactional with the act, or go through an outbox. **2-3 weeks.**

**5. Decide what MANAGED is, and price the model you already run.**
Either build the per-tenant agent sandbox with per-tenant credentials, isolation and metering, or drop the second operating model from the pitch — selling a two-model product where one model has no code is the fastest way to lose the room. In parallel and cheaply: per-tenant LLM keys or at minimum per-tenant metering, model id in config instead of six string literals, and move the report sweep and board build off single-invocation synchronous loops onto a queue. **6+ weeks for a credible MANAGED; ~2 weeks for the metering and the queue if MANAGED is deferred.**

---

**The one-line version for the acquirer conversation:** the adjudication engine is a genuine asset and the enforced half of the governance story is real and unusually thoughtful — but the product currently has no roles, no tests, no tenant deletion, a dead promotion gate, an audit log the app itself deletes, and one of its two advertised operating models does not exist in the codebase. Those are all buildable in a quarter or two. They are not survivable in a diligence room unbuilt.
