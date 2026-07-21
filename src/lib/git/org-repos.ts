/**
 * The brand's repo registry. Git settings live at the ORG level (like the
 * Optimizely connection). Each entry plays one or both ROLES — prototypes
 * (experiment code; console pulls artifacts) and source (production codebase;
 * Ship target) — with defaults kept PER ROLE. Prototypes-role repos must be
 * GitHub (the console reads artifacts from them); source entries may be
 * azure-devops/external references with no API.
 */
import { getContentStore } from "../content/store";
import { parseRepoUrl } from "./provider";
import type { OrgRepo, RepoRole, RepoProvider } from "./types";

export type { OrgRepo, RepoRole, RepoProvider } from "./types";

/** Normalize records written before roles/provider existed. */
function normalize(r: OrgRepo & { isDefault?: boolean }): OrgRepo {
  return {
    ...r,
    roles: r.roles?.length ? r.roles : ["prototypes"],
    provider: r.provider ?? "github",
    defaultFor: r.defaultFor ?? (r.isDefault ? ["prototypes"] : []),
  };
}

export async function listOrgRepos(orgId: string): Promise<OrgRepo[]> {
  const repos = (await (await getContentStore()).listOrgRepos(orgId)).map(normalize);
  return repos.sort((a, b) => b.defaultFor.length - a.defaultFor.length || a.fullName.localeCompare(b.fullName));
}

export async function defaultOrgRepo(orgId: string, role: RepoRole = "prototypes"): Promise<OrgRepo | null> {
  const repos = (await listOrgRepos(orgId)).filter((r) => r.roles.includes(role));
  return repos.find((r) => r.defaultFor.includes(role)) ?? repos[0] ?? null;
}

/** Ensure exactly one default per role among repos that can play it. */
async function settleDefaults(orgId: string): Promise<void> {
  const store = await getContentStore();
  const repos = (await store.listOrgRepos(orgId)).map(normalize);
  for (const role of ["prototypes", "source"] as RepoRole[]) {
    const eligible = repos.filter((r) => r.roles.includes(role));
    const defaults = eligible.filter((r) => r.defaultFor.includes(role));
    if (eligible.length === 0) continue;
    if (defaults.length === 0) {
      const first = eligible[0];
      first.defaultFor = [...first.defaultFor, role];
      await store.putOrgRepo(first);
    } else if (defaults.length > 1) {
      for (const extra of defaults.slice(1)) {
        extra.defaultFor = extra.defaultFor.filter((x) => x !== role);
        await store.putOrgRepo(extra);
      }
    }
  }
}

export async function addOrgRepo(
  orgId: string,
  input: { repo: string; baseBranch?: string; artifactPath?: string; roles?: RepoRole[]; provider?: RepoProvider },
): Promise<OrgRepo> {
  const provider: RepoProvider = input.provider ?? "github";
  const roles: RepoRole[] = input.roles?.length ? input.roles : ["prototypes"];
  if (roles.includes("prototypes") && provider !== "github") {
    throw new Error("Prototype repos must be on GitHub — the console pulls built artifacts from them. Non-GitHub entries can play the source role.");
  }
  let fullName: string;
  if (provider === "github") {
    const ref = parseRepoUrl(input.repo);
    if (!ref) throw new Error("GitHub repo must be owner/repo or a github.com URL");
    fullName = `${ref.owner}/${ref.repo}`;
  } else {
    fullName = input.repo.trim();
    if (!fullName) throw new Error("A repo locator is required");
  }

  const store = await getContentStore();
  const record: OrgRepo = {
    id: `${orgId}:${fullName}`,
    orgId,
    fullName,
    baseBranch: input.baseBranch?.trim() || "main",
    artifactPath: input.artifactPath?.trim() || "dist/variation.js",
    roles,
    provider,
    defaultFor: [],
  };
  await store.putOrgRepo(record);
  await settleDefaults(orgId); // first repo for a role becomes its default
  return record;
}

export async function setDefaultOrgRepo(orgId: string, id: string, role: RepoRole): Promise<void> {
  const store = await getContentStore();
  const repos = (await store.listOrgRepos(orgId)).map(normalize);
  const target = repos.find((r) => r.id === id);
  if (!target) throw new Error("Unknown repo");
  if (!target.roles.includes(role)) throw new Error(`That repo doesn't play the ${role} role`);
  for (const r of repos) {
    const should = r.id === id;
    const has = r.defaultFor.includes(role);
    if (should && !has) await store.putOrgRepo({ ...r, defaultFor: [...r.defaultFor, role] });
    if (!should && has) await store.putOrgRepo({ ...r, defaultFor: r.defaultFor.filter((x) => x !== role) });
  }
}

export async function removeOrgRepo(orgId: string, id: string): Promise<void> {
  const store = await getContentStore();
  const repos = (await store.listOrgRepos(orgId)).map(normalize);
  if (!repos.some((r) => r.id === id)) return;
  await store.deleteOrgRepo(id);
  await settleDefaults(orgId);
}
