# Beta 2 — decisions

*Calls made, with the reasoning and the cost accepted. A decision that is only
in a chat log is not a decision. Supersedes the open questions it answers in
TARGET-ARCHITECTURE.md; where it contradicts a mockup, this wins.*

---

## D1 · Ship the whole six-role model. Enforce three gates.

**Decision.** `Author · Builder · Reviewer · Approver · Admin · Viewer` all exist
in the data model and in `can(actor, customer, action, subject)` from the first
commit. Only three transitions are *enforced* at first — **Approve · Kill ·
Stamp** — and the roles a customer has not used stay out of their UI.

**Why not "two roles now, six later".** The expensive parts of a role model are
the migration and the resolver, and neither gets cheaper by deferring. Adding
roles later means backfilling every member row and re-auditing every call site;
the resolver costs the same whether it knows two roles or six. What is genuinely
expensive is *enforcement* (gates on ~25 sites that read `user.role` off a JWT
today) and *comprehension* (six roles shown to a three-person team). So we defer
exactly those two and nothing else.

**Consequence.** The other three roles become configuration, not engineering:
turning on Reviewer sign-off later is a policy flip, not a schema change.

**Cost accepted.** Some `can()` cases return "permitted" for a while because the
gate behind them is not yet written. That is a known, listed gap rather than an
absent concept — and it fails toward today's behaviour, so nothing regresses.

---

## D2 · Distinct-approver defaults to the size of the team, and says which.

**Decision.** `requireDistinctApprover` is **on when the customer has three or
more people who can approve, off below that** — and the Settings row always
states the reason in words: *"Off — you have 2 people who can approve. We'll
suggest turning this on at 3."* Adding a third approver prompts once. Every
change is audited, on or off.

**Why not the doc's `true` by default.** A three-person team hits a wall on day
one, turns the check off in irritation, and learns that the product is
bureaucratic. That teaches exactly the wrong lesson about the feature the
product is sold on.

**Why not `false` by default.** A governance tool whose governance is quietly off
is selling a claim it does not make. The failure is silent, which is worse.

**Why the derived default is better than either.** It is never silently weak —
the state and its reason are on screen — and it becomes strict at exactly the
moment strictness becomes possible, rather than at an arbitrary one.

---

## D3 · `/` Today is role-derived from day one.

**Decision.** Today filters through `can()`. It ships with the three enforced
gates, so an Approver sees runs that ended without a Decision and an Author does
not.

**Why.** A queue's only value is being shorter than the list. A Today that shows
everyone the same rows is `/experiments` with a different heading — which is
what the current dashboard is, and why nobody uses it. The copy says "waiting on
you", so it has to be true.

---

## D4 · The tenant is a **Customer**.

**Decision.** "Customer" in every surface. `Org` in code, renamed to `Customer`
(not `Brand`).

**Why.** It is what the operator already calls it, and it is on nearly every
screen. TARGET-ARCHITECTURE §1 proposed "Brand"; the vocabulary that is already
in people's mouths beats the tidier noun.

---

## D5 · shadcn/ui is adapted, not adopted. Prism's tokens stay canonical.

**Decision.** Components are copied in and rewritten to Prism's vocabulary on the
way in. `shadcn init` is never run against this repo.

**Why.** Two of shadcn's token names mean the opposite of ours: its `--muted` is
a background where ours is body text, and its `--accent` is a faint hover wash
where ours is the one brand blue. Letting it write the palette would restyle
about **1,196 call sites** (`text-muted` 766, `text-accent` 289, `bg-accent`
141). Owning the source is the point of the library.

**Consequence.** Each component costs a few minutes of adaptation on arrival,
and we keep one palette and one card grammar.

---

## D6 · The BuildRuntime seam lands before any Managed work.

**Decision.** `BuildRuntime` + `LocalBuildRuntime` ship first, inert, wrapping
what already happens. `ManagedBuildRuntime` is then an adapter, not a project.

**Why now.** A seven-agent trace found `prepare()` already exists in good shape —
it is `provisionBranch()`, including the fork off `starter` and the
compare-and-swap `.opmc/**` commit. What is missing is thin: `start()` is a
paste-able string with no session record, and `logs()`/`cancel()` have nothing
behind them. So the seam is mostly naming what is there, and it is far cheaper
before a second implementation exists than after.

**Capabilities are declared, not assumed.** `{ streamsLogs, canCancel,
reportsCost }` — all three are `false` for Local today, and the UI degrades from
the descriptor rather than from a mode string.

---

## D7 · A sandbox build needs Node and three files. Proven, not assumed.

**Decision.** The Managed lane is viable and the terminal step is a historical
accident, not a technical requirement.

**Evidence.** A throwaway spike: clone `starter` with the org PAT over HTTPS
(1.3s, 168K, 11 files, **no `package.json`**), copy three files into a directory
with **no `.git`**, and `OPMC_KEY=… node build.mjs` produces the artifact in
**0.09s** with no network. Push access as the PAT confirmed by dry-run; nothing
was written.

**What is still open, and is the real sizing question.** `dev.mjs` proxies the
customer's *live* page, so if the agent must *see* its work the sandbox needs
egress and a headless browser — not just Node. That, not the build, is what
decides the shape of the Managed lane.

**Security finding attached to this.** The org PAT carries `admin: true` on the
prototypes repo and authenticates as a *user*, not a machine account. Before any
sandbox holds a credential it must be a fine-grained token or GitHub App scoped
to one repo with `contents:write`.

---

## D8 · Creating a customer is a back-office act; the customer connects its own tools

**Decision.** "Add a customer" lives in the back office, not behind the customer
switcher. The operator's wizard creates the record and the *understanding*
(read → ask → correct → compile); it then invites the first Owner. The Owner
connects the A/B tool, the AI key and the site scripts from inside their own
console, where the setup checklist already lives. Prism never asks an operator
to paste a customer's credentials.

**Why.** Two of the use cases (A/B tool BYO, LLM key BYO) are the customer's
keys. An operator holding them is a liability we would have to explain in the
first security review, and it makes the operator the bottleneck for setup.
The switcher now switches; its menu says where creation happens instead of
pretending to do it.

---

## D9 · The customer interview is terminal, and unknowns are recorded, not guessed

**Decision.** After the site is read, Prism asks only questions whose answer
changes what the agent would build — grounded in what the crawl could not
settle (which of two button labels is primary; which of three loaded families
is the headline face; whether the absence of urgency copy is a rule). Three
rounds at most. After the third, or when the person says "that's enough",
anything unanswered is written into the profile as **unknown** and the agent
must ask before assuming. The understanding meter may fall: an answer can
reveal Prism knew less than it thought, and the option says so before the click.

**Why.** It is the brief's rule (`src/lib/ai/brief.ts`, `measurement.ts`:
questions ⇔ readiness < 90, answers pass terminal, code force-empties the
loop) applied one tier up. The failure it prevents is the same: an endless
interview nobody finishes, or a profile that reads as confident where it is
guessing. The ceiling of asking is around 85; the rest is *earned* from
recorded decisions, which is why the profile shows that layer first.

**What the real read found (10 Sep 2026, prep.outrigger.com, `deriveDesignTokens`).**
Three self-hosted families (Duplicate Sans, Duplicate Ionic, Montserrat — 15
faces); 1,398 custom properties in main.css — 355 Bootstrap's, 46 the brand's
own named palette (`--clr-deep-turquoise`, `--clr-black-rock`, `--clr-sand`,
`--clr-coral`…), the rest per-component — plus 60 from the SynXis booking
widget, whose stylesheet also owns the primary button's style; Bootstrap 5
underneath with its default blue (`#0d6efd`) used 38 times beside the brand's
`#0078cd` (43); "Check availability" ×9 against "Book Now" ×3 on the home
page. Every one of those became an interview question, because a crawl can
see them and cannot decide them. (A first derivation run reported zero brand
variables: it resolved main.css against `www.`, which the WAF blocks for Node.
The review caught it against the repo's own July capture.)

---

## D10 · The customer is a container; everything read, asked and approved is per site

**Decision.** Nothing is crawled, characterized or approved at the customer
level. A customer is a name, its sites, its people and its connections. Each
SITE has the observed / characterized / earned layers, its own interview, its
own context revisions and its own compiled skill (`sites/<domain>/context.md`,
skill tier `site`). The back-office wizard creates the container and its
Owner; reading a site happens from Sites, one site at a time, by whoever knows
that site — or by an operator inside a support session. When a site is saved,
the next thing offered is the next site: a customer with three sites is not
onboarded until all three are understood.

**Why.** A crawl is of a site, and a hotel group's properties do not share a
voice: outriggerkona.com reads "quieter and more residential than the main
brand" while outrigger.com sells the beach before the building. A customer-
level profile would have averaged them into something true of neither, and
the agent would have cited it. (Bryan, 10 Sep 2026: "everything from the scan
and evaluation should be site specific, not the brand — the brand is just a
container"; "once a site is fully onboarded the option should be to scan
another site".)

**Consequence for CONTEXT-INGESTION.md.** The hierarchy there gave the Customer
its own profile / skill / evidence. Corrected: those live on Site only. The
skill resolution rule is unchanged in shape — global + customer + site +
prototype, later tiers win — but the customer tier holds only hand-written
skills (brand-voice, accessibility floor), never a derived profile.

---

## D11 · Signed in, you belong to one account; the sidebar picks a site

**Decision.** The console never offers another account in a picker. The
control at the top of the sidebar is a **site selector** — *All sites* or one
of the account's — and it scopes Overview, Experiments and Readouts. The
account's name sits above it as a label, not a control. The only way into a
different account is the back office, which loads you into that account with
its sites as a support session the account can see (D8).

**Why.** Bryan, 10 Sep 2026: "should this be a site selector after you have
logged in as a customer? if I wanted to modify anything as the app owner I
could go from the back office and open that customer and then I have that
customer loaded and their sites." An account switcher in a signed-in console
implies the person can see other people's data; a site selector implies only
what is true. It also keeps the copy generic — the same screen reads right
for an account that signed itself up (no operator anywhere in the sentence).

---

## D12 · One way to a site, and copy that reads right for an account that signed itself up

**Decision — one way in.** There is no Sites room. The site selector at the top
of the sidebar is the only site control: picking a site scopes Overview,
Experiments and Readouts to it, and puts a CONFIGURE item **named for that
site** below — environments, script, source code, and what Prism understands.
Each row of the selector carries that site's understanding state (*Not read
yet* · *Read — questions waiting* · *Interview unfinished* · *Approved · r3*),
so nothing the list view showed is lost. *All sites* means no site item.
*+ Add a site* lives in the selector and lands on the site it created.

**Why.** Two doors to the same place (a dropdown and a nav item) means neither
is the way, and the nav item carried a list that only existed to re-choose what
the dropdown already chooses. (Bryan, 10 Sep 2026: "the drop down to pick sites
is the only one but it must also load all the site info from the other tab.")

**Decision — generic copy.** No screen says *the customer*, *their sites*, or
*on their behalf*. The person on the screen owns the account; an operator only
ever reaches it through a support session the account can see. The wizard is
**New account** → Company · Sites · Owner.

**Why.** The same screens have to read correctly when an account signs itself
up, with no operator in the sentence at all. (Bryan: "a customer might actually
just sign up — keep it generic.")

**Also settled in passing.** The support-session reason gate says what it wants
("The account's Owner reads this in their Activity — a plain sentence, not a
word") and opens at four characters; an eight-character gate that explained
nothing read as a broken button.

---

## D12 · Two repositories per site, and the read-only one is read at onboarding

**Decision.** A site names two repositories and they are never the same thing.
The **prototypes** repository is where Prism WRITES — each experiment is a
branch under `prototype/`. The **source** repository is where Prism READS — the
site's real stylesheets and components — and it is read-only, always. Both are
collected when the site is added, before anything is read.

**Why read the source at all.** A crawl sees what a browser computed; the
repository sees what somebody wrote. `deriveDesignTokens` already says so:
*"Computed styles in the browser miss media queries and pseudo-states. Prefer
the source repo's SCSS when it's available."* The difference is not cosmetic —
counting says `#004561` appears 73 times; the stylesheet says its name is
`$clr-deep-turquoise`, that it is `$primary`, and that six more colours are
declared which no page we read happens to use. Only two sources can find that
last one.

**The mechanic that makes it worth doing.** Connecting the source SHORTENS THE
INTERVIEW. Three of the seven questions exist only because a crawl cannot see
the source — which type family is for headlines, whether the framework's blue
is a leak, which button is the primary. Each is one line in a stylesheet or one
component name. The interview shows them answered, with the line that answered
them, and asks the remaining four — which are the ones no file can answer.
The product thesis in one screen: give Prism more and it asks you less.

**Consequence.** Adding a site is INFRASTRUCTURE only — address, code,
environments, script. The wizard used to read the site itself and then
Understand read it again; now the read happens once, over both sources, in
Understand. Page selection is gone: the read chooses by template and says so.

---

## D13 · The product is vertical-neutral; the site profile learns a vertical

**Decision.** Nothing the console says about itself may assume what a customer
sells. Room titles, help text, dialog copy, validation, empty states, the
interview's questions, and every `prism/*` built-in skill are written for any
website in the world — retail, SaaS, media, charity, banking, travel. A person
on a customer's website is a **visitor**. The product never names what converts:
not bookings, not sign-ups, not sales — it says "the action that matters" or
recasts the sentence.

The opposite is true one layer down. A **site profile** is supposed to be
specific: the drafts about outrigger.com are written in hotel words because
outrigger.com is a hotel site, and the `outrigger/brand-voice` skill saying
*"Guests, never users"* is that brand's own rule, correctly discovered. That
contrast is the proof the architecture works — the product assumes nothing, the
profile learns everything.

**Why it is written down.** The demo account is a hotel group, and its
vocabulary leaked out of the fixture and into the product: 262 occurrences of
guest/booking across 19 files, including a rule stated in agent briefings that
site visitors are called "guests". A prospect from a bank would have seen a
console that assumed they sold rooms. (Bryan, 11 Sep 2026: "this is not a hotel
solution… this is for any brand in the world.")

**How to hold the line.** Before writing product copy, ask whether it would read
correctly on a console loaded for a bookshop. Fixture content is exempt and
should NOT be sanitised — the demo has to describe a real site in its own words.

---

## D14 · A site's own code is required to build; the gate is on Build, not on setup

**Decision.** Every site names two repositories and a prototype cannot be built
without both. The **read-only source** is what the agent builds AGAINST — the
site's own stylesheets and components. The **prototypes repository** is where
the build lands. Neither is optional.

But neither is required to ADD a site. You may not know them when you are
adding it, and a wizard you cannot finish is worse than a site that says plainly
what it still needs. **The gate is on Build.** A site missing either one can be
added, read, interviewed, corrected, and have experiments written and measured
against it — the moment something would be built, it stops, names what is
missing and offers to go and fix it.

**Why the source specifically.** Without it the agent writes from the OUTSIDE of
a page: it guesses at the design system from what a browser happened to compute,
which silently misses media queries, hover and focus states, and every token
declared but not used on the pages that were read. What it produces then sits
beside the site rather than inside it. With the source it reuses the real
components and the real names — and it answers three of the interview's
questions outright (D12).

**One definition, like the other gate.** `buildBlockers(site)` sits beside
`isBriefComplete` in `fake.ts` and is imported by every surface that gates on
it: the Build stage, and the point where an experiment chooses a site. Session
changes count — `resolveSite(domain)` in `config.tsx` applies what was connected
a minute ago, so connecting a source unblocks the build immediately rather than
at the next reload.

**The three states are all in the fixture, on purpose.** outrigger.com has both
and builds. outriggerkona.com has a prototypes repository and no source — the
sharp case, half set up. waikikibeachcomber.com has neither. (Bryan, 11 Sep
2026: "we need each site's source code to properly build the code… its
required… no prototype can be built without it.")

---

## D15 · A nav group names a SCOPE, not a verb

**Decision.** The sidebar's groups say whose settings these are, not what you
are about to do to them. `CONFIGURE` is gone. In its place:

```
Overview · Experiments · Ideas · Readouts · Activity     (the work, and the record)
<the chosen site's domain>                               Setup · Understanding
ACCOUNT                                                  Connections · People & roles · Guardrails · Account
DEMO
```

**What was wrong.** `CONFIGURE` held six things with nothing in common — one
site's setup, account integrations, people, experiment defaults, an audit
record and account lifecycle. Two of them were not configuration at all:
Activity is a record and Account is lifecycle. Worse, a person who had just
chosen a site had no way to tell which of the six followed that choice. Exactly
one did. Reading "Guardrails" under a heading that appeared below a chosen site
invited exactly the wrong conclusion.

**Consequences.**
- **Activity moves up**, with the things you READ. In a product whose pitch is
  the audit trail, it was fifth in a list of settings.
- **The site splits in two.** One item was carrying environments, the script,
  both repositories AND the whole understanding surface — the read, the
  interview, five sections, revisions, output files. Its own subtitle truncated
  to "environments · source · understan…", which was the overload showing.
  `Setup` is infrastructure; `Understanding` is knowledge — a different job,
  done by a different person, at a different time (the same split D12 drew
  through onboarding).
- **The site group vanishes when no site is chosen**, so the nav never offers a
  setting with nothing to apply it to.
- **State rides the row it describes.** The understanding state was briefly a
  pill beside the group header, which truncated the domain — and it describes
  Understanding, not the site. It is a dot on that row, with the words in its
  title and the full pill on the page itself.

---

## D16 · The code host belongs to the SITE, never to the account

**Decision.** Where a site's code lives — GitHub, GitLab, Bitbucket, Azure
DevOps, cloud or self-hosted — is a property of the SITE. There is no
account-level code-host connection.

**Why.** Bryan, 14 Sep 2026: "a customer might have 10 sites managed by
different systems." One site is built in-house on the company GitHub; the next
is an agency's self-hosted GitLab; a third is a partner's Bitbucket. An
account-level connection means the second site can only be set up by granting
Prism access it has no business holding — or cannot be set up at all.

**What it changes.** A site's Setup now reads in the order the work happens:

1. **WHERE THE CODE LIVES** — the host, its organisation, and whether it is
   self-hosted. Prism reaches that organisation and nothing else on that host.
2. **READS FROM** — this site's own stylesheets and components. Required to
   build (D14), so it comes before the repository that merely receives output.
3. **WRITES TO** — the prototypes repository and its branch prefix.

Connections keeps only what genuinely IS account-wide — the A/B tool, the model
key, site reading — and carries a table naming each site's host, so somebody
looking for it there is told where it actually lives rather than finding nothing.

**Fixture.** outrigger.com is on GitHub at `INHQInc`; outriggerkona.com is on a
self-hosted GitLab at `git.kaimana.dev` under an agency's group, with its own
prototypes repository; waikikibeachcomber.com has no host at all. The three
states are in the demo on purpose.

**Open, and adjacent.** The A/B tool is still account-wide ("one per account").
If a customer's sites live in different Optimizely projects — likely, on the same
argument as above — that is the same mistake one layer along. Not yet decided.


## D17 · A site is committed at its address, and what it still needs has one home

**Why.** Bryan, 15 Sep 2026, walking the owner journey: *"this is widely difficult
to follow"* and *"I find the screens right now very complicated"*, then — on the
site wizard — *"maybe its a wizard to start and then you can bail but pick back on
on the overview page."*

Three things were wrong at once. **Add a site was a four-step wizard that discarded
everything if you left**, while its shell showed a "Saved" pill and the line "You
can stop here and come back — nothing is lost" and offered "Save & close". It wrote
no draft at all: `grep -c DRAFTS onboarding.tsx` was 0 against 7 in
`customer-context.tsx`. **Its steps 2–4 were a second copy of the Setup room**,
which has always owned environments, the two repositories and the install
instructions durably. And **the one surface that tells an owner what to do next
rendered behind `{fresh && …}`** in work.tsx, where `fresh` is set true only by
entering a back-office support session or by un-archiving — so a customer's own
Owner had never seen it once.

**Decision.**

1. **A site is written the moment its address validates**, not at the end of a
   flow. "Nothing is lost" becomes a property of the data — a row in the site
   selector — rather than a promise an in-memory map has to keep. There is
   therefore nothing to *resume*: reopening "Add a site" always starts a new one.
   The rejected alternative was giving the wizard a real draft map; it makes a
   second durable editor for five facts that already have a home.
2. **What a site still needs has ONE definition** — `siteSteps()` in `fake.ts`,
   beside the gate it shares. Its three build gates **are** `buildBlockers()`,
   imported and never re-derived — the rule D14 set, now stated for the wider
   list. The other three are work that is not a build gate: an environment, a site
   read and checked, and a tag that reports in on its own.
3. **The account Overview carries exactly one readiness card, per site**, and it
   is the only resume surface. Per site because D16 makes an account-level code
   host untrue at the second site. A row is collapsed to its own first unmet step
   as a sentence with a verb; the site the selector is scoped to expands; only the
   first not-done step opens into teaching prose, so the list stays a list.
4. **Reading a site is step 5.** Read · Ask · Correct is the product's whole point
   and had appeared on no checklist anywhere — its only signpost was 12px grey text
   on the last screen of a wizard nobody reopens. It says plainly that a build does
   not wait on it, but that what gets built is only as good as it.
5. **Committing at the address obliges a way back out.** "Remove this site" in the
   Setup room, offered only for a site added this session with no experiments. A
   typo would otherwise be a permanent row nagging from the readiness card.

**What it changes.** The wizard is two steps — address, then the host — and step 2
renders `CodeHostCard`, the *same* component the Setup room renders, writing through
one `rememberEdit()`. Leaving lands on Understanding rather than Setup. Deleted:
wizard steps 3 and 4, the reads-from and writes-to halves of step 2, the
account-level checklist's host/repository/Optimizely steps, seven Outrigger-
hardcoded fixtures, the dead `Sites → the site` route, and the `fresh` gate.
`onboarding.tsx` went from 342 lines to 167; `setup.tsx` lost 326.

**The known price of D12.** The site selector is the only site control, so any
per-site "fix this" button on an account-scoped screen must re-scope the sidebar,
Experiments and Readouts as a side effect of being pressed. Accepted, and written
down here so the next session does not rediscover it as a bug.

**Understanding state now has three homes, not four.** The selector row's pill, the
readiness step, and the Understanding room. The sidebar dot was dropped: it was the
only one of the four that was a colour with no sentence — a status you cannot act on
from where you see it.

**Open.** When every site is ready the card removes itself and says so first, so
"is my newest site set up?" has no answer on Overview once it is. Accepted: a
permanent "ready" row would be a status nobody can act on. Revisit if anyone looks
for it.
