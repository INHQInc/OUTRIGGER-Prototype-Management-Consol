# RUNBOOK — failure modes and how to diagnose them

*Everything here cost real time at least once. Each entry is: the symptom you'll actually see, why it happens, and the check that settles it.*

**First rule: get ground truth before theorising.** Most of the time lost below was spent debugging a *symptom of a stale or invisible state*, not a real bug.

```bash
curl -s "<consoleUrl>/api/loader/status?key=<prototypeKey>" | python3 -m json.tool
```

Tokenless. Reports `served` vs `head` commit, cache age, `stale`, `staleForMs`, and `artifactProblem`. If this doesn't match what you believe, believe it, not your belief.

---

## GitHub token problems

These accounted for the single longest debugging session in the project's history. The decisive insight: **GitHub reports "can't write" and "can't see" with *different* status codes, and the obvious permission check lies.**

### `403 Resource not accessible by personal access token`

**Means:** the token can see the repo but **cannot write** to it. Creating a branch (`POST /git/refs`) needs `Contents: Read and write`.

**Do NOT trust `GET /repos/{owner}/{repo}` → `permissions.push`.** That reflects the *account's role* on the repo, not the fine-grained PAT's grant. On a repo you own it returns `push: true` even when the token is read-only. We shipped a green "✓ can write" indicator on exactly that basis and it was wrong.

**The reliable probe** (`GitHubClient.canCreateBranch`) — attempt to create a ref with an all-zero SHA:

| Response | Meaning |
|---|---|
| `403` | Token cannot write |
| `422 Object does not exist` | Token **can** write (it passed the permission gate and failed on the bogus SHA) |

No side effects — the zero SHA never creates anything.

### `404` on a repo that definitely exists

**Means:** the token **cannot see it at all.** GitHub returns 404 rather than 403 for private repos a token isn't scoped to, deliberately — it won't confirm a private repo's existence.

Almost always: the PAT's **Repository access** doesn't include it. Which leads to the trap that cost the most time:

### The "Public repositories" tier is read-only

A fine-grained PAT set to **Repository access → Public repositories** gets **read-only** access to public repos **no matter what `Contents: Read and write` says in Permissions**, and **zero** access to private ones.

Symptom sequence that had us chasing ghosts:
1. Repo public + token on the public tier → **reads worked** (branch lists loaded fine), writes 403'd.
2. Repo switched to private → suddenly **404**, because the public-read fallback vanished.

**Fix:** Repository access must be **All repositories** or **Only select repositories** including the target repo.

### Permission changes that "didn't take"

Changing a fine-grained PAT's permissions requires clicking the green **Update** button. Editing dropdowns and navigating away saves nothing. Also: editing permissions does **not** change the token string — so if the app already holds that token, no re-key is needed; if it holds a *different* one, no amount of editing helps.

### Which token is the app even using?

`getOrgGitToken()` prefers the **per-customer connection**, and falls back to `process.env.GITHUB_TOKEN`. The connection tile shows `Connected · <login>` vs `Console default`. Editing a PAT on github.com is irrelevant unless it's the one actually stored.

> **Note:** `connectGitHub()` validates a token via `/user` — proving only that it's *valid*, not that it can *write*. A read-only token connects successfully and fails later at branch creation. The write probe on the Repositories page exists to surface that at connect time.

---

## "My push isn't showing up"

### Phantom staleness

The loader caches the repo artifact for **20s** (`SERVED_TTL_MS` in `lib/prototypes/served.ts`). Reload immediately after a push and you get the old build — which reads as "my code didn't work" and starts a debugging session on a bug that doesn't exist.

**Check `/api/loader/status`:** `served.commit` vs `head.commit`, and `staleForMs` for how long until the cache expires. Only judge appearance once `stale: false`.

### The console only sees *pushed* commits

`resolveRepoSource` reads the branch on GitHub. Your local working tree is invisible. Cutting a version freezes **the pushed artifact**, not what you're looking at locally.

### Browser HTTP cache

After status confirms your commit, the browser may still hold the old artifact. Hard reload (⌘⇧R).

### Deploy lag ≠ code bug

Pushing the console repo doesn't mean it's live. We spent a cycle on a "still broken" error message that was simply a deploy that hadn't finished. Check the deployment before concluding the fix failed.

---

## Artifact problems

### Wrong prototype is injecting

A fresh branch forks from `starter`, which carries `starter`'s own built `dist/variation.js`. Until the first real build, the review URL serves **the template's** variation.

`artifactProblem` (in `served.ts`) detects exactly two states: `starter-build` and `placeholder` (the console's provisioned stub). Provision resets `dist/` to a key-namespaced stub on **first provision only** — never on re-sync, which would clobber real work.

**Do not** flag "namespace ≠ `opmc-<key>`" as a problem. A prototype may legitimately use a shorter namespace — `room-detail-overlay` ships as `opmc-rdo` — and that check false-positives on healthy builds.

### `dist/variation.js` always shows as modified

`build.mjs` stamps `built <ISO timestamp>` into the header comment, so **rebuilding always produces a one-line diff** even when nothing changed. Don't read that as a stale artifact. Compare the *body*, or check which commit last touched `src/`.

---

## Local preview (`dev.mjs`)

### Everything renders in serif

Browsers enforce **CORS on webfonts**. The preview serves the page from `localhost` while `<base href>` points assets at the target origin — so every `@font-face` fails and text falls back silently. The preview lies about typography.

**Fix (implemented):** proxy the **stylesheets** through the dev server and rewrite their font URLs to a local asset proxy, so the site's own `@font-face` rules are used verbatim — correct families, weights, `woff2` — just same-origin.

Two mistakes to avoid if you touch this:
- **Don't inject your own `@font-face`** rules per font file. It drops `font-weight`/`font-style` descriptors and needs a hardcoded per-brand list.
- **Don't proxy only same-origin stylesheets.** Brand fonts are frequently declared in **CDN-hosted CSS**, which is exactly what CORS blocks.

### A font 404s once and stays broken forever

`curl -sL` without `-f` returns the **404 HTML body with exit code 0**. Cached and served as `font/woff`, permanently. Always `curl -sSLf`, validate font magic bytes (`wOFF`/`wOF2`/`OTTO`/`true`/`0x00010000`), and **never cache a failure**.

### `EADDRINUSE: address already in use :::4400`

Another `dev.mjs` is running (often another Claude session's). **Don't kill it** — use `PORT=4401 node dev.mjs`.

### Screenshots full of consent banners

`?clean=1` drops known third-party scripts (OneTrust, AudioEye, chat, analytics) **locally only**. It never touches the live page.

---

## Git working-copy gotchas

### `fatal: invalid reference: starter`

The clone was made with `--branch prototype/<key>`, so `starter` exists only as a **remote-tracking** ref. Use:

```bash
git fetch origin starter:refs/remotes/origin/starter && git checkout origin/starter -- <paths>
```

### Another Claude is working in that folder

Prototype folders often have a live session editing `src/`. **Never `git commit -a`** there — you'll sweep half-finished work into a commit. Stage explicit paths:

```bash
git commit -m "…" -- path/one path/two
```

And avoid running builds in their tree; `node build.mjs` rewrites `dist/variation.js`.

---

## Provisioning

- **Needs `FIRECRAWL_API_KEY`** in the environment. Without it, provisioning still commits the brief + context; `meta.json` records `captureOk: false`.
- **Compare-and-swap:** commits `.opmc/**` with `force: false`, re-reads HEAD and retries once. It can never rewind a Claude push.
- **Idempotent:** a matching `contentHash` with no fresh captures is a no-op.
- **`.opmc/` is console-authored.** Never hand-edit it in a branch; re-sync regenerates it.

---

## Vercel environment variables

### "isn't set on the server" right after adding the var

Env vars are baked in **at deploy time**. Adding one in Vercel does nothing to
the running deployment — the error persists until a NEW deployment goes out.
Fix: push anything (an empty commit works: `git commit --allow-empty -m
"chore: redeploy for env"`) or Deployments → ⋯ → Redeploy. Scope must include
**Production**.

## Policy gates that look like errors (they aren't)

- **"No brief yet — write what we're building first"** on provision/re-sync,
  and the disabled Get-init-script button: the brief gates the BUILD by design.
  One sentence in the Brief step (or Draft-with-AI) clears it.
- **"This experiment is RUNNING"** on push: a live test is immutable — pausing
  it in Optimizely IS the human sign-off. No override flag exists on purpose.
- **"Certification failed … the push is gated"**: fix and re-cut, or use the
  explicit recorded override in the Launch card if you accept the risk.

## Experiment data stops appearing in GA4

**OPEN as of 2026-09-15** — see
[`investigations/GA4-OPTIMIZELY-2026-09.md`](investigations/GA4-OPTIMIZELY-2026-09.md)
for the full record, the environment IDs, and the evidence.

Fast orientation if this comes back:

- The impression path is **browser → GTM → GA4**. It does **not** use Optimizely's
  Google OAuth grant. Re-authorizing the integration cannot fix missing impressions —
  that grant only serves Optimizely reading GA4 back, and the audiences API.
- **"There was an error loading Google Audiences"** is a *different* fault. It belongs
  to the Audience Targeting integration, which is off at project level. Don't chase it
  as the outage.
- Before concluding a tag never fired: **GTM trigger groups fire once per page.**
  Replaying a dataLayer event does not re-fire the tag, so silence proves nothing.
  Confirm a new `gtm.triggerGroup` push before believing a negative result.
- The in-app browser's network log records first-party requests only. GA4 hits must be
  caught by patching `sendBeacon` / `fetch` / `XHR.open` / `Image.src` — and have the
  patch **block** them if you don't want test events in production GA4.
- "Is GA4 actually receiving it?" is answered by **Admin → Events → Recent events**
  (28-day window) or DebugView. Realtime's event card is top-N and hides low-volume
  events.
- **Collection is probably fine.** Admin → Events → Recent events lists
  `experience_impression` with its stream active, and re-pulling the Optimizely project
  daily shows experiments still taking samples. If both are true, the fault is in
  ATTRIBUTION, not collection, and consent/accounts/tokens are all the wrong tree.
- **"There was an error loading Google Audiences" is a different fault** on a feature
  that is OFF at project level, and does not mean you must build an audience in GA4
  first — the export creates them. Leave it off; it also spends the 100-audience quota.
- **Optimizely's "Manage" link cannot switch accounts.** It opens Google's Linked apps
  page, which only revokes, and only for the account the browser is signed into.
- First check, and the current best hypothesis: GA4 → Admin → Custom definitions.
  If the property is at **50/50 event-scoped custom dimensions**, dimensions stop
  populating — events still arrive, the parameter goes empty, every experiment report
  goes blank, and it happens on an arbitrary date with no change on your side.
