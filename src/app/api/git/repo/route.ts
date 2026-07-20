import { NextRequest, NextResponse } from "next/server";
import { getContentStore } from "@/lib/content/store";
import { getGitClient, parseRepoUrl } from "@/lib/git/provider";
import type { SiteRepoBinding, SourceMode, RepoConfig } from "@/lib/git/types";

/** GET ?site=<key> → the site's repo binding (or null). */
export async function GET(req: NextRequest) {
  const siteKey = req.nextUrl.searchParams.get("site");
  if (!siteKey) return NextResponse.json({ error: "site required" }, { status: 400 });
  const store = await getContentStore();
  return NextResponse.json({ binding: await store.getRepoBinding(siteKey), tokenPresent: !!getGitClient() });
}

interface Body {
  siteKey?: string;
  featureRepo?: string;
  featureBase?: string;
  branchPrefix?: string;
  sourceMode?: SourceMode;
  sourceRepo?: string;
  sourceBase?: string;
}

/** POST → validate + persist a site's feature/source repo binding. */
export async function POST(req: NextRequest) {
  let b: Body;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!b.siteKey) return NextResponse.json({ error: "siteKey required" }, { status: 400 });

  const fref = parseRepoUrl(b.featureRepo ?? "");
  if (!fref) return NextResponse.json({ error: "Feature repo must be owner/repo or a github.com URL" }, { status: 400 });

  const sourceMode: SourceMode = b.sourceMode ?? "same";
  let source: RepoConfig | undefined;
  if (sourceMode === "repo") {
    const sref = parseRepoUrl(b.sourceRepo ?? "");
    if (!sref) return NextResponse.json({ error: "Source repo must be owner/repo or a github.com URL" }, { status: 400 });
    source = { provider: "github", owner: sref.owner, repo: sref.repo, baseBranch: b.sourceBase?.trim() || "main" };
  }

  const binding: SiteRepoBinding = {
    feature: {
      provider: "github",
      owner: fref.owner,
      repo: fref.repo,
      baseBranch: b.featureBase?.trim() || "main",
      branchPrefix: b.branchPrefix?.trim() || "prototype/",
    },
    sourceMode,
    ...(source ? { source } : {}),
  };

  // Optional live validation when a token is configured (non-fatal).
  let validation: { ok: boolean; message: string } | null = null;
  const client = getGitClient();
  if (client) {
    try {
      const info = await client.getRepo(binding.feature.owner, binding.feature.repo);
      validation = info.permissions?.push
        ? { ok: true, message: `Connected — default branch ${info.defaultBranch}, push access OK.` }
        : { ok: false, message: `Reachable but the token lacks push access (needs Contents + Pull-requests write).` };
    } catch (e) {
      validation = { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }

  const store = await getContentStore();
  await store.setRepoBinding(b.siteKey, binding);
  return NextResponse.json({ binding, validation, tokenPresent: !!client }, { status: 201 });
}
