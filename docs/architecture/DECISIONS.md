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
