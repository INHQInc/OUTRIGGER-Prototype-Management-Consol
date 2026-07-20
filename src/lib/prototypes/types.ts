/**
 * Prototype metadata — the store-backed record (Neon hosted / FS local).
 * This is the canonical brief/hypothesis/lifecycle schema an experiment
 * program needs. Overlay CODE (fragment/css/js) is authored/deployed
 * separately via the feature repo; this record is the source of truth for
 * everything about the prototype except its code.
 */

/**
 * Lifecycle stage — where the prototype is on its journey (see
 * docs/LIFECYCLE-ARCHITECTURE.md). The `status` field holds this. Advances
 * draft → review → live → shipped, or ends archived.
 */
export type PrototypeStage = "draft" | "review" | "live" | "shipped" | "archived";
export const PROTOTYPE_STAGES: PrototypeStage[] = ["draft", "review", "live", "shipped", "archived"];

/** Old status values → lifecycle stages (records predating the rename). */
const LEGACY_STAGE: Record<string, PrototypeStage> = {
  draft: "draft",
  "demo-ready": "review",
  experimenting: "live",
  "handed-off": "shipped",
};

export function normalizeStage(value: string | undefined): PrototypeStage {
  if (!value) return "draft";
  if ((PROTOTYPE_STAGES as string[]).includes(value)) return value as PrototypeStage;
  return LEGACY_STAGE[value] ?? "draft";
}

export const STAGE_LABEL: Record<PrototypeStage, string> = {
  draft: "Draft",
  review: "In review",
  live: "Live",
  shipped: "Shipped",
  archived: "Archived",
};
export const STAGE_TONE: Record<PrototypeStage, "neutral" | "ok" | "warn" | "danger" | "accent"> = {
  draft: "neutral",
  review: "accent",
  live: "warn",
  shipped: "ok",
  archived: "neutral",
};

export type TargetSource = "clone" | "live";

export interface PrototypeTarget {
  /** Page URL / path on the site the prototype targets. */
  url: string;
  /** clone = build against our snapshot; live = run on the real page. */
  source: TargetSource;
}

/** Structured brief — not a free-text blob. */
export interface PrototypeBrief {
  problem: string;       // problem / opportunity
  change: string;        // what it changes
  doneLooksLike: string; // definition of done
}

/** Canonical A/B hypothesis: "We believe [change] for [audience] will cause [outcome] because [rationale]." */
export interface PrototypeHypothesis {
  change: string;
  audience: string;
  outcome: string;
  rationale: string;
}

export interface PrototypeMetrics {
  primary: string;       // the metric you decide on
  guardrails: string[];  // what must not regress
}

/**
 * An immutable build of a prototype, pinned to a git SHA. This is the unit that
 * gets PROMOTED across environments unchanged — "build once, promote immutably"
 * (docs/LIFECYCLE-ARCHITECTURE.md). Append-only: versions are never edited, only
 * cut and superseded.
 */
export interface ArtifactVersion {
  id: string;
  prototypeKey: string;
  siteKey: string;        // denormalized for cascade on site delete
  version: number;        // monotonic per prototype (1, 2, 3, …)
  gitSha: string;         // the immutable pin
  gitRef?: string;        // branch/tag it was cut from
  notes?: string;
  createdAt: string;
  createdBy?: string;
}

export interface PrototypeRecord {
  key: string;
  siteKey: string;
  name: string;
  /** Lifecycle stage (see PrototypeStage). Normalize on read with normalizeStage(). */
  status: PrototypeStage;
  targets: PrototypeTarget[];
  brief: PrototypeBrief;
  hypothesis: PrototypeHypothesis;
  metrics: PrototypeMetrics;
  owner?: string;
  ticketUrl?: string;
  priority?: number;     // ICE/PIE-style 1–100
  createdAt: string;
  updatedAt: string;
}
