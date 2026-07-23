/**
 * Brand-level experimentation config + provider resolution.
 * Config is org-scoped (a brand runs on one A/B platform). Optimizely-first,
 * provider-agnostic. See docs/LIFECYCLE-ARCHITECTURE.md (integrate, don't
 * duplicate — we promote INTO the platform; we don't rebuild it).
 */
import { getContentStore } from "../content/store";
import { OptimizelyClient } from "../optimizely/api";
import type {
  ExperimentationConfig,
  ExperimentationProvider,
  ExperimentationProviderId,
  ExperimentationProject,
  ExperimentationStatus,
} from "./types";

export type {
  ExperimentationConfig,
  ExperimentationProvider,
  ExperimentationProviderId,
  ExperimentationProject,
  ExperimentationStatus,
} from "./types";

const DEFAULT_PROVIDER: ExperimentationProviderId = "optimizely";

export async function getExperimentationConfig(orgId: string): Promise<ExperimentationConfig | null> {
  return (await getContentStore()).getExperimentationConfig(orgId);
}

/** The raw Optimizely client for a brand (ship/push path), or null if not connected. */
export async function getOptimizelyClientForOrg(orgId: string): Promise<OptimizelyClient | null> {
  const cfg = await getExperimentationConfig(orgId);
  const token = cfg?.optimizely?.apiToken;
  if (!token) return null;
  return new OptimizelyClient(token, cfg?.optimizely?.defaultProjectId);
}

/** Build the provider client for a brand, or null if it isn't connected. */
export async function getExperimentationProvider(orgId: string): Promise<ExperimentationProvider | null> {
  const cfg = await getExperimentationConfig(orgId);
  const token = cfg?.optimizely?.apiToken;
  if (!token) return null;
  const client = new OptimizelyClient(token, cfg?.optimizely?.defaultProjectId);
  return {
    id: "optimizely",
    async listProjects(): Promise<ExperimentationProject[]> {
      const projects = await client.listProjects();
      return projects.map((p) => ({ id: String(p.id), name: p.name, platform: p.platform, status: p.status }));
    },
  };
}

/**
 * Connect (or re-key) a brand's Optimizely token. Validates it by listing
 * projects before persisting; returns the projects so the UI can offer a pick.
 */
export async function connectOptimizely(orgId: string, apiToken: string): Promise<ExperimentationProject[]> {
  const token = apiToken.trim();
  if (!token) throw new Error("An API token is required");
  const client = new OptimizelyClient(token);
  let projects: Awaited<ReturnType<OptimizelyClient["listProjects"]>>;
  try {
    projects = await client.listProjects();
  } catch {
    throw new Error("That token was rejected by Optimizely. Check it's a valid Personal Access Token.");
  }
  const store = await getContentStore();
  const existing = await store.getExperimentationConfig(orgId);
  const defaultProjectId = existing?.optimizely?.defaultProjectId
    ?? (projects.length === 1 ? String(projects[0].id) : undefined);
  await store.setExperimentationConfig({
    orgId,
    provider: DEFAULT_PROVIDER,
    optimizely: { apiToken: token, defaultProjectId },
    updatedAt: new Date().toISOString(),
  });
  return projects.map((p) => ({ id: String(p.id), name: p.name, platform: p.platform, status: p.status }));
}

/** Set the brand's default Optimizely project. */
export async function setDefaultProject(orgId: string, projectId: string): Promise<void> {
  const store = await getContentStore();
  const cfg = await store.getExperimentationConfig(orgId);
  if (!cfg?.optimizely?.apiToken) throw new Error("Connect Optimizely first");
  await store.setExperimentationConfig({
    ...cfg,
    optimizely: { ...cfg.optimizely, defaultProjectId: projectId },
    updatedAt: new Date().toISOString(),
  });
}

export async function disconnectExperimentation(orgId: string): Promise<void> {
  await (await getContentStore()).deleteExperimentationConfig(orgId);
}

/** UI-safe status: connection + projects, never the token itself. */
export async function getExperimentationStatus(orgId: string): Promise<ExperimentationStatus> {
  const cfg = await getExperimentationConfig(orgId);
  const token = cfg?.optimizely?.apiToken;
  if (!token) return { connected: false, provider: DEFAULT_PROVIDER, projects: [] };
  const base: ExperimentationStatus = {
    connected: true,
    provider: cfg!.provider,
    tokenLast4: token.slice(-4),
    defaultProjectId: cfg!.optimizely?.defaultProjectId,
    projects: [],
  };
  try {
    const provider = await getExperimentationProvider(orgId);
    base.projects = provider ? await provider.listProjects() : [];
  } catch (e) {
    base.error = (e as Error).message;
  }
  return base;
}
