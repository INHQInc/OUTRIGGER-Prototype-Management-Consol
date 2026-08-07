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
  created?: string;
  last_modified?: string;
}
export interface OptiPage {
  id: number;
  name: string;
  edit_url: string;
}
/** Optimizely's change objects carry their payload in different fields per
 *  type — `attributes` for an attribute edit, `selector`/`operator` for an
 *  insert, `src`, `css`, `dest`… Modelling only `value` meant an editor-built
 *  experiment reached the analyst as "bare attribute changes with no content
 *  described", so the index signature keeps whatever Optimizely sends. */
export interface OptiChange {
  id?: string; type: string; value?: string; dependencies?: string[]; async?: boolean;
  selector?: string; operator?: string; src?: string; css?: unknown; dest?: string;
  attributes?: Record<string, unknown>;
  [k: string]: unknown;
}
export interface OptiAction { page_id: number; changes: OptiChange[] }
export interface OptiVariation { variation_id: number; name: string; weight: number; actions?: OptiAction[]; archived?: boolean; status?: string }
export interface OptiExperiment {
  id: number;
  name: string;
  status: string;
  variations: OptiVariation[];
  page_ids?: number[];
  project_id?: number;
  /** Metrics attached to the experiment DEFINITION — readable with zero
   *  traffic (unlike results), which is what lets the measurement plan be
   *  authored and stamped BEFORE the experiment starts. */
  metrics?: {
    event_id?: number; aggregator?: string; field?: string; scope?: string;
    /** "increasing" | "decreasing" — which way is GOOD, per Optimizely. Read
     *  when the console adjudicates the experiment's own primary metric so
     *  polarity is DATA rather than an assumption. Absent on older payloads. */
    winning_direction?: string;
  }[];
}

export interface OptiEvent {
  id: number;
  name: string;
  event_type?: string;
  archived?: boolean;
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

  /** Read-only: list experiments in the project (sanity check + dedupe).
   *  Paginated — a mature project easily exceeds one page of 100, and a
   *  truncated list silently hides bindable experiments. */
  async listExperiments(): Promise<OptiExperimentSummary[]> {
    const all: OptiExperimentSummary[] = [];
    for (let page = 1; page <= 10; page++) {
      const batch = await this.req<OptiExperimentSummary[]>(`/experiments?project_id=${this.pid()}&per_page=100&page=${page}`);
      all.push(...batch);
      if (batch.length < 100) break;
    }
    return all;
  }

  /** Read-only: the project's EVENT registry (paginated) — the names the
   *  measurement plan binds to, available with zero traffic. Returns ALL
   *  events including archived (an attached metric can point at an archived
   *  event — the caller decides which subset to offer for new bindings);
   *  `truncated` reports a hit page cap so silence never reads as coverage. */
  async listEvents(): Promise<{ events: OptiEvent[]; truncated: boolean }> {
    const all: OptiEvent[] = [];
    let truncated = false;
    for (let page = 1; page <= 5; page++) {
      const batch = await this.req<OptiEvent[]>(`/events?project_id=${this.pid()}&per_page=100&page=${page}`);
      all.push(...batch);
      if (batch.length < 100) break;
      if (page === 5) truncated = true;
    }
    return { events: all, truncated };
  }

  /** Read-only: LIVE experiment results (visitors, conversions, lift,
   *  significance per variation × metric). Raw — normalized at the caller's
   *  trust boundary (lib/prototypes/results.ts). */
  getExperimentResults(experimentId: string | number): Promise<unknown> {
    return this.req<unknown>(`/experiments/${experimentId}/results`);
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

  /** Full experiment, including each variation's actions + changes. */
  getExperiment(experimentId: string | number): Promise<OptiExperiment> {
    return this.req<OptiExperiment>(`/experiments/${experimentId}`);
  }

  /**
   * Replace the custom-code change on ONE variation, preserving everything else.
   *
   * The REST v2 PATCH replaces the whole `variations` array, so we read the
   * experiment first, swap only the target variation's custom_code change
   * (other change types on that action are kept), and PATCH the full set back.
   * Returns the fresh experiment for read-back verification.
   */
  async setVariationCustomCode(experimentId: string | number, variationId: string | number, code: string): Promise<OptiExperiment> {
    const exp = await this.getExperiment(experimentId);
    const vid = Number(variationId);
    const target = (exp.variations ?? []).find((v) => Number(v.variation_id) === vid);
    if (!target) throw new OptimizelyError(404, `Variation ${variationId} not found on experiment ${experimentId}`);
    const pageId = target.actions?.[0]?.page_id ?? exp.page_ids?.[0];
    if (!pageId) throw new OptimizelyError(400, "Experiment has no page to attach the change to — add a page in Optimizely first.");

    const variations = (exp.variations ?? []).map((v) => {
      const base: OptiVariation = { variation_id: v.variation_id, name: v.name, weight: v.weight, actions: v.actions ?? [] };
      if (Number(v.variation_id) !== vid) return base;
      const actions = (v.actions?.length ? v.actions : [{ page_id: pageId, changes: [] as OptiChange[] }]).map((a) => ({ ...a, changes: [...(a.changes ?? [])] }));
      const act = actions.find((a) => a.page_id === pageId) ?? actions[0];
      const idx = act.changes.findIndex((c) => c.type === "custom_code");
      // Strip server-assigned ids so the API treats it as the replacement payload.
      const change: OptiChange = { type: "custom_code", value: code, dependencies: [] };
      if (idx >= 0) act.changes[idx] = change; else act.changes.push(change);
      return { ...base, actions };
    });

    await this.req(`/experiments/${experimentId}`, { method: "PATCH", body: JSON.stringify({ variations }) });
    return this.getExperiment(experimentId);
  }

  /**
   * WHAT IS ACTUALLY LIVE on a variation, whoever authored it.
   *
   * The console used to decide what the analyst reads from `buildMode` — a
   * checkbox someone has to remember to tick. When it was wrong, the analyst
   * was handed the repo's starter stub for an experiment authored in
   * Optimizely's editor, concluded the variation changes nothing, and every
   * mechanism read off it was worthless. Ground truth beats a flag: ask
   * Optimizely what the variation contains.
   */
  static liveVariationBuild(exp: OptiExperiment, variationId: string | number): {
    customCode: string | null;
    /** Visual-editor edits, summarized — for an editor-built experiment this
     *  IS what was built, and it is all the analyst can reason from. */
    editorChanges: string[];
  } {
    const v = (exp.variations ?? []).find((x) => Number(x.variation_id) === Number(variationId));
    let customCode: string | null = null;
    const editorChanges: string[] = [];
    for (const a of v?.actions ?? []) {
      for (const c of a.changes ?? []) {
        if (c.type === "custom_code") {
          if (typeof c.value === "string" && c.value.trim()) customCode = c.value;
        } else {
          // Pass the PAYLOAD, not a guess at which field holds it: whatever
          // Optimizely sends for this change type reaches the analyst, minus
          // the plumbing. Guessing the schema is how the content went missing.
          const skip = new Set(["id", "type", "dependencies", "async"]);
          const body = Object.entries(c)
            .filter(([k, v]) => !skip.has(k) && v !== undefined && v !== null && v !== "")
            .map(([k, v]) => `${k}=${(typeof v === "string" ? v : JSON.stringify(v)).replace(/\s+/g, " ").trim().slice(0, 300)}`)
            .join(" · ");
          editorChanges.push(`${c.type}${body ? ` — ${body}` : " (no detail returned)"}`);
        }
      }
    }
    return { customCode, editorChanges: editorChanges.slice(0, 24) };
  }

  /** The custom-code value currently on a variation (read-back verification). */
  static customCodeOf(exp: OptiExperiment, variationId: string | number): string | null {
    const v = (exp.variations ?? []).find((x) => Number(x.variation_id) === Number(variationId));
    for (const a of v?.actions ?? []) {
      const c = (a.changes ?? []).find((ch) => ch.type === "custom_code");
      if (c && typeof c.value === "string") return c.value;
    }
    return null;
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
