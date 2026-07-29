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

## 3. Rooms, not steps

The workspace rail's rows are the prototype's PARTS — nouns a team recognizes,
grouped Opti-style (Plan→Brief · Build→Agent/Skills/Recommendations ·
Target→Pages · Experiment→Versions/Optimizely · Handoff→Explorer/Ship record ·
Settings) — never a restating of pipeline steps as sections. The pipeline is
status (the rail's status block + dots), not information architecture. Never
render a vertical list of step-cards.

**Opti-native grammar (user-locked 07-25):** the /prototypes front door is an
Optimizations-style table; the workspace is a command rail; the app sidebar
collapses to an icon rail inside a prototype. When adding a surface, ask "how
does Optimizely say this?" first — familiarity to an Opti user is a feature.

*Origin: "it's all super confusing… a prototype has a brief, source control
setup, experimentation setup, skills setup, code handoff — not a list of steps."*

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

---

**The test before shipping any screen:** count how many times each fact appears
(must be 1), check every section has the same card grammar, check every status
element links somewhere, and read the tab row aloud — it should sound like a
team describing the thing, not a process chart.
