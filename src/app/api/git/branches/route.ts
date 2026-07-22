import { NextRequest, NextResponse } from "next/server";
import { getGitClientForOrg } from "@/lib/git/connection";
import { parseRepoUrl } from "@/lib/git/provider";
import { getActiveOrgId } from "@/lib/active-org";
import { currentUser } from "@/lib/auth/current";
import { GitError } from "@/lib/git/github";

/** GET ?repo=owner/repo → branch names, via the active customer's GitHub connection. */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ref = parseRepoUrl(req.nextUrl.searchParams.get("repo") ?? "");
  if (!ref) return NextResponse.json({ error: "repo (owner/repo) required" }, { status: 400 });
  const client = await getGitClientForOrg(await getActiveOrgId());
  if (!client) return NextResponse.json({ branches: [], connected: false });
  try {
    return NextResponse.json({ branches: await client.listBranches(ref.owner, ref.repo), connected: true });
  } catch (e) {
    return NextResponse.json({ branches: [], connected: true, error: (e as Error).message });
  }
}

/**
 * POST { repo, branch, from? } → create `branch` by forking `from` (default
 * `starter`). Idempotent: if the branch already exists it's a no-op. This is
 * what makes "add a new branch" actually add it, instead of leaving a pointer
 * to a branch that doesn't exist yet.
 */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const ref = parseRepoUrl(String(body.repo ?? ""));
  const branch = String(body.branch ?? "").trim();
  const from = String(body.from ?? "starter").trim() || "starter";
  if (!ref || !branch) return NextResponse.json({ error: "repo and branch required" }, { status: 400 });
  if (branch === "starter") return NextResponse.json({ error: "Can't target the starter template branch." }, { status: 400 });

  const client = await getGitClientForOrg(await getActiveOrgId());
  if (!client) return NextResponse.json({ error: "GitHub isn't connected for this customer." }, { status: 400 });
  try {
    // Already there? Nothing to do.
    try {
      await client.getBranchSha(ref.owner, ref.repo, branch);
      return NextResponse.json({ created: false, branch });
    } catch (e) {
      if (!(e instanceof GitError && (e.status === 404 || e.status === 422))) throw e;
    }
    const fromSha = await client.getBranchSha(ref.owner, ref.repo, from).catch(() => {
      throw new Error(`No '${from}' branch in ${ref.owner}/${ref.repo} to fork the new branch from.`);
    });
    await client.createBranch(ref.owner, ref.repo, branch, fromSha);
    return NextResponse.json({ created: true, branch, from });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
