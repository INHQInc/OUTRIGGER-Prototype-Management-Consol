import type { RepoInfo, PullRequestResult } from "./types";

/**
 * Minimal GitHub REST client (raw fetch, no SDK dependency — same approach as
 * the Optimizely client). Auth: a fine-grained or classic PAT with Contents
 * (read/write) + Pull requests (read/write) on the target repo.
 *
 * SAFETY: this never pushes to the base branch. It only creates prototype
 * branches and opens PRs; a human reviews + merges.
 */
const BASE = "https://api.github.com";

export class GitError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export class GitHubClient {
  constructor(private token: string) {}

  private async gh<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new GitError(res.status, `GitHub ${res.status}: ${body.slice(0, 300)}`);
    }
    return (res.status === 204 ? (undefined as T) : ((await res.json()) as T));
  }

  /** Confirms token + repo access. Returns default branch + push permission. */
  async getRepo(owner: string, repo: string): Promise<RepoInfo> {
    const r = await this.gh<{
      name: string;
      owner: { login: string };
      default_branch: string;
      private: boolean;
      html_url: string;
      permissions?: { push?: boolean; pull?: boolean; admin?: boolean };
    }>(`/repos/${owner}/${repo}`);
    return {
      owner: r.owner.login,
      repo: r.name,
      defaultBranch: r.default_branch,
      private: r.private,
      htmlUrl: r.html_url,
      permissions: r.permissions,
    };
  }

  /** Head commit SHA of a branch. */
  async getBranchSha(owner: string, repo: string, branch: string): Promise<string> {
    const r = await this.gh<{ object: { sha: string } }>(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
    return r.object.sha;
  }

  /** Create branch `name` at `fromSha`. Idempotent-ish: 422 if it already exists. */
  async createBranch(owner: string, repo: string, name: string, fromSha: string): Promise<void> {
    await this.gh(`/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${name}`, sha: fromSha }),
    });
  }

  /** Get a file's blob SHA on a branch (needed to update an existing file). null if absent. */
  async getFileSha(owner: string, repo: string, path: string, branch: string): Promise<string | null> {
    try {
      const r = await this.gh<{ sha: string }>(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`);
      return r.sha;
    } catch (e) {
      if (e instanceof GitError && e.status === 404) return null;
      throw e;
    }
  }

  /** Create or update a file on `branch`. Never touches the base branch. */
  async putFile(owner: string, repo: string, opts: { path: string; content: string; message: string; branch: string }): Promise<void> {
    const sha = await this.getFileSha(owner, repo, opts.path, opts.branch);
    await this.gh(`/repos/${owner}/${repo}/contents/${encodeURIComponent(opts.path)}`, {
      method: "PUT",
      body: JSON.stringify({
        message: opts.message,
        content: Buffer.from(opts.content, "utf8").toString("base64"),
        branch: opts.branch,
        ...(sha ? { sha } : {}),
      }),
    });
  }

  /** Open a PR from `head` into `base`. */
  async openPullRequest(owner: string, repo: string, opts: { title: string; head: string; base: string; body?: string }): Promise<PullRequestResult> {
    const r = await this.gh<{ number: number; html_url: string }>(`/repos/${owner}/${repo}/pulls`, {
      method: "POST",
      body: JSON.stringify({ title: opts.title, head: opts.head, base: opts.base, body: opts.body ?? "" }),
    });
    return { number: r.number, url: r.html_url, branch: opts.head };
  }
}
