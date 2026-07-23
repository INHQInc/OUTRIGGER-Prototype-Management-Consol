---
name: opmc-prototype-triage
description: Diagnose a misbehaving prototype in the OPMC console — wrong/old code injecting, a build that won't appear, branch creation failing, fonts wrong in preview, or "it works locally but not on the review URL". Load when someone reports an issue with a specific prototype.
---

# Triaging a prototype

Work the ladder in order. Each rung is cheap and rules out a whole class of cause. **Do not start reading variation code until rung 3** — most reports are state problems, not code problems.

## 1. Ground truth: what is actually being served?

```bash
curl -s "<consoleUrl>/api/loader/status?key=<prototypeKey>" | python3 -m json.tool
```

Tokenless. Read it literally:

| Field | Meaning |
|---|---|
| `head.commit` | what's at the branch tip on GitHub |
| `served.commit` | what the loader will hand the page **right now** |
| `stale` / `staleForMs` | the 20s cache hasn't expired — wait, don't debug |
| `head.built` | is there an artifact at HEAD at all |
| `artifactProblem` | `starter-build` = serving the template's build · `placeholder` = provisioned stub, never built |
| `latestVersion` | `null` means no version was ever cut |

**"My change isn't showing"** is `stale: true` or `head.commit ≠ what they pushed` far more often than it is a bug.

## 2. Did the push actually land?

The console reads **the branch on GitHub** — the user's local working tree is invisible to it. If `head.commit` isn't their commit, the work isn't pushed. Check for uncommitted changes, but **never commit on their behalf** if another Claude session is working in that folder.

## 3. Is it the right artifact?

`artifactProblem: "starter-build"` → the branch is serving the inherited template build. They need one real `node build.mjs` + commit + push.

Note: a namespace that differs from `opmc-<key>` is **not** a problem — short namespaces are legitimate.

## 4. Can the token do what's being asked?

Branch creation or provisioning failing is almost always token scope, not app logic:

- `403 Resource not accessible` → token **can't write**. Needs `Contents: Read and write`.
- `404` on a repo that exists → token **can't see it** — private repo not in the PAT's repository access.
- **"Public repositories" access tier is read-only**, whatever Permissions say, and gives zero access to private repos.

Check the write probe on **Settings → Repositories** (it attempts a ref creation with a bogus SHA: `403` = no write, `422` = write OK). Don't trust `permissions.push` from `GET /repos` — it reflects the account's role, not the token's grant.

## 5. Only now: the variation itself

- Idempotent guard present? Runs twice → one instance?
- Late-injection safe? The loader injects **after** window load, so `DOMContentLoaded` listeners never fire.
- Survives re-render? Needs a MutationObserver if the page rebuilds its DOM.
- Same-origin assets only.

## Preview-specific

Serif everywhere in `node dev.mjs` = **CORS-blocked webfonts**, not a CSS bug. The dev server proxies stylesheets to fix this; if it's still wrong, they may be on an old `dev.mjs` (pull `starter`). `EADDRINUSE` on 4400 means another preview is running — `PORT=4401`.

Full detail: `docs/RUNBOOK.md`.
