# Optimizely → GA4: experiment data stopped flowing

*Opened 2026-09-15. Updated 2026-09-18. **Status: OPEN — root cause not established.**
Optimizely support ticket **#1933756** in progress; a reply is drafted and unsent.*

**Moved to `main` on 18 Sep.** It previously existed only on `beta-2`, along with the
RUNBOOK link to it, so anyone working on trunk could not find it — which happened.

**Read this first:** the most useful thing in this document is the split between what
was *verified*, what was *ruled out*, and what is still *hypothesis*. Several
plausible-sounding causes were found and then demoted by evidence, and one of our own
tests returned a confident false negative. Do not re-litigate them without reading
"Ruled out" and "Method notes".

---

## The symptom, as reported

- Errors on the Optimizely GA4 integration page.
- Experiment data "no longer flowing to GA4".
- **"Everything dropped off last week."**
- **"No changes on our side."**
- A test is running on the outrigger.com homepage and can be seen firing.

The last two constrain everything: whatever broke has to explain a **cliff on a
specific date** caused by **something nobody at Outrigger touched**. Most of the
defects found during this investigation fail that test — they are long-standing.

---

## Environment facts

Gathered live; treat as the reference table.

| Thing | Value |
|---|---|
| Optimizely account | OUHH Outrigger Hotels Hawaii → Experimentation |
| Optimizely project | **Outrigger Prod** `21089662478` |
| GTM container | **`GTM-M84QDRN`** |
| GA4 account | **`a164364640`** ("Outrigger") |
| GA4 property — Resorts | **`340476168`**, measurement ID **`G-VG9FLW2BKF`** |
| GA4 property — Condos | `338523501`, measurement ID `G-G0KZH482BY` |
| GA4 stream seen collecting | *New Site - Outrigger* |
| Optimizely's GA4 OAuth account | **`outrigger.analytics@gmail.com`** |
| Optimizely's configured property | **`340476168` only** (Resorts) |
| Running homepage experiment | *Googl Analytics Test* `5879069902897152` |
| Optimizely snippet revision (15 Sep) | `4080` |

Measurement ID is chosen per page by a custom-JS GTM variable resolving
resort-vs-condo; it returns **`undefined`** if it resolves to neither.

### Who can see what

| Account | Role |
|---|---|
| `joshua.haddadi@outrigger.com` | Analytics **org** admin (Billing, Org, User) |
| `jvillalobos1490@gmail.com` | Analytics **org** admin |
| `orh.analytics@outrigger.com` | Analytics **org** admin |
| `outrigger.analytics@gmail.com` | Analytics **org** admin — *and the account Optimizely authenticates as* |
| `bryan.r.hopkins@gmail.com` | Property access only. **Not** an account administrator. |

**Organisation roles are not property data access.** Billing / Org / User Admin govern
the Analytics organisation; they do not grant Viewer or Editor on property
`340476168`, and it is property-level access the Admin API checks. That distinction
is why several checks below are still open.

---

## Verified (evidence, not inference)

**1. Optimizely pushes the impression correctly.** Captured live on the homepage:

```
event:              "experience_impression"
exp_variant_string: "OPT-5879069902897152(Googl Analytics Test)-4861312306511872(Original)"
Holdback:           false
```

That is the GTM-specific integration shape, exactly as Optimizely documents it.

**2. The GTM tag exists and is correctly built.** From the published container:

| GTM tag name | tag_id | GA4 event | Parameter |
|---|---|---|---|
| Q GA4 - Optimizely experience_impression Event Tag | **989** | `experience_impression` | `exp_variant_string` ← DLV `exp_variant_string` |
| Q GA4 - Optimizely optimizely_decision Event Tag | **996** | `optimizely_decision` | `exp_variant_string` ← DLV `exp_variant_string` |
| GA4 - Optimizely | **555** | `optimizely_decision_web` | `personalization_campaign_name`, `personalization_campaign_variant` |

**3. The tag fired on page load.** dataLayer index 11 carried `gtm.triggerGroup` with
`70915926_994` in `gtm.triggers` — the group that fires tag 989 — *after* OneTrust
resolved consent.

**4. GA4 is receiving traffic on the right property.** Intercepted a live GA4 hit with
`tid=G-VG9FLW2BKF`, so the measurement-ID variable resolves correctly on the homepage.

**5. `experience_impression` IS being collected.** GA4 → Admin → Events → **Recent
events** lists it, on stream *New Site - Outrigger*, with the stream active in the
last 28 days. **This is the single most important fact in the document.** It means
collection is not broken.

**6. `exp_variant_string` is registered** as an **event-scoped** custom dimension, last
changed **Apr 16, 2024**. So GA4 is configured to receive the parameter.

**7. The property is at its custom-dimension ceiling.** GA4 → Admin → Custom
definitions shows, verbatim:

> ⚠️ *"This property has reached or is exceeding the limit for event-scoped custom
> dimensions (50 of 50)."*

**8. Optimizely's own settings are correct.** Report Generation **ON**, 13 campaigns.
Both project-level boxes ticked, including *"Enable integrating using GTM by default
for existing and new experiments"*. Experiment level: **Tracked**, GTM box ticked.

**9. The OAuth account exists and is privileged** — `outrigger.analytics@gmail.com` is
one of four Analytics organisation administrators. It has not been deleted or stripped
at the org level.

**10. GA4 holds 39 audiences**, against a cap of 100. The Audiences error is therefore
not "none exist" and not "limit reached".

**11. Optimizely is still collecting today.** Re-pulling the whole project on 16 Sep
and diffing against 15 Sep: no experiments added, removed, status-changed or modified
— but **three took new samples in 24 hours**: *Rooms and Suites Overlay* +18,
*Offer Landing Social Traffic* +5, *Home Page CTA Optimization* +80. Optimizely's own
event collection is alive.

**12. GA4 Realtime does not list `experience_impression`** among its top events. This
is **not** evidence of anything — that card is top-N and impressions are a thin slice
of homepage traffic. Recorded so nobody re-runs it and draws a conclusion.

**13. Optimizely's "Manage" link cannot switch accounts.** It opens Google's
**Linked apps** page, which offers *Remove access* and nothing else. It also opens for
whatever account the browser is signed into — so signed in as
`bryan.r.hopkins@gmail.com`, Optimizely does not appear at all, because the grant
lives on a different account.

**14. The user list is not visible to us.** GA4 → Admin → Property access management
returns *"Incorrect permissions: you do not have sufficient permissions to access this
page"* for `bryan.r.hopkins@gmail.com`. Only the four org admins can enumerate users.

**15. Audience Targeting has NEVER been enabled.** The project Integrations list
reads, verbatim:

| Integration | Type | Usage | Status |
|---|---|---|---|
| Google Analytics 4 — Audience Targeting | Audiences | `--` | **OFF** |
| Google Analytics 4 — Report Generation | Analytics | 13 campaigns | **ON** |

Usage `--` means no campaign has ever used it. **This kills the ticket's founding
premise** — see "The support ticket" below.

**16. Re-tested live on www.outrigger.com, 18 Sep, after the consent fix.** Still
working end to end on the browser side:

| Check | Result |
|---|---|
| `experience_impression` pushed with `exp_variant_string` + `Holdback:false` | ✅ |
| Tag 989 fired — trigger group `70915926_994` present | ✅ |
| Consent state in test browser | all groups (`C0001`–`C0005`) accepted |
| GTM container + Google tag loaded | ✅ 1 each |
| GA4 `/g/collect` requests | 3 |

**17. The event ORDER, captured the same run.** This is new and it matters:

```
 0  gtm.js
 1  experience_impression      ← Optimizely pushes here
 2  optimizely_decision        ← NOTE: no exp_variant_string on this push
10  OneTrustGroupsUpdated      ← consent resolves here, 9 events later
11  gtm.dom
12  gtm.triggerGroup (…_994)   ← tag 989 fires here
```

The impression is pushed long before consent is known; the GTM trigger group is what
bridges the gap. On this load it bridged successfully. See H4.

---

## Ruled out

**The OAuth grant, as the cause of missing impressions.** The account is alive and an
org admin (9), and — decisively — **the impression path is browser → GTM → GA4 and
never touches that token**. It serves only Optimizely *reading GA4 back* and the
audiences API. **Re-authorising cannot restore impression flow.** It remains worth
doing for other reasons (see "The account and its grant").

**Custom dimension missing.** It is registered (6).

**Wrong property / measurement ID.** Resolves correctly on the homepage (4).

**Optimizely misconfiguration.** Everything on Optimizely's side is right (8). The
answers to support's four questions are all "yes, confirmed".

**Optimizely stopped seeing traffic.** Three experiments took samples in the last 24
hours (11).

**The Audiences error, as the cause of anything.** Audience Targeting has never been
enabled (15). A disabled integration cannot block data flow. The ticket opened on an
automated reply asserting it could; that assertion is false and everything downstream
of it was wasted motion.

**"No network call is being made."** Tested, and **the test was invalid** — see Method
notes. A replayed dataLayer event does not re-fire the tag, because GTM trigger groups
fire once per page and `70915926_994` does not re-arm. Zero captures proved nothing.

---

## Open hypotheses, ranked

### H1 — event-scoped custom dimension cap (best fit)

The property is at **50 of 50** (7). When a property goes over that limit, dimensions
stop populating. Events keep arriving exactly as observed in (5); the parameter simply
goes empty, and every Optimizely report built on `exp_variant_string` goes blank.

**Why it fits where nothing else does:** it produces a cliff on an arbitrary date —
when *another team's* new dimension tips the property over — with genuinely **no change
on your side**. It is also the only hypothesis consistent with (5) and (11) together:
the tag fires, Optimizely collects, GA4 receives, and the attribution is empty.

**The test that settles it:** Explore → free-form, dimension `exp_variant_string`,
metric Event count, daily, last 60 days. If the dimension goes flat on a date while
`experience_impression` event count stays healthy → confirmed. The fix is freeing
custom-dimension slots, not consent and not accounts. **Still not run.**

### H2 — something republished in GTM

The only recent change seen anywhere: two **ODP** tags edited *"a month ago"*, while
every Optimizely-related tag reads *"2 years ago"* / *"3 years ago"*. **Check GTM →
Versions** for what the last two or three published versions changed. Not yet done.

### H4 — the consent gap (new, 18 Sep)

`experience_impression` is pushed at dataLayer index **1**; OneTrust resolves consent
at **10**; the tag fires at **12** (17). The GTM trigger group bridges that nine-event
gap. It bridged on our test load — but Optimizely support independently flagged a Tag
Assistant warning that *"the Google tag should have loaded before events were sent"*.

**If that bridge fails on a slow load, or for a visitor who sits on the banner, the
impression is dropped silently.** That produces **intermittent** loss, not a cliff —
so on its own it does not explain "everything dropped off". It could plausibly explain
a *falloff*, and Bryan described a falloff in the ticket, so do not dismiss it.

**Untested.** One load on one machine cannot detect intermittent loss by construction.

### H3 — GA4 Audience Targeting is simply off

Explains the *visible error* without explaining the outage. See below.

---

## The visible error is a separate problem — and we recommend leaving it

On the experiment's Integrations tab:

> **"There was an error loading Google Audiences."**

It sits in the **Variation Audiences** block, which belongs to the **GA4 — Audience
Targeting** integration — **OFF** at project level. It has nothing to do with
impression collection.

**It does not mean an audience must be built in GA4 first.** The flow is the other
direction: Variation Audiences *creates* audiences in GA4, one per variation. It reads
the existing list to display it. With 39 audiences present (10), emptiness is not the
cause; an API call is failing, most likely because the integration it belongs to is
disabled, and secondarily because the Admin API needs **Editor** on the property to
manage audiences and org-admin does not confer that.

**Recommendation: leave Audience Targeting off.**

1. It is unrelated to the outage. Enabling it to clear a red box adds a variable to an
   investigation that is already hard to date.
2. **GA4 caps audiences at 100 and the property holds 39.** Each experiment exporting
   variation audiences adds two or more. The same property is already at 50/50 on
   event-scoped custom dimensions — quota pressure there is live, and this feature
   spends the other quota.

Treat the red box as noise from a disabled feature until somebody actively wants
variation audiences, and budget the audience limit before turning it on.

---

## Real defects found along the way (fix regardless — none of them are the outage)

**1. The three Optimizely GA4 tags are gated on the wrong consent group.**
Of 23 GA4 event tags in `GTM-M84QDRN`:

| Consent exception | GA4 tags |
|---|---|
| **C0002 — Performance/analytics** | 19 (`page_view`, `scroll`, `purchase`, `add_to_cart`, `begin_checkout`, `performance_timing`, `pdf_download`, `form_lead_submit`, …) |
| **C0004 — Targeting/advertising** | **3 — exactly 989, 996, 555** |
| ungated | 1 (`page_view`, tag 111) |

In the GTM UI the exception is named **"Targeting Exception Trigger"**. The C0004 rule
otherwise contains only advertising infrastructure (Google Ads, Bing, Floodlight,
Pinterest). Any visitor accepting analytics and declining advertising sends GA4 their
page views and purchases but never their experiment impression.
**Fix:** move 989 / 996 / 555 onto the analytics exception the other 19 use.
**Why it is not the outage:** true since the container was built. It cannot produce a
cliff.
**STATUS: FIXED 17–18 Sep.** The tags now sit on the analytics group. Expect
impression volume to step up from that date — say so to support, or the step reads as
a clue. The Audiences error was **unchanged** by it, which is further confirmation the
two are unrelated.

**2. Duplicate instrumentation.** `experience_impression` *and* `optimizely_decision`
both fire on every decision carrying the same `exp_variant_string`, plus
`optimizely_decision_web` for personalization. When consent permits, GA4 receives the
same impression under two event names. Ask Optimizely whether `optimizely_decision` is
legacy and safe to retire.

**3. Single property configured.** Optimizely points at `340476168` (Resorts) only.
Experiments on condo pages route GA4 data to `338523501`, which Optimizely does not read.

**4. A personal Gmail owns the integration.** `outrigger.analytics@gmail.com` is not a
Workspace account on the domain. Nobody at Outrigger can administer it, its OAuth
refresh token can expire for reasons outside Outrigger's control, and — as (13)
showed — **you cannot even inspect the grant without logging in as that specific
person**. `orh.analytics@outrigger.com` already exists as an org admin and is the
better owner.

---

## The support ticket (#1933756) — read before replying

**We stalled our own ticket.** On 3 Sep we answered the automated checklist with
*"we are not using GTM for this integration."* That is false — the integration is the
GTM-specific flow and always has been. Support then found GTM themselves and spent
**two full rounds** asking us to confirm it. That is where roughly ten days went.

**The ticket's founding premise is also false.** The first (automated) reply asserted
that the Audiences error *"is preventing experiment data from flowing to GA4."* It
cannot — Audience Targeting has never been on (15). Every checklist item that followed
(audience limits, property ID, permissions, token refresh) descends from that error.

**Two claims from support that contradict this document.** Both are worth resolving,
because if support is right, either is a cause WITH A DATE:

1. They report the project-level *"Enable integrating using GTM by default"* as **not
   enabled**. We record it as ticked (8). Someone is looking at something different.
2. They report GA4 integration **not enabled on Home Page CTA Optimization**. Note we
   verified Tracked + GTM ticked on *Googl Analytics Test* `5879069902897152`, a
   DIFFERENT experiment. This may be a genuine per-experiment gap.

**And there IS a change on our side, for one experiment.** Bryan told support he
toggled Home Page CTA Optimization's integration off and on several times around
3 Sep and left it off overnight. That undermines "no changes on our side" for that
experiment specifically — though not for the project-wide drop.

**Drafted reply** (not yet sent): `~/Downloads/optimizely-support-email.{md,html}`.
Cut to ~76 lines deliberately: two corrections, the four answers, the date request.
An earlier 321-line version was rejected as too long — the detail lives here instead,
and gets sent only if support pushes back on a specific point.

---

## The account and its grant

**Three different places, three different jobs.** Conflating them cost time:

| Where | What it controls |
|---|---|
| GA4 → Admin → Property access management | Who can read/edit property `340476168`. Where `orh.analytics@outrigger.com` needs **Editor**. |
| Optimizely → the integration's connect flow | Which Google account Optimizely acts *as*. **The only place a swap happens.** |
| `myaccount.google.com` → Linked apps | Revoking a grant. Revoke-only, and scoped to the signed-in account. |

**The gotcha:** Google OAuth silently uses whatever account the browser is already
signed into. Clicking connect while signed in as the current holder re-grants as the
current holder, with no chooser. This is the usual reason "it won't let us change it".

### Swap runbook (not yet executed)

State captured **before** any change, 15 Sep 2026 — restore to this on rollback:

```
Settings → Integrations → Google Analytics 4 · Report Generation
  Status .................. ON     (Usage: 13 campaigns)
  Account ................. outrigger.analytics@gmail.com
  Property ID ............. 340476168
  [x] Enable the GA4 integration by default for all new experiments
  [x] Enable integrating using GTM by default for existing and new experiments
```

1. **Grant first.** Give `orh.analytics@outrigger.com` **Editor** on `340476168` (and
   `338523501` if condo experiments should ever report). Doing this *after* the swap
   risks an empty property picker and a broken integration across 13 campaigns.
2. **Force an account chooser** — sign out of Google in that browser, or use a separate
   Chrome profile signed in as the target account.
3. **Re-authorize in Optimizely** (toggle the integration Off then On).
4. **Confirm the Property ID still reads `340476168`.** If it clears or the property is
   not offered, step 1 did not take — roll back rather than saving.
5. **Re-tick both checkboxes**, especially the GTM one, since that drives
   `experience_impression`.
6. **Expect no change to impression flow.** That path does not use this grant. If
   impressions are still missing afterwards, that is confirmation the two problems are
   separate, not a failed test.

Open with Optimizely before executing: does re-authorization disturb the 13 attached
campaigns?

---

## Watching it daily

The whole project can be re-pulled and diffed in about two minutes, which distinguishes
"Optimizely stopped seeing traffic" from "GA4 stopped attributing it" without waiting
on the ticket:

```bash
cp prod.json prod-$(date +%m%d).json && python3 fetch_prod.py
# then diff experiments_list by id for added/removed/status/last_modified,
# and sum results[*].metrics[*].results[*].samples per experiment
```

15 → 16 Sep: nothing added, removed, modified or status-changed; three experiments took
new samples. Keep doing this and the sample counts answer the question on their own —
if they keep climbing while GA4 shows nothing attributed, H1 is effectively confirmed.

---

## Open questions

1. `exp_variant_string` over 60 days — does it go flat on a date? **(H1, decisive, still not run)**
2. What did the last GTM container versions change, and when? **(H2)**
3. Property-level role of `outrigger.analytics@gmail.com` on `340476168` — Viewer,
   Editor, or absent? Needs one of the four org admins; `bryan.r.hopkins@gmail.com`
   cannot see the user list.
4. What date did Optimizely see impressions drop? Only they have this, and it is the
   one piece of evidence that would confirm or kill H1/H2. **Asked twice; still
   unanswered. This is the bottleneck.**
4a. Is there an audit log for the project-level GTM toggle, and when did it last
   change? (Support says it is off; we say it is on.)
4b. Is GA4 integration actually enabled on *Home Page CTA Optimization*, and did
   Bryan's 3 Sep toggling leave it off?
5. Does re-authorizing the integration disturb the 13 attached campaigns?
6. Is `optimizely_decision` legacy, and safe to retire alongside `experience_impression`?

---

## Method notes

**Reading the GTM container without GTM access** — the published container is public:

```bash
curl -s "https://www.googletagmanager.com/gtm.js?id=GTM-M84QDRN" -o gtm.js
```

Parse the resource blob after `"macros":` — it holds `macros`, `tags`, `predicates`,
`rules`. Tag firing/blocking is expressed as rules of `if` / `unless` / `add` / `block`
over predicate indices. This is how the consent matrix was derived.

**Capturing GA4 hits.** The in-app browser's network log records **first-party requests
only** — one page load logged 257 requests, every one of them `outrigger.com`, and zero
third-party. GA4 hits never appear there. Intercept at the transport layer instead
(`navigator.sendBeacon`, `fetch`, `XMLHttpRequest.open`,
`HTMLImageElement.prototype.src`). To capture *without* writing test events into
production GA4, have the interceptor **block** matching requests rather than pass them.

**Do not diagnose by replaying dataLayer events.** Trigger groups fire once per page.
Verify a replay actually produced a new `gtm.triggerGroup` push before drawing any
conclusion from silence — ours did not, and the silence looked like a finding.

**Authoritative check for "is GA4 receiving it":** Admin → Events → *Recent events*
(28-day window), and DebugView for live per-parameter inspection. **Realtime's event
card is top-N** and will hide a low-volume event like this one.

**Checking a Google grant.** `myaccount.google.com` → Linked apps shows only the
signed-in account's grants, under two separate filters (*Sign in with Google* and
*Access to Any account access*). Clear the filter and check both before concluding an
app is not connected.

---

*See also: [`../RUNBOOK.md`](../RUNBOOK.md), [`../EXPERIMENT-INTEGRATION.md`](../EXPERIMENT-INTEGRATION.md).*
