import { NextResponse } from "next/server";
import { getGitClientForOrg } from "@/lib/git/connection";
import { getActiveOrgId } from "@/lib/active-org";
import { currentUser } from "@/lib/auth/current";

/**
 * GET → repos visible to the ACTIVE CUSTOMER's GitHub connection (recent-
 * first), for the repo pickers. Falls back to the console-default credential
 * when the customer hasn't connected GitHub yet.
 */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = await getGitClientForOrg(await getActiveOrgId());
  if (!client) return NextResponse.json({ repos: [], tokenPresent: false });
  try {
    return NextResponse.json({ repos: await client.listRepos(), tokenPresent: true });
  } catch (e) {
    return NextResponse.json({ repos: [], tokenPresent: true, error: (e as Error).message });
  }
}
