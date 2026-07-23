/**
 * Built-in generic skills, seeded into the library on first load.
 *
 * These are the two things every prototype instance should get regardless of
 * customer: a real mental model of the system it's inside, and a way to send
 * what it learns back. Without the first it reverse-engineers the architecture
 * from file paths; without the second, hard-won findings die in a transcript.
 */

export const SYSTEM_SKILL = `---
name: opmc-system
description: How the OPMC platform works end to end — the nouns, who authors what, the artifact contract, the skill library, and how work reaches production. Load this first on any prototype branch to understand the system you're inside.
---

# The OPMC system

You are working inside **OPMC** — a build-and-ship layer for web experiments. It exists so a prototype can be authored with real tooling (you, in a real repo) instead of inside an experimentation platform's visual editor, then reviewed on the customer's real site and handed to an experiment.

## The three nouns

- **Customer** — a brand. Owns a GitHub connection, environments, repos, skills.
- **Environment** — one of their sites (prep/staging/production). Each has a **loader tag** installed in the site template; it's inert until a page is opened with \`?opmc=<key>\`.
- **Prototype** — one experiment idea. Owns a brief, target pages, a git branch, and versions.

## Who authors what — the boundary that keeps this safe

| Path | Author | Never touched by |
|---|---|---|
| \`.opmc/**\` | **The console** | You — it's regenerated on re-sync; your edits are lost |
| \`.claude/skills/**\` | **The console** (skill library) | You — manage skills in the console |
| \`src/**\`, \`dist/variation.js\` | **You** | The console — it only ever reads them |
| \`source-site/\` | **Nobody** — read-only symlink to the customer's production source | Everyone. Read it; never write it |

Disjoint trees, so two writers never clobber each other.

## The contract

One file: **\`dist/variation.js\`** on your branch. Self-contained — injects its own CSS, HTML and behavior; no imports, no CDN, no external assets. The console *pulls* it; it never authors code. That same file is what ships to the experimentation platform, so it has to stand alone.

## How your work reaches a real page

1. You build and push \`dist/variation.js\`.
2. The console's loader serves it to any page opened with \`?opmc=<key>\`.
3. The loader tag is already in the site template, so no deploy is needed to review.
4. When it's good, a **version** is cut — freezing that exact commit's artifact.
5. The console produces an **Optimizely bundle**: the variation JS, URL targeting, and metric, to paste into a Web Experiment.

Normal visitors never see anything — the review URL is token-gated.

## The skill library

Skills are managed in the console, in three tiers:

- **generic** — every prototype, every customer (this skill, the build loop, the ideas channel)
- **brand** — one customer's prototypes (their fidelity rules, their stack)
- **prototype** — a single build

A prototype's effective set is materialized into \`.claude/skills/\` on its branch. If a skill you need doesn't exist, that's worth submitting — see \`opmc-ideas\`.

## What the console can and can't do

**Can:** provision \`.opmc/\` (brief, page snapshots, data + design tokens), create your branch off \`starter\`, pull your artifact, cut versions, report what's being served.

**Can't:** write your code, see your local filesystem, or reach the customer's production source. Anything about *your machine* (folder paths) is passed to you through the init command, never stored server-side.

## Ground truth beats assumption

The console exposes \`GET <consoleUrl>/api/loader/status?key=<key>\` (no token). It reports the **served** commit vs the **branch HEAD** commit, cache age, and whether the artifact is a stale template build. After pushing, poll it until your commit is live — don't debug appearance against a cached build.
`;

export const IDEAS_SKILL = `---
name: opmc-ideas
description: Send an improvement back to the OPMC platform — a missing capability, a skill that should exist, a console bug, or friction that cost you time. Use whenever you hit something the system should have done for you.
---

# Sending ideas back

You see this system's friction more directly than anyone: a file that should have been in \`.opmc/\`, a skill that should exist, a status that lied, a step that took an hour and should have taken a minute. **That knowledge is worth more than the prototype you're building**, and it evaporates when the session ends unless you send it.

## When to submit

- You reverse-engineered something the console could have handed you.
- A **skill should exist** (generic, brand, or prototype-specific) and doesn't.
- The console did something wrong, misleading, or surprising.
- You found a pattern worth making standard.
- A guardrail should have stopped you and didn't.

Submit as you go, while the cost is fresh — not "at the end."

## How

\`\`\`bash
curl -s -X POST "$OPMC_URL/api/ideas" \\
  -H "Authorization: Bearer $OPMC_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prototypeKey": "<key>",
    "category": "app",
    "title": "One line: what should change",
    "body": "What happened, what it cost, and the specific change you propose."
  }'
\`\`\`

\`category\`: \`app\` (console), \`skill\` (a skill should exist/change), \`workflow\` (the process), \`bug\`, \`other\`.

Take \`OPMC_URL\` and the prototype key from \`.opmc/context.json\`. The token is the same one used for cutting versions — it's in your shell env, never in the repo.

## What makes an idea useful

A good submission is **specific and grounded in what actually happened**:

- **What you hit** — the concrete situation, not a generalization.
- **What it cost** — "spent 40 minutes finding the room JSON by trial and error."
- **What should change** — the actual proposal, at the level of a file, endpoint, or rule.

> **Good:** *"\`data.md\` should list \`window.*\` globals at capture time. The room JSON was the whole architecture of this prototype and I found it by luck. One file turns hours of spelunking into one read."*
>
> **Weak:** *"Better documentation would help."*

If you can name the file that should exist, name it. If you can draft it, say so — offering to draft the thing is more useful than describing it.

## Don't

- Don't submit secrets, tokens, or customer data — ideas are read by humans in a shared console.
- Don't submit instead of doing the work; submit alongside it.
- Don't editorialize about the user. Describe the system.
`;
