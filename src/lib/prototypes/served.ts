/**
 * What the loader is ACTUALLY serving right now.
 *
 * The loader caches the repo artifact briefly so a shared preview link doesn't
 * hammer the GitHub API. That cache is invisible from the outside, which turns
 * "did my push land?" into guesswork — you reload, see old code, and start
 * debugging a phantom. So the cache lives here and is introspectable: the
 * status endpoint reports the served commit AND the branch-HEAD commit, making
 * staleness a fact you can poll on instead of a feeling.
 */
import { resolveRepoSource } from "./source";

export const SERVED_TTL_MS = 20_000;

export interface ServedEntry {
  js: string | null;
  sha?: string;
  at: number;
}

const cache = new Map<string, ServedEntry>();

/** The artifact namespace baked into a built variation, e.g. `opmc-room-detail-overlay`. */
export function detectNamespace(js?: string | null): string | undefined {
  if (!js) return undefined;
  return js.match(/opmc-[a-zA-Z0-9_-]+/)?.[0];
}

/**
 * Is the served artifact the WRONG artifact — i.e. the `starter` build a fresh
 * branch inherits before its first real build?
 *
 * Deliberately narrow. Comparing the namespace to `opmc-<key>` false-positives:
 * a prototype is free to pick a shorter namespace (e.g. `opmc-rdo` for
 * room-detail-overlay) and still be perfectly correct. The only genuinely
 * broken states are the template build and the console's own placeholder.
 */
export function artifactProblem(js?: string | null): "starter-build" | "placeholder" | null {
  if (!js) return null;
  if (detectNamespace(js) === "opmc-starter") return "starter-build";
  if (/no build yet — edit src\/ and run node build\.mjs/.test(js)) return "placeholder";
  return null;
}

/** Cached repo-HEAD artifact — the same value the loader hands the page. */
export async function servedFromRepo(key: string): Promise<ServedEntry> {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < SERVED_TTL_MS) return hit;
  let js: string | null = null;
  let sha: string | undefined;
  try {
    const src = await resolveRepoSource(key);
    js = src.found ? src.variationJs ?? null : null;
    sha = src.headSha;
  } catch {
    js = null; // no binding / token / branch — caller falls through to other sources
  }
  const entry: ServedEntry = { js, sha, at: now };
  cache.set(key, entry);
  return entry;
}

/** Peek without refreshing — used by the status endpoint to expose cache age. */
export function peekServed(key: string): ServedEntry | undefined {
  return cache.get(key);
}
