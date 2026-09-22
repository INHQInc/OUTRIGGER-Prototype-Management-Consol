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

## What is left — both are yours

An agent does not handle connection strings or API keys. These are the only
steps not done.

### A. `DATABASE_URL` for staging and for Preview

For each of the two: Neon → project `outrigger-prototype-console` → Branches →
the branch → **Connect** → copy the string. Then Vercel → Environment Variables
→ **Add Environment Variable**:

| Field | Value |
|---|---|
| Key | `DATABASE_URL` |
| Type | Secret |
| Value | the string you copied |
| Environments | tick **only** the one tier — `staging`, or `Preview` |

The environments box is the whole risk. It opens with **Production** ticked.
Untick it. Production already has its own and must not be touched.

### B. `ANTHROPIC_API_KEY` for staging

Preview already has one — the existing key is scoped *Production and Preview*
(added 24 Jul). Only staging is missing it. Add it scoped to **staging** only.
A separate key from production gives you per-tier cost attribution, which the
console has none of today.

**Add nothing else.** Leaving `CRON_SECRET` and `PRISM_OUTWARD_EFFECTS` off
staging is what keeps it harmless.

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
