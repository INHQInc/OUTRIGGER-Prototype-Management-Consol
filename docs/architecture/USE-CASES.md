# Prism — the use cases

*Started from the operator's list, checked against the code, completed. This is
the spec the UX is judged against: a direction is good only if it makes these
easier. Where a use case contradicts TARGET-ARCHITECTURE.md, this wins — it
describes what people actually do.*

---

## Three conflicts the operator's list exposes

**1 · Sites are plural. The model has no sites at all.**
The list says *"New website onboarding (they can have multiple) … everyone has
different setups"* and *"source code setup per site."* Today `Environment` hangs
straight off `orgId` (`environments.ts:15-25`); `siteKey` survives only as a
field marked *"Legacy: the pre-refactor site this env belonged to."* Repos are
customer-scoped, not site-scoped (`OrgRepo.id = ${orgId}:${fullName}`,
`git/types.ts:65-73`). And TARGET-ARCHITECTURE explicitly **deleted** the Site
entity. That deletion is wrong and this supersedes it: the shape is
**Customer → Site (many) → Environment (many)**, with the code binding on the
Site, because two sites of one customer can live in different repos.

**2 · "Everyone has different setups" kills the fixed enum.**
`EnvironmentKind` is exactly `development | staging | production`
(`environments.ts:13`). Real customers have prep, UAT, a preview branch per
release, two prods in two regions. Environment kind becomes a customer-defined
label with one boolean that actually matters — *is this production?* — because
that bit, not the name, is what gates promotion and outward effects.

**3 · There are no passwords, so "password reset" is the wrong use case.**
Access is `POST /api/auth/admin-login { email, secret }` where `secret` is ONE
shared `ADMIN_LOGIN_SECRET` for every admin, issuing a **365-day** session
(`admin-login/route.ts:6-24`); members get magic links instead. So there is
nothing personal to reset, one leaked secret is everyone's secret, and removing
a person can take up to a year to take effect. The real use cases are **getting
back in** and **removing someone's access**, and they are security work, not a
forgotten-password form.

---

## A · Getting set up

Mostly done once, by an admin. The operator's list is almost entirely here —
which is itself the finding: the pain today is getting *into* the product.

| # | Use case | Actor | State today |
|---|---|---|---|
| A1 | Onboard a new customer | Operator/Admin | exists, thin |
| A2 | Invite a user and give them a role | Admin | invite exists; **roles are decorative** |
| A3 | Get back in when your link died | Anyone | shared secret / magic link only |
| A4 | Remove someone's access, immediately | Admin | **not possible inside a year** |
| A5 | Add a website (several per customer) | Admin | **no Site entity** |
| A6 | Add that site's environments, named their way | Admin | fixed 3-value enum |
| A7 | Connect source code, per site | Admin/Dev | customer-scoped only |
| A8 | Install the Prism script on a lower environment | Developer | exists, self-verifying |
| A9 | Confirm the script is live and stays live | Admin | heartbeat exists |
| A10 | Connect the A/B tool — bring your own | Admin | **`"optimizely"` is a single-member union** |
| A11 | Connect an LLM key — bring your own | Admin | **one global key; model hardcoded in 10 files** |
| A12 | Choose where builds run (your machine / Prism) | Admin | tiles exist, no Managed lane |

## B · Doing the work

Absent from the operator's list, and the reason a great wizard is not a great
product. This is the loop that runs for years after the ten minutes of setup.

| # | Use case | Actor |
|---|---|---|
| B1 | Write down an idea before it evaporates | anyone |
| B2 | Turn an idea into a stated experiment | Author |
| B3 | Get it built | Builder (**usually the agent**) |
| B4 | See it on the real page before anyone else does | Author/Reviewer |
| B5 | Sign off that it matches the brief | Reviewer |
| B6 | Approve it to reach real visitors | Approver |
| B7 | Watch a run without babysitting it | anyone |
| B8 | **Stop it now** | Reviewer/Approver/Admin — never gated |
| B9 | Decide what happened, and stamp it | Approver |
| B10 | Send the result to people without accounts | Author |
| B11 | Hand the winner to the developers to build properly | Author → Dev |
| B12 | Find what we learned about X, eighteen months later | anyone |

## C · When it goes wrong

Where enterprise trust is actually won. Nothing in the current UI addresses any
of these; each one currently ends in "ask Bryan."

| # | Use case |
|---|---|
| C1 | The agent is stuck, or the build failed |
| C2 | A guardrail breached mid-run, at 2am |
| C3 | Someone removed our script from the site |
| C4 | A token or key expired |
| C5 | The A/B vendor is down or rate-limiting |
| C6 | The result contradicts what we expected and someone disputes it |
| C7 | Someone joins mid-programme and must understand the history |
| C8 | An experiment has sat untouched for 90 days |
| C9 | Traffic was misconfigured and the sample is invalid |

## D · Across customers

| # | Use case | Actor |
|---|---|---|
| D1 | Switch between customers without losing your place | Operator |
| D2 | See every customer's programme at once | Operator |
| D3 | Support someone else's account, time-boxed and audited | Vendor support |

---

## What this set says about the UX

**Setup is a minority of the life and a majority of the pain.** A1–A12 happen
once; B1–B12 happen weekly for years. Designing the wizard beautifully and the
app conventionally optimises the ten minutes and neglects the decade.

**The agent is a first-class actor, not a tool.** B3 is usually performed by
software. Any UX that assumes a human on the other side of every action is
already wrong.

**Category C is the whole enterprise argument.** A governance product whose
failure modes all resolve to "ask the person who built it" is a demo.

**Roles are load-bearing across all four categories** — A2, A4, B5, B6, B8, B9,
D3 are all role-shaped — and today the role field is read by zero gates.
