import { GitHubClient } from "./github";
import type { RepoRef } from "./types";

/** Parse an owner/repo out of a GitHub URL or "owner/repo" shorthand. */
export function parseRepoUrl(input: string): RepoRef | null {
  const s = input.trim().replace(/\.git$/, "");
  // owner/repo shorthand
  const short = s.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (short) return { owner: short[1], repo: short[2] };
  try {
    const u = new URL(s);
    if (!/github\.com$/i.test(u.host)) return null;
    const parts = u.pathname.replace(/^\/+/, "").split("/");
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}

/** Prototype branch name from a feature key + prefix. */
export function prototypeBranch(key: string, prefix = "prototype/"): string {
  return `${prefix}${key}`;
}

/** GitHub client from GITHUB_TOKEN, or null if not configured (token-gated, like Optimizely/Vercel). */
export function getGitClient(): GitHubClient | null {
  const token = process.env.GITHUB_TOKEN;
  return token ? new GitHubClient(token) : null;
}
