/**
 * The Program Board's data — kanban over ground truth (B1/B2).
 *
 * A card's column is DERIVED, not dragged: the pipeline says where the work
 * actually is, and the experiment's live status (from the Optimizely API)
 * decides the Testing column and its lock. A prototype whose experiment is
 * running is immutable — the lock comes from the platform, not a human.
 */
import { getContentStore } from "../content/store";
import { resolvePrototypeOrg } from "./org";
import { resolveRepoSource } from "./source";
import { listArtifactVersions } from "./versions";
import { lastPush } from "./ship";
import { derivePipeline, type Pipeline } from "./pipeline";
import { getBriefDrift } from "./brief-drift-state";
import { getCoverage, coverageGate, coverageStale, testCasesStale } from "./coverage";
import { getVerdict, adjudicationPending } from "./verdict";
import { auditTargetCode } from "./brief-audit";
import { getOptimizelyClientForOrg } from "../experimentation";
import { normalizeStage, type PrototypeRecord } from "./types";

import { COLUMN_RANK } from "./board-model";
export { BOARD_COLUMNS } from "./board-model";
export type { BoardColumn, BoardCard } from "./board-model";
import type { BoardColumn, BoardCard } from "./board-model";

export async function buildBoard(orgId: string): Promise<{ cards: BoardCard[]; archivedCount: number }> {
  const store = await getContentStore();
  const all = await store.listPrototypes();
  const orgIds = await Promise.all(all.map((p) => resolvePrototypeOrg(p)));
  const protos = all.filter((_, i) => orgIds[i] === orgId);

  const client = await getOptimizelyClientForOrg(orgId).catch(() => null);

  const cards = await Promise.all(protos.map(async (p): Promise<BoardCard | null> => {
    const stage = normalizeStage(p.status);

    const [source, versions, push, provisionFlagRaw, holdRaw, deployedRaw, claudeSeenAt, briefDrift, coverage, verdict] = await Promise.all([
      resolveRepoSource(p.key).catch(() => null),
      listArtifactVersions(p.key).catch(() => []),
      lastPush(p.key).catch(() => null),
      store.getFlag(`provision:${p.key}`).catch(() => null),
      store.getFlag(`hold:${p.key}`).catch(() => null),
      store.getFlag(`deployed:${p.key}`).catch(() => null),
      store.getFlag(`claude:seen:${p.key}`).catch(() => null),
      getBriefDrift(p.key, p).catch(() => null),
      getCoverage(p.key).catch(() => null),
      getVerdict(p.key).catch(() => null),
    ]);
    // Live experiment status — the Testing lock's source of truth.
    let experimentStatus: string | undefined;
    if (client && p.experiment?.experimentId) {
      try { experimentStatus = (await client.getExperiment(p.experiment.experimentId)).status; } catch { /* unreachable → no lock */ }
    }
    const locked = experimentStatus === "running";
    // QA escalates the Review stage via pipeline alerts — the same inputs the
    // workspace passes, so table strip / board / rail dots always agree.
    const qaCodeHash = auditTargetCode(source, versions[0]).codeHash;
    const pipeline = derivePipeline({
      proto: p, provisionFlagRaw, source, versions, lastPush: push, claudeSeenAt, experimentStatus, briefDrifted: Boolean(briefDrift),
      qaFailing: coverageGate(coverage) === "failing",
      qaStale: coverageStale(coverage, source?.headSha, qaCodeHash) || testCasesStale(coverage, source?.headSha, qaCodeHash),
      adjudicationPending: adjudicationPending(verdict, experimentStatus),
    });

    // The column IS the canonical stage — shipped → handoff, running → experiment
    // (locked badge), all handled inside pipeline.stage.id. One source of truth.
    // THE TWO TERMINAL COLUMNS SIT PAST THE PIPELINE, so they are decided here
    // rather than in derivePipeline — which has no step for either and should
    // not grow one. Archived wins over everything: a closed-out prototype has
    // no work left whatever its branch says. Deployed is a stored human claim,
    // and it only counts once the thing was actually handed off — you cannot
    // deploy a winner nobody picked.
    const deployedAt = deployedRaw?.trim() || null;
    const derivedColumn: BoardColumn =
      stage === "archived" ? "archived"
      : (deployedAt && pipeline.stage.id === "handoff") ? "deployed"
      : pipeline.stage.id;
    // A HOLD ONLY EVER PULLS A CARD BACK. The pipeline reads the facts, but the
    // facts cannot tell "built" from "still being worked on" — a branch with a
    // build on it looks finished whether or not anyone is done. So a human may
    // park a card in an earlier column, and that placement is stored. It is
    // clamped to the derived column, so a hold can never claim progress the
    // facts do not support, and it evaporates on its own if the work falls
    // back behind it. A running experiment ignores holds: it is locked.
    const heldAt = holdRaw as BoardColumn | null;
    const holdValid = Boolean(heldAt && heldAt in COLUMN_RANK && !locked
      && COLUMN_RANK[heldAt] < COLUMN_RANK[derivedColumn]);
    const column: BoardColumn = holdValid ? heldAt! : derivedColumn;

    return {
      key: p.key, name: p.name, column, derivedColumn, held: holdValid, locked, experimentStatus, pipeline,
      deployedAt: deployedAt ?? undefined,
      metric: p.metrics.primary || undefined,
      guardrailCount: p.metrics.guardrails.length || undefined,
      hypothesis: p.hypothesis.change || undefined,
      audience: p.hypothesis.audience || undefined,
      outcome: p.hypothesis.outcome || undefined,
      description: p.brief.change || undefined,
      where: p.brief.where || undefined,
      guardrails: p.metrics.guardrails.length ? p.metrics.guardrails : undefined,
      attachmentCount: p.brief.attachments?.length || undefined,
      versionCount: versions.length || undefined,
      owner: p.owner,
      priority: p.priority,
    };
  }));

  const clean = cards.filter((c): c is BoardCard => c !== null)
    .sort((a, b) => (a.priority ?? 1e9) - (b.priority ?? 1e9) || a.name.localeCompare(b.name));
  return {
    cards: clean,
    archivedCount: protos.filter((p) => normalizeStage(p.status) === "archived").length,
  };
}

/** Is this prototype's experiment running right now? (The immutability rail.) */
export async function experimentRunning(orgId: string, proto: PrototypeRecord): Promise<boolean> {
  if (!proto.experiment?.experimentId) return false;
  const client = await getOptimizelyClientForOrg(orgId).catch(() => null);
  if (!client) return false;
  try { return (await client.getExperiment(proto.experiment.experimentId)).status === "running"; } catch { return false; }
}
