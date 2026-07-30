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
import { getCoverage } from "./coverage";
import { getBriefDrift, briefFingerprint } from "./brief-drift-state";
import { getBriefAuditMarker, briefAuditNeeded, runBriefAudit, codeHashOf } from "./brief-audit";
import { isBriefComplete, type ArtifactVersion } from "./types";

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
  input: {
    gitSha: string; gitRef?: string; notes?: string; createdBy?: string; variationJs?: string;
    certification?: ArtifactVersion["certification"];
    briefSnapshot?: ArtifactVersion["briefSnapshot"];
    coverageSnapshot?: ArtifactVersion["coverageSnapshot"];
  },
): Promise<ArtifactVersion> {
  const gitSha = input.gitSha.trim();
  if (!gitSha) throw new Error("A git commit SHA is required to pin the version");
  if (!/^[0-9a-f]{7,40}$/i.test(gitSha)) throw new Error("That doesn't look like a git SHA (7–40 hex chars)");
  const store = await getContentStore();
  const existing = await store.listArtifactVersions(prototypeKey);
  const version = existing.reduce((max, v) => Math.max(max, v.version), 0) + 1;
  // The record must be COMPLETE before the one write — the stores are
  // append-only and ignore re-adds of the same id, so anything attached
  // after addArtifactVersion() would be silently dropped.
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
    certification: input.certification,
    briefSnapshot: input.briefSnapshot,
    coverageSnapshot: input.coverageSnapshot,
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
  // SELF-AWARE GATE: a cut freezes briefSnapshot — never freeze a lie. If
  // this (build, brief) pair has never been judged, audit it NOW — forced
  // (an in-flight page-view audit must not let the cut slip through
  // unjudged) and pinned to the EXACT code this cut freezes (no second
  // repo pull, no verdict about a different commit). Infra failures fail
  // OPEN (the next console view re-audits); a drifted verdict fails CLOSED.
  if (proto) {
    let drift = await getBriefDrift(prototypeKey, proto).catch(() => null);
    let gateDrifted = false;
    if (!drift && isBriefComplete(proto.brief, proto.metrics)) {
      const marker = await getBriefAuditMarker(prototypeKey).catch(() => null);
      if (briefAuditNeeded(marker, codeHashOf(src.variationJs), briefFingerprint(proto))) {
        const outcome = await runBriefAudit(proto, {
          actor: opts.createdBy ?? "console (auto-audit)",
          force: true,
          build: { variationJs: src.variationJs, builtSha: src.headSha },
        }).catch(() => null);
        // The gate trusts the verdict it just got DIRECTLY — it judged the
        // exact code this cut freezes, so it fails closed even if its
        // persist lost a race with a concurrent run's write.
        gateDrifted = Boolean(outcome?.ran && !outcome.report.inSync);
      }
      // Re-read regardless: either our forced run just persisted a verdict,
      // or a concurrent audit landed one between the two reads above.
      drift = drift ?? await getBriefDrift(prototypeKey, proto).catch(() => null);
    }
    if (drift || gateDrifted) {
      throw new Error("Brief ↔ build drift is unresolved — this cut would freeze a brief that doesn't match the code. Resolve it in the Brief room (update the brief, or dismiss the audit if the brief is accurate), then cut.");
    }
  }
  // Everything frozen with the version is computed BEFORE the cut, so the one
  // append-only write carries the complete record:
  //  · certification — "was this build safe to ship?" has one immutable answer
  //  · briefSnapshot — the spec this exact code was built to satisfy
  //  · coverageSnapshot — the scenarios + review results as of this cut
  const certification = certifyVariation(src.variationJs, {
    key: prototypeKey,
    targetOrigins: (proto?.targets ?? []).map((t) => t.url),
  });
  const coverage = await getCoverage(prototypeKey).catch(() => null);
  const version = await cutArtifactVersion(prototypeKey, siteKey, {
    gitSha: src.headSha,
    gitRef: src.branch,
    notes: opts.notes,
    createdBy: opts.createdBy,
    variationJs: src.variationJs,
    certification,
    briefSnapshot: proto ? { brief: proto.brief, hypothesis: proto.hypothesis, metrics: proto.metrics } : undefined,
    coverageSnapshot: coverage ?? undefined,
  });
  const orgId = proto ? await resolvePrototypeOrg(proto) : "";
  await audit(orgId, opts.createdBy ?? "system", "version.cut", `${prototypeKey} v${version.version}`, `${src.repo}@${src.branch} · ${src.headSha.slice(0, 7)} · certification ${version.certification?.passed ? "PASSED" : "FAILED"}`);
  return version;
}
