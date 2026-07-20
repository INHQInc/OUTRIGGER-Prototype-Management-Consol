/**
 * Optimizely Web Experimentation REST API client (v2).
 * Auth: Personal Access Token (Bearer). Reads OPTIMIZELY_API_TOKEN /
 * OPTIMIZELY_PROJECT_ID from the environment.
 *
 * SAFETY RAIL: this client creates experiments in a PAUSED state only. It never
 * starts an experiment (no traffic goes live) — a human does that in Optimizely.
 */

const BASE = "https://api.optimizely.com/v2";

export class OptimizelyError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface OptiProject {
  id: number;
  name: string;
  platform: string;
  status: string;
  account_id: number;
}
export interface OptiExperimentSummary {
  id: number;
  name: string;
  status: string;
}
export interface OptiPage {
  id: number;
  name: string;
  edit_url: string;
}
export interface OptiVariation { variation_id: number; name: string; weight: number }
export interface OptiExperiment {
  id: number;
  name: string;
  status: string;
  variations: OptiVariation[];
}

/**
 * Optimizely Web Experimentation REST v2 client, built from EXPLICIT credentials
 * (brand-level config), not the environment. Auth: Personal Access Token
 * (Bearer). `projectId` is required only for project-scoped calls.
 *
 * SAFETY RAIL: createDraftExperiment leaves status at the API default
 * ("not_started") — NO traffic goes live. A human starts it in Optimizely.
 */
export class OptimizelyClient {
  constructor(private token: string, private projectId?: string) {}

  private pid(): string {
    if (!this.projectId) throw new OptimizelyError(0, "No Optimizely project selected for this brand");
    return this.projectId;
  }

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new OptimizelyError(res.status, `Optimizely ${res.status}: ${body.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }

  /** Read-only: list all projects the token can access. Validates the token. */
  listProjects(): Promise<OptiProject[]> {
    return this.req<OptiProject[]>(`/projects?per_page=100`);
  }

  /** Read-only: fetch a project (defaults to the configured one). */
  getProject(projectId?: string): Promise<OptiProject> {
    return this.req<OptiProject>(`/projects/${projectId ?? this.pid()}`);
  }

  /** Read-only: list experiments in the project (sanity check + dedupe). */
  listExperiments(): Promise<OptiExperimentSummary[]> {
    return this.req<OptiExperimentSummary[]>(`/experiments?project_id=${this.pid()}&per_page=100`);
  }

  /**
   * Create (or return existing) a Page for URL targeting. Substring path match so
   * it works on either prep or prod host.
   */
  createPage(name: string, editUrl: string, pathSubstring: string): Promise<OptiPage> {
    const conditions = JSON.stringify([
      "and",
      ["or", { match_type: "substring", type: "url", value: pathSubstring }],
    ]);
    return this.req<OptiPage>(`/pages`, {
      method: "POST",
      body: JSON.stringify({
        project_id: Number(this.pid()),
        name,
        edit_url: editUrl,
        activation_type: "immediate",
        conditions,
      }),
    });
  }

  /** Create a PAUSED/draft A/B experiment with our variation as custom code. */
  createDraftExperiment(opts: {
    name: string;
    description: string;
    pageId: number;
    variantName: string;
    variationJs: string;
  }): Promise<OptiExperiment> {
    return this.req<OptiExperiment>(`/experiments`, {
      method: "POST",
      body: JSON.stringify({
        project_id: Number(this.pid()),
        name: opts.name,
        description: opts.description,
        type: "a/b",
        page_ids: [opts.pageId],
        variations: [
          { name: "Original", weight: 5000, actions: [{ page_id: opts.pageId, changes: [] }] },
          {
            name: opts.variantName,
            weight: 5000,
            actions: [{ page_id: opts.pageId, changes: [{ type: "custom_code", value: opts.variationJs }] }],
          },
        ],
        // status intentionally omitted → defaults to not_started (draft, no traffic)
      }),
    });
  }

  experimentAppUrl(experimentId: number): string {
    return `https://app.optimizely.com/v2/projects/${this.pid()}/experiments/${experimentId}/variations`;
  }
}

// --- Backward-compatible env-based wrappers (CLI scripts / existing promote flow) ---

export function optimizelyConfig(): { token: string; projectId: string } {
  const token = process.env.OPTIMIZELY_API_TOKEN;
  const projectId = process.env.OPTIMIZELY_PROJECT_ID;
  if (!token) throw new OptimizelyError(0, "OPTIMIZELY_API_TOKEN is not set");
  if (!projectId) throw new OptimizelyError(0, "OPTIMIZELY_PROJECT_ID is not set");
  return { token, projectId };
}

function envClient(): OptimizelyClient {
  const { token, projectId } = optimizelyConfig();
  return new OptimizelyClient(token, projectId);
}

export const getProject = (): Promise<OptiProject> => envClient().getProject();
export const listExperiments = (): Promise<OptiExperimentSummary[]> => envClient().listExperiments();
export const createPage = (name: string, editUrl: string, pathSubstring: string): Promise<OptiPage> => envClient().createPage(name, editUrl, pathSubstring);
export const createDraftExperiment = (opts: { name: string; description: string; pageId: number; variantName: string; variationJs: string }): Promise<OptiExperiment> => envClient().createDraftExperiment(opts);
export const experimentAppUrl = (experimentId: number): string => envClient().experimentAppUrl(experimentId);
