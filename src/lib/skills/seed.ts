/**
 * Library seeding — must run on EVERY read path, not just the API route.
 *
 * The /skills page server-renders straight from listAllSkills(), so when
 * seeding lived only in `GET /api/skills` (which nothing calls — the client
 * only POSTs) the library rendered empty forever.
 */
import { listGlobalSkills, upsertSkill, parseFrontmatter, slugify } from "./skills";
import { SYSTEM_SKILL, IDEAS_SKILL, PROTOTYPE_SKILL } from "./builtins";
import { getGitClientForOrg } from "../git/connection";
import { defaultOrgRepo } from "../git/org-repos";

async function seedBuiltins(): Promise<void> {
  const have = new Set((await listGlobalSkills()).map((s) => s.id));
  for (const md of [PROTOTYPE_SKILL, SYSTEM_SKILL, IDEAS_SKILL]) {
    const fm = parseFrontmatter(md);
    const id = slugify(fm.name ?? "");
    if (!id || have.has(id)) continue;
    await upsertSkill({ id, name: fm.name ?? id, scope: "global", description: fm.description ?? "", body: md, builtIn: true });
  }
}

/**
 * Legacy fallback: if a customer's starter branch still carries a bundled
 * skill, adopt it. Outrigger's no longer does — opmc-prototype is a built-in.
 */
async function seedFromStarter(orgId: string): Promise<void> {
  if ((await listGlobalSkills()).some((s) => s.id === "opmc-prototype")) return;
  const repo = await defaultOrgRepo(orgId, "prototypes");
  const client = await getGitClientForOrg(orgId);
  if (!repo || !client) return;
  const [owner, name] = repo.fullName.split("/");
  if (!owner || !name) return;
  const md = await client.readFileAtRef(owner, name, ".claude/skills/opmc-prototype/SKILL.md", "starter").catch(() => null);
  if (!md) return;
  const fm = parseFrontmatter(md);
  await upsertSkill({
    id: "opmc-prototype",
    name: fm.name ?? "opmc-prototype",
    scope: "global",
    description: fm.description ?? "The core build loop for an OPMC prototype.",
    body: md,
    builtIn: true,
  });
}

/** Idempotent; safe to call on any read path. Never throws. */
export async function ensureSkillsSeeded(orgId: string | null | undefined): Promise<void> {
  try { await seedBuiltins(); } catch { /* best-effort */ }
  if (orgId) { try { await seedFromStarter(orgId); } catch { /* best-effort */ } }
}
