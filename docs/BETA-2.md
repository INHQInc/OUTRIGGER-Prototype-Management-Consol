# Beta 2 — the rebuild

*Branch `beta-2`. Beta 1 (`main`) stays operational and untouched.*

## What Beta 2 is

The console rebuilt around one correction: **Prism's value is not a nicer
variation editor — it is governance over AI-generated experiments.** Every
variation an immutable git SHA, every metric pre-registered before traffic,
every verdict stamped against a frozen brief, nothing reaching production
without a human gate. AI writes the experiment; Prism makes it admissible.

## The three changes that matter

**1. The agent moves server-side.** Today the build happens in the user's own
terminal — clone, `claude`, push. That is fine as a prototype architecture and
fatal as a product one: no enterprise security review passes "each user installs
a CLI and holds credentials on their laptop." A per-tenant sandbox removes the
installs, the keys on endpoints, and the dev environment per seat. **Everything
else here is cosmetic until this is true.**

**2. Two lanes, not one flow.**
- *Describe* — state the intent, the agent builds, preview, ship. Never a terminal.
- *Build* — open the same prototype in your own environment when the change is
  genuinely hard. Same artifact, same versioning, same audit trail. An escape
  hatch, not the road.

**3. Intent in the wizard, infrastructure in Settings.** The wizard asks only
what a person can answer unaided: which page · what changes · what you expect.
Repo, branch, artifact path, siteKey and the loader tag move to a one-time
Connections screen, answered by whoever can answer them.

## What the audit found in Beta 1

Creating a prototype today is **13 steps across 3 UIs and 2 terminals**, with 8
entry points (two dead), 13 preconditions and 21 failure modes. Its own verdicts:

> "A newly provisioned prototype gives the user a git branch and nothing they can see."

> On the terminal step — "this is the point where the product stops being an app."

Specifics worth keeping in view while rebuilding:
- The Repository and Branch dropdowns change nothing — the server attaches the
  same default when absent and coerces a blank branch to `prototype/<key>`.
- Step 3 of 4 is a waiting room whose own copy reads *"nothing to click here."*
- A marketer is asked for an absolute filesystem path, with a Finder
  right-click recipe as the help text.
- The buildMode tiles: recognising the word "Optimizely" silently costs you
  half the product.
- With no customer selected the app says *"create a customer at the top of the
  sidebar"* — an instruction a non-admin cannot follow.

## Mockups

https://claude.ai/code/artifact/5303518f-1a87-4bd5-a2af-16692f283432 — 11
artboards, Prism's real tokens, including the locked-out first-run state and
the developer handoff.

## Running side by side

Beta 2 needs its **own database**. The content store is Neon-backed whenever
`DATABASE_URL` is set, so a preview deployment pointed at production's URL
would write to Beta 1's data. Give this branch its own `DATABASE_URL` and set
`NEXT_PUBLIC_RELEASE_CHANNEL=Beta 2` — the sidebar and `/api/version` then say
which generation you are in.

The loader tag on prep.outrigger.com points at the Beta 1 deployment, so
existing `?opmc=` previews keep working untouched.

## Order of work

1. Server-side agent execution — the unlock; nothing else is real without it.
2. The wizard: intent-only, resumable, one question per screen.
3. Make the governance visible — the audit trail, frozen briefs and stamped
   verdicts exist and are invisible unless you go looking. In a buyer demo
   that is the whole story and none of it is on screen.
4. Enterprise table stakes: SSO, SCIM, roles beyond admin/not-admin, data
   residency. Necessary, not differentiating.

---

# Feature backlog

*Ordered by what a buyer would miss first. Each entry says what is missing, why
it matters, and where it lands, so it can be picked up without this context.*

## 1 · The brief carries a decision rule the analytics side reads

**Status:** designed, not built. Agreed 11 Sep 2026.

**The gap.** `deriveVerdict` runs nine gates and every one of them asks whether
a number is REAL — adjudicable, bound, hypothesis declared, past the runtime
floor, past the sample floor, guardrails intact, both arms converting,
computing, significant. Not one asks whether the number is WORTH ANYTHING to
this business. So the verdict says *Confirmed* and a person still has to guess
whether to ship, using judgement that was never written down and cannot be
audited later.

**Why it matters more than it looks.** With no customer-supplied economics, the
product fills the gap with its own assumptions — and that is exactly how
hospitality vocabulary reached a JSON schema description in `lib/ai/results.ts`
(`"e.g. 'Total booking intent'"`). Ask the customer what a good outcome is and
the product never has to guess (D13). This entry and the vertical-neutrality
rule are the same fix seen from two directions.

**What to add to the brief.** Five fields, PRE-REGISTERED — stated before any
number exists, frozen with the brief revision, so they cannot be rationalised
afterwards. Each must change a decision or it does not earn a place (the brief
author's own rule: at most two questions, first pass only).

| Field | What it is | Why |
|---|---|---|
| Smallest lift worth having | below this you would not bother | exists today as `mde.stated` in `stages.tsx` RUN_FACTS, but it lives in run facts, not the brief, and `deriveVerdict` never consults it |
| What shipping it properly costs | engineering days | turns "+2.4%" into "worth three days?" — every business has this, no vertical needed |
| What one conversion is worth | optional, customer supplies unit AND number | the field that makes the product vertical-neutral by construction: the customer says what converts, the product never names it |
| What you would do at each outcome | win big · win small · flat · lose · underpowered | the pre-registration that turns a finding into a decision |
| What would stop you shipping a winner | legal, brand, ops — the veto no metric can see | guardrails cover measurable vetoes; this covers the rest |

**What it changes on screen.** The Decision panel stops reporting a finding and
states the decision the customer already made:

> **Confirmed at +0.4%.** You said below 2% is not worth the three days.
> **You said: do not ship.**

A statistically significant win that the customer's own rule says to drop —
a call nothing in the system can make today. Likewise *"you said you would
extend once; this is the second time"* on an underpowered run.

**Where it lands.** `brief-author.tsx` (the nine parts become fourteen, or a
sixth group), `measurement.tsx` (the plan freezes them with the metric map),
`stages.tsx` RUN_FACTS (reads them instead of holding its own `mde`),
`verdict.tsx` (a tenth gate, AFTER significance — economics never override
validity), and `readout.tsx` (the readout cites the rule it was judged against).

**The invariant to keep.** Economics are consulted only once a result is
admissible. A verdict must never become *Confirmed* because it would be
profitable; the order is validity → significance → worth. Same reason the
existing gates put validity before significance.

## 2 · What we have learned — the evidence room

**Status:** proposed 11 Sep 2026, not started.

Covers **B12** (find what we learned about X, eighteen months later) and **C7**
(someone joins mid-programme and must understand the history), both of which
have nothing behind them today.

The earned layer is the one `CONTEXT-INGESTION.md` calls "the layer nobody else
can build" and the loudest thing in the builder's context — and it exists in
exactly one place: a card inside a site profile with three hard-coded claims.
There is no way to search it, see which runs back a claim, or read the
programme's history.

Build: a room listing every recorded decision across the account's sites, with
claims DERIVED from those decisions rather than written by hand, each clicking
through to the runs that earned it — including the contradictions, where two
runs disagree, which is the honest case the flywheel has to handle. Searchable
by page, component or pattern.

It is also the longest-lived surface in the product: setup happens once, this is
opened for years.

## 3 · Access you can actually revoke, and a way back in

**Status:** not started. Both are on the operator's original nine use cases.

- **A4 — remove someone's access immediately.** People & roles has *Change* but
  no *Remove*. `USE-CASES.md` calls it "not possible inside a year". One dialog,
  plus the Activity line, plus what happens to work they had in flight.
- **A3 — get back in when your link died.** Shared secret / magic link only
  today. Enterprise trust, small surface.

## 4 · De-verticalize Beta 1's live prompts

**Status:** found 11 Sep 2026, NOT actioned — needs Bryan's go, and it is on
`main`, not this branch.

17 occurrences of guest/booking sit inside LIVE LLM prompts and JSON-schema
descriptions in `lib/ai/results.ts`, `lib/ai/observation.ts`,
`lib/ai/measurement.ts` and `lib/skills/builtins.ts` — including a few-shot
headline example, *"Guests engage far more — but the booking path moved"*. A
few-shot example inside a schema is the strongest signal in a prompt: pointed at
a bank, the model writes hospitality language into their readout because we told
it that is what a readout sounds like.

Harmless today — Beta 1 is single-tenant — and a hard blocker for customer two.
Changing a prompt changes model behaviour, so the work is: fix the 17, then diff
one real readout before and after so the change is visible before it ships.
A further 5 doc comments and 8 pieces of UI copy are cosmetic and can wait.

## 5 · Archiving and deleting an account

**Status:** UX BUILT 11 Sep 2026 (`src/app/console/lifecycle.tsx`). The backend
rules below are the specification for when it is made real.

**Why it is not just a button.** An account holds things Prism does not own: a
script tag in the customer's own HTML, branches in the customer's own GitHub,
readout links in other people's inboxes. It also holds the one thing the product
claims is immutable — recorded decisions, the earned layer. Ending an account
has to be honest about what it can reach and what it cannot.

### Two acts, not one

**Archive = stop.** Reversible. Nothing runs, everything stays readable.
**Delete = leave.** Irreversible, and only reachable from archived — you cannot
delete an account that still has something live.

Both are gated by a DERIVED precondition list, never a checkbox: each line is
state some other surface already reads, exactly like the setup checklist and
back-office Health. You cannot archive while a run is reaching real visitors;
you cannot delete while a script is still calling home.

### What happens to each thing

| What the account holds | Archive | Delete |
|---|---|---|
| **Runs reaching real visitors** (4 in the fixture) | Blocks it. Offers *Stop them and archive* as one deliberate act — never a side effect. Each run stops with whatever the data supports | none can remain |
| **Experiments mid-build or in review** | frozen where they are; no new builds, no pushes | gone |
| **The Prism script on their pages** | Prism CANNOT remove it — it is their HTML. The loader serves nothing, so every page reverts to control on the next load. The account is told the tag is still there and given the line to remove | must be gone first; Prism verifies by the heartbeat stopping |
| **Recorded decisions and the earned layer** | kept and readable — this is the point of archiving | offered as an export first, then gone. It is theirs, not ours |
| **Readouts shared with people who have no account** | keep working, read-only | the links die. Say so, and say how many |
| **Branches in their repository** | untouched — Prism does not own that repository | untouched. Say so explicitly: someone deleting an account will assume the branches went with it |
| **Their keys** (A/B tool, AI model, code host) | kept, unused | revoked and destroyed |
| **People** | keep read access, lose write | access ends |
| **Metered usage / billing** | stops on the archive date | — |
| **Activity and support-session records** | kept | gone with the account — it was their record of who looked at their data |
| **The operator's own audit** | — | one line survives: an account was deleted, when, by whom, on whose request. No customer content |

### The invariant that matters most

**An administratively stopped run is not a finding.** When archiving stops four
live runs, their verdicts must NOT read as *refuted* — nothing was disproved.
They are `not_adjudicable`, with the reason recorded as *stopped because the
account was archived*, never as a result. Anything else writes false evidence
into the earned layer, which is the one layer the product calls immutable and
measured.

### The four calls, settled

1. **Cooling-off: 30 days from the archive date**, shown as a date rather than a
   countdown. Waivable by a written request — the Owner's own words, kept on the
   record beside the deletion, because a data-protection request cannot be made
   to wait a month.
2. **Both may delete.** The Owner from their own Account room, the operator from
   the back office. Same preconditions, same words. A deletion right that needs
   a support ticket is not a right.
3. **Archiving keeps read access.** An archived account its owner cannot open is
   a hostage, not an archive.
4. **Un-archiving returns to the setup checklist, not to running.** It cannot put
   back a tag that was removed while it was gone, and Prism cannot know until a
   page calls home. Saying "live" would be a guess presented as a fact.

### How it is enforced

Read-only is ONE context (`Archived`), read by `PageHeader` — the single grammar
for a room's actions. A room cannot forget to be read-only, because every action
it offers passes through that header. Verified across Experiments, Guardrails,
Connections and People.

The script precondition clears by LISTENING, never by a checkbox: *Check again*
waits for a tag to call home and reports what it heard. Asking someone to
confirm a tag is gone would be a flag somebody has to remember to set, which is
exactly what the derived-preconditions rule forbids.

### Where it lands

Back office → Customers (the operator's path), and the customer console's own
settings (the Owner's path) — the same two acts, the same preconditions, the
same copy. `operator.tsx`, a new account-lifecycle surface, plus a `state` on
the account fixture (`active | archived | deleted`) that the shell reads: an
archived account's console is readable and every write control is gone.

## Open questions

- **Demo accounts across verticals.** The back office lists four accounts and
  all four are hotel groups. Making them a retailer, a SaaS, a charity would
  make the product's neutrality visible rather than merely true — at the cost of
  fixtures that are no longer backed by a real crawl and a real Optimizely
  project. Undecided.
- **The wizard stepper.** shadcn has no stepper; the step bar is the one
  hand-rolled control in the console. Keep, or rebuild from primitives.

