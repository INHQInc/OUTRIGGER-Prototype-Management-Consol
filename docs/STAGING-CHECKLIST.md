# Finishing staging — a plain checklist

*22 Sep 2026. Work through these in order. Nothing here is urgent and nothing
expires. Production is fine and untouched; every step below is additive.*

**What this is for:** you have one console and everything you touch is live. This
gives you a second copy to try things on. A copy needs somewhere to run and its
own data. Both halves exist already. The rest is wiring.

---

## 0. Check the right database got copied  ← do this first

I copied the Neon project `outrigger-prototype-console` into a branch called
`staging`. I am confident that is the console's database, because its contents
are your real prototypes and its compute was active during live traffic. But the
connection password is hidden from me, so I could not prove it.

**Do:** Vercel → project `outrigger-prototype-management-consol` → Settings →
Environment Variables → open `DATABASE_URL` → reveal the value.

**Look for:** the host should belong to the Neon project
`outrigger-prototype-console`.

- **Matches** → carry on to step 1.
- **Does not match** → stop. Tell Claude which Neon project it really is; the
  `staging` branch needs deleting and recreating in the right one.

---

## 1. Connect staging to its own database

**Do:** Neon → project `outrigger-prototype-console` → Branches → `staging` →
Connect → copy the connection string.

Then Vercel → Environment Variables → Add Environment Variable:

| Field | Value |
|---|---|
| Key | `DATABASE_URL` |
| Type | Secret |
| Value | the string you copied |
| Environments | tick **staging**, untick **Production** |

**The environments box is the step to be careful about.** It defaults to
Production. Getting it wrong points staging at the live database.

**Note:** if Vercel refuses because `DATABASE_URL` already exists, do step 2
first and come back.

---

## 2. Stop previews using the live database

This is a pre-existing problem, unrelated to staging, and worth fixing while you
are here.

`DATABASE_URL` is currently scoped to **Production and Preview**. That means any
branch you push and preview also reads and writes your live database.

**Do:** open the existing `DATABASE_URL` → Edit → untick **Preview**, leave
Production ticked → Save.

**What changes:** ordinary preview builds will then have no database and will
error on pages that need one. That is the correct trade — a preview that
silently writes to production is worse than one that does not run.

---

## 3. Add the model key to staging

**Do:** Add Environment Variable → key `ANTHROPIC_API_KEY`, type Secret, scoped
to **staging** only. Use a different key from production if you can, so model
spend is attributable per tier.

**Add nothing else.** Leaving `CRON_SECRET` and `PRISM_OUTWARD_EFFECTS` absent
is what makes staging harmless: no emails, no Optimizely writes, no repo writes,
no scheduled jobs.

---

## 4. Redeploy production once

The ownership guard is configured but not switched on. The build currently
serving was created before the setting existed, and Vercel only applies settings
to new builds.

**Do:** Vercel → Deployments → the newest Production one → ⋯ → Redeploy. Same
commit, no code change.

**How you know it worked:** in the Neon SQL editor on the `production` branch,
run `select val from content_meta where key = 'db-owner';`. It should return
`prod`. It currently returns nothing.

**What it buys:** after this, any deployment pointed at the wrong database
refuses to start instead of quietly changing its schema.

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

## Deliberately not doing

**No custom domain for staging.** Protection is set to cover everything except
custom domains, so `staging.prism.brandgraphai.com` would make a console holding
customer data publicly reachable. The generated URL is uglier and safe.

**Not scrubbing the copied data.** Customer tokens live in the database, not in
environment variables, so a copy carries them. `src/lib/deploy/outward.ts` blocks
reach per deployment instead, which is right every time rather than depending on
someone remembering to scrub on every refresh. See `docs/HANDOFF.md` →
"TIERS AND GUARDS".
