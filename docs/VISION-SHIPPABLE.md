# The Agent-Native Experiment Authoring Layer — Vision & Shippable Feature Map

*Last updated: 2026-07-23 — the day the loop closed end-to-end for the first time.*

> Companion to [`PRODUCT-ROADMAP.md`](PRODUCT-ROADMAP.md) (market positioning, pillars P1–P4, acquirer analysis). That doc says **why** and **where**. This doc says **what we build, feature by feature**, to get from today's working prototype to a product **anyone can use**, that is **shippable as a company**, and that is **buyable by Optimizely** (or LaunchDarkly, or Amplitude — never negotiate with one).

---

## 1. The Vision, One Paragraph

Anyone — a PM, a marketer, a dev — describes an experiment in plain language. An **agent builds it in real code**, against the real site's real components, data, and design system. The team **reviews it injected on their actual environment** before any experiment exists. It ships to the experimentation platform as a **certified, SHA-pinned variation** — pushed by API, verified by an automated QA gate that knows the failure modes humans don't. Winners become **production pull requests**. And the platform **learns from every session**: every piece of friction an agent hits becomes a skill, a check, or a fix that every future session inherits. Nobody authors experiment code by hand, nobody pastes JavaScript into a custom-code box, and no winner is ever stranded as orphaned client-side script again.

**The category: agent-native experiment authoring.** Not a testing tool. Not a visual editor. The layer the experimentation platforms are missing on both sides of their own product.

## 2. What Today Proved (2026-07-23)

The thesis stopped being a claim today. In one session, with one live tenant:

| Proof | What happened |
|---|---|
| **Agent authors beyond the editor ceiling** | A Claude instance built a full room-detail overlay — modal, gallery, data-joined from the page's embedded JSON, brand-exact against real SCSS — no visual editor could produce it. |
| **Real-environment review works** | Reviewed injected on prep.outrigger.com via the token-gated loader, before any experiment existed. |
| **It ships into a real Optimizely experiment** | The same artifact runs as Variation #1 custom code in a real Web Experiment. Verified live. |
| **The QA moat is real** | Shipping surfaced a failure mode no human would predict: Optimizely injects **early** (`<head>`, pre-body) while our loader injects **late**. The variation passed review and died in the experiment — twice, in two different layers (`init()` bail; `document.body` append). Both are now permanent platform knowledge. |
| **The platform learns** | The building agent's feedback (missed data island) became a shipped extractor fix the same day. The injection lesson became skill guidance + a template fix every future prototype inherits. |
| **Agents self-orient** | A fresh instance wakes up, reads `opmc-system`, checks `/sync-status`, self-heals drift, and starts working — zero human briefing. |

That last row is the moat no incumbent has: **the flywheel where doing the work improves the platform that does the work.**

## 3. The Product in One Diagram

```
  DESCRIBE            BUILD                REVIEW              CERTIFY & SHIP         LEARN
┌───────────┐   ┌──────────────────┐   ┌──────────────┐   ┌───────────────────┐   ┌────────────┐
│ Brief      │→ │ Agent in a real   │→ │ Injected on  │→ │ QA gate → API push │→ │ Ideas →    │
│ (anyone    │   │ repo: components,│   │ the REAL     │   │ to Optimizely as a │   │ skills →   │
│ writes it) │   │ data, tokens,    │   │ lower env    │   │ certified, SHA-    │   │ every next │
│            │   │ skills loaded    │   │ (?opmc token)│   │ pinned variation   │   │ session    │
└───────────┘   └──────────────────┘   └──────────────┘   └───────────────────┘   └────────────┘
                                                              ↓ winner declared
                                                          Production PR (P3)
```

## 4. Feature Map — Everything Between Here and Shippable

Organized by the journey. Status: ✅ built · 🟡 partial · ⬜ to build. Each ⬜ carries the "why it gates shipping" in one line.

### 4.1 Onboarding — "anyone can start without us in the room"

| # | Feature | Status | Why it gates shipping |
|---|---|---|---|
| O1 | **GitHub App OAuth** replacing PATs — repo-scoped install, PR-only permission, one-click revoke | ⬜ | Today's PAT saga (403/404/"Public repositories" tier) took a founder + an AI hours. A normal user churns in minutes. Disqualifying as-is. |
| O2 | **Auto-provisioned prototypes repo** — console creates the repo from a template on connect (no manual `starter` branch requirement) | ⬜ | "Your repo must contain a starter branch" is insider knowledge. The product should manufacture its own preconditions. |
| O3 | **Site compatibility check** — on adding an environment: SSR test, CSP parse, bot-protection detect, loader reachability → red/green verdict with the reason | ⬜ | We know the boundary (SSR + CSP-permissive + loader-installable). Today it's tribal knowledge; it must be a 30-second automated verdict before a customer invests an hour. |
| O4 | **Loader install paths ×3** — one-line tag · GTM template · **via the Optimizely snippet itself** (project JS/custom snippet — zero site-template access needed) | 🟡 tag only | The Optimizely-snippet path removes the single biggest onboarding blocker (waiting on a site deploy) — and it's the acquisition-integration story in miniature. |
| O5 | Experimentation platform connect — OAuth to Optimizely, project picker, scoped token vault | 🟡 PAT-based | Same PAT problem, different platform. |
| O6 | Guided first-run — sample prototype, checklist, "your first experiment in 30 minutes" | ⬜ | Activation. |

### 4.2 Authoring — the agent-native core

| # | Feature | Status | Why it gates shipping |
|---|---|---|---|
| A1 | **Hosted build agents** — click *Build*, an agent runs in a cloud sandbox (clone, skills, source-site, dev-preview), streaming progress + screenshots into the console chat | ⬜ | **THE "anyone can use it" unlock.** Today requires a terminal, a local Claude Code seat, and path-pasting. A PM will never do that. Local mode stays for power users. |
| A2 | `opmc` **CLI** for local mode — `npx opmc init <key>` does clone/branch/symlink/env/skills + restart guidance; cross-platform | ⬜ | Replaces pasted bash + the "which folder?" saga. One command, idempotent. |
| A3 | **Skill library, three tiers** (generic/brand/prototype), in-app authoring + reader, per-prototype selection, delivered into the branch, pruned on deselect | ✅ | Built today. |
| A4 | Skill **versioning + packs** — per-platform packs (Optimizely Web/FX, VWO), per-CMS packs (Optimizely CMS, AEM, Sitecore, Shopify), import/export | ⬜ | Packs are how knowledge scales past one brand — and how "deepest Optimizely awareness" becomes a demo. |
| A5 | **Capture intelligence** — SSR+rendered dual capture; `data.md` (embedded data islands + DOM↔data join keys); `design-tokens.md` (fonts, custom properties, z-index ladder); reference-repo registry + `source-site` symlink | ✅ | Built today. The "hours of spelunking → one read" layer. |
| A6 | **Brief system** — empty-brief interview protocol, agent PATCH-back, console-canonical | ✅ | Built. Add: brief templates per experiment type (⬜, small). |
| A7 | **Self-orientation + self-healing** — `opmc-system` mental model, §0 sync check, tokenless `/sync-status`, agent re-syncs on drift | ✅ | Built today. Extend to hosted agents automatically (A1 dependency). |
| A8 | Console ↔ agent chat — talk to the building agent from the prototype page; approve/iterate without a terminal | ⬜ | The review conversation belongs next to the preview, not in a separate app. Rides on A1. |

### 4.3 Review & QA — trust, and the feature Optimizely can't ignore

| # | Feature | Status | Why it gates shipping |
|---|---|---|---|
| R1 | Live review on the real environment (`?opmc` token-gated loader), per-page verify/confirm, loader heartbeat | ✅ | The canvas. Add: expiring review tokens + per-env review gates (⬜) — today the key is the only secret. |
| R2 | **The Certification Pipeline** — automated QA gate every variation passes before ship: **dual injection timing** (early `<head>` + late post-load — today's lesson, automated) · idempotency (runs twice → once) · re-render survival (MutationObserver) · zero-analytics scan · same-origin asset check · bundle budget · flicker/CLS estimate · multi-viewport screenshots | ⬜ | **The single most acquisition-desirable feature.** Optimizely's custom-code box is a support-ticket generator; a "Certified Variation" badge is the quality gate their platform has never had. Every check encodes a failure we personally paid for. |
| R3 | Stakeholder review — share links, comments, approve/request-changes on the live preview | ⬜ | The agency/marketing loop; adoption spreads through reviewers. |
| R4 | `/api/loader/status` ground truth — served vs HEAD commit, cache age, artifact problems | ✅ | Built today. Kills phantom-staleness debugging forever. |

### 4.4 Ship — closing the loop with the platform

| # | Feature | Status | Why it gates shipping |
|---|---|---|---|
| S1 | **API push to Optimizely** — create/update the experiment's variation custom code by API on every version cut; read-back diff to verify; no paste, ever | 🟡 paused-draft create exists | Today's empty-paste failure and 39KB copy ritual disappear. Cut v3 → it's in Optimizely, verified, in seconds. |
| S2 | **Auto anti-flicker split** — detect above-the-fold, visible-on-load styles; hoist only those into the platform's CSS slot automatically, keep the artifact canonical | ⬜ | The one legitimate reason to split CSS/JS, done by analysis instead of convention. |
| S3 | SHA-pinned immutable versions + drift guard + handoff bundle (manual mode) | ✅ | Built. The traceability spine: review-bytes == ship-bytes == recorded-bytes. |
| S4 | **Results read-back** — experiment status + results displayed in the console (display only; the platform owns stats) | ⬜ | Closes the narrative loop in one pane; feeds S5. |
| S5 | **Winner → production PR** — agent productionizes the winning variation into the real source (it already reads `source-site`), opens a PR with result + provenance; handoff-bundle mode for external repos | 🟡 Outrigger-shaped resolver exists | P3, the crown jewel of the original roadmap. Generalize via **handoff adapters** (per-stack: Razor/Optimizely CMS ✅-ish, React/Next ⬜, Vue ⬜, Liquid ⬜). |
| S6 | Multi-provider connectors — VWO, LaunchDarkly, AB Tasty, GrowthBook behind the existing `ExperimentationProvider` seam | ⬜ | Neutrality = bidding dynamic. Build #2 before any acquisition conversation. |

### 4.5 The Learning Loop — the moat, formalized

| # | Feature | Status | Why it gates shipping |
|---|---|---|---|
| L1 | **Ideas channel** — building agents POST friction/proposals to a triage inbox, attributed to the prototype | ✅ | Built today. Proved same-day: agent feedback → shipped extractor fix. |
| L2 | **Retrospective agent** — after each ship, an agent reviews the session and *proposes* skill updates / new checks (human-approved) | ⬜ | Turns the flywheel from artisanal to automatic. |
| L3 | Idea → draft PR — code-shaped ideas become draft PRs against the console by a maintenance agent (human merge, always) | ⬜ | The platform maintains itself under supervision. |
| L4 | Skill analytics — which skills correlate with fewer iterations, higher certification pass rates, faster ship | ⬜ | Makes knowledge measurable; the diligence artifact for "the moat compounds." |
| L5 | Fleet telemetry — certification pass rate, time-to-live-experiment, PR-acceptance rate, native-ship rate | ⬜ | The metrics that sell the company (§7 of the roadmap). |

### 4.6 The Program Board — run the whole experimentation program

*The manage layer on top of the build layer. Optional — but it's the accelerator for every team that has never run a structured testing program, and it turns the Ideas tab from an inbox into the front of a pipeline.*

| # | Feature | Status | Why it gates shipping |
|---|---|---|---|
| B1 | **Kanban pipeline** — Backlog → Brief → Sign-off → Building → Review → **Testing (locked)** → Decided → Shipped/Archived | ⬜ | The management surface non-technical teams actually live in. The data model already carries `status`, `hypothesis`, and `metrics` per prototype — this is UI over truth we already store. |
| B2 | **Ground-truth stage derivation** — cards advance and lock from real system state: provisioned → built (loader status) → certified → **experiment live (Optimizely API)** → PR merged. Manual dragging only where judgment lives. | ⬜ | The differentiator vs. Jira/Trello: the board can't lie. A card in *Testing* means the experiment is actually running — and the prototype is **immutable while it is** (no editing a live variation). |
| B3 | **Sign-off gates** — brief approval before build; review approval before ship; who-can-approve per role | ⬜ | Governance where human judgment belongs, and nowhere else. |
| B4 | **Hypothesis + metric on every card** — surfaced from the existing model; templates per experiment type | 🟡 model exists | The experimentation discipline most teams never had, built into the workflow instead of a wiki nobody reads. |
| B5 | **Ideas → Backlog graduation** — the ideas inbox (agent- and human-submitted) feeds the board; one click turns an idea into a prototype stub with a draft brief | 🟡 ideas inbox built | Closes the loop from "agent noticed something" to "experiment in the pipeline." |
| B6 | Portfolio view — every prototype across brands, filterable by stage/owner/metric; the "what's live where" answer | ⬜ | The exec surface; also the acquisition demo ("here's a customer's whole program"). |

### 4.7 Enterprise & Multi-Tenant — "shippable as a company"

| # | Feature | Status | Why it gates shipping |
|---|---|---|---|
| E1 | Real schema for skills/ideas/selections (out of the flag store), migrations | ⬜ | Flag-store JSON was the right prototype move; it is not a product datastore. |
| E2 | Roles (admin/builder/reviewer/dev), SSO/SAML + SCIM, audit log surfacing (audit exists ✅) | 🟡 | Enterprise table stakes. |
| E3 | **Secrets vault + token health** — encrypt at rest; the write-probe (✅) runs scheduled; expiry alerts (the current PAT dies Oct 18 and nothing will say why) | 🟡 | Today's #1 support-ticket generator, automated away. |
| E4 | **Loader security hardening** — SRI, key rotation, kill switch, stage gating, per-env allowlists, expiring review tokens | ⬜ | We inject JS into customer production sites. This is the scariest diligence surface; harden it before anyone asks. |
| E5 | Billing, plans, metering (agent-run minutes, prototypes, seats) | ⬜ | Revenue. |
| E6 | SOC 2 Type II path + pen test | ⬜ | Start the clock early; it gates every enterprise logo and every acquirer's diligence. |
| E7 | Tenant-neutral naming & theming (OPMC → commercial name; "opmc-" namespace is cosmetic but everywhere) | ⬜ | Customer #2 shouldn't ship inside another brand's acronym. |

### 4.8 Portability — widening the addressable web

| # | Feature | Status | Why it gates shipping |
|---|---|---|---|
| P1 | **Browser-extension capture** — snapshot DOM + data + styles from a live authenticated session; solves SPAs *and* auth-gated pages in one move | ⬜ | The single biggest boundary-breaker. curl-capture covers server-rendered CMS sites; the extension covers most of the rest. |
| P2 | CSP toolkit — detect at onboarding (O3), nonce/allowlist guidance, first-party loader domain (customer CNAME) | ⬜ | Converts "hard no" sites into "one infra ticket" sites. |
| P3 | Cross-platform dev harness (Windows; no curl dependency) | ⬜ | Half the agencies run Windows. |

## 5. Phases & Exit Criteria

| Phase | Weeks | Ships | Exit criterion (falsifiable) |
|---|---|---|---|
| **1 — Kill the sharp edges** | 0–6 | O1 O2 O3 O4 · S1 S2 · R2(v1: dual-timing, idempotency, analytics-scan) · A2 · E3 | **A stranger onboards, builds, certifies, and pushes an experiment to Optimizely without us in the room or a single paste.** |
| **2 — Anyone can use it** | 6–14 | A1 A8 · R3 · B1 B2 B4 (Program Board v1) · E1 E2 · O6 · customer #2 live | **A non-developer runs idea → certified → live experiment entirely in the browser.** Second tenant proves nothing is Outrigger-shaped. |
| **3 — The loop compounds** | 3–6 mo | S4 S5(React adapter) S6(connector #2) · B3 B5 B6 · L2 L3 L4 · P1 | **A winner ships as a merged PR on a non-.NET stack; a case study quantifies time-to-production.** |
| **4 — Acquirable** | 6–12 mo | E4 E5 E6 · remaining adapters/connectors · L5 dashboards | **Diligence-ready: SOC 2 underway, 2+ connectors, enterprise logo, metrics dashboard that proves the thesis with our own data.** |

**Sequencing rule:** nothing in Phase 2+ starts while a Phase-1 sharp edge still exists. Every hour a founder spends explaining a 403 to a customer is the product failing.

## 6. What "Buyable by Optimizely" Specifically Means

They would be buying four assets, in this order of strategic value:

1. **The authoring layer Opal doesn't have.** Opal ideates and orchestrates *inside the editor ceiling*. We are the "build anything, source-true" surface beneath it — complementary by construction (MCP/Opal interop is a Phase-3 feature, not a hope).
2. **The Certification Pipeline (R2).** A quality gate for the custom-code box — the highest-support-cost, lowest-trust corner of their product. Every check is a failure mode we hit in production, encoded. This is the feature their PM demos internally the week after close.
3. **The winner-codification bridge (S5)** — with the deepest Optimizely-CMS source-awareness in existence as the head start, proven on a real enterprise ASP.NET codebase.
4. **The learning flywheel (L1–L4).** Skills + ideas + retrospectives = a system whose authoring quality compounds with usage. Un-rebuildable by fiat; it has to be *lived*.

And the integration story writes itself: the console embeds as a tab in the Optimizely UI; the loader rides their snippet (O4); "Certified" becomes a badge on their variation screen; Opal calls us over MCP when a request exceeds the editor.

**Discipline (from the roadmap, unchanged):** Optimizely is the strongest *narrative* and the hardest *buyer* — PE-owned, debt-restructured, and the most likely to attempt an internal build. Build connector #2 (LaunchDarkly or Amplitude/Statsig) before any conversation. Two interested parties is the difference between an acquihire and a tuck-in.

## 7. North-Star Metrics (instrumented in-product, L5)

- **Time-to-live-experiment** — brief written → certified variation running in the platform. Target: under a day.
- **Certification pass rate** — first-build pass %, and which checks catch what. Proves R2's value with our own data.
- **Native-ship rate** — % of winners merged as production code. The anti-stranded-JS metric; the category's reason to exist.
- **PR-acceptance rate** — generated PRs merged with light/no edits.
- **Zero-paste rate** — % of ships that touched no clipboard. Should be 100% by Phase 1's end.
- **Flywheel velocity** — ideas submitted → skills/checks shipped → sessions inheriting them, per month.

---

*This document is the build map. `PRODUCT-ROADMAP.md` remains the positioning + acquirer analysis. When they disagree on sequencing, this one wins; when they disagree on strategy, that one does.*
