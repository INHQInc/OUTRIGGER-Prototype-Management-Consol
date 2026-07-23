/**
 * Immutable artifact versions for a prototype. Append-only: you cut a version
 * pinned to a git SHA, and that exact build is what gets promoted across
 * environments unchanged ("build once, promote immutably" —
 * docs/LIFECYCLE-ARCHITECTURE.md).
 */
import { getContentStore } from "../content/store";
import { resolveRepoSource } from "./source";
import { audit } from "../audit";
import { certifyVariation } from "../certify/certify";
import { resolvePrototypeOrg } from "./org";
import type { ArtifactVersion } from "./types";

export async function listArtifactVersions(prototypeKey: string): Promise<ArtifactVersion[]> {
  return (await getContentStore()).listArtifactVersions(prototypeKey);
}

/**
 * Cut a new immutable version (auto-numbered) pinned to a git SHA. The version
 * carries a fixed code snapshot: `variationJs` if provided (repo-sourced —
 * preferred), else the compiled overlay (legacy fallback).
 */
export async function cutArtifactVersion(
  prototypeKey: string,
  siteKey: string,
  input: { gitSha: string; gitRef?: string; notes?: string; createdBy?: string; variationJs?: string },
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
    variationJs: input.variationJs,
    notes: input.notes?.trim() || undefined,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy?.trim() || undefined,
  };
  await store.addArtifactVersion(record);
  return record;
}

/**
 * Cut a version from the prototype's feature-repo branch: pull the built
 * variation at HEAD and pin the version to that commit. This is the primary
 * path — the code comes from the repo, not the console.
 */
export async function cutArtifactVersionFromRepo(
  prototypeKey: string,
  siteKey: string,
  opts: { notes?: string; createdBy?: string } = {},
): Promise<ArtifactVersion> {
  const src = await resolveRepoSource(prototypeKey);
  if (!src.found || !src.headSha || !src.variationJs) {
    throw new Error(src.error ?? "No built variation found on the prototype's branch.");
  }
  const proto = await (await getContentStore()).getPrototype(prototypeKey);
  // Certification runs at cut time — the report is frozen with the version,
  // so "was this build safe to ship?" has one immutable answer forever.
  const certification = certifyVariation(src.variationJs, {
    key: prototypeKey,
    targetOrigins: (proto?.targets ?? []).map((t) => t.url),
  });
  const version = await cutArtifactVersion(prototypeKey, siteKey, {
    gitSha: src.headSha,
    gitRef: src.branch,
    notes: opts.notes,
    createdBy: opts.createdBy,
    variationJs: src.variationJs,
  });
  version.certification = certification;
  // persist the report onto the stored record (append-only store: re-add same id overwrites)
  try { await (await getContentStore()).addArtifactVersion(version); } catch { /* stores that reject dup ids keep the plain version */ }
  const orgId = proto ? await resolvePrototypeOrg(proto) : "";
  await audit(orgId, opts.createdBy ?? "system", "version.cut", `${prototypeKey} v${version.version}`, `${src.repo}@${src.branch} · ${src.headSha.slice(0, 7)} · certification ${version.certification?.passed ? "PASSED" : "FAILED"}`);
  return version;
}
