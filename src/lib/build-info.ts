/**
 * WHICH BUILD THIS IS — read once, on the server.
 *
 * Vercel injects the commit at build time, so this is the build's own answer
 * rather than a claim about it. Everything reads THIS, not `process.env`
 * directly, so the footer and /api/version can never disagree about what is
 * running.
 */
export interface BuildInfo {
  sha: string;
  full: string | null;
  ref: string | null;
  env: string;
  /** WHICH PRODUCT GENERATION this deployment is. Beta 1 is the operational
   *  console; Beta 2 is the rebuild running beside it on its own database.
   *  Read per-DEPLOYMENT (an env var), not per-commit, so the same code can
   *  serve either — and so nobody has to infer which one they are looking at
   *  from a commit hash. */
  channel: string;
}

export function buildInfo(): BuildInfo {
  const full = process.env.VERCEL_GIT_COMMIT_SHA ?? "";
  return {
    // "local" rather than a fake hash: a dev server is genuinely not a build,
    // and inventing one would make the footer lie in the one place it exists
    // to be trusted.
    sha: full ? full.slice(0, 7) : "local",
    full: full || null,
    ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    env: process.env.VERCEL_ENV ?? "development",
    channel: process.env.NEXT_PUBLIC_RELEASE_CHANNEL?.trim() || "Beta 1",
  };
}
