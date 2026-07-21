# Prototype Lifecycle Architecture

*Status: locked 2026-07-20. This is the target model the app is being refactored toward.*

## Thesis

A prototype is not a static thing with a "mode." It is a **living hypothesis**
that produces **immutable artifact versions**, each **promoted through
environments** under **governed gates**, ending in either a shipped PR or an
archived learning.

Our defensible territory is the two stages the experimentation platforms
(Optimizely, VWO) are weakest at: **authoring beyond the visual-editor ceiling**
and **codifying the winner back into production source**. We **integrate, we do
not duplicate** — no home-grown stats engine, flag SDK, or audience-targeting
system. We promote *into* Optimizely and use *their* environments/audiences for
release and measurement.

## The four enterprise principles (non-negotiable)

1. **Build once, promote immutably.** The exact bytes validated in staging are
   the exact bytes that hit production. An artifact is pinned to a git SHA and
   promoted *unchanged* across environments — never rebuilt per environment.
2. **Decouple deploy from release.** Being on an environment ≠ being exposed to
   users. Exposure is a flag / experiment / audience with gradual ramp
   (1% → 50% → 100%) and an instant kill switch.
3. **Govern every gate.** Each stage transition is an explicit, role-gated
   promotion with an approver; every action lands in an immutable audit log.
4. **Trace end-to-end.** One lineage: hypothesis → commit → experiment →
   result → shipped PR.

## The lifecycle

```
IDEATE ──▶ BUILD ──▶ LOCAL/DEV ──▶ STAGING/QA ──▶ PRODUCTION ──▶ SHIP
hypothesis  git PR    live inject    live inject     experiment     handoff→PR
+ metrics             hot-reload     QA audience     ramp+guardrails  flag retired
```

| Stage | Environment | Exposure mechanism | Gate | Platform concept |
|---|---|---|---|---|
| Ideate | — | — | hypothesis + primary/guardrail metrics | program mgmt / backlog |
| Build | — | git branch, PR review | code review | (their gap — our value) |
| Local/Dev | dev | live proxy + overlay inject, hot-reload | author self-check | — |
| Staging/QA | staging (e.g. prep) | loader / QA audience (forced) | stakeholder approval | environments + QA |
| Production | production | experiment, 1%→100% ramp | launch approval | Web/Feature Experimentation |
| Decide | production | ship / iterate / kill | significance + guardrails | Stats Engine |
| Ship | source repo | handoff diff → PR, retire flag | merge approval | (their gap — our value) |

## Canvas decision: live-injection-first, clones optional

- **Clone risk is epistemic** (a snapshot goes stale / low fidelity → you build
  the wrong thing) — read-only, zero blast radius, but can give false
  confidence. Ship-readiness can only be *proven* against the real DOM.
- **Live-injection risk is operational** (CSP, env access, touching client
  infra) — but maximally truthful.
- **Decision:** live injection on a lower environment is the **primary** canvas.
  Local dev uses a **live proxy** of a lower env + overlay injection (fresh +
  fast, no stored clone). **Clones are an opt-in fallback**, warranted only when:
  (a) the client won't allow a script on their env, (b) a page state is hard to
  reach repeatedly (deep booking-flow step), or (c) a review URL must not shift
  under the reviewer mid-approval.
- **Open hinge:** whether a lower env's CSP accepts our loader or forces us onto
  the Optimizely snippet. Verify against the target env before building the
  injection path (Phase 3).

## Target data model

- ~~Brand/Site~~ **AMENDED 2026-07-21: the Site entity was eliminated.** The model
  is three nouns — Customer (brand/tenant) → Environment (where) → Prototype
  (what). Environments belong directly to the customer; prototypes carry
  `orgId` + target URL(s). Pages/snapshots are legacy-optional, not part of the
  model. The lifecycle principles below are unchanged.
- **Environment** *(per brand)* — `{ id, label, url, kind: dev|staging|production }`.
  The site's origin seeds the default `production` environment.
- **Prototype** — the hypothesis: identity + structured brief + canonical A/B
  hypothesis + metrics (primary + guardrails) + `stage`
  (draft|review|live|shipped|archived) + `authoringSource` (live|clone).
- **ArtifactVersion** *(per prototype)* — immutable build: `{ version, gitSha,
  gitRef, createdAt, notes }`. This is what gets promoted.
- **Promotion/Deployment** — `{ versionId, environmentId, exposure {vehicle:
  proxy|loader|optimizely, audience/ramp}, status: active|inactive|concluded,
  promotedBy, promotedAt }`. Current state per environment is derived.
- **AuditEvent** — append-only `{ actor, action, target, at }`.

## Build sequence

- **Phase 1 — Foundations (data model).** Environments (seed origin →
  production) + immutable ArtifactVersion + prototype `stage`/`authoringSource`.
  Additive/non-breaking. (Historical: Add Site later removed entirely with the Site entity.)
- **Phase 2 — Promotions + governance.** Promote a version across environments
  (immutable), role-gated, append-only audit log.
- **Phase 3 — Live-injection canvas.** Local live-proxy + overlay inject;
  lower-env loader/opti injection (after CSP verification).
- **Phase 4 — Experiment + ship.** Promote a version into an Optimizely
  experiment; handoff diff → PR on ship; traceability view.
- **Phase 5 — Learnings + program.** Decision + learnings on archive; hypothesis
  backlog / program board.

## What would lose an acquirer's respect

Reinventing their crown jewels. If we blur the line and rebuild the stats
engine, flag SDK, or targeting, we look like a naive competitor, not an
acquisition that slots in. Stay on authoring + codification; promote into theirs.
