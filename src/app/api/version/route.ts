import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * WHICH BUILD IS SERVING — the question this session asked three times.
 *
 * "Is the fix live?" was answered by inference each time: a header that only
 * middleware sets, a 401 that became a 200, a button that did or did not
 * appear. Each inference was sound and each cost a round of guessing, and one
 * of them was wrong for an hour because a deploy had not finished.
 *
 * Vercel injects the commit at build time, so this is the build's own answer
 * rather than a claim about it. Public and uncached on purpose: a version
 * endpoint behind a session cannot tell you whether the session code deployed,
 * and a cached one tells you about the build before last.
 *
 * It exposes a commit SHA of a private repo and nothing else — no config, no
 * env, no paths.
 */
export function GET() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? "";
  return NextResponse.json(
    {
      sha: sha ? sha.slice(0, 7) : "local",
      full: sha || null,
      ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      env: process.env.VERCEL_ENV ?? "development",
      // The moment this module was first evaluated on this instance — a rough
      // cold-start stamp, not a build time. Named so nobody reads it as one.
      instanceStartedAt: BOOTED,
    },
    { headers: { "cache-control": "no-store, max-age=0", "x-robots-tag": "noindex, nofollow" } },
  );
}

const BOOTED = new Date().toISOString();
