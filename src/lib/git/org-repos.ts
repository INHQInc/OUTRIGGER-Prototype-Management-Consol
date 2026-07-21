/**
 * The brand's repo registry. Git settings live at the ORG level (like the
 * Optimizely connection): register as many repos as the brand uses, flag one
 * default. Each prototype then picks its repo + branch from these.
 */
import { getContentStore } from "../content/store";
import { parseRepoUrl } from "./provider";
import type { OrgRepo } from "./types";

export type { OrgRepo } from "./types";

export async function listOrgRepos(orgId: string): Promise<OrgRepo[]> {
  const repos = await (await getContentStore()).listOrgRepos(orgId);
  return repos.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.fullName.localeCompare(b.fullName));
}

export async function defaultOrgRepo(orgId: string): Promise<OrgRepo | null> {
  const repos = await listOrgRepos(orgId);
  return repos.find((r) => r.isDefault) ?? repos[0] ?? null;
}

export async function addOrgRepo(orgId: string, input: { repo: string; baseBranch?: string; artifactPath?: string; isDefault?: boolean }): Promise<OrgRepo> {
  const ref = parseRepoUrl(input.repo);
  if (!ref) throw new Error("Repo must be owner/repo or a github.com URL");
  const store = await getContentStore();
  const existing = await store.listOrgRepos(orgId);
  const fullName = `${ref.owner}/${ref.repo}`;
  const record: OrgRepo = {
    id: `${orgId}:${fullName}`,
    orgId,
    fullName,
    baseBranch: input.baseBranch?.trim() || "main",
    artifactPath: input.artifactPath?.trim() || "dist/variation.js",
    isDefault: input.isDefault ?? existing.length === 0, // first repo becomes the default
  };
  if (record.isDefault) {
    for (const r of existing) if (r.isDefault && r.id !== record.id) await store.putOrgRepo({ ...r, isDefault: false });
  }
  await store.putOrgRepo(record);
  return record;
}

export async function setDefaultOrgRepo(orgId: string, id: string): Promise<void> {
  const store = await getContentStore();
  for (const r of await store.listOrgRepos(orgId)) {
    const shouldBe = r.id === id;
    if (r.isDefault !== shouldBe) await store.putOrgRepo({ ...r, isDefault: shouldBe });
  }
}

export async function removeOrgRepo(orgId: string, id: string): Promise<void> {
  const store = await getContentStore();
  const repos = await store.listOrgRepos(orgId);
  if (!repos.some((r) => r.id === id)) return;
  await store.deleteOrgRepo(id);
  // Keep exactly one default when repos remain.
  const remaining = repos.filter((r) => r.id !== id);
  if (remaining.length && !remaining.some((r) => r.isDefault)) {
    await store.putOrgRepo({ ...remaining[0], isDefault: true });
  }
}
