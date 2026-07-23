# Opal vs. the Agent-Native Authoring Layer — Enterprise Gap Analysis

*Researched 2026-07-23 against Optimizely's own current documentation. Every load-bearing claim below carries a receipt — most of them verbatim from Optimizely's support center. Companion to [`VISION-SHIPPABLE.md`](VISION-SHIPPABLE.md) and the pitch deck.*

---

## 1. Executive Summary

Opal is real, well-built, and moving fast — an agent **orchestration** platform (15+ out-of-the-box agents in 2026, a Python/FastAPI Tools SDK, an MCP server, A2A integration with Gemini Enterprise). It runs on **Google Gemini's model family, with Anthropic Claude added via Vertex AI as of March 15, 2026**.

But on the exact ground we occupy — *authoring experiment variations as real code, collaboratively, with provenance* — Optimizely's own documentation draws the boundary for us, in three sentences:

> **"The variation development agent is only available in the new Visual Editor."**

> **"Variation-level code changes (custom HTML, CSS, and JavaScript) are not supported through MCP. Instead, use the Visual Editor."**

> **"Any code Opal generates is a custom code solution and falls outside the scope of Optimizely Support."**

Read together: Opal's authoring lives **inside the editor ceiling**, their **own agent-integration surface (MCP) excludes variation code**, and when Opal does generate code, **Optimizely disclaims support for it**. The generated-code output is ephemeral, single-experiment, un-versioned, un-reviewed on any real environment, and has no path to production source.

That's not a product criticism — it's a deliberate scope decision by a platform whose center of gravity is the marketer in the editor. It is also, precisely, the layer we built.

## 2. What Opal Actually Is (fair reading)

| Aspect | Reality |
|---|---|
| **Architecture** | Agent orchestration across Optimizely One: small specialized agents for content, commerce, experimentation. A2A-powered collaboration with Google's stack (Gemini Enterprise). |
| **Models** | Gemini family; Claude family via Vertex AI since 2026-03-15. Note: *"Effective March 12th, 2026 Optimizely may allocate Opal workloads to any of its approved LLM models"* — the customer doesn't choose or pin the model. |
| **Experimentation agents** | Variation development agent (Visual Editor), Experiment Review, Program Overview, Conflict Checker, Value Estimator, Competitive Webpage Analysis — plus copy suggestions, test ideas, results summaries. |
| **Extensibility** | Opal Tools SDK (Python/FastAPI, function annotations); MCP server for external AI tools (Cursor, Claude Code, Claude Desktop) covering query/manage/implement operations. |
| **Commercials** | Credit-based usage billing across all Opal features (since May 2025). |

**What the variation development agent does well:** element modifications and styling with brand consistency ("automatically retrieving page styles"), new components (banners, countdown timers, widgets), and variation ideation from patterns in the experiment's other variations. For editor-expressible changes, this is genuinely useful and reduces custom-code requests.

## 3. The Seven Structural Gaps (each with its receipt)

### Gap 1 — Editor-bound authoring
*"The variation development agent is only available in the new Visual Editor."*
The agent operates on the DOM through the editor's change model. Complex interactive experiences — a data-driven overlay joined to the page's embedded JSON, multi-step flows, components with real state — are beyond what the editor's change format expresses. **Ours:** an agent in a real repo with real tooling; anything buildable in code is buildable.

### Gap 2 — Their own MCP excludes exactly our territory
*"Variation-level code changes (custom HTML, CSS, and JavaScript) are not supported through MCP. Instead, use the Visual Editor."*
Optimizely built an MCP server for developers in Claude Code and Cursor — and scoped variation code **out of it**. External agents can create experiments and audiences but cannot author the variation itself. **The precise hole in their agent story is our entire product.**

### Gap 3 — Generated code is disclaimed, not certified
*"Any code Opal generates is a custom code solution and falls outside the scope of Optimizely Support."*
Opal will generate custom code when a request requires it — and the moment it does, the customer is on their own. No QA gate, no injection-timing test, no idempotency check. We know from live experience what that means: our own variation passed review and died silently in the experiment (early `<head>` injection vs. post-load) — a failure class Opal's output walks into with no net. **Ours:** the Certification Pipeline exists *because* of these failure modes, and the output is certified rather than disclaimed.

### Gap 4 — No git, no versions, no provenance
Nothing in Opal's documentation describes version control, export, or code ownership workflows for generated variations. Changes preview in-editor and persist on "Save All" — the unit of storage is the experiment's change list. There is no SHA, no diff, no history, no "what exactly ran in this experiment?" answer at the code level. **Ours:** every variation is a commit; every ship is an immutable SHA-pinned version; review-bytes = ship-bytes = recorded-bytes.

### Gap 5 — Single-player, single-experiment isolation
The agent works inside one editor session on one experiment. No documented collaboration: no team working the same variation, no review workflow, no stakeholder approval chain, no reuse of a built component across experiments or brands. Each experiment's AI work starts from zero (its context is "the changes already made in your experiment's other variations"). **Ours:** a git branch any teammate or agent can pick up; skills and captured intelligence that compound across every prototype and brand; a program board with sign-off gates.

### Gap 6 — Preview-only review; no real-environment truth
Review is an in-editor before/after preview. There is no token-gated injection on the customer's actual lower environment, no "stakeholders click a link and see the real page," no ground-truth status API. **Ours:** the loader review surface — verified live on a real enterprise prep environment — plus `/api/loader/status` making staleness a fact rather than a feeling.

### Gap 7 — Winners still strand
Opal changes nothing about the shipping gap: a winning variation remains client-side editor changes (or disclaimed custom code) with no path to a production pull request. **Ours:** winner → PR, with the agent productionizing against the customer's real source tree — already proven in resolver form on a production ASP.NET/Optimizely CMS codebase.

### (Enterprise footnote — model governance)
*"Optimizely may allocate Opal workloads to any of its approved LLM models."* Enterprises can't pin, choose, or audit which model authored a given change; combined with credit-based metering, cost and behavior are both platform-allocated. **Ours:** the authoring agent is the customer's own Claude Code (or our hosted runtime), with the session transcript as the audit trail.

## 4. Enterprise Capability Matrix

| Capability | Opal (documented, 2026-07) | OPMC (today / roadmap) |
|---|---|---|
| Authoring surface | Visual Editor only | Real repo + real tooling (today) · hosted agents (P2) |
| Complexity ceiling | Editor change model | Anything expressible in code — proven with a data-joined overlay no editor could build |
| Custom code stance | Generated but **unsupported** | Generated, **certified** (dual injection timing, idempotency, re-render, analytics-scan…) |
| Agent access to variation code | **Excluded from their MCP** | The entire product; MCP interop is our roadmap, not our blocker |
| Version control / provenance | None documented | Git-native; SHA-pinned immutable versions; drift guard (today) |
| Team collaboration | None documented | Branch-based; any human or agent resumes the work (today) |
| Review surface | In-editor preview | Injected on the real lower environment, token-gated (today) |
| QA gate | None | Certification Pipeline (v1 in Phase 1) |
| Ship verification | Manual save | API push + read-back diff (Phase 1); we've lived the empty-paste failure it kills |
| Winner → production | None | Agent-drafted PR against real source; Razor resolver proven, adapters roadmap |
| Cross-experiment knowledge | Per-experiment context only | Skills + capture intelligence + ideas — compounds across brands (today) |
| Program management | Agent reports/summaries | Program board over ground truth; Testing locked to live experiment status (P2) |
| Model governance | Platform-allocated ("any approved model") | Customer-controlled agent; full session audit trail |
| Learning loop | Static agents + credits | Friction → ideas → skills → checks; same-day flywheel already observed |

## 5. Strategic Read

1. **The complementarity story survives contact with the evidence — and gets stronger.** Opal orchestrates and ideates; its own docs wall it off from deep variation authoring. "The layer that completes Opal" isn't spin; it's their documented scope plus ours, with MCP as the seam they already built.
2. **Their MCP exclusion is our door.** Optimizely explicitly points developers in Claude Code at their MCP server — and explicitly tells them variation code isn't there. We are the missing tool call.
3. **"Falls outside the scope of Optimizely Support" is the Certified Variations pitch in their words.** The platform's own AI generates artifacts the platform won't stand behind. A certification gate is the obvious product answer, and nobody — including them — has built it.
4. **The build-vs-buy risk is now better bounded.** For Opal to match us they would need: a repo-native authoring runtime, git provenance, a real-environment review loader, a QA gate, per-customer source-awareness, and a compounding knowledge system — none of which extend naturally from an editor-embedded agent. That's not a feature gap; it's an architecture gap.
5. **Keep being fair in the pitch.** Opal is good at what it scopes itself to. The deck should quote their boundaries, not caricature their product — the quotes are stronger than any caricature.

## Sources

- [Optimizely Opal and AI features — Support](https://support.optimizely.com/hc/en-us/articles/23727985454861-Optimizely-Opal-and-AI-features)
- [AI variation development agent — Support](https://support.optimizely.com/hc/en-us/articles/38406424155533-AI-variation-development-agent)
- [Optimizely Experimentation MCP server overview — Support](https://support.optimizely.com/hc/en-us/articles/45320607594893-Optimizely-Experimentation-MCP-server-overview)
- [Optimizely Opal overview — Support](https://support.optimizely.com/hc/en-us/articles/36354416686477-Optimizely-Opal-overview)
- [2026 Optimizely Opal release notes — Support](https://support.optimizely.com/hc/en-us/articles/37791100847373-2026-Optimizely-Opal-release-notes)
- [Opal via Google's Gemini Enterprise — CMS Critic](https://cmscritic.com/optimizely-opal-fuels-marketers-with-powerful-ai-agents-via-googles-gemini-enterprise)
- [What's new in Optimizely Opal — January 2026](https://www.optimizely.com/insights/whats-new-in-optimizely-opal-january-2026/)
- [Opal University press release](https://www.optimizely.com/company/press/opal-university)
