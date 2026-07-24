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
import { getOptimizelyClientForOrg } from "../experimentation";
import { normalizeStage, type PrototypeRecord } from "./types";

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
    if (stage === "archived") return null;

    const [source, versions, push, provisionFlagRaw, claudeSeenAt] = await Promise.all([
      resolveRepoSource(p.key).catch(() => null),
      listArtifactVersions(p.key).catch(() => []),
      lastPush(p.key).catch(() => null),
      store.getFlag(`provision:${p.key}`).catch(() => null),
      store.getFlag(`claude:seen:${p.key}`).catch(() => null),
    ]);
    // Live experiment status — the Testing lock's source of truth.
    let experimentStatus: string | undefined;
    if (client && p.experiment?.experimentId) {
      try { experimentStatus = (await client.getExperiment(p.experiment.experimentId)).status; } catch { /* unreachable → no lock */ }
    }
    const locked = experimentStatus === "running";
    const pipeline = derivePipeline({ proto: p, provisionFlagRaw, source, versions, lastPush: push, claudeSeenAt, experimentStatus });

    const column: BoardColumn = stage === "shipped" ? "shipped"
      : locked ? "testing"
      : pipeline.stage.id;

    return {
      key: p.key, name: p.name, column, locked, experimentStatus, pipeline,
      metric: p.metrics.primary || undefined,
      hypothesis: p.hypothesis.change || undefined,
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
