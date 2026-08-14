# Design Principles — how OPMC screens are laid out

*Every rule below exists because the user corrected a real screen. Violating one
is a bug, not a taste difference. Read this before touching any UI.*

## 1. Say it once

Every fact has exactly ONE home per screen. Before adding any status text,
banner, badge, or empty-state sentence, ask: **where does this fact already
appear?** If it appears anywhere, link to it — don't restate it.

- Status/stage → the rail's status block (stage chip + stage strip). Nowhere else.
- Gates & problems → **the command rail** — every lifecycle row carries its live
  severity dot; the gate line sits under the CTA. THE RAIL IS THE CHECKLIST;
  there is no Overview page.
- The CTA states the action ("Write the brief"), not the reason. And it is
  HIDDEN when you're already in the room it points to (a link back to the
  current tab is dead weight).
- An empty state may guide ("explain the experiment…") ONLY if no other element
  on the screen already says the thing is missing.

*Origin: "why do we need to repeat about the brief this many times" — the same
fact appeared 5× (chip, chip status, banner, Needs Attention, empty card, CTA).
"why do we need this?" — the parts grid restated the tab bar.*

## 1b. One status color vocabulary — four meanings, everywhere

🔴 **critical** = blocked, no way forward · 🟠 **attention** = needs you now
(the active step, or a warning on a done one) · 🟢 **good** = done + verified ·
⚪ **pending** = not started. Derived once in `lib/prototypes/severity.ts`
(`stepSeverity`); every dot and checklist row colors from it. Never invent a
fifth color or reuse a meaning (the old blue "current" dot broke this).

*Origin: "CRITICAL no way to move forward is red, needs attention is orange,
done/good is green, not started is gray."*

## 2. One vocabulary, one derivation

The board column, the header stage chip, and any other "where is it" surface use
the SAME word, produced by the SAME function (`pipeline.stage` in
`lib/prototypes/pipeline.ts`). Never re-derive stage/status locally — consume the
pipeline. Normalize stored status with `normalizeStage()` like every reader.

*Origin: "this is confusing which one is right and why the overlap" / "and they
don't align."*

## 3. The IA is the stage model

**First-principles law (user-driven 07-30; supersedes the grouped-rooms
rail):** the human's job is five decisions — say what to build → get the
agent going → judge it on the real page → run the experiment → hand it off —
and the console has ONE canonical model for that: **Brief · Build · Review ·
Experiment · Handoff**. Those ARE the rooms, plus a quiet Settings. Never
let the nav mirror the machine's subsystems: subsystem-shaped IA (fourteen
rooms under seven headers) generates clutter no trim can fix and forces
conductors to be bolted on top just to navigate it. **New capability = a
SECTION inside its stage** (anchor id, one card grammar) — never a new room
or group. Status escalates INSIDE derivePipeline (anchored alerts: drift,
cert, QA failing/stale) so every surface — rail dots, table strip, board —
shares one derivation and can never disagree. **ONE VERTICAL NAV, TOTAL** — and since 08-14 that one is the global
sidebar, which is now ALWAYS present. The rooms became a horizontal TAB ROW
inside the workspace, so the sidebar no longer has to vanish to keep the
count at one, and you can move between prototypes without leaving the one
you are in. Inside a prototype the sidebar defaults to a 56px ICON RAIL
(label on hover); elsewhere it is labelled; an explicit toggle beats both
and is remembered. The tabs keep the rooms' status dots — same
`derivePipeline` derivation, so tabs, table strip and board cannot
disagree. "← Prototypes" is gone: the sidebar is the exit, and a link back
to a place already on screen is dead weight (§1).

*Origin (08-14): "i want the left nav panel to always be present, no more
navigating away… once you are in an experiment these vertical items on the
left go away and we use a tab system."* The earlier rule — sidebar hidden
inside a prototype — solved the same problem (two nav columns) by removing
the wrong one.

*Origin: "think about our product from a first principles perspective, not
patching."*

**Opti-native grammar (user-locked 07-25):** the /prototypes front door is an
Optimizations-style table; the workspace is the five-stage rail. When adding
a surface, ask "how does Optimizely say this?" first — familiarity to an
Opti user is a feature.

**Set up, then operate (user-driven 07-30):** rooms serve OPERATING a
prototype; they are the wrong shape for SETTING ONE UP, because setup is
genuinely linear (brief → branch/agent → first build → page verification —
each step depends on the last). Until the base is set the workspace is a
guided single-column flow: numbered steps embedding the rooms' own
components, completion by ground truth (steps tick themselves), every step
openable (numbering carries the linearity; hard locks make honest mistakes
unfixable), one-way flip to the working model when the base is set. Never
show a new prototype the command rail; never show an operating prototype
the setup flow.

**The queue is the conductor (user-driven 07-30):** in the working model,
the human must never be the workflow engine. The rail's status block carries
"Next" — the iteration loop derived from ground truth as an ORDERED,
EXECUTABLE queue (deriveFlow): one-button server actions run INLINE from the
queue (re-sync, QA generation, cut, push — gates still apply and deliberate
friction like the QA ack stays in its room); agent steps hand over the exact
paste line; machine waits genuinely tick (a poll runs only while one shows);
human acts are links, never pulses. Rooms are for depth and judgment; the
loop runs from one place. The queue replaced the single CTA + gate line —
its first item IS the gate, with its why.

**ONE of each in the rail (user-enforced 07-30, the second time):** the rail
carries exactly one nav (the rooms), one status (chip + the rooms' dots),
one action surface (the NEXT card — a single card; the rest of the loop is
a "then: A → B → C" preview LINE, expandable). Never stack a second
numbered list beside the room list. The in-workspace stage strip died of
redundancy — the dots already say per-stage state; the strip lives only on
the /prototypes table, where it's the sole status system.

*Origin: "look how many navigation management areas we have now — we got
worse not better."*

*Origin: "making changes to brief, resync, cut new version — it's a mess of
jumping around… the order to execute is impossible to know if you're not
using it daily."*

*Origin: "the flow is so bad, it really is jumping from one section to
another and back and forth… make each logical setup step that's required up
front, then a working model after the base is set."*

*Origin: "it's all super confusing… a prototype has a brief, source control
setup, experimentation setup, skills setup, code handoff — not a list of steps."
/ "items that don't have the status dots look like they are at the same level
of nav as each section."*

## 4. One card grammar per room

Every section in a room is the same shape: title row (`text-[14px]
font-semibold`, action button on the right if it has one) + muted description +
body. No collapsibles for primary configuration. No title-less cards sitting
next to titled ones. No card wrapping another card with its own second heading.
At most ONE accent-tinted card per room — the room's primary action.

*Origin: "why is repo and branch collapsible but local folder is not… it's kind
of a hierarchical mess."*

## 5. Gates block, they never teleport

Position holds at the first blocked gate (the first-gate rule). Requirements
badge and block; they never move work backwards. A running experiment locks the
prototype — no UI may offer a bypass.

## 6. Every status element is a link to its fix

A chip, dot, alert, or Needs Attention row deep-links (`?tab=<room>`) to the room
that resolves it. Status you can't act on from where you see it is decoration.

## 7. Width is the content's, not the container's

No page-level width cap that all sections inherit. Full-width page; form-heavy
rooms choose `max-w-4xl`; prose keeps ~70ch. Wide artifacts (explorers, boards)
take the space.

*Origin: "why are we forcing all the content to be stuck with the width of the
steps at the top."*

## 8. Type floor

No user-facing text below 12.5px. Body 14–15px. Contrast was never our failure —
size was.

## 9. Ground truth only

The UI renders what the system can verify (branch HEAD, cut SHAs, live
experiment status, injection checks) — never self-reported progress. If we can't
verify it, say so honestly ("pre-certification") rather than implying it.

## 10. Name things what the user calls them

"Start Claude", not "Run this to build". "Repo & branch", not "Code location".
"Sync brief & skills to the branch", not "Branch content". If a label needs the
description to be understood, the label is wrong.

And when the user has a word for something, that word wins — even against a
plainer one. The chip on a multi-event metric says COMPOSITE, because that is
what he calls it, what the type is called, and what the builder says. Choosing
"combined" because it read more simply quietly renamed his vocabulary and gave
the product two words for one thing.

*Origin: "i said composite you used combined why?"*

## 11. Refreshing is not broken

Content that is being regenerated is still true, so it is never dimmed, covered
or replaced by a spinner. The zone header says what it is doing and its rule
pulses; the numbers stay legible the whole time. Two scrims over half a readout
made a routine background rewrite look like a fault.

*Origin: "this is super strange for the user" · "the overlay is terrible."*

## 12. A readable measure, at any screen width

A section either uses the width it has or holds a comfortable measure — never a
line that runs the full width of a wide monitor. Prose over ~75 characters
becomes a wall no matter how good it is, so a wide zone becomes COLUMNS rather
than longer lines. Corollary: no section may stop two-thirds across while the
one beneath it spans everything; two widths in one zone read as broken
alignment.

*Origin: "its a giant read and very hard to find something you read when you
look back" · "use the space it has optimally."*

## 13. The number lives with the sentence that explains it

A row of lifts under a paragraph is a magnitude with no meaning, sitting between
prose that gives it meaning and a table that gives it context. Each movement of
a read carries its own figure. And the words never contain the number: the model
names a METRIC KEY, the page resolves the live value, so a saved sentence can
never quote a stale figure.

## 14. Same shape, every time

A readout is read repeatedly, across experiments, by people looking for the part
they half-remember. The sections are therefore FIXED and identical everywhere —
What the change did · Where the behaviour went · What it cost · Against the
prediction — and each stands alone, so scanning one gives a complete thought.
The cost of a fixed frame is a section with nothing to say; the answer is to say
that plainly, never to invent content to fill it.

## 14b. Role owns the colour; kind is set apart by form

The four role chips — decision · supporting · guardrail · exploratory — own the
colour vocabulary on a metric. Anything that is a different CLASS of fact about
the same metric (that it is a composite, that it is per-version) must not borrow
one of those hues: a Σ COMPOSITE chip in accent read as a second SUPPORTING
badge. Set it apart by FORM instead — filled rather than outlined, with a mark —
so the reader can tell a kind from a role without learning a fifth colour.

*Origin: "composite needs a different color than supporting metric its
confusing."*

## 14c. Flag what is not what it appears to be

A COMPOSITE metric is a different kind of thing from an Optimizely event, and a
reader who doesn't know that reads its rate as a head-count. Anywhere such a
metric appears — the read, the per-metric rows, the index — it carries the flag,
and hovering gives the one description of what it sums and how it is counted.
The flag only fires when the metric genuinely combines more than one event: a
one-event composite is the event under another name, and flagging it would
train the reader to ignore the flag.

## 14d. The reader never hears about our plumbing

A readout describes the change and what guests did about it. It never mentions
where the change was authored, which system holds it, or how the console
obtained it — no visual editor, no custom code, no artifact, no push, no repo.
Labelling the model's INPUTS by provenance is what invites this: it starts
reasoning aloud about the scaffolding. Give it one block called "what the new
version changes on the page" and the tooling disappears from the prose.

*Origin: "we dont care where the change was made this is about the change and
the impact thats all."*

## 14e. A document does not depend on the reader's screen state

What prints must not depend on which folds happened to be open or which rows
someone expanded. Two people printing the same readout must get the same
document. Open the folds for the duration of the print and restore them after;
print every cached explanation, not the ones currently on screen.

*Origin: the method section printing as a heading with nothing under it.*

## 15. Compute the caveat; never ask for it

If the console can derive a warning, it states it. Action-total composites,
one-armed surfaces, events the plan names that Optimizely isn't reporting, a gap
that hasn't separated from the control — all computed. A caveat that depends on
a model remembering to write it is a caveat that eventually goes missing, and
two sections asked to "note the caveats" will write the same sentence twice.

## 16. One control, one meaning

When a control does two jobs, it does neither well and neither can be turned off
independently. Type says what a metric is FOR (and drives the summary); the pin
says whether it gets a written observation. Marking PROMOTES; it never
suppresses — an unmarked metric still feeds the verdict and can still be raised
as a contradiction, or the control becomes a way to curate a flattering readout
by omission.

## 17. No caps the product didn't ask for

A limit is a product decision or it is storage hygiene — never a number picked
for layout. If removing a cap strains something downstream (an LLM's output
budget, a schema's maxItems), scale the downstream thing; do not clip the user's
list and say nothing.

*Origin: "the app is limiting the number of items i can pin and that should not
happen."*

## 18. A user action never rides a background job's gate

Presentation writes — reorder, hide, type, pin — go on their own serialized
chain with optimistic state, and answer on the same frame. They must never wait
behind an analyst call: a click silently dropped by a busy gate reads as a
ten-second lag, then as a broken control.

*Origin: "clicking the pin icon is taking so long, no modality no spinner… BAD
UX."*

## 19. Never silently substitute the floor

Every generated surface has a computed fallback. When one is used, SAY SO — the
readout marks a computed summary, a dropped section is visibly absent. A silent
substitution turns a validator bug into what looks like a quality problem, and
nobody can tell which they are looking at.

---

**The test before shipping any screen:** count how many times each fact appears
(must be 1), check every section has the same card grammar, check every status
element links somewhere, read the tab row aloud — it should sound like a team
describing the thing, not a process chart — and check that no line of prose runs
wider than about 75 characters.
