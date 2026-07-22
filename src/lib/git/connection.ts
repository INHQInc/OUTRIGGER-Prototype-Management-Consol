/**
 * Brand-level GitHub connection — the Optimizely pattern applied to git.
 * Each customer connects a GitHub account (service/machine account PAT);
 * all git operations for that brand resolve its token. The console-wide
 * GITHUB_TOKEN env var remains only as a default fallback.
 */
import { getContentStore } from "../content/store";
import { GitHubClient, GitError, friendlyGitError } from "./github";
import { audit } from "../audit";

export interface RepoWriteProbe {
  repo: string;
  canWrite: boolean | null; // true = push ok, false = read-only, null = couldn't check
  reason?: string;
}

/**
 * Can the customer's connected token actually WRITE to this repo? Branch
 * creation and commits need `push`. A valid-but-read-only token (or the console
 * env fallback) passes the /user validation yet 403s here — this surfaces that
 * before the user hits it at "Get init script".
 */
export async function probeRepoWrite(orgId: string | null | undefined, fullName: string): Promise<RepoWriteProbe> {
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) return { repo: fullName, canWrite: null, reason: "invalid repo" };
  const client = await getGitClientForOrg(orgId);
  if (!client) return { repo: fullName, canWrite: null, reason: "GitHub not connected" };
  try {
    const canWrite = await client.canCreateBranch(owner, repo);
    return { repo: fullName, canWrite, reason: canWrite ? undefined : "token is read-only on this repo — needs Contents: Read and write, and repo access must not be 'Public repositories' (that tier is read-only)" };
  } catch (e) {
    // 404 on a repo the customer owns = the token can't even SEE it — it's private
    // and the token isn't scoped to include it. That's a hard no on write.
    if (e instanceof GitError && e.status === 404) {
      return { repo: fullName, canWrite: false, reason: "the connected token can't see this repo — it's private and isn't in the token's repository access. Reconnect a token scoped to this repo (Only select repositories → it, or All repositories) with Contents: Read and write" };
    }
    return { repo: fullName, canWrite: null, reason: friendlyGitError(e, { action: "reach", repo: fullName }) };
  }
}

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
