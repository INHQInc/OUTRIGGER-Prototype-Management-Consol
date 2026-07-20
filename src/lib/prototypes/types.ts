/**
 * Prototype metadata — the store-backed record (Neon hosted / FS local).
 * This is the canonical brief/hypothesis/lifecycle schema an experiment
 * program needs. Overlay CODE (fragment/css/js) is authored/deployed
 * separately via the feature repo; this record is the source of truth for
 * everything about the prototype except its code.
 */

export type ProtoStatus = "draft" | "demo-ready" | "experimenting" | "handed-off";
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

export interface PrototypeRecord {
  key: string;
  siteKey: string;
  name: string;
  status: ProtoStatus;
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
