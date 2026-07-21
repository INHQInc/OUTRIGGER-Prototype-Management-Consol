/**
 * Promote an immutable artifact version onto an environment. Append-only
 * history; the current state of an environment is the latest `active` promotion.
 * Production promotions with the Optimizely vehicle create a paused draft
 * experiment using the brand's connection. See docs/LIFECYCLE-ARCHITECTURE.md.
 */
import { getContentStore } from "../content/store";
import { listOrgEnvironments } from "../environments";
import { resolvePrototypeOrg } from "../prototypes/org";
import { normalizeStage } from "../prototypes/types";
import { audit } from "../audit";
import { defaultVehicle, type Promotion, type PromotionVehicle } from "./types";
import { promoteToOptimizely } from "./optimizely";

export type { Promotion, PromotionVehicle, PromotionStatus } from "./types";
export { defaultVehicle } from "./types";

export async function listPromotions(prototypeKey: string): Promise<Promotion[]> {
  return (await getContentStore()).listPromotions(prototypeKey);
}

/** Latest active promotion per environment (the "live where" view). */
export function currentByEnvironment(promotions: Promotion[]): Record<string, Promotion> {
  const out: Record<string, Promotion> = {};
  for (const p of promotions) { // input is newest-first
    if (p.status === "active" && !out[p.environmentId]) out[p.environmentId] = p;
  }
  return out;
}

export async function promote(input: {
  prototypeKey: string;
  versionId: string;
  environmentId: string;
  vehicle?: PromotionVehicle;
  actor?: string;
}): Promise<Promotion> {
  const store = await getContentStore();
  const proto = await store.getPrototype(input.prototypeKey);
  if (!proto) throw new Error("Unknown prototype");
  const version = (await store.listArtifactVersions(input.prototypeKey)).find((v) => v.id === input.versionId);
  if (!version) throw new Error("Unknown version");
  const orgId = await resolvePrototypeOrg(proto);
  const env = (await listOrgEnvironments(orgId)).find((e) => e.id === input.environmentId);
  if (!env) throw new Error("Unknown environment");

  const vehicle = input.vehicle ?? defaultVehicle(env.kind);
  const actor = input.actor ?? "system";

  const promotion: Promotion = {
    id: crypto.randomUUID(),
    prototypeKey: input.prototypeKey,
    siteKey: proto.siteKey,
    versionId: version.id,
    versionNumber: version.version,
    environmentId: env.id,
    environmentKind: env.kind,
    environmentLabel: env.label,
    vehicle,
    status: "active",
    promotedAt: new Date().toISOString(),
    promotedBy: actor,
  };

  // Optimizely vehicle → create a paused draft experiment via the brand config.
  // A failure here fails the promotion (recorded) rather than throwing away the
  // attempt — the history keeps the failed row for traceability.
  if (vehicle === "optimizely") {
    try {
      const result = await promoteToOptimizely({ orgId, proto, version, env });
      promotion.experimentId = result.experimentId;
      promotion.experimentUrl = result.experimentUrl;
      promotion.detail = result.detail;
    } catch (e) {
      promotion.status = "failed";
      promotion.detail = (e as Error).message;
    }
  }

  // Supersede prior active promotions for this environment (only on success).
  if (promotion.status === "active") {
    for (const p of await store.listPromotions(input.prototypeKey)) {
      if (p.environmentId === env.id && p.status === "active") {
        await store.updatePromotionStatus(p.id, "superseded");
      }
    }
  }

  await store.addPromotion(promotion);

  // Nudge the lifecycle stage forward (never backward) as a convenience — the
  // pipeline is a guide; the user can still override the stage manually.
  if (promotion.status === "active") {
    const rank = { draft: 0, review: 1, live: 2, shipped: 3, archived: 3 } as const;
    const target = env.kind === "production" ? "live" : env.kind === "staging" ? "review" : null;
    if (target && rank[normalizeStage(proto.status)] < rank[target]) {
      await store.putPrototype({ ...proto, status: target, updatedAt: new Date().toISOString() });
    }
  }

  await audit(
    orgId,
    actor,
    "promotion.create",
    `${proto.name} v${version.version} → ${env.label}`,
    promotion.status === "failed"
      ? `failed: ${promotion.detail}`
      : `${vehicle}${promotion.experimentId ? ` · exp ${promotion.experimentId}` : ""}`,
  );

  if (promotion.status === "failed") throw new Error(promotion.detail || "Promotion failed");
  return promotion;
}
