/**
 * Brand-level GitHub connection — the Optimizely pattern applied to git.
 * Each customer connects a GitHub account (service/machine account PAT);
 * all git operations for that brand resolve its token. The console-wide
 * GITHUB_TOKEN env var remains only as a default fallback.
 */
import { getContentStore } from "../content/store";
import { GitHubClient } from "./github";
import { audit } from "../audit";

export interface GitConnectionStatus {
  connected: boolean;      // a brand-specific connection exists
  login?: string;
  tokenLast4?: string;
  envFallback: boolean;    // no brand connection, but the console default works
}

/** The token to use for a brand: its own connection, else the console default. */
export async function getOrgGitToken(orgId: string | null | undefined): Promise<string | null> {
  if (orgId) {
    const conn = await (await getContentStore()).getGitConnection(orgId);
    if (conn?.token) return conn.token;
  }
  return process.env.GITHUB_TOKEN ?? null;
}

/** GitHub client for a brand, or null when neither a connection nor the env default exists. */
export async function getGitClientForOrg(orgId: string | null | undefined): Promise<GitHubClient | null> {
  const token = await getOrgGitToken(orgId);
  return token ? new GitHubClient(token) : null;
}

/** Connect (or re-key) a brand's GitHub. Validates via /user before persisting. */
export async function connectGitHub(orgId: string, token: string, actor?: string): Promise<{ login: string }> {
  const clean = token.trim();
  if (!clean) throw new Error("A token is required");
  let viewer: { login: string };
  try {
    viewer = await new GitHubClient(clean).getViewer();
  } catch {
    throw new Error("GitHub rejected that token. Check it's a valid PAT with access to the prototype repos.");
  }
  await (await getContentStore()).setGitConnection({ orgId, token: clean, login: viewer.login, updatedAt: new Date().toISOString() });
  await audit(orgId, actor ?? "system", "github.connect", viewer.login);
  return viewer;
}

export async function disconnectGitHub(orgId: string, actor?: string): Promise<void> {
  const store = await getContentStore();
  const conn = await store.getGitConnection(orgId);
  await store.deleteGitConnection(orgId);
  await audit(orgId, actor ?? "system", "github.disconnect", conn?.login ?? orgId);
}

/** UI-safe status — never the token itself. */
export async function getGitConnectionStatus(orgId: string): Promise<GitConnectionStatus> {
  const conn = await (await getContentStore()).getGitConnection(orgId);
  if (conn?.token) return { connected: true, login: conn.login, tokenLast4: conn.token.slice(-4), envFallback: false };
  return { connected: false, envFallback: Boolean(process.env.GITHUB_TOKEN) };
}
