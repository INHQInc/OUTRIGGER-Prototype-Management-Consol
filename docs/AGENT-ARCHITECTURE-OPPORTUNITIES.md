# Where agent patterns would make Prism enterprise-grade

*22 Sep 2026. From a five-angle design panel over the real code, each proposal scored by
an independent judge on impact, effort, risk and fit with the locked lifecycle. 36
proposals, 21 do-now, 15 do-later, 0 dropped. Scores are out of 20.*

## The headline

**Prism does not need an agent loop. It needs governance around the fifteen model calls
it already makes.** The generic "bounded tool-use loop" proposal scored 8/20, last of
all 36. Every high scorer is plumbing, tenancy or structural enforcement.

This is the correct result and worth stating plainly, because "add an agent" is the
fashionable answer and it is wrong here. Prism's architecture already delegates the
agent loop deliberately: the console **pulls** code and never authors it, and the
build/verify loop ships as Markdown to Claude Code. That boundary is a feature. The
enterprise gap is that everything *around* it is ungoverned.

## 1. One model seam — the single highest-leverage change

Four separate angles converged on this independently, which is the strongest signal in
the panel.

Today: 12 separate `new Anthropic()` constructions, 15 copies of the model id string,
no `timeout`, no `maxRetries`, and `usage` / `input_tokens` appear **zero times
repo-wide** — nothing reads cost. `stop_reason` is checked once, so a truncated tool
call silently degrades at 14 of 15 sites.

The live failure this causes: the SDK default is 2 retries at a 10-minute timeout, which
can outlive a route's 60s `maxDuration`. Vercel kills the function, `finally` never
runs, the user gets a bare 504, and nothing reaches the audit trail.

Build `src/lib/ai/call.ts` as the only place that constructs a client, names the model,
and sets timeout and retry policy. Then layer on what it unlocks:

| Follow-on | Score | What it buys |
|---|---|---|
| `anthropicFor(orgId, purpose)` per-tenant metering and BYO key | 17 | Model spend becomes a per-customer line item you can cap or invoice |
| Repair re-issues the same forced tool with original context | 17 | Repair becomes correction rather than a re-roll |
| `runOnce(key, inputHash, ttl, fn)` on the four unguarded expensive endpoints | 17 | Removes duplicate spend and concurrent-write races |
| A `model.call` ledger record | 14 | Per-customer attribution and evidence for future decisions |
| Per-purpose circuit breaker, degrade rather than 504 | 14 | Bounded spend during a provider incident |

Mirror the per-org Optimizely PAT pattern exactly, so it reads as the same product
rather than a new subsystem.

## 2. Vertical-neutrality is structurally violated today

`Prism is for any website` is a stated product constraint. The code does not honour it.
"hotel", "guests" and "booking path" are hardcoded at nine prompt sites, and worse,
inside a **derivation**: `readoutStructure()` in `results.ts` composes the CHAIN block
the model is told to build its answer from, and writes "guests take this step MORE and
the outcome is still flat or down" into it.

Fix by extending the existing `OrgNotebook` at `notebook:org:<orgId>` with a
`vocabulary` block. It already holds audience and durable preferences and is already
human-visible and removable.

This is the precondition for the second client, and it is a demo risk today.

## 3. The prose-cap drift, for the third time

`readingTool.headline.description` still reads `<=80 chars` while `HEADLINE_MAX = 140`.
HANDOFF records fixing this exact drift in the *repair prompt* on 2026-09-20, under a
heading literally called "Second time, same lesson". The tool schema was missed.

Worse, `observation.ts:78-92` still runs a private pre-fix `clean()`. It hard-gates
length with no advisory path, and it never calls `unwrapScaffolding` — so a value
arriving as `<parameter name="text">Guests reach for availability…` passes every check
and renders raw tool-call syntax into a box a client executive reads.

The structural fix is `src/lib/ai/prose-contract.ts`: one `FIELD` table of
`{ key, limit, gate, rules[] }` feeding three things that are currently three
hand-maintained copies — the JSON-schema description the model reads, the validator, and
the prompt. One edit provably moves all three.

This is the repo's own rule applied properly: when a model-behaviour bug recurs, fix it
in code, do not patch the prompt again.

## 4. Graphs — one honest opportunity, and it is not the lifecycle

Turning `derivePipeline` into nodes and edges scored 13/20, do-later. The lifecycle is
locked and five steps long; making it data buys per-tenant profiles and a generated
diagram, not correctness. Worth doing eventually, not now.

The genuinely graph-shaped thing is **surface identity**: a stable id for a *region of a
page*, plus a small typed edge set over it. `surfaceIdOf(orgId, url, whereHint,
selectors)` normalises URLs against per-org path templates so `/rooms/123` and
`/rooms/456` are one surface. That is what turns a pile of experiment records into a
programme a new account manager can read on their first day.

Two things hang off it and are the commercially interesting ones:

- **Proven nulls become expiring org facts.** `deriveNextTest()` already separates a
  tight interval around zero, a direction genuinely ruled out, from a wide one, merely
  unresolved. Its own header calls that distinction worth as much as a win. It is not
  persisted. Persisting it is the line that sells the platform: the second experiment on
  a page starts from what the first one proved. It is also a fortnight of traffic not
  spent re-answering a settled question.
- **Baselines from frozen stats.** The control arm's observed rate is already in every
  stamped verdict. Write it as a fact and the statistical power gate starts firing by
  itself instead of waiting for someone to hand-type a baseline.

Hold both behind an append-only `BrandMemory` seam mirroring `ContentStore`, so tenant
isolation is a database column rather than an application filter.

## 5. Verification belongs in CI, not in an in-console agent

`certifyVariation` is static regex analysis, and its own header calls dynamic dual-timing
execution "the v2 upgrade". The right home is a GitHub Actions workflow shipped with the
prototypes-repo starter: Playwright loads the real target URL, injects the artifact at
both timings, asserts idempotency and re-entry.

Per-customer infrastructure, per-customer token, zero new runtime in the serverless
console. This is the enterprise answer to "the platform should verify" without building
an agent to do it.

## 6. What NOT to build

One judge's proposal was to ship nothing, and it scored 16/20.

`proposeMetricMap`, `defineCustomMetric`, `generateCoverage`, `proposeMeasurementPlan`,
`draftBrief`, `checkBriefDrift`, `giveObservation` and `draftNextTest` are correct as
straight-line forced-tool calls. They are structured-output calls over facts the console
already computed deterministically in `stats.ts`, `verdict.ts` and `pipeline.ts`. Giving
any of them agency would trade determinism for nothing. A readout a client can be shown
twice and get the same answer is the entire basis on which Prism asks anyone to trust
its verdicts.

If you ever do want something loop-shaped, the two narrow candidates are:

- **The ask box proposing a button rather than a past-tense lie.** One optional
  `propose_action` tool, enum-constrained to POSTs the results surface already exposes,
  executed by a human click. Allow-listed, attributed, audited.
- **A bounded artifact-repair agent**, scoped strictly to fixing a *named* defect that
  dynamic verification detected, opening a PR and never pushing. Gated on objective
  criteria, proposing rather than deciding.

Both are do-later. Neither is urgent.

## Quick wins worth doing this week

- `brief-audit.ts` comments say "the flag store has no CAS". It does.
  `compareAndSetFlag` is on the `ContentStore` interface and is a real conditional write
  in Neon. Give the audit a real lease and a documented source of duplicate LLM spend
  disappears. Scored 16/20.
- Interpolate the caps into the tool schema so the 80-versus-140 drift cannot recur.
  Scored 17/20, cheapest item on the list.
- Port `observation.ts` onto the shared validator. Highest ratio of shipped defect
  removed to lines changed in the whole panel. Scored 18/20, top of the list.
