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

