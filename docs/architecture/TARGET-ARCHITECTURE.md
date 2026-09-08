# Prism — Target Architecture

*Beta 2. This is the document the rebuild derives from: the UX follows the model,
not the other way round. Where it contradicts an earlier mockup, this wins.*

*Produced 2026-09-08 from a seven-agent pass over the whole codebase — domain,
surfaces, governance, roles, extensibility — then a diligence read, then this.
Every claim in the source pass was cited to file:line.*

---

# Prism — Target Architecture

*The document the rebuild derives from. Every call here is made; where I accepted a cost I say so; open questions are marked as such and there are only four.*

---

## 1. The object model

Today the code carries roughly thirty entities and the UI exposes about fifteen of them as things you can name. No user holds fifteen nouns. Worse, the fifteen are not one vocabulary: `PrototypeRecord`, `ArtifactVersion`, `MetricMap`, `CoverageSpec`, `VerdictRecord`, `EvidenceBoard`, `Promotion` and `PushResult` are seven names for four ideas, and the product's own surfaces disagree about which one is being discussed.

**Five nouns. One sentence: *a Brand states an Experiment, cuts a Build, opens a Run, and stamps a Decision.***

**Brand** — the tenant, the isolation boundary, the top of the tree. Today's `Org` (`src/lib/orgs.ts`) labelled "Customer" in the UI. Everything hangs off it and *nothing crosses it*. It owns the connections (experimentation platform, code host, agent runtime), the environments, the people and their roles, the standing guardrail policy, and the agent instruction library. Users say "our account"; the UI says Brand. Renaming Org→Brand is cheap and removes the three-way Org/Customer/Site confusion the current code lives with.

**Experiment** — the living hypothesis, and the only thing that appears in the program list. This is today's `PrototypeRecord` (`src/lib/prototypes/types.ts`), which already declares itself "the source of truth for everything about the prototype except its code." I am collapsing "prototype" and "experiment" into one word deliberately. Today the product has both, they are the same row, and the split is the single largest source of vocabulary drift: a card can be in the Experiment stage of the Prototype pipeline while bound to an Optimizely Experiment. One name. When we mean the vendor's object, we say "the experiment **in Optimizely**" — it is not a noun the user holds, it is a delivery detail of a Run.

An Experiment's content is its **Brief**, and this is the load-bearing change: **a Brief is an immutable numbered revision, not a mutable field-set.** The Experiment points at a head revision; every edit creates Brief 2, 3, 4 with an author and a timestamp. A Brief revision carries what is testable and what is judged: the change, the audience, the expected outcome, the decision metric *and its direction*, the guardrails, the target pages, and the operational measurement mapping (which platform events compose the decision metric). Today all of that is spread across `brief`, `hypothesis`, `metrics`, `targets` on the record, plus `briefSnapshot` frozen on each cut (`versions.ts:114`), plus `briefAtConfirm` and `priorConfirmations` frozen on the metric map, plus `primaryHistory` and `directionHistory` arrays, plus eight disclosure booleans on the verdict (`hypothesisNotFrozen`, `directionAssumed`, `mapConfirmedAfterObservation`, `briefRefrozenAfterObservation`, `primaryChangedAfterObservation`, …). Every one of those exists to answer a single question — *what did we say we were testing, before we saw the numbers?* — that an immutable revision chain answers by construction. Making the Brief a revision deletes the entire disclosure-flag family and replaces it with a diff between two numbered documents that a human can read.

**Build** — the immutable artifact. Today's `ArtifactVersion`: git-SHA-pinned code plus everything that was true when it was cut (certification report, QA spec, and now a **Brief revision id** rather than a copied snapshot). Append-only, monotonically numbered, never edited. Displayed as "Build 4," not "v4," because "version" reads like a document revision and we now have two revisioned things. A Build belongs to exactly one Experiment and pins exactly one Brief revision.

**Run** — a Build exposed to traffic on an Environment, under a stated allocation, with a start and an end. This is a new noun and it earns its place. Today "running" is a status string read back from Optimizely (`pipeline.ts` ground truth `experimentStatus`), which means Prism cannot say when the run started without asking the vendor, cannot say what share of traffic saw the variation, cannot stop it, and has nowhere to hang "what was frozen before traffic." A Run has: the Build, the Environment, the Brief revision in effect at start, the allocation, `startedAt`, `endedAt`, who opened it, who approved it. **The pre-registration anchor is simply `run.briefRevision`.** Not "cut or plan or live, whichever is earliest, with four flags for the ways it might be a lie" (`verdict.ts:318-435`). One field. An Experiment usually has one Run; a re-test after a fix has a second, with its own frozen brief and its own decision, which today is impossible to represent honestly.

**Decision** — the adjudication of one Run. Draft while the Run is open, re-derived on every read; **stamped** by a human when the Run closes, at which point the results, the statistics and the verdict freeze together. This is today's `VerdictRecord` plus the readout, the evidence board and the analyst reading — all of which are *presentation of* a decision, not separate entities. A Decision is what leaves the building: the emailed readout, the shared link, the row in the program's history.

Everything else in today's model becomes an **aspect** of one of these five, and stops being a thing you navigate to:

| Today | Becomes |
|---|---|
| `MetricMap` / `CompositeMetric` / `briefAtConfirm` | Part of the **Brief** revision (the measurement plan is pre-registration, not analytics) |
| `CoverageSpec` (scenarios + test cases) | The **Build's** QA record |
| `CertificationReport`, `PushResult` | Facts about a **Build** |
| `Promotion` | The act that opens a **Run** |
| `ExperimentResults`, `StatsReport`, `ResultsHistory`, `Reading`, `EvidenceBoard`, `AttentionItem`, `ReadoutModel` | Views and evidence of a **Decision** |
| `BriefDriftRecord` | A check on the (Build, Brief revision) pair |
| `Skill`, `ReferenceRepo`, `OrgRepo`, `GitConnection`, `ExperimentationConfig`, `Environment`, `OrgMember` | **Brand** setup |
| `Idea` / `Discovery` | An Experiment that hasn't been written yet — one **Ideas** list, and a Discovery promotes into a new Experiment in Drafting |
| `SiteConfig`, `PageVersion`, `Asset`, `SiteRepoBinding`, `FeatureManifest`, `HandoffPiece` | **Deleted.** The locked architecture doc already says the Site entity was eliminated (`docs/LIFECYCLE-ARCHITECTURE.md`, target data model); the code kept it alive for cascades and evidence images. Evidence images move to a blob store keyed by Brand. |

Two Brand-level nouns remain, and they belong to a different person: **Environment** (a place the brand owns, with a URL, a kind, and a loader tag whose installation Prism verifies) and **Connection** (platform, code host, agent runtime, identity provider). They are configuration, held by an admin, touched once. They must never appear inside an experiment's flow — that leak is the entire subject of §6.

**Tradeoff accepted:** five nouns plus two setup nouns is more than the three most SaaS products get away with, and Run is the one a user has not asked for. I am paying that because Run is what makes "immutable while running," "pre-registered before traffic," and "we re-tested it" expressible without disclosure flags — and those three sentences are the product.

---

## 2. The lifecycle

One spine, seven states, on the **Experiment**. The vocabulary is the same in the list, the header chip, the rail and the audit log — that discipline already exists in `derivePipeline` (`src/lib/prototypes/pipeline.ts:111`) and is the best thing in the current UI. What changes is that state stops being *derived-only* and becomes a real machine: a server-side `transition(experiment, event, actor)` is the only writer of state, and there is no free `PATCH { status }` (today `src/app/api/prototypes/route.ts:182` accepts any stage from any stage).

**Drafting** → **Ready** → **Built** → **Reviewed** → **Approved** → **Running** → **Decided** → **Shipped** | **Archived**

**Drafting → Ready.** *Machine gate.* The head Brief revision is complete: a change, a decision metric with a declared direction, at least one guardrail, at least one target page, and a measurement mapping proposed. Today the check is `isBriefComplete` (change + primary metric, `types.ts:151-153`) called from five places — the single best-enforced invariant in the codebase, and it keeps that shape. Direction and guardrails join it, because a direction that was never declared currently propagates all the way to the verdict as "ASSUMED" (`verdict.ts:303-307`), which is a disclosure the product should never need to make. Ask once, at the start, from the person who knows.

**Ready → Built.** *Machine gate, human trigger.* A build lands from the agent, certification runs, the brief↔build drift audit runs pinned to that exact code. Certification failing or drift unresolved holds the state at Ready and blocks the cut — the fail-closed drift gate at `versions.ts:79-108` is right and stays exactly as it is. Cutting a Build is the transition.

**Built → Reviewed.** ***Human gate — the Reviewer signs off.*** Why human: injection proof and QA are the only evidence that the thing works on the real page, and today the strongest half of that evidence is a human assertion anyway — `injectionPasses` treats a machine-proven `present` and a human-asserted `confirmed` as identical (`types.ts:71-74`). Make the assertion explicit and attributed instead of implicit. The sign-off is pinned to a Build id; **a new Build voids it**, the way a new commit dismisses a stale GitHub review. QA hard-gates here rather than being the "warn with teeth" it is at the push (`ship.ts:82-94`), because there is now a role who owns it.

**Reviewed → Approved.** ***Human gate — the Approver, and by default a different person from the author and the builder.*** This is the transition the product is sold on and the one that currently does not exist: `POST /api/promotions` requires only org membership, has no approver field, and `actor` is an audit label (`src/app/api/promotions/route.ts:18-30`, `src/lib/promotions/index.ts:48`) — and the only component that calls it, `PromotePanel.tsx:47`, is imported by nothing. An Approval names the Build, the Brief revision, the Environment and the intended allocation. It is void the moment any of those change.

**Approved → Running.** *Human act, machine-enforced preconditions.* Prism opens the Run: it pushes the frozen bytes to the platform with read-back verification (`ship.ts:111-113` — keep), sets the allocation, and starts traffic **through the platform seam**. This reverses today's rule that "a human owns experiment state" and the push never touches traffic (`ship.ts:12-13`). I am reversing it deliberately: principle 2 of the locked architecture — decouple deploy from release, ramp gradually, kill instantly — has no implementation because `OptimizelyClient` has no traffic write and no stop (`src/lib/optimizely/api.ts:117-307`), and a governance product that cannot stop the thing it governs is not a governance product. The cost is blast radius: Prism can now affect live traffic. It is paid for by two rules — a Run cannot open without a valid Approval, and **Kill is never gated**: any Reviewer, Approver or Admin can stop a Run in one click with no second signature, because safety actions must never require a quorum.

**Running → Decided.** ***Human gate — stamping.*** While Running the Experiment is **frozen**: brief, targets, build binding and allocation are immutable; an edit creates a new Brief revision that is visibly *not* the run's anchor and can never retro-anchor it. Today this is enforced for exactly two operations, the push (`ship.ts:101-105`) and the stamp (`results/route.ts:593-598`), while `PATCH /api/prototypes` rewrites brief, metrics, targets and repo mid-run with no status check (`route.ts:163-223`) and `experimentRunning()` (`board.ts:89-94`) has no server-side caller at all. In the target, the freeze is one predicate consulted by the transition function, and every write path goes through it. Also: the running check must **fail closed** — `ship.ts:106-108` currently catches any error from the platform and proceeds unless the message contains "RUNNING," so a vendor timeout lets you overwrite a live variation.

The stamp keeps every rule it has, because they are the good part: refused mid-run, refused when platform status is unreadable, refused with a 409 if the verdict changed between the human reading it and pressing the button (`results/route.ts:593-606`). Add one: the stamper must hold the Approver role, and cannot be the sole author of the Brief revision being adjudicated.

**Decided → Shipped | Archived.** *Human.* Shipped means the winner graduated into production source (the handoff package on the branch, read at a pinned SHA). Archived means the learning is filed. Both terminal.

**Reopening.** A stamped Decision can be reopened, which discards the frozen snapshots — today by any org member, audited but not gated (`results/route.ts:627-638`). In the target, reopening requires the Approver role plus a typed reason, and **does not delete the prior stamp**: it supersedes it, the way a promotion is superseded rather than deleted (`promotions/index.ts:74-89`). An immutable record you can blank is not immutable; an immutable record you can supersede is.

**One structural rule carried forward verbatim:** the spine holds at the first gate that needs you, a blocked step means no later step becomes current, and the terminal state is never auto-promoted (`pipeline.ts`, "THE RULE"). That is correct and it is why every surface can share one derivation.

---

## 3. The role model

Today there are exactly two privilege levels: *console-global admin*, who can access every Brand (`src/lib/active-org.ts:16`), and *member of some Brands*, who can do everything inside them. `OrgMember.role` is written (`orgs.ts:73`), rendered as a badge (`MembersManager.tsx:65`), and read by zero permission gates. Every `admin` check in the API reads the console-global role off the JWT. There is no reviewer, no approver, no read-only.

**Six roles, scoped to a Brand, plus one vendor-side capability.**

**Author** — has the idea. Creates Experiments, writes and revises Briefs, requests review. Cannot approve, cannot open or kill a Run, cannot stamp. This is the marketer, and the wizard in §6 is built for exactly this person's knowledge.

**Builder** — makes the change. Pushes code, cuts Builds, runs the QA suite, drafts the measurement mapping. **The agent is a Builder**, not a shared org token: each agent session authenticates as a scoped, expiring principal bound to one Experiment, and its actions are attributed to it in the audit log. Today the credential is one per-org, never-expiring, unrevocable plaintext bearer token compared with `===` (`src/lib/api-token.ts:49-50`), and it may write brief/hypothesis/metrics directly. In the target a Builder — human or agent — may **propose** a Brief revision, which an Author accepts. Co-authorship survives; unattended rewriting of the pre-registration does not.

**Reviewer** — owns the site. Signs off QA and injection proof, owns the Environments and the loader tag, can kill a Run. This is the person who says "yes, that can go on our production pages," and today they have no representation at all.

**Approver** — approves production promotion and stamps Decisions. The two-person rule is a **Brand policy**, not a hardcode: `requireDistinctApprover: true` by default for production Runs and for stamping, switchable off by an Admin with the change audited. Some brands will not have two people; make them turn it off knowingly rather than discovering it was never on.

**Admin** — Brand configuration: connections, environments, people and roles, the instruction library, the guardrail policy, billing. Not a superuser over experiments: an Admin who wants to approve a Run holds the Approver role too.

**Viewer** — read-only, including Decisions and readouts. Necessary because readouts already leave the building via signed links (`src/lib/reports/link.ts`) and executives will want accounts, not only emails.

**Vendor support** — not a role, a capability: time-boxed, reason-required, fully-audited impersonation of a named Brand, surfaced *to the Brand* in its own activity log. Replaces today's implicit global superuser, which is the finding a security reviewer will lead with.

Roles compose (a person can be Author + Approver on one Brand and Viewer on another) and are additive. All of it resolves through one function — `can(actor, brand, action, subject)` — and **every principal becomes an Actor**: a browser session, an agent token, the cron sweep, a support impersonation. The ~25 sites currently reading `user.role` off a JWT route through it. That single resolver is what makes the pitch checkable.

**Tradeoff accepted:** six roles is heavier than admin/member and will annoy small teams on day one. The alternative cannot express "someone other than the builder approved this," which is the sentence the entire product is sold on. Mitigation: a brand with three people can put everyone in Author+Approver and turn the distinct-approver policy off; the roles cost them nothing until they need them, and the model is already there when procurement asks.

---

## 4. The seams

Five interfaces. Each is defined by what the app actually calls, and each has a capability descriptor so the UI degrades honestly instead of pretending.

**1. Experimentation platform (the vendor seam).** Today `ExperimentationProvider` has one method, `listProjects()` (`src/lib/experimentation/types.ts:44-48`), and every operation that matters bypasses it to a concrete `OptimizelyClient` from eight call sites. The real seam:

```ts
interface ExperimentPlatform {
  readonly id: PlatformId;
  readonly capabilities: {
    serverSideResults: boolean; trafficAllocation: boolean;
    pauseResume: boolean; customCode: boolean; eventRegistry: boolean;
  };
  listProjects(): Promise<Project[]>;
  listEvents(projectId: string): Promise<PlatformEvent[]>;        // the metric registry the plan maps onto
  createExperiment(spec: ExperimentSpec): Promise<PlatformExperiment>;   // created paused
  getExperiment(id: string): Promise<PlatformExperiment>;         // status, variations, declared metrics + polarity
  setVariationCode(id: string, variationId: string, code: string): Promise<void>;
  readVariationCode(id: string, variationId: string): Promise<string>;   // read-back verification is a seam method
  setAllocation(id: string, alloc: Allocation): Promise<void>;
  start(id: string): Promise<void>;
  pause(id: string, reason: string): Promise<void>;               // the kill switch
  stop(id: string): Promise<void>;
  getResults(id: string, window?: DateWindow): Promise<RawResults>;
}
```

`RawResults` is normalized at this boundary — including the duplicate-metric-name disambiguation that currently happens at `results.ts:102-124` and the polarity join by event id, never by array position (`results/route.ts:153-161`). Those two rules are correct and belong *in the adapter*, so every future platform inherits them.

**Not a seam: the adjudicator.** `verdict.ts` and `stats.ts` stay a single pinned implementation with golden tests. They are the moat; making them pluggable would be the mistake of letting a vendor swap in their own stats engine and calling the result a Prism Decision.

**2. Build runtime (the agent seam) — and this is how LOCAL and MANAGED become one contract.**

```ts
interface BuildRuntime {
  readonly mode: "local" | "managed";
  readonly capabilities: { streamsLogs: boolean; canCancel: boolean; reportsCost: boolean };
  prepare(spec: BuildSpec): Promise<Workspace>;   // branch + .opmc materialized; identical in both modes
  start(w: Workspace, task: BuildTask): Promise<BuildSession>;
  status(s: BuildSessionRef): Promise<BuildStatus>;   // queued | running | awaiting-human | finished | failed
  logs(s: BuildSessionRef, cursor?: string): AsyncIterable<LogLine>;
  cancel(s: BuildSessionRef, reason: string): Promise<void>;
}
```

The `LocalBuildRuntime` implements `start()` by returning `awaiting-human` plus the command to paste, and learns about progress from the code-host webhook — which is exactly what the product does today (`provision.ts:1-7`, "git is the transport"), only now it is one implementation of an interface rather than the only thing that exists. `ManagedBuildRuntime` runs the agent in a per-Brand sandbox with per-Brand credentials and metering. Critically, **every surface is written against the interface**, so MANAGED is a new adapter and not a new product. The LLM configuration hangs off the runtime: per-Brand key or metered platform key, model id in config — today it is one global `ANTHROPIC_API_KEY` and `"claude-opus-4-8"` hardcoded in six files.

**3. Code host.**

```ts
interface CodeHost {
  readonly capabilities: { pullRequests: boolean; branchProtection: boolean; webhooks: boolean };
  listRepos(): Promise<Repo[]>; listBranches(repo: string): Promise<string[]>;
  readFile(repo: string, ref: string, path: string): Promise<FileBlob | null>;
  readTree(repo: string, ref: string, prefix: string): Promise<TreeEntry[]>;
  commitTree(repo: string, branch: string, files: FileWrite[], opts: { expectHead: string }): Promise<Commit>;
  openPullRequest(spec: PrSpec): Promise<PullRequest>;
  protectPaths(repo: string, branch: string, paths: string[]): Promise<void>;   // makes ".opmc is ours" enforcement
  subscribe(repo: string, events: HookEvent[], url: string): Promise<Subscription>;
}
```

`protectPaths` is the point. "The agent never writes `.opmc/`" is stated four times in the skill text delivered to the branch (`src/lib/skills/builtins.ts:102, 242, 267`) and enforced nowhere. A seam method turns a convention into a check. `commitTree`'s `expectHead` preserves the compare-and-swap commit that already stops the console rewinding the agent's work (`provision.ts:345-355`). And `getOrgGitToken`'s fallback to a console-wide `process.env.GITHUB_TOKEN` (`connection.ts:54`) is deleted: a Brand with no connection has no code host, and says so.

**4. Storage — tenancy expressed in the type system.** Today `ContentStore` is a genuinely good seam (`src/lib/content/store.ts:23-127`) with two full implementations, and it survives in shape. Three changes. First, **every method takes a `TenantScope` as its first argument**, so a query without a tenant is a compile error rather than a code review finding — this replaces the four places that call `listPrototypes()` and filter in memory (`board.ts:28`, the dashboard, `r/[token]/page.tsx:34`, `reports/guard.ts:45`). Second, the untyped `content_meta` flag plane splits: aggregates with identity (Experiment, Brief revision, Build, Run, Decision, Approval, Audit) get real tables with an `org_id` column and indexes; genuinely ephemeral markers keep a key/value plane, now namespaced under the tenant. Roughly thirty namespaces in one `(key, val)` table is why there is no prefix scan, why Reports needs a hand-maintained index flag, and why per-tenant export and deletion are unimplementable. Third, **migrations become a versioned, ordered, reversible set** — not nine accumulated `alter table … if not exists` statements executed inside `ensureSchema` on every cold start (`store-neon.ts:59-162`).

```ts
interface Store {
  experiments: Repository<Experiment>;  briefs: AppendOnly<BriefRevision>;
  builds: AppendOnly<Build>;  runs: Repository<Run>;  decisions: Repository<Decision>;
  approvals: AppendOnly<Approval>;  audit: AppendOnly<AuditEvent>;
  blobs: BlobStore;   // evidence images, artifacts
  tx<T>(scope: TenantScope, fn: (t: Tx) => Promise<T>): Promise<T>;   // the audit write is in the transaction
}
```

`tx` matters: today `ship.ts:128` awaits the audit write after the platform write and before the verification throw, so a failed audit insert leaves a completed push with no record. A governed act and its audit row commit together or not at all.

**5. Tenancy and identity.**

```ts
interface Identity { resolve(req: Request): Promise<Actor | null>; }   // session | agent | cron | support
interface Authz   { can(actor: Actor, brand: BrandId, action: Action, subject?: Subject): Promise<Decision>; }
interface DirectorySync { upsertUser(...); deactivateUser(...); syncGroups(...); }  // SCIM
```

Sessions become short-lived with server-side revocation, and `ConsoleUser.status: "disabled"` (`auth/types.ts:7`) is checked at request time — today it is enforced nowhere and a 365-day stateless JWT means disabling a user takes up to a year. Fifty tenants is fifty IT departments asking for SSO and SCIM; the seam exists from day one even if the first implementation is email codes.

Two more that are not headline seams but must not be hardcoded: **Notification** (email today; Slack and webhooks are the obvious next asks, and the Decision is the payload) and **Blob** (evidence and artifacts, so images stop living in a `site` asset table that belongs to a deleted concept).

---

## 5. The information architecture

The rule: **a surface exists only if it is one of the five nouns, or the Brand's setup.** Anything else is a section inside one of those, or it is deleted. This is the discipline the workspace already got right — the nav is the stage model, new capability is a section inside a stage, never a new room — and it is what the *global* nav never got.

**Six surfaces. That is all.**

**`/` — Today.** What needs *this person*, given their role. An Author sees briefs with open questions and reviews awaiting their answer; a Reviewer sees builds waiting on QA sign-off; an Approver sees approvals pending and Runs that ended without a stamped Decision. Justified by: nothing — and that is the point. It is a queue over the other five, and it must be derived from `can()` so it is genuinely different per role. Today the dashboard renders identically for every role because nothing reads one.

**`/experiments` — the program.** One list, one derivation, table by default with the board as a *lens toggle* on the same data, not a second route. Filters by state, owner, environment, decision. Justified by: **Experiment**. This replaces five overlapping views (`ProgramBoard`, `PrototypeTable`, `PrototypeCard`, `PrototypeGroups`, the dead `PrototypeBoard`) and must be built against a single org-scoped query — `buildBoard` currently loads every prototype of every tenant, then makes eight store round-trips plus a GitHub fetch plus a platform call *per card* (`board.ts:28-51`), with no caching and no `loading.tsx` anywhere in the app.

**`/experiments/[id]` — the experiment.** One page, sectioned by the spine, with a rail carrying live severity: **Brief · Build · Review · Run · Decision · Handoff**, plus Settings trailing. Justified by: **Experiment, Brief, Build, Run, Decision**. Three moves inside it:

- **The measurement plan moves into Brief.** Today it is a sub-view of Analytics (`AnalyticsView`), which is precisely why it is editable after observation and why the verdict needs `mapConfirmedAfterObservation`. It is pre-registration. It lives with the thing it pre-registers, and confirming it is part of completing a Brief revision.
- **Evidence and the readout move into Decision.** They are presentations of an adjudication, not a fourth thing.
- **`/prototypes/[key]/settings` stops being a page.** It is a section, as `?tab=settings` already is — having both is an artifact of growth.

**`/ideas` — the backlog.** Human ideas and agent recommendations and promoted Discoveries in one list, each promotable into an Experiment in Drafting. Justified by: it is an **Experiment** that has not been written yet. This is the flywheel — a Discovery from one Decision becomes the pre-registered primary of the next — and it is the only justification for a list that is not experiments.

**`/readouts` — Decisions leaving the building.** Subscriptions, recipient groups, cadence, delivery history, the signed public link. Justified by: **Decision** distribution is a Brand-level concern (recipients outlive any one experiment), so it cannot live inside `/experiments/[id]`. Keep the ISO-week claim inside the compare-and-set (`reports/store.ts:99-128`) — it is correct — but move the sweep off a single 300-second serverless invocation that loops brands in signup order and deterministically starves whoever registered last (`cron/reports/route.ts:63-70`).

**`/settings` — the Brand.** Tabs: **Connections** (platform · code host · agent runtime · identity), **Environments**, **People & roles**, **Agent instructions**, **Guardrail policy**, **Activity** (the audit log — paginated, filterable, exportable), **Brand**. Justified by: **Brand**. Every one of these is configuration a person touches once and an Admin owns.

**Deleted, and why.** `/handoff` — a single customer's laptop path in the primary nav, resolving against a hardcoded `~/Projects/Outrigger_Website/OUT.Website` (`handoff/resolve.ts:13-14`), unable to run on serverless at all; the concept survives as the Handoff section of an experiment, reading a package from the branch. `/features`, `/pages/[siteKey]/[slug]`, `/snap`, `/preview` — the clone-first era, reading `node:fs` under `process.cwd()` and dead in production. `/deploys` — a route whose entire body is the sentence "Deploys arrive after Features." `/customers` — becomes the Brand switcher plus a support-only console. `/environments` and `/skills` as top-level entries — into Settings, because they are setup and the person who owns them is not the person running experiments. The dead components (`PromotePanel`, `PrototypeBoard`, `ProvisionButton`, `FeaturePreview`) go with them.

**And one more deletion, which overrides a locked decision.** The workspace's two-mode design — a guided linear setup that owns the screen until the base is set, then a one-way flip to the operating model (`src/lib/prototypes/setup.ts`) — was the right answer to the wrong problem. Its four steps are *brief · branch & agent · first build · see it on the page*: one of those is intent and three are infrastructure. With connections in Settings and the agent runtime behind a seam, steps two and three are automatic and step four is the Review gate. Setup mode dissolves into the spine. Keeping it would mean keeping the reason it exists.

Two things that stay as they are because they are already right: audit rows must be **keyed to entity ids**, not string-matched against a display name the way per-prototype history is today (`prototypes/[key]/page.tsx:235`, which loses everything when an experiment is renamed; the underlying cause is that `AuditEvent` has no subject id). And the `MetricMap` must stop carrying the UI's presentation state — `roles`, `observed`, `hiddenMeasures`, `measureOrder`, `acknowledged` — inside the pre-registration artifact; view preferences move to a per-user record, which also ends two routes contending over one compare-and-set blob.

---

## 6. What this means for the wizard

The wizard exists to produce **Brief revision 1 of a new Experiment**, authored by a person who knows the marketing problem and nothing about the repository. That is its whole job. The test for every field: *can an Author answer this unaided, and does the answer change what gets built or how it is judged?* Anything that fails the test moves to Settings and belongs to an Admin.

**What it asks — six questions, in this order.**

1. **Where?** The page or pages, picked from the Brand's environments rather than typed as a URL. If the Brand has one review environment, it is not asked at all.
2. **What changes?** Free text. Becomes `brief.change`.
3. **Who for?** Everyone, or a named audience. Becomes the hypothesis's audience.
4. **What do you expect to happen, and why?** The outcome and rationale — the "because" half of "We believe X for Y will cause Z because W," which today's model has as a field and today's create flow never collects.
5. **How will we know?** The decision metric **in the Author's words**, plus its direction — up or down — as an explicit choice, never inferred from prose. This is the one question the wizard must not let you skip, because it is the gate for everything downstream.
6. **What must not get worse?** Guardrails, **pre-filled from the Brand's standing guardrail policy** (bounce rate, revenue per session, page errors, whatever that brand has declared) as checkboxes to confirm or amend. Never a blank textarea. This is the single highest-leverage change in the wizard: guardrails are the mechanism that lets a breach veto a win (`verdict.ts:509-554`), and today they are free text that most experiments will leave empty.

The Experiment row is created after question 1 and updated as you go, so the wizard is resumable across sessions and devices, and an abandoned draft is a real row an Author can come back to — not local state that evaporates.

**Where the rest comes from.**

*The operational measurement mapping* — which platform events compose "Check Availability clicks" — is **not** in the wizard. It is proposed by the AI against the connected project's event registry after creation, reviewed by the Author or an Analyst, and **confirmed as part of the Brief revision before the Run opens**. It is a gate on Running, not on creating, because it needs the platform connection and often a conversation. The current implementation already does the hard part with zero traffic; what changes is that its confirmation stamps a Brief revision rather than a side-car blob with its own archive of prior confirmations.

*Skills* come from the Brand's instruction library, resolved automatically: global plus brand, default-on until someone makes an explicit choice, with rename-forward mapping so a built-in rename never silently drops a selection. That resolution logic is the best-built extension point in the current repo and it does not change. The wizard does not mention skills. Per-experiment overrides appear in the Build section, visible only to Builders.

*Repository, branch, artifact path, site key, loader tag, the review token, the Optimizely project/experiment/variation ids* — all Settings, all Admin, all resolved server-side. An audit of the current flow found the wizard's Repository and Branch dropdowns change nothing: the server attaches the same default when they are absent and coerces a blank branch to `prototype/<key>`. They can be deleted today, ahead of everything else in this document.

**What the wizard must not ask, stated as rules.**

- **Nothing it can compute.** The key, the branch name, the owner (the author), the priority score.
- **Nothing an Author cannot answer.** Repo, branch, artifact path, environment kind, loader installation, event ids, project ids.
- **Not "how will this be built."** Today it asks `builtHere` — console pipeline versus built in Optimizely's editor — which is a question about infrastructure wearing the costume of a question about method. Derive it: if the Brand has a code host and an agent runtime connected, Prism builds it. If it has only a platform connection, it is externally built. Ask only when both are genuinely available, and then phrase it as *who builds this — Prism's agent, my own agent, or I'll build it in the platform's editor* — which is a question about people, and an Author can answer it.
- **Not the terminal.** In MANAGED there is no command to paste. In LOCAL there is, but it appears in the Build section *after* the brief is complete, addressed to a Builder, not as step two of a marketer's flow. The audit's own verdict on that step — *"this is the point where the product stops being an app"* — is the reason the agent runtime is a seam rather than an assumption.
- **Nothing twice.** One fact, one home per screen; if the wizard collects it, no later section re-asks it, and if a later section owns it, the wizard does not preview it.

---

## Open questions

Four, and only four are genuine.

**Can the agent build without the Author's machine?** Everything in §4's build-runtime seam and everything in §6 assumes yes. If MANAGED turns out to require the marketer's laptop after all, the terminal step returns to the flow and no amount of design fixes it. This is the load-bearing assumption and it should be proven with a throwaway sandbox before the rebuild starts, not after.

**Does the platform expose traffic allocation and stop on every plan tier we will sell into?** The Run object, the ramp, and the kill switch all depend on `setAllocation` / `pause` being available through the API for the customer's contract, not just for ours. If they are not, Prism records an *intended* allocation and links out to the platform to apply it — which is a materially weaker product and needs to be known now, because it changes what the Approval means.

**Copy-on-run or full revision chain for the Brief?** I have specified a full immutable chain, which is cleaner and answers more questions. The cheaper alternative is a mutable brief that is copied at Run start. The chain costs a table and a diff UI; it buys "show me what changed after we started" as a query rather than a family of booleans. I am confident in the chain but it is the call most worth re-testing against a real editing session.

**Where does a multi-variation experiment live?** The model assumes one Build per Run, matching today's single `PrototypeExperimentBinding` and the verdict engine's single focus variation. A three-arm test is either three Builds on one Run, or a Build containing all arms. The stats layer already handles multiple arms; the object model and the approval flow do not. This does not block the rebuild, but it should be decided before the Build↔Run relationship is written into the schema, because retrofitting it is a migration.
