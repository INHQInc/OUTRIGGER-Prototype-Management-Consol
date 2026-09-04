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
