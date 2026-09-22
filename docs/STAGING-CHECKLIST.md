# Staging and preview — what is done, what is left

*22 Sep 2026. Production is fine and untouched. Everything below was additive.*

**The shape, and where each tier stands:**

| Vercel environment | Git branch | Neon branch | `PRISM_DB_OWNER` | `DATABASE_URL` |
|---|---|---|---|---|
| Production | `main` | `production` | `prod` ✅ claimed | ✅ Production-only |
| staging | `staging` | `staging` | `staging` ✅ set | ❌ **you must paste** |
| Preview | every other branch | `preview` | `preview` ✅ set | ❌ **you must paste** |

Two secrets remain, and only a person can enter them.

---

## Status: done. Staging is live and logged into.

Confirmed 22 Sep by logging in at
`https://outrigger-prototype-management-consol-bryan-hopkins-projects.vercel.app`
— which exercises the whole chain at once: Vercel routes the branch to the
staging environment, the app signs a session with staging's `AUTH_SECRET`,
matches the user against staging's `ADMIN_EMAILS`, checks staging's
`ADMIN_LOGIN_SECRET`, and reads staging's own Neon branch.

### The eight variables staging needs

| Variable | Type | Note |
|---|---|---|
| `DATABASE_URL` | Secret | staging Neon branch |
| `PRISM_DB_OWNER` | Config | `staging` |
| `NEXT_PUBLIC_RELEASE_CHANNEL` | Config | `Staging` — the visible proof you are not on production |
| `ANTHROPIC_API_KEY` | Secret | shared with Preview, separate from production |
| `AUTH_SECRET` | Secret | **must differ from production's** |
| `ADMIN_LOGIN_SECRET` | Secret | its own password |
| `ADMIN_EMAILS` | Config | same addresses as production |
| `PUBLIC_BASE_URL` | Config | staging's own URL |

### Correcting this document: "Add nothing else" was wrong

An earlier version of this checklist said staging needed only `DATABASE_URL` and
`ANTHROPIC_API_KEY`, and to **add nothing else**. That was wrong, and it left
staging unusable in a way that looked like a deploy failure. Three of the four
variables above are required before a single authenticated page renders:

- **`AUTH_SECRET` unset → the app throws.** `authSecret()` in
  `src/lib/auth/config.ts` raises rather than returning a default. Not a login
  failure — a crash on any page that touches a session.
- **`ADMIN_EMAILS` unset → login always fails.** `isAdminEmail()` tests
  membership of an empty list, so the correct password is still rejected.
- **`ADMIN_LOGIN_SECRET` unset → "Admin login not configured"**, a 500 returned
  before any password is checked.

The right rule is narrower than "add nothing else": **withhold only the variables
that let a tier reach the outside world** — `PRISM_OUTWARD_EFFECTS`,
`CRON_SECRET`, `RESEND_API_KEY`, `MAILGUN_*`, `OPTIMIZELY_*`. Everything the app
needs to boot and authenticate must be present, with its own values.

### `AUTH_SECRET` and `ADMIN_LOGIN_SECRET` are not interchangeable

They look alike in the dashboard and behave nothing alike.

| | `AUTH_SECRET` | `ADMIN_LOGIN_SECRET` |
|---|---|---|
| What | signs session cookies | a password people type |
| Rotating it | **invalidates every session** — everyone logged out, 365-day cookies | harmless; existing sessions keep working |
| Across tiers | **must differ** — a shared key makes a staging session valid on production | may differ; no reason to share |

The dangerous case is editing production's `AUTH_SECRET` while meaning to add
staging's. Same dialog shape, and the damage is invisible until people start
getting logged out. Two tells that you are on an existing row rather than adding
a new one: the **Key field is greyed out**, and the Config option reads *"Saved
secrets are write-only."*

To add a tier's own value, always use **Add Environment Variable** and expect to
end with *two* rows of the same name on different scopes. Vercel allows that —
`PRISM_DB_OWNER` exists three times. Confirm by the timestamps: the new row says
"Added just now" and the old row's date must not have moved.

---

## What was done, and how it was verified

### The ownership guard is armed, and it proved the Neon project

`PRISM_DB_OWNER=prod` is set on Production only. On first boot the console
CAS-writes that claim into whatever database it actually connects to
(`NeonContentStore.create()`, the `claim` branch). Production redeployed at
17:21Z on commit `c2012c4`; on the next authenticated request the claim landed.

    select key, val from content_meta where key = 'db-owner';
    -- production branch of outrigger-prototype-console → prod   (1 row)

That is the answer to a question nothing else could answer. `DATABASE_URL` is
type **Secret** — Vercel's words: *"You can't reveal this value after saving."*
Not to an agent, not to Bryan. And Vercel's Storage tab shows **no connected
database**, so no integration record names the project either. Two dead ends.
Behaviour settled it: the row appeared in `outrigger-prototype-console`, so that
is production's database and the `staging` branch was forked from the right
place.

Corroborating, from Neon's branch list at the moment the console was reloaded:
`production` **Active**, *"Compute last active: now"*, 223.82 MB. `staging` idle
at 0 CU-hrs.

Any deployment now pointed at a database it does not own refuses to start
instead of running nine `alter table` statements against it.

### Previews no longer read and write the live database

`DATABASE_URL` had been scoped *Production and Preview* since 17 Jul. Every
feature-branch preview was reading and writing production. Narrowed to
**Production** only.

### The `preview` Neon branch exists

Forked from `production`, **Expires: Never**, id `br-noisy-hat-auqae51j`. One
shared branch for every feature branch, disposable by design — if a migration
mangles it, delete it and fork again.

It was forked *after* production claimed the database, so it arrived carrying
`db-owner = prod`, which would have made every preview refuse to start. Already
corrected on that branch:

    update content_meta set val = 'preview' where key = 'db-owner';

`staging` does not have this problem: it was forked at 09:54, before the claim,
and `select … where key = 'db-owner'` on it returns **no rows**. It will claim
itself cleanly on first boot. Verified, not assumed.

### Branch ids, so nobody has to go hunting

| Neon branch | id |
|---|---|
| `production` (default) | `br-winter-grass-aumw7fr9` |
| `staging` | `br-proud-sky-au0k0nig` |
| `preview` | `br-noisy-hat-auqae51j` |

Project `outrigger-prototype-console` = `delicate-frog-62798343`, AWS us-east-1.

---

## Correcting the record: why the staging paste really failed

Earlier this was blamed on Vercel refusing a duplicate key whose scope overlaps
an existing one, with custom environments counting as preview. **That diagnosis
was wrong.** `PRISM_DB_OWNER` now exists as three separate rows — Production,
staging and Preview — added without complaint. Vercel treats those as distinct
targets.

The likely real cause was the environments box: it opens with **Production**
ticked, and a staging value saved with Production still ticked collides with the
`DATABASE_URL` that was already there.

Narrowing `DATABASE_URL` to Production was still right, for the reason above —
previews were writing to production. It just was not the unblock it was
described as.

---

## Three Vercel behaviours that cost time on 22 Sep

**A branch created at an already-deployed commit does not build.** `staging` was
branched from `main` at `84c73ef`, which production had deployed four minutes
earlier. Vercel deduplicates by commit SHA, so the push produced *no deployment
at all* — no error, no skipped entry, nothing. The environment config was
correct the whole time. `guard/code-write` had built fine an hour before because
it carried its own distinct SHA.

This only bites at bootstrap. Once `staging` diverges from `main` it always has
something new to build. To force one: push any commit (an empty one works), or
trigger it from the API.

**The deployments API ignores `customEnvironmentSlugOrId`.** Passing it produced
an ordinary Preview deployment — `target: null`, no custom environment attached,
and therefore Preview's environment variables rather than staging's. The field
that works is `target` set to the environment slug:

```
POST /v13/deployments?forceNew=1
{ "name": "...", "project": "prj_...", "target": "staging",
  "gitSource": { "type": "github", "org": "INHQInc",
                 "repo": "OUTRIGGER-Prototype-Management-Consol", "ref": "staging" } }
```

Check `target` in the response before believing a deployment went where you
asked. A staging deployment that silently ran as a preview would claim the wrong
database and look fine doing it.

**Pushing the `staging` branch does not deploy to the staging environment.**
This is the one that matters, because it looks exactly like it worked: the push
produces a deployment, it builds, it goes READY, and it is not staging.

The custom environment is configured correctly — `branchMatcher` is
`{ type: "equals", pattern: "staging" }`, which is what the UI writes and what
the docs describe. It still does not route. Five deployments on the `staging`
branch, split perfectly by how they were created:

| Created by | `target` | Aliases assigned |
|---|---|---|
| `git push origin main:staging` (×3) | `null` | branch alias only |
| `POST /v13/deployments` with `target: "staging"` (×2) | `"staging"` | **`…-consol-bryan-hopkins-projects.vercel.app`** + branch alias |

That second alias is the staging URL — the one that was logged into to prove the
tier works. Only a `target: "staging"` deployment is ever assigned it. So a push
leaves the staging URL serving whatever the last explicit staging deployment
built, with no error anywhere and a green build in the dashboard to look at.

It had already happened twice before it was noticed. Between 22 Sep 17:00 and
17:52 the branch moved from `84c73ef` to `f1dab44` — twelve commits — while the
staging URL stayed on `84c73ef`.

**So: after pushing `staging`, trigger the deployment explicitly.** The push
alone is not the deploy.

```
POST /v13/deployments?forceNew=1
{ "name": "outrigger-prototype-management-consol",
  "project": "prj_k2NQb2qYTAN2rlgHwW7D4KLOIONx", "target": "staging",
  "gitSource": { "type": "github", "org": "INHQInc",
                 "repo": "OUTRIGGER-Prototype-Management-Consol", "ref": "staging" } }
```

Confirm two fields in the response, not one: `target` is `"staging"` **and**
`alias` contains `…-consol-bryan-hopkins-projects.vercel.app`. The alias is the
stronger check — it is the URL a person actually opens.

*Unresolved: why `branchMatcher` does not route a pushed branch to its custom
environment. The configuration reads correctly and the behaviour contradicts it.
Recorded as observed rather than explained — the workaround above is proven, the
cause is not.*

---

## After you refresh a branch from production, later

A Neon branch is a point-in-time copy, so any branch forked from now on carries
`db-owner = prod`. A deployment declaring `staging` or `preview` will then meet a
database claimed by `prod` and **refuse to start** — correct behaviour,
confusing symptom. One statement on the refreshed branch:

```sql
update content_meta set val = 'staging' where key = 'db-owner';
```

The error message names the variable, so whoever hits it will not be guessing.

---

## Deliberately not doing

**No custom domain for staging.** Protection is `all_except_custom_domains`, so
`staging.prism.brandgraphai.com` would make a console holding customer data
publicly reachable. The generated URL is uglier and safe.

**Not scrubbing the copied data.** Customer tokens live in the database, not in
environment variables, so a copy carries them. Note that `RESEND_API_KEY`,
`CRON_SECRET` and `ADMIN_LOGIN_SECRET` are all scoped *Production and Preview*,
so preview holds real credentials. What stops it reaching the world is
`src/lib/deploy/outward.ts`: `PRISM_OUTWARD_EFFECTS` is **Production only**, so
email, experiment-write and code-write are all refused on staging and preview
regardless of which keys are present. Structural, not a procedure someone has to
remember on every refresh.

**No Vercel Storage integration.** `DATABASE_URL` is a hand-pasted string, which
is why nothing in the Vercel UI can tell you which Neon project you are talking
to.
