/**
 * Immutable artifact versions for a prototype. Append-only: you cut a version
 * pinned to a git SHA, and that exact build is what gets promoted across
 * environments unchanged ("build once, promote immutably" —
 * docs/LIFECYCLE-ARCHITECTURE.md).
 */
import { getContentStore } from "../content/store";
import type { ArtifactVersion } from "./types";

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
  const record: ArtifactVersion = {
    id: `${prototypeKey}-v${version}`,
    prototypeKey,
    siteKey,
    version,
    gitSha,
    gitRef: input.gitRef?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy?.trim() || undefined,
  };
  await store.addArtifactVersion(record);
  return record;
}
