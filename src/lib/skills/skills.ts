/**
 * Claude skill library.
 *
 * Skills are the instructions a Claude instance loads when it opens a prototype
 * repo. Today exactly one (`opmc-prototype`) is baked into the `starter` branch
 * and inherited by everything, relevant or not. This makes them a library with
 * three tiers:
 *
 *   global    — generic, brand-agnostic. Every prototype, every customer.
 *   brand     — one customer's prototypes (their fidelity rules, their stack).
 *   prototype — a single prototype.
 *
 * A prototype's effective set = global + its brand's + its own, minus anything
 * explicitly turned off for it. Provision materializes that set into
 * `.claude/skills/<name>/SKILL.md` on the branch, which is the only path Claude
 * Code auto-loads.
 *
 * Stored as content-store flags so this needs no schema migration.
 */
import { getContentStore } from "../content/store";

export type SkillScope = "global" | "brand" | "prototype";

export interface Skill {
  id: string;              // stable slug, also the on-disk skill directory name
  name: string;            // frontmatter `name`
  scope: SkillScope;
  orgId?: string;          // brand + prototype scopes
  prototypeKey?: string;   // prototype scope only
  description: string;     // full description — what it's for, when it applies
  body: string;            // the SKILL.md content (frontmatter included)
  updatedAt: string;
  builtIn?: boolean;       // seeded from the starter branch
}

const GLOBAL_KEY = "skills:global";
const orgKey = (orgId: string) => `skills:org:${orgId}`;
const selectionKey = (prototypeKey: string) => `skills:selection:${prototypeKey}`;

export function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "skill";
}

/** Minimal YAML frontmatter reader — SKILL.md only ever carries name/description. */
export function parseFrontmatter(md: string): { name?: string; description?: string; body: string } {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { body: md };
  const out: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (kv) out[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return { name: out.name, description: out.description, body: m[2] };
}

async function readList(key: string): Promise<Skill[]> {
  const raw = await (await getContentStore()).getFlag(key);
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as Skill[]) : [];
  } catch { return []; }
}

async function writeList(key: string, list: Skill[]): Promise<void> {
  await (await getContentStore()).setFlag(key, JSON.stringify(list));
}

export async function listGlobalSkills(): Promise<Skill[]> {
  return readList(GLOBAL_KEY);
}

/** Brand + prototype-scoped skills for a customer. */
export async function listOrgSkills(orgId: string | null | undefined): Promise<Skill[]> {
  if (!orgId) return [];
  return readList(orgKey(orgId));
}

/** Every skill visible to a customer, in tier order. */
export async function listAllSkills(orgId: string | null | undefined): Promise<Skill[]> {
  const [g, o] = await Promise.all([listGlobalSkills(), listOrgSkills(orgId)]);
  const rank = { global: 0, brand: 1, prototype: 2 } as const;
  return [...g, ...o].sort((a, b) => rank[a.scope] - rank[b.scope] || a.name.localeCompare(b.name));
}

export async function getSkill(orgId: string | null | undefined, id: string): Promise<Skill | null> {
  return (await listAllSkills(orgId)).find((s) => s.id === id) ?? null;
}

export async function upsertSkill(input: Omit<Skill, "updatedAt"> & { updatedAt?: string }): Promise<Skill> {
  const skill: Skill = { ...input, id: input.id || slugify(input.name), updatedAt: new Date().toISOString() };
  const key = skill.scope === "global" ? GLOBAL_KEY : orgKey(skill.orgId ?? "");
  const list = await readList(key);
  const i = list.findIndex((s) => s.id === skill.id);
  if (i >= 0) list[i] = skill; else list.push(skill);
  await writeList(key, list);
  return skill;
}

export async function deleteSkill(orgId: string | null | undefined, id: string): Promise<void> {
  for (const key of [GLOBAL_KEY, ...(orgId ? [orgKey(orgId)] : [])]) {
    const list = await readList(key);
    const next = list.filter((s) => s.id !== id);
    if (next.length !== list.length) await writeList(key, next);
  }
}

/**
 * Which skills apply to a prototype, and whether each is on.
 *
 * Default-on: global + the brand's skills + any skill scoped to this prototype.
 * Once the user makes a choice we store the explicit enabled set, so adding a
 * new global skill later doesn't silently change an existing prototype.
 */
export async function resolveSkillsForPrototype(orgId: string | null | undefined, prototypeKey: string): Promise<{ skill: Skill; enabled: boolean }[]> {
  const all = await listAllSkills(orgId);
  const applicable = all.filter((s) => s.scope !== "prototype" || s.prototypeKey === prototypeKey);
  const raw = await (await getContentStore()).getFlag(selectionKey(prototypeKey));
  let enabledIds: string[] | null = null;
  if (raw) {
    try { const v = JSON.parse(raw); if (Array.isArray(v)) enabledIds = v as string[]; } catch { /* default-on */ }
  }
  return applicable.map((skill) => ({ skill, enabled: enabledIds ? enabledIds.includes(skill.id) : true }));
}

export async function setSkillSelection(prototypeKey: string, enabledIds: string[]): Promise<string[]> {
  const clean = Array.from(new Set(enabledIds.filter(Boolean)));
  await (await getContentStore()).setFlag(selectionKey(prototypeKey), JSON.stringify(clean));
  return clean;
}

/** The skills provision should write into `.claude/skills/` on the branch. */
export async function enabledSkillsForPrototype(orgId: string | null | undefined, prototypeKey: string): Promise<Skill[]> {
  return (await resolveSkillsForPrototype(orgId, prototypeKey)).filter((r) => r.enabled).map((r) => r.skill);
}
