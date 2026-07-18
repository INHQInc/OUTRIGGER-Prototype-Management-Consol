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

export function optimizelyConfig(): { token: string; projectId: string } {
  const token = process.env.OPTIMIZELY_API_TOKEN;
  const projectId = process.env.OPTIMIZELY_PROJECT_ID;
  if (!token) throw new OptimizelyError(0, "OPTIMIZELY_API_TOKEN is not set");
  if (!projectId) throw new OptimizelyError(0, "OPTIMIZELY_PROJECT_ID is not set");
  return { token, projectId };
}

async function opti<T>(path: string, init?: RequestInit): Promise<T> {
  const { token } = optimizelyConfig();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
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

export interface OptiProject {
  id: number;
  name: string;
  platform: string;
  status: string;
  account_id: number;
}

/** Read-only: fetch the configured project. Confirms token + project access. */
export async function getProject(): Promise<OptiProject> {
  const { projectId } = optimizelyConfig();
  return opti<OptiProject>(`/projects/${projectId}`);
}

export interface OptiExperimentSummary {
  id: number;
  name: string;
  status: string;
}

/** Read-only: list experiments in the project (sanity check + dedupe). */
export async function listExperiments(): Promise<OptiExperimentSummary[]> {
  const { projectId } = optimizelyConfig();
  return opti<OptiExperimentSummary[]>(`/experiments?project_id=${projectId}&per_page=100`);
}
