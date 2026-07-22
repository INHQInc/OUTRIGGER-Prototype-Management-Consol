import { getContentStore } from "../content/store";
import { listOrgRepos, defaultOrgRepo } from "../git/org-repos";
import type { PrototypeRecord, PrototypeRepoRef } from "./types";

/**
 * Resolve (and lazily HEAL) a prototype's repo. If its saved repo isn't a
 * registered prototypes repo (stale / deleted / the wrong one), repoint it at
 * the org's default prototypes repo and persist — so a prototype never gets
 * stuck on an invalid repo the user has to hand-fix. Mirrors resolvePrototypeOrg.
 */
export async function resolvePrototypeRepo(proto: PrototypeRecord, orgId: string): Promise<PrototypeRepoRef | undefined> {
  if (!orgId) return proto.repo;
  const registered = (await listOrgRepos(orgId)).filter((r) => r.roles.includes("prototypes")).map((r) => r.fullName);
  if (proto.repo?.fullName && registered.includes(proto.repo.fullName)) return proto.repo; // already valid

  const def = await defaultOrgRepo(orgId, "prototypes");
  if (!def) return proto.repo; // nothing registered yet — the UI guides them to add one

  const branch = proto.repo?.branch && proto.repo.branch !== "starter" ? proto.repo.branch : `prototype/${proto.key}`;
  const healed: PrototypeRepoRef = { fullName: def.fullName, branch, artifactPath: def.artifactPath };
  await (await getContentStore()).putPrototype({ ...proto, repo: healed, updatedAt: new Date().toISOString() });
  return healed;
}
