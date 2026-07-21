import { NextRequest, NextResponse } from "next/server";
import { getGitClientForOrg } from "@/lib/git/connection";
import { parseRepoUrl } from "@/lib/git/provider";
import { getActiveOrgId } from "@/lib/active-org";
import { currentUser } from "@/lib/auth/current";

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
