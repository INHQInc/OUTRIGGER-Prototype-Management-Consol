/**
 * Immutable artifact versions for a prototype. Append-only: you cut a version
 * pinned to a git SHA, and that exact build is what gets promoted across
 * environments unchanged ("build once, promote immutably" —
 * docs/LIFECYCLE-ARCHITECTURE.md).
 */
import { getContentStore } from "../content/store";
import { getGitClient, prototypeBranch } from "../git/provider";
import { GitError } from "../git/github";
import { getPrototypeOverlay, buildOverlayVariation } from "./overlay";
import type { ArtifactVersion } from "./types";

export interface ResolvedHead {
  gitSha: string;
  gitRef: string;   // the branch the SHA came from
  repo: string;     // owner/repo
  usedBase: boolean; // true if the prototype branch didn't exist and base was used
}

/**
 * Resolve the current HEAD commit of a prototype's feature branch (or the base
 * branch if that branch doesn't exist yet), so a version can be pinned without
 * pasting a SHA. Needs the site's feature-repo binding + GITHUB_TOKEN.
 */
export async function resolvePrototypeHead(prototypeKey: string): Promise<ResolvedHead> {
  const store = await getContentStore();
  const proto = await store.getPrototype(prototypeKey);
  if (!proto) throw new Error("Unknown prototype");
  const binding = await store.getRepoBinding(proto.siteKey);
  if (!binding) throw new Error("No feature repo bound for this site — set it in Settings → Repositories.");
  const client = getGitClient();
  if (!client) throw new Error("GitHub isn't connected (GITHUB_TOKEN not set).");

  const { owner, repo, baseBranch, branchPrefix } = binding.feature;
  const branch = prototypeBranch(prototypeKey, branchPrefix);
  try {
    const sha = await client.getBranchSha(owner, repo, branch);
    return { gitSha: sha, gitRef: branch, repo: `${owner}/${repo}`, usedBase: false };
  } catch (e) {
    if (e instanceof GitError && (e.status === 404 || e.status === 422)) {
      // The prototype branch doesn't exist yet — pin the base branch head.
      const sha = await client.getBranchSha(owner, repo, baseBranch);
      return { gitSha: sha, gitRef: baseBranch, repo: `${owner}/${repo}`, usedBase: true };
    }
    throw e;
  }
}

export async function listArtifactVersions(prototypeKey: string): Promise<ArtifactVersion[]> {
  return (await getContentStore()).listArtifactVersions(prototypeKey);
}

/** Cut a new immutable version (auto-numbered) pinned to a git SHA. */
export async function cutArtifactVersion(
  prototypeKey: string,
  siteKey: string,
  input: { gitSha: string; gitRef?: string; notes?: string; createdBy?: string },
): Promise<ArtifactVersion> {
  const gitSha = input.gitSha.trim();
  if (!gitSha) throw new Error("A git commit SHA is required to pin the version");
  if (!/^[0-9a-f]{7,40}$/i.test(gitSha)) throw new Error("That doesn't look like a git SHA (7–40 hex chars)");
  const store = await getContentStore();
  const existing = await store.listArtifactVersions(prototypeKey);
  const version = existing.reduce((max, v) => Math.max(max, v.version), 0) + 1;
  // Snapshot the compiled overlay so the version carries its own immutable code.
  const built = buildOverlayVariation(prototypeKey, await getPrototypeOverlay(prototypeKey));
  const record: ArtifactVersion = {
    id: `${prototypeKey}-v${version}`,
    prototypeKey,
    siteKey,
    version,
    gitSha,
    gitRef: input.gitRef?.trim() || undefined,
    variationJs: built.isEmpty ? undefined : built.variationJs,
    notes: input.notes?.trim() || undefined,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy?.trim() || undefined,
  };
  await store.addArtifactVersion(record);
  return record;
}
