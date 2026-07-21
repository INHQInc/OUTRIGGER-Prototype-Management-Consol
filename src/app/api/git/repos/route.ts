import { NextResponse } from "next/server";
import { getGitClient } from "@/lib/git/provider";
import { currentUser } from "@/lib/auth/current";

/**
 * GET → repos visible to the connected GitHub account (recent-first), for the
 * repo pickers. Token source is the global connection today; when GitHub moves
 * to brand-level connections (like Optimizely), this resolves per-brand.
 */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = getGitClient();
  if (!client) return NextResponse.json({ repos: [], tokenPresent: false });
  try {
    return NextResponse.json({ repos: await client.listRepos(), tokenPresent: true });
  } catch (e) {
    return NextResponse.json({ repos: [], tokenPresent: true, error: (e as Error).message });
  }
}
