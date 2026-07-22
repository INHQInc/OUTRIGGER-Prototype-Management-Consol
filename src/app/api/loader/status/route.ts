import { NextRequest, NextResponse } from "next/server";
import { resolveRepoSource } from "@/lib/prototypes/source";
import { listArtifactVersions } from "@/lib/prototypes/versions";
import { peekServed, detectNamespace, SERVED_TTL_MS } from "@/lib/prototypes/served";

/**
 * GET /api/loader/status?key=<prototypeKey> → what is actually being served.
 *
 * Tokenless on purpose: the review URL is already key-gated, and reading "what
 * build is live" should never need the write token. This exists to kill the
 * phantom-staleness debugging cycle — after a push you poll here until
 * `head.commit` is your commit and `stale` is false, THEN hard-reload and judge.
 *
 * `served` is the loader's briefly-cached payload (what the page gets right
 * now); `head` is the branch tip. When they differ, the cache just hasn't
 * expired — `staleForMs` says how long until it does.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || !/^[a-zA-Z0-9_-]+$/.test(key)) {
    return NextResponse.json({ error: "key required" }, { status: 400, headers: CORS });
  }

  const cached = peekServed(key);
  const now = Date.now();
  const cacheAgeMs = cached ? now - cached.at : null;
  const cacheValid = cacheAgeMs !== null && cacheAgeMs < SERVED_TTL_MS;

  // Branch tip — always read fresh, so "has my push landed?" is answerable.
  let head: { commit?: string; found: boolean; bytes?: number; namespace?: string; branch?: string; repo?: string; error?: string };
  try {
    const src = await resolveRepoSource(key);
    head = {
      repo: src.repo,
      branch: src.branch,
      commit: src.headSha,
      found: src.found,
      bytes: src.variationJs ? Buffer.byteLength(src.variationJs, "utf8") : undefined,
      namespace: detectNamespace(src.variationJs),
    };
  } catch (e) {
    head = { found: false, error: (e as Error).message };
  }

  const versions = await listArtifactVersions(key).catch(() => []);
  const latest = versions[0];

  const servedCommit = cacheValid ? cached?.sha ?? null : head.commit ?? null;
  const source = head.found ? "repo" : latest?.variationJs ? "version" : "none";

  return NextResponse.json({
    key,
    source,
    served: {
      commit: servedCommit,
      namespace: cacheValid ? detectNamespace(cached?.js) : head.namespace,
      bytes: cacheValid && cached?.js ? Buffer.byteLength(cached.js, "utf8") : head.bytes,
      cacheAgeMs,
      cachedTtlMs: SERVED_TTL_MS,
    },
    head: {
      repo: head.repo ?? null,
      branch: head.branch ?? null,
      commit: head.commit ?? null,
      built: head.found,
      bytes: head.bytes ?? null,
      namespace: head.namespace ?? null,
      error: head.error ?? null,
    },
    latestVersion: latest ? { version: latest.version, commit: latest.gitSha, builtAt: latest.createdAt } : null,
    // True while the loader would still hand out a build older than the tip.
    stale: Boolean(servedCommit && head.commit && servedCommit !== head.commit),
    staleForMs: cacheValid && cacheAgeMs !== null ? Math.max(0, SERVED_TTL_MS - cacheAgeMs) : 0,
    // Set when the served artifact belongs to a different prototype — e.g. the
    // stale `opmc-starter` build a fresh branch inherits before its first build.
    namespaceMismatch: (() => {
      const ns = (cacheValid ? detectNamespace(cached?.js) : head.namespace) ?? null;
      return ns ? ns !== `opmc-${key}` : false;
    })(),
    expectedNamespace: `opmc-${key}`,
  }, { headers: CORS });
}
