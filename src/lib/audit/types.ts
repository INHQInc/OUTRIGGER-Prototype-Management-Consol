/**
 * Append-only audit trail. Every governed action (promotion, experiment
 * creation, connect/disconnect) lands here — who did what, when, to what.
 * Scoped to the org (brand). See docs/LIFECYCLE-ARCHITECTURE.md.
 */
export interface AuditEvent {
  id: string;
  orgId: string;
  actor: string;
  action: string;   // e.g. "promotion.create", "experiment.create"
  target: string;   // e.g. "trip-planner v3 → Production"
  detail?: string;
  at: string;
}
