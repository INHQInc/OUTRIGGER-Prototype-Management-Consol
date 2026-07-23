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
  // Built-ins are CODE-canonical: their source of truth is builtins.ts, so
  // re-assert them on every seed. Insert-if-missing was the bug — a built-in
  // edited in code (like adding the §0 self-sync section) never reached anyone
  // whose library had already seeded the old copy.
  //
  // A human editing a built-in in the UI flips it to builtIn:false ("forks" it),
  // and we leave those alone. Unchanged bodies are skipped so we don't churn.
  const byId = new Map((await listGlobalSkills()).map((sk) => [sk.id, sk]));
  for (const md of [PROTOTYPE_SKILL, SYSTEM_SKILL, IDEAS_SKILL]) {
    const fm = parseFrontmatter(md);
    const id = slugify(fm.name ?? "");
    if (!id) continue;
    const prev = byId.get(id);
    if (prev && prev.builtIn === false) continue; // human-forked — don't clobber
    if (prev && prev.body === md) continue;         // already current
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
