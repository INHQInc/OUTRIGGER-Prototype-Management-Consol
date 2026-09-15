# Optimizely → GA4: experiment data stopped flowing

*Opened 2026-09-15. **Status: OPEN — root cause not established.** Optimizely support ticket in progress.*

**Read this first:** the single most useful thing in this document is the split between
what was *verified*, what was *ruled out*, and what is still *hypothesis*. Several
plausible-sounding causes were found and then demoted by evidence. Do not re-litigate
them without reading "Ruled out" below.

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
| Optimizely snippet revision (at time of check) | `4080` |

Measurement ID is chosen per page by a custom-JS GTM variable that resolves
resort-vs-condo; it returns **`undefined`** if it resolves to neither.

---

## Verified (evidence, not inference)

**1. Optimizely pushes the impression correctly.** Captured from the live homepage:

```
event:              "experience_impression"
exp_variant_string: "OPT-5879069902897152(Googl Analytics Test)-4861312306511872(Original)"
Holdback:           false
```

This is the GTM-specific integration shape, exactly as Optimizely documents it.

**2. The GTM tag exists and is correctly built.** Read from the published container:

| GTM tag name | tag_id | GA4 event | Parameter |
|---|---|---|---|
| Q GA4 - Optimizely experience_impression Event Tag | **989** | `experience_impression` | `exp_variant_string` ← DLV `exp_variant_string` |
| Q GA4 - Optimizely optimizely_decision Event Tag | **996** | `optimizely_decision` | `exp_variant_string` ← DLV `exp_variant_string` |
| GA4 - Optimizely | **555** | `optimizely_decision_web` | `personalization_campaign_name`, `personalization_campaign_variant` |

**3. The tag fired on page load.** dataLayer index 11 carried
`gtm.triggerGroup` with `70915926_994` in `gtm.triggers` — the group that fires tag
989 — *after* OneTrust resolved consent. Tag 989 fired.

**4. GA4 is receiving traffic on the right property.** Intercepted a live GA4 hit with
`tid=G-VG9FLW2BKF`. So the measurement-ID variable resolves correctly on the homepage.

**5. `experience_impression` is being collected by GA4.** It appears in
GA4 → Admin → Events → **Recent events**, on stream *New Site - Outrigger*, with the
stream active in the last 28 days.

**6. `exp_variant_string` is registered** as an **event-scoped** custom dimension,
last changed **Apr 16, 2024**.

**7. Optimizely's own settings are correct.** Report Generation **ON**, 13 campaigns.
Both project-level boxes ticked, including *"Enable integrating using GTM by default
for existing and new experiments"*. Experiment-level: **Tracked**, GTM box ticked.

**8. `outrigger.analytics@gmail.com` still exists and is privileged** — one of four
Analytics **organization** administrators (Billing Admin, Org Admin, User Admin),
alongside `joshua.haddadi@outrigger.com`, `jvillalobos1490@gmail.com`,
`orh.analytics@outrigger.com`.

---

## Ruled out

**The OAuth grant / account being deleted.** The account is alive and an org admin (8).
More importantly the impression path is **browser → GTM → GA4** and never touches that
token. The token only serves Optimizely *reading GA4 back* and the audiences API.
**Re-authorizing cannot restore impression flow.**

**Custom dimension missing.** It is registered (6).

**Wrong property / measurement ID.** Resolves correctly on the homepage (4).

**Optimizely misconfiguration.** Everything on Optimizely's side is right (7). The
answers to Optimizely support's four questions are all "yes, confirmed".

**"No network call is being made."** Tested and the test was **invalid** — see
Method notes. A replayed dataLayer event does **not** re-fire the tag, because GTM
trigger groups fire once per page and `70915926_994` does not re-arm. Zero captures
proved nothing. Do not repeat this test the same way.

---

## Open hypotheses, ranked

### H1 — event-scoped custom dimension cap (best fit)

GA4 admin shows, verbatim:

> ⚠️ *"This property has reached or is exceeding the limit for event-scoped custom
> dimensions (50 of 50)."*

When a property goes over that limit, dimensions stop populating. Events keep arriving
exactly as observed in (5); the parameter simply goes empty, and every Optimizely
report built on `exp_variant_string` goes blank.

**Why it fits where nothing else does:** it produces a cliff on an arbitrary date
(when *another team's* new dimension tips the property over) with genuinely **no
change on your side**.

**The test that settles it:** Explore → free-form, dimension `exp_variant_string`,
metric Event count, daily, last 60 days. If the dimension goes flat on a date while
`experience_impression` event count stays healthy → confirmed. Fix is freeing
custom-dimension slots, not consent and not accounts.

### H2 — something republished in GTM

The only recent change seen anywhere: two **ODP** tags edited *"a month ago"*, while
every Optimizely-related tag reads *"2 years ago"* / *"3 years ago"*.
**Check GTM → Versions** for what the last two or three published versions changed.
Not yet done.

### H3 — GA4 Audience Targeting is simply off

Explains the *visible error* (below) without explaining the outage. Project-level
**GA4 — Audience Targeting** integration is **OFF**.

---

## The visible error is a separate problem

On the experiment's Integrations tab:

> **"There was an error loading Google Audiences."**

It sits in the **Variation Audiences** block, which belongs to the **Audience
Targeting** integration — which is **OFF** at project level. It has nothing to do with
impression collection, and it may well be long-standing. **Do not treat it as the
outage.** A useful check: search GA4's 39 audiences for any named after an Optimizely
experiment or variation. If there are none, this export has never worked.

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
**Fix:** move 989/996/555 onto the analytics exception used by the other 19.
**Why it is not the outage:** it has been true since the container was built. It
cannot produce a cliff.

**2. Duplicate instrumentation.** `experience_impression` *and* `optimizely_decision`
both fire on every decision carrying the same `exp_variant_string`, plus
`optimizely_decision_web` for personalization. When consent permits, GA4 receives the
same impression under two event names. Ask Optimizely whether `optimizely_decision`
is legacy and safe to retire.

**3. Single property configured.** Optimizely points at `340476168` (Resorts) only.
Experiments on condo pages route GA4 data to `338523501`, which Optimizely does not read.

**4. Personal Gmail owns the integration.** `outrigger.analytics@gmail.com` is not a
Workspace account on the domain; nobody at Outrigger can administer it, and its OAuth
refresh token can expire for reasons outside Outrigger's control.
`orh.analytics@outrigger.com` already exists as an org admin and is the better owner.

---

## Account swap — rollback record

State captured **before** any change, 2026-09-15:

```
Settings → Integrations → Google Analytics 4 · Report Generation
  Status .................. ON     (Usage: 13 campaigns)
  Account ................. outrigger.analytics@gmail.com
  Property ID ............. 340476168
  [x] Enable the GA4 integration by default for all new experiments
  [x] Enable integrating using GTM by default for existing and new experiments
```

**The tell when swapping to `orh.analytics@outrigger.com`:** watch the Property ID
field. Optimizely populates the property picker from what the authorized Google
account can see.

- `340476168` retained/offered → the account has property access.
- Field clears or property not offered → org-admin only, **no property-level access**.
  Roll back; grant Editor on the property first.

After swapping, re-check both checkboxes — especially the GTM one, since that drives
`experience_impression`. Expect **no change to impression flow**; that path does not
use this grant.

---

## Open questions

1. `exp_variant_string` over 60 days — does it go flat on a date? **(H1, decisive)**
2. What did the last GTM container versions change, and when? **(H2)**
3. Property-level role of `outrigger.analytics@gmail.com` on `340476168` —
   Viewer, Editor, or absent? Needs a GA4 **account Administrator**;
   `bryan.r.hopkins@gmail.com` is not one and cannot see the user list.
4. What date did Optimizely see impressions drop? Only they have this, and it is the
   one piece of evidence that would confirm or kill H1/H2. **Asked in the ticket.**
5. Does re-authorizing the integration disturb the 13 attached campaigns?

---

## Method notes

**Reading the GTM container without GTM access** — the published container is public:

```bash
curl -s "https://www.googletagmanager.com/gtm.js?id=GTM-M84QDRN" -o gtm.js
```

Parse the resource blob after `"macros":` — it holds `macros`, `tags`, `predicates`,
`rules`. Tag firing/blocking is expressed as rules of `if` / `unless` / `add` / `block`
over predicate indices. This is how the consent matrix above was derived.

**Capturing GA4 hits.** The in-app browser's network log records first-party requests
only — GA4 hits never appear. Intercept at the transport layer instead
(`navigator.sendBeacon`, `fetch`, `XMLHttpRequest.open`, `HTMLImageElement.prototype.src`).
To capture *without* writing to production GA4, have the interceptor **block** matching
requests rather than pass them through.

**Do not diagnose by replaying dataLayer events.** Trigger groups fire once per page.
Verify a replay actually produced a new `gtm.triggerGroup` push before drawing any
conclusion from silence.

**Authoritative check for "is GA4 receiving it":** GA4 → Admin → Events → *Recent
events* (28-day window), and DebugView for live per-parameter inspection. Realtime's
event card is top-N and will hide a low-volume event like this one.

---

*See also: [`../RUNBOOK.md`](../RUNBOOK.md), [`../EXPERIMENT-INTEGRATION.md`](../EXPERIMENT-INTEGRATION.md).*
