/**
 * Experimentation-platform seam. A brand (org) runs experiments on ONE
 * enterprise A/B platform. Optimizely is the first (and current focus)
 * implementation; the interface is provider-agnostic so VWO / others slot in
 * later without touching callers — same pluggable pattern as the content store.
 */

export type ExperimentationProviderId = "optimizely";

/** A project/workspace in the provider (Optimizely projects, VWO accounts, …). */
export interface ExperimentationProject {
  id: string;
  name: string;
  platform?: string;
  status?: string;
}

/**
 * Brand-level (org-scoped) experimentation configuration. Provider-specific
 * blocks hold credentials/settings; only one is populated per `provider`.
 * The apiToken is a secret — stored server-side, never returned to the client.
 */
export interface ExperimentationConfig {
  orgId: string;
  provider: ExperimentationProviderId;
  optimizely?: {
    apiToken: string;
    defaultProjectId?: string;
  };
  updatedAt: string;
}

/** What the UI needs — no secret material. */
export interface ExperimentationStatus {
  connected: boolean;
  provider: ExperimentationProviderId;
  tokenLast4?: string;
  defaultProjectId?: string;
  projects: ExperimentationProject[];
  error?: string;
}

/** Provider-agnostic operations the app relies on. */
export interface ExperimentationProvider {
  readonly id: ExperimentationProviderId;
  /** List projects the configured credentials can access (also validates them). */
  listProjects(): Promise<ExperimentationProject[]>;
}
