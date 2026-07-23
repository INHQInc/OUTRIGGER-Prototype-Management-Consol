---
name: opmc-skill-authoring
description: Add or change a Claude skill in the OPMC skill library — the instructions prototype-building Claude instances load. Covers the three tiers (generic/brand/prototype), where skills live, how they reach a branch, and how to write one that actually triggers. Load when asked to add, edit, or reason about skills.
---

# Authoring OPMC skills

Skills are the instructions a Claude instance loads when it opens a prototype repo. They're managed in the console (**Configuration → Skills**), not hand-edited into branches.

## The three tiers

| Tier | Applies to | Example |
|---|---|---|
| `global` | every prototype, every customer | the build loop, the system model, the ideas channel |
| `brand` | one customer's prototypes | their fidelity rules, their component conventions |
| `prototype` | a single build | one-off constraints for a specific experiment |

A prototype's effective set is `global + its brand's + its own`, **default-on**. Once a selection is made it's stored explicitly, so adding a new global skill later **cannot silently change prototypes already in flight**. Preserve that property — it's deliberate.

## Where they live

- **Canonical:** the console content store (`lib/skills/skills.ts`), editable in the UI, readable in place.
- **Built-ins:** `lib/skills/builtins.ts` — seeded on first load (`opmc-system`, `opmc-ideas`), plus `opmc-prototype` imported from the prototypes repo's `starter` branch.
- **Delivery:** the enabled set is materialized into `.claude/skills/<name>/SKILL.md` on the prototype branch — the only path Claude Code auto-loads.

> The console owns `.opmc/**` and `.claude/skills/**`; Claude owns `src/**` + `dist/variation.js`. Keep those trees disjoint — it's what stops two writers clobbering each other.

## Writing one that actually gets used

The **frontmatter `description` is load-bearing** — it's what a Claude instance reads to decide whether to load the skill at all. A vague description means the skill is never opened.

```markdown
---
name: brand-fidelity
description: Outrigger's brand rules for prototype CSS — reuse site classes, namespace custom styles, never redefine a site class globally. Load before writing any CSS on an Outrigger prototype.
---
```

- Say **when to load it**, not just what it contains.
- Be specific and imperative. "Prefer X over Y because Z" beats "consider best practices."
- Put the rule *and* its reason — a rule without a reason gets rationalised around.
- Keep it short enough to be read in full.

## Adding a skill

1. **Configuration → Skills → + New skill**.
2. Pick the tier. Default to `global` only if it's genuinely brand-agnostic — anything mentioning a specific site, CMS, or design system is `brand`.
3. Write the full description (shown in the library) and the `SKILL.md` body including frontmatter.
4. Check it renders under **Read**.

## Don't

- Don't put secrets or customer data in a skill — they're materialized into a git branch.
- Don't duplicate `opmc-system` (the platform model) in a brand skill; link the concept instead.
- Don't make a skill that only restates the brief. Briefs are per-prototype data; skills are durable procedure.
