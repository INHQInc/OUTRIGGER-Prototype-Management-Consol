/**
 * A promotion moves ONE immutable artifact version onto an environment. History
 * is append-only; the current state of an environment is the latest `active`
 * promotion for it. See docs/LIFECYCLE-ARCHITECTURE.md (build once, promote
 * immutably; decouple deploy from release).
 */
import type { EnvironmentKind } from "../environments";

/** How the version is exposed in the environment. */
export type PromotionVehicle = "proxy" | "loader" | "optimizely" | "manual";
export type PromotionStatus = "active" | "superseded" | "concluded" | "failed";

export interface Promotion {
  id: string;
  prototypeKey: string;
  siteKey: string;
  versionId: string;         // ArtifactVersion.id promoted
  versionNumber: number;     // denormalized for display
  environmentId: string;
  environmentKind: EnvironmentKind;  // denormalized
  environmentLabel: string;          // denormalized
  vehicle: PromotionVehicle;
  status: PromotionStatus;
  // Provider linkage (optimizely vehicle):
  experimentId?: string;
  experimentUrl?: string;
  detail?: string;           // notes / error / pending reason
  promotedBy?: string;
  promotedAt: string;
}

/** Default exposure vehicle for an environment kind. */
export function defaultVehicle(kind: EnvironmentKind): PromotionVehicle {
  if (kind === "production") return "optimizely";
  if (kind === "staging") return "loader";
  return "proxy";
}
