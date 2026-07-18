# Product Roadmap — The Build-and-Ship Layer for Experiments

*The missing layer: build advanced experiments the visual editors can't, and ship the winners as production code. We plug into the experimentation platform — we are not an A/B testing tool.*

*Working codename: **OPMC** today → commercial name TBD (candidates: **Loop**, **Winner**, **Shipline**, **Groundtruth**). Last updated: 2026-07-18.*

> **This is a strategy + build document.** It defines what we build, in what order, why each piece is a competitive edge, what makes us acquisition-desirable, and what makes us trivial for any dev team to adopt. It is grounded in the July 2026 market research (see `docs/MARKET-RESEARCH.md` if exported) and in what we have already proven with the Outrigger console.

---

## 1. The One-Line Product

**We are the missing layer where teams *build* advanced experiments the visual editors can't — and *ship* the winners as production code.**

We are **not an A/B testing tool.** The experimentation platform (Optimizely, VWO, LaunchDarkly) still runs the test, splits traffic, and declares the winner. We plug into it. We solve the two things it does badly, on either side of it:

- **The authoring ceiling (build side).** Optimizely and VWO visual editors are fine for swapping a headline or a color. Building anything *advanced* inside them — real interactive components, multi-step flows, data-backed UX, sophisticated design-system-true experiences — is painful, brittle, or flat-out impossible. So ambitious experiments either never get built or get hand-coded off to the side. **We are where you build the advanced prototype**, with an AI coding agent working in real code with a real preview — no visual-editor ceiling.
- **The shipping gap (ship side).** Even once a sophisticated variation wins, getting it into production is a manual dev rebuild that often never happens — so winners live forever as client-side JavaScript. Because everything we build is **source-aware from the first keystroke**, shipping is a **native pull request into the real repo**, not a rebuild.

So we bracket the experimentation platform: **build (beyond the editor) → [their platform runs the test] → ship (as native code).** We don't compete with the experimentation vendors — we make what they run more ambitious and make its winners real.

### Why this framing (and not "an AI experimentation platform")

The market research is unambiguous on positioning:

- **We don't do testing, stats, or winner-declaration** — that's the platform's job, and trying to replace it means a rip-and-replace sale against entrenched incumbents. Plugging in is a far easier sale *and* keeps every experimentation vendor a potential partner/acquirer instead of a competitor.
- **"AI builds experiments" (in a visual editor) is commoditized** — Optimizely Opal, VWO Copilot, AB Tasty Evi. But they all generate *client-side* variations inside the same editor ceiling. None let you build a genuinely advanced, source-true experience, and none ship it to code.
- **"AI opens PRs" is commoditized** — Vercel v0, Cursor, Codex — but none of them are experiment-aware or start from a design your team validated.
- **The build-advanced-then-ship layer between them is unclaimed.** That is our wedge, and everything in this roadmap defends it.

We sell a **layer that sits on top of an existing Optimizely / LaunchDarkly / VWO contract**, priced on experiment volume and displaced dev-labor — not a standalone platform chasing the ~$1.5B A/B-software TAM. Our budget target is the **$5–10B CRO-services / dev-implementation pool** (10–30 dev-hours and ~$20K all-in per experiment today), plus the experiments that never happen at all because they were too hard to build in the editor.

---

## 2. Strategic Pillars (our four legs up)

Every feature must strengthen at least one. These are the moats an incumbent finds hard to copy.

| # | Pillar | Why it's defensible | Who can't easily copy it |
|---|--------|---------------------|--------------------------|
| **P1** | **Author beyond the visual-editor ceiling** | A real code-based authoring environment (Claude Code + real components + real preview) lets teams build advanced, interactive, data-backed experiences the Opti/VWO editors can't. This is the *front* half of the missing layer. | Experimentation vendors whose authoring surface *is* the visual editor — they'd have to build a real IDE. |
| **P2** | **Source-aware from the first keystroke** | Everything built maps to the *exact* owning code (React component, Razor block, Vue SFC, Liquid section) as it's authored — not reverse-engineered later. Hard, stack-specific engineering that compounds with every repo we learn. | Marketer-centric DXPs (Optimizely, Adobe) — this is developer tooling, off their center of gravity. |
| **P3** | **Ship as a native PR into the customer's repo** | The *back* half of the missing layer. Requires deep repo trust, safe-write guarantees, and code a senior dev will actually merge. The un-owned center. | Everyone — nobody ships this today. |
| **P4** | **Own-your-output / git-native history** | Every experiment is durable, revertable, version-controlled institutional memory — and the output is plain code the team owns, no runtime lock-in. | Experimentation platforms whose data model is server-side test config, not source. |

**The rule:** if a feature doesn't reinforce P1–P4, it's a distraction. We do **not** try to out-feature the experimentation vendors on testing, stats, targeting, or reporting — that's their platform, and we plug into it. We win by owning the two things they're worst at: **building the advanced prototype (P1) and shipping it (P3)**, made possible by source-awareness (P2) and durable ownership (P4).

---

## 3. Horizon 0 — What's real today (the proof, already built)

This is our credibility. Do not rebuild it; productize it.

| Capability | State | Roadmap role |
|---|---|---|
| Sanitized, versioned site capture (Firecrawl + asset mirroring, tracking stripped) | ✅ Working | Becomes the "prototype canvas" / staging surface. |
| Overlay/feature model (HTML fragment + CSS + JS + injection points, element picker) | ✅ Working | Becomes the experiment authoring artifact. |
| Optimizely variation export + promote to **paused** draft experiment (safety-railed) | ✅ Working | First experimentation-platform connector. |
| Protected shareable deploy (Vercel, Basic-Auth, noindex) | ✅ Working | Becomes stakeholder/agency review + UAT surface. |
| **Handoff engine**: resolver (prototype → real source), origin↔integrated diff, `git apply` patch | ✅ Working | **This is the seed of P2/P3 — the crown jewel.** |
| Auth (JWT, 365-day), store seam (JSON local / Neon hosted) | ✅ Working | Becomes multi-tenant identity + persistence. |

**Narrative for any pitch:** "We already resolve a prototype change to the owning source in a real enterprise ASP.NET/Optimizely CMS codebase, and generate a mergeable patch. The roadmap generalizes that across stacks and closes the loop to auto-PR."

---

## 4. Horizon 1 — Productize the Wedge (0–3 months)

**Goal:** turn the single-tenant Outrigger console into a multi-tenant product that runs the full loop for *one modern-stack design partner* end to end. This is the "prove it generalizes past ASP.NET" horizon — the single most important thing an acquirer will stress-test.

### 4.1 Multi-tenancy & onboarding
| Feature | What it does | Pillar |
|---|---|---|
| Org / workspace model | Multiple customers, isolated data, role-based members (admin / builder / reviewer / dev). | — |
| Repo connection (GitHub App first) | OAuth GitHub App with **least-privilege, PR-only** scope. No direct push to default branch, ever. | P3 |
| Stack autodetect | On repo connect, detect framework (Next/React, Vue/Nuxt, Rails/ViewComponent, .NET Razor, Shopify Liquid) and component conventions. | P2 |
| Experiment platform connect | Pluggable connector interface to the platform that *runs* the test; ship **Optimizely Web** (done) + **LaunchDarkly** as connector #2. We push the variation to it — we don't run the test ourselves. | — |

### 4.2 The authoring loop (Claude Code as engine)
| Feature | What it does | Pillar |
|---|---|---|
| Advanced authoring surface | A real code + live-preview environment where Claude Code builds interactive, data-backed, design-system-true experiences the visual editors can't produce. This is the front-half pain we exist to solve. | P1 |
| Source-grounded generation | Claude Code authors *with the real component tree in context* — not a DOM overlay, but a candidate native implementation from the start. | P1, P2 |
| Dual-output artifact | Every experiment produces BOTH (a) a client-side variation to hand the platform for fast testing AND (b) a native-code draft mapped to source. The native draft is the differentiator. | P2, P3 |
| Per-experiment context contract | Auto-generated `CLAUDE.md`-style brief per experiment: design system tokens, component conventions, lint rules, "don't touch" boundaries. | P1 |
| Selector-robustness lint (exists) | Extend the existing lint to flag fragile client-side selectors and prefer stable hooks. | P2 |

### 4.3 Close the loop
| Feature | What it does | Pillar |
|---|---|---|
| **Winner → PR** (the headline feature) | When the platform declares a winner, generate the native implementation as a branch + PR into the customer repo, with description, screenshots, the result pulled from the platform, and a link back to the experiment. | **P3** |
| Origin↔integrated compare (exists) | Promote the existing VS-Code-style diff into the PR review surface. | P3 |
| Experiment ledger | Every experiment writes an immutable record (idea → variation → result → PR → merge SHA). The seed of P4. | P4 |

### 4.4 Trust rails (non-negotiable from day one)
| Feature | What it does |
|---|---|
| PR-only, human-merge | We never merge. A human dev approves and merges. Full stop. |
| Scoped, revocable tokens | Per-repo GitHub App install; customer can revoke instantly. |
| Full audit log | Every generation, deploy, promote, and PR is logged with actor + timestamp. |
| No secret exposure | Repo credentials stored server-side (vault), never in generated artifacts or client. |

**Horizon 1 exit criteria:** one non-Outrigger design partner on a React/Next stack runs *idea → source-aware experiment → test → winner → merged PR* without us hand-writing the integration. That demo is the fundraise/acquisition proof.

---

## 5. Horizon 2 — Build the Moat (3–6 months)

**Goal:** make source-awareness and the production bridge deep enough that an incumbent would rather buy than rebuild.

### 5.1 Deep source-awareness (P2)
| Feature | What it does | Leg up |
|---|---|---|
| Multi-stack resolvers | First-class resolvers for React/Next, Vue/Nuxt, Svelte, Rails/ViewComponent, .NET Razor, Shopify Liquid, and headless CMS (Contentful/Contentstack) bindings. | Breadth incumbents don't have. |
| Component-graph indexing | Index the repo into a component/route graph so a page region resolves to the owning component with high confidence (not grep guessing). | Confidence = trust = merges. |
| Design-system awareness | Ingest the customer's design tokens / component library so generated code uses *their* primitives, not ad-hoc markup. | PRs a senior dev accepts with light edits. |
| Round-trip drift detection | Detect when the live source has changed since the experiment was authored; re-base the native draft. | Keeps winners shippable weeks later. |

### 5.2 CI/CD-native (P3 — "seamless for any dev team")
| Feature | What it does | Leg up |
|---|---|---|
| Checks integration | Generated PRs run the customer's existing CI (tests, lint, typecheck, visual regression) and surface status inline. | We meet devs where they already are. |
| Preview-deploy links | Attach the customer's own preview (Vercel/Netlify/Amplify) to the PR, plus our sanitized preview as fallback. | Reviewers see it live. |
| Codeowners-aware routing | Respect `CODEOWNERS` — auto-request the right reviewers. | Feels native, not bolted-on. |
| Framework adapters SDK | A documented adapter interface so a customer's platform team can teach us a bespoke stack in a day. | Extensibility = enterprise fit. |

### 5.3 Git-native experiment history (P4)
| Feature | What it does | Leg up |
|---|---|---|
| Experiment-as-commit lineage | Each experiment maps to a branch/PR/merge lineage queryable as history: "show every experiment that touched checkout." | Institutional memory nobody else has. |
| Winner/loser provenance | Even losing experiments are archived with their code + result, so teams stop re-testing the same idea. | Compounding org value. |
| Revert-a-winner | Because winners are real commits, they revert like any code — no orphaned client-side JS to hunt down. | Directly kills the tech-debt pain. |

### 5.4 Build-and-ship visibility (not test analytics)
We deliberately do **not** build test dashboards, significance, or reporting — that's the experimentation platform's job, and duplicating it would make us look like a competitor to our own acquirers. We instrument only what *we* uniquely create: what got built, and whether it shipped.
| Feature | What it does |
|---|---|
| Time-to-production dashboard | The metric that sells us: **time (and $) from "winner declared" to "merged in prod."** Trend it down. |
| Native-ship rate | % of winners shipped as production code vs. stranded as client-side JS. Our north-star. |
| Build-ledger portfolio view | Every prototype we authored across all properties, filterable by surface, status, and dev-owner — including the advanced ones the visual editor couldn't have produced. |

**Horizon 2 exit criteria:** three design partners across three different stacks; median winner→merged-PR time cut by an order of magnitude vs. their baseline; a published case study with the number.

---

## 6. Horizon 3 — Platform & Enterprise (6–12 months)

**Goal:** enterprise-ready, multi-connector, governed — the shape a strategic acquirer can drop into their platform.

### 6.1 Connector breadth
- Experimentation connectors: **Optimizely Web** (done) + **Optimizely Feature Experimentation**, **LaunchDarkly**, **VWO**, **Statsig/Amplitude**, **AB Tasty**, **GrowthBook**. Each connector = another acquirer whose customers we already serve.
- Repo connectors: GitHub (done), **GitLab**, **Azure DevOps** (read-model already proven with Outrigger), **Bitbucket**.
- CMS bindings: Optimizely CMS, Contentful, Contentstack, Sitecore, Shopify, WordPress.

### 6.2 Governance & enterprise trust
| Feature | What it does |
|---|---|
| SSO/SAML + SCIM | Enterprise identity, provisioning, deprovisioning. |
| Approval workflows | Configurable gates: who can author, who can promote to experiment, who can open a PR, who can merge. |
| Environment guardrails | Prep-before-prod enforcement (already a principle in our Optimizely client); block prod traffic without sign-off. |
| SOC 2 Type II + pen test | Table stakes for writing to enterprise repos. Start the audit in this horizon. |
| Data residency & retention | Configurable; no customer source stored beyond what's needed to generate the PR. |

### 6.3 Collaboration
- Agency/external-reviewer mode (already have protected shareable deploys) — first-class multi-party review where an agency uses the prototype as source-of-truth.
- Comment threads on experiments and PRs; Slack/Teams notifications.
- Figma import → experiment (design-to-experiment on-ramp).

### 6.4 Intelligence layer (optional, later — stay in our lane)
We do **not** generate test ideas from heatmaps/analytics — that's the platform's territory and pulls us back toward looking like a testing tool. Our intelligence is about *building and shipping*:
- **Build-assist**: suggest components/patterns from the customer's own design system while authoring an advanced prototype.
- **Ship-prioritization**: rank the winner backlog by implementation cost/effort so the easiest-to-ship winners go first.

**Horizon 3 exit criteria:** SOC 2, 2+ experimentation connectors live, one Fortune-500-tier logo, ARR that turns an acquihire into a tuck-in.

---

## 7. The "Leg Up" — features competitors structurally can't ship fast

These are the ones to over-invest in, because they're where incumbents are weakest.

1. **Authoring beyond the visual-editor ceiling** (P1) — a real code environment for advanced, interactive, source-true experiences the Opti/VWO editors can't build. The vendors' authoring surface *is* the editor; matching us means building an IDE.
2. **Native-code winners with a mergeable PR** (P3) — Optimizely/VWO/AB Tasty all stop at client-side. This is the whole game.
3. **Cross-stack source resolvers** (P2) — marketer-centric DXPs have no muscle here; it's real dev tooling.
4. **Git-native experiment history + revert-a-winner** (P4) — their data model is server-side test config; ours is source. They'd have to re-architect.
5. **The build-and-ship KPI** — we name, measure, and shrink the cost of getting an advanced experiment built and shipped, which nobody instruments end to end.
6. **Adapters SDK** — lets enterprise platform teams extend us; turns "does it support my weird stack?" from a blocker into a one-day integration.

---

## 8. Seamless for Any Dev Team (the adoption thesis)

Adoption dies if we feel like a foreign object in the dev workflow. Design principles:

- **We live in the PR, not in a portal.** The dev's surface is a normal pull request with normal CI, normal reviewers, normal preview links. If they never open our app, we still win.
- **Least privilege, revocable, PR-only.** We never touch the default branch. A dev can audit exactly what we'd change before granting anything.
- **Their conventions, not ours.** Generated code uses their design system, their component patterns, their lint config. The bar is "merge with light edits," and we instrument that acceptance rate.
- **One-day stack onboarding.** The Adapters SDK + stack autodetect means a platform team can teach us their repo without a services engagement.
- **Read-only by default on sensitive sources.** (Proven pattern: the Outrigger Azure DevOps clone is strictly read-only.) We can operate in "suggest-only" mode where we never write, only propose diffs.
- **Escape hatches everywhere.** Every generated artifact is plain HTML/CSS/JS/component code the team owns — no lock-in, no runtime dependency on us to keep a winner live.

---

## 9. Acquisition Desirability (what makes them want to buy, per target)

Ranked by fit from the research. Build the connector for each *before* the conversation — nothing sells like "we already serve your customers."

### 9.1 LaunchDarkly (top target)
- **Why they want it:** their flag→experiment→ship loop is developer-native but stops at the flag; we add "AI authors the variant + ships the winner as code." Fills their weakest link. They actively tuck in small teams (Highlight.io, Houseware, 2025).
- **Build to attract them:** LaunchDarkly connector, flag-aware experiments, PR generation that wires the flag into the shipped code.

### 9.2 Amplitude (strong target)
- **Why they want it:** just absorbed Statsig's brand/customers (post OpenAI–Statsig); hungry to differentiate in experimentation. We make their experiments *ship*.
- **Build to attract them:** Amplitude/Statsig connector — the experiments they run get *built advanced* and *shipped as code* through us.

### 9.3 Optimizely (strongest narrative, hardest buyer)
- **Why they want it:** exact Opal roadmap overlap; they own Web + Feature Experimentation and want agents that run experiments. We are the "and then it ships" they don't have.
- **Reality check:** $1.1B debt restructuring (Golub, Dec 2024) + PE optimize-for-exit posture = price-sensitive, and **most likely to build it themselves via Opal.** Court them, but don't depend on them.
- **Build to attract them:** deepest Optimizely CMS source-awareness (we already have the ASP.NET head start), Opal/MCP interop so we're complementary, not competitive.

### 9.4 Create the bidding dynamic
The difference between a $5M acquihire and a $40M+ tuck-in (comps: Intellimize eight-figures, NetSpring ~$40M) is **a second interested party.** Build ≥2 connectors and run ≥2 conversations in parallel. Never negotiate with only Optimizely.

### 9.5 Diligence-ready assets to build alongside the product
- Clean git-native experiment ledger (our own product proves our own thesis).
- Documented Adapters SDK (shows the moat generalizes).
- Case study with the experiment-to-production time/cost delta.
- SOC 2 + pen test (removes the scariest diligence question about repo writes).
- Clean IP: no customer proprietary source reproduced or retained beyond generation.

---

## 10. Build-vs-Buy Defense (the #1 risk)

Optimizely (Opal), Adobe (Experimentation Accelerator), and Amplitude are shipping agentic experimentation *now*. Our survival depends on staying in the part they find hardest:

- **Go deep on P1/P3 (advanced authoring + shipping).** Never try to out-feature them on testing, stats, targeting, or reporting — plug into it. Win on the build-ceiling and the production bridge, the two things their platforms do worst.
- **Be the neutral layer.** Support many experimentation platforms and many repos. A neutral bridge is more valuable (and more acquirable by *any* of them) than a single-vendor feature.
- **Compound the data moat.** Every repo we learn improves resolvers. Ship telemetry (with consent) on PR-acceptance rate to keep raising generation quality.
- **Move now.** The window is narrow — Opal is "one product decision away." Speed to a referenceable multi-stack proof is the strategy.

---

## 11. Sequencing Summary

| Horizon | Timeframe | Headline outcome | Proves |
|---|---|---|---|
| **H0** | done | Single-tenant Outrigger loop works | Feasibility |
| **H1** | 0–3 mo | Multi-tenant; one modern-stack partner runs idea→winner→merged PR | It generalizes |
| **H2** | 3–6 mo | 3 stacks, order-of-magnitude faster winner→prod, published case study | The moat is real |
| **H3** | 6–12 mo | SOC 2, multi-connector, enterprise logo, ARR | It's acquirable |
| **H4** | 12+ mo | Parallel acquirer conversations, bidding dynamic | The exit |

---

## 12. Metrics We Live By

The product must instrument the thing we sell:

- **Native-ship rate** — % of winning experiments shipped as production code (vs. stranded client-side). *Our north star.*
- **Time-to-production** — hours from winner-declared to merged PR. Trend down relentlessly.
- **PR-acceptance rate** — % of generated PRs merged with light/no edits. Proxy for generation trust (P1/P2).
- **Infeasible-made-feasible** — # of advanced experiments built that the visual editor could not have produced. Proves the build-side pillar (P1).
- **Displaced dev-labor $** — modeled savings vs. the ~$3K/variant, ~$20K/experiment baseline. The ROI slide.

---

*Open questions to lock next: (1) commercial name; (2) first non-Outrigger design partner + their stack; (3) connector #2 — LaunchDarkly vs. Amplitude first; (4) pricing model (per-seat vs. per-experiment vs. displaced-labor). Answer these before H1 build starts.*
