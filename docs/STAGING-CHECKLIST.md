# Finishing staging and preview — a plain checklist

*22 Sep 2026. Work through these in order. Nothing here is urgent and nothing
expires. Production is fine and untouched; every step below is additive.*

**What this is for:** you have one console and everything you touch is live.
This gives you two more copies to try things on — a **staging** tier you deploy
to deliberately, and a **preview** tier that every feature branch gets for free.
Each needs its own data. The rest is wiring.

**The shape when this is finished:**

| Vercel environment | Git branch | Neon branch | `PRISM_DB_OWNER` |
|---|---|---|---|
| Production | `main` | `production` | `prod` |
| staging | `staging` | `staging` | `staging` |
| Preview | every other branch | `preview` | `preview` |

---

## 1. Redeploy production  ← do this first, and it proves two things at once

The ownership guard is configured but not switched on. The build serving today
was created before `PRISM_DB_OWNER` existed, and Vercel only applies settings to
new builds.

**Do:** Vercel → Deployments → the newest Production one → ⋯ → Redeploy. Same
commit, no code change.

**How you know it worked:** in the Neon SQL editor, on the **production** branch,
run `select val from content_meta where key = 'db-owner';`. It should return
`prod`. It currently returns nothing.

**Why this is step one.** We cannot read the production connection string —
`DATABASE_URL` is type Secret, and Vercel means it: *"You can't reveal this
value after saving."* Not to Claude, not to you. So "is this the right Neon
project?" could not be answered by looking.

This answers it by behaviour instead. `PRISM_DB_OWNER=prod` is set on Production
only. On first boot the console writes that claim into whatever database it
actually connects to (`src/lib/content/store-neon.ts`, the `claim` branch of
`create()`). So:

- **Row appears in Neon project `outrigger-prototype-console`** → that is
  production's database, proven, and the guard is now armed.
- **Row does not appear** → wrong project. Stop. The `staging` branch was copied
  from the wrong place and needs deleting and recreating. Find the project where
  the row *did* appear.

**What the guard buys:** after this, any deployment pointed at a database it does
not own refuses to start instead of quietly running nine `alter table`
statements against it.

---

## 2. Connect staging to its own database

Only meaningful once step 1 confirms the right project.

**Do:** Neon → project `outrigger-prototype-console` → Branches → `staging` →
Connect → copy the connection string.

Then Vercel → Environment Variables → Add Environment Variable:

| Field | Value |
|---|---|
| Key | `DATABASE_URL` |
| Type | Secret |
| Value | the string you copied |
| Environments | tick **staging** only |

**The environments box is the step to be careful about.** Getting it wrong
points staging at the live database.

*The duplicate-key collision that blocked this is gone — the existing
`DATABASE_URL` was narrowed to Production only on 22 Sep, so `staging` is free.*

---

## 3. Give preview its own database too

Previews used to read and write the live database. That is now fixed by
subtraction — they have no database at all and will error on any page that needs
one. This step gives them a real one.

**Do:** Neon → Branches → New Branch, named `preview`, from `production`. Set
expiry to **Never**; the create dialog defaults to deleting it after a day.

Then Vercel → Add Environment Variable:

| Field | Value |
|---|---|
| Key | `DATABASE_URL` · Type Secret · Environments **Preview** only |
| Key | `PRISM_DB_OWNER` · value `preview` · Type **Config** · Environments **Preview** only |

One Neon branch shared by every feature branch is the normal arrangement. It is
disposable by design — if a branch's migration mangles it, delete and re-create
from `production`.

---

## 4. Add the model key to the new tiers

**Do:** Add Environment Variable → key `ANTHROPIC_API_KEY`, type Secret, scoped
to **staging** and **Preview**. Use a different key from production if you can,
so model spend is attributable per tier.

**Add nothing else.** Leaving `CRON_SECRET` and `PRISM_OUTWARD_EFFECTS` absent
is what makes these tiers harmless: no emails, no Optimizely writes, no repo
writes, no scheduled jobs.

---

## 5. Merge the guard branch

`guard/code-write` closes a hole where a second deployment could commit into the
shared prototypes repo. It is pushed and has a passing test.

**Do:** open a pull request from `guard/code-write` into `main`, review the diff,
merge.

**Do this before staging has a database**, because it is one of the three things
stopping staging from touching the real world.

---

## 6. See it run

**Do:** create a branch called exactly `staging` and push it. Vercel builds it
into the staging environment automatically.

**How you know it worked:** open the deployment URL. You will need to be logged
in to Vercel, which is expected — every non-production URL is protected. The
build info should say channel **Staging**, not Beta 1.

---

## When you refresh staging from production later

A Neon branch is a point-in-time copy, so a branch taken **after** step 1 carries
the row `db-owner = prod` with it. A staging deployment declaring
`PRISM_DB_OWNER=staging` will then meet a database claimed by `prod` and
**refuse to start** — correctly, but it will look like staging is broken.

**The fix is one statement**, run on the refreshed branch:

```sql
update content_meta set val = 'staging' where key = 'db-owner';
```

Same for `preview`. The error message names the variable, so whoever hits this
will not be guessing.

---

## Deliberately not doing

**No custom domain for staging.** Protection is set to cover everything except
custom domains, so `staging.prism.brandgraphai.com` would make a console holding
customer data publicly reachable. The generated URL is uglier and safe.

**Not scrubbing the copied data.** Customer tokens live in the database, not in
environment variables, so a copy carries them. `src/lib/deploy/outward.ts` blocks
reach per deployment instead, which is right every time rather than depending on
someone remembering to scrub on every refresh. See `docs/HANDOFF.md` →
"TIERS AND GUARDS".

**No Vercel Storage integration.** The Storage tab shows no connected database —
`DATABASE_URL` is a hand-pasted string. That is why nothing in the Vercel UI can
tell you which Neon project you are talking to, and why step 1 exists.
