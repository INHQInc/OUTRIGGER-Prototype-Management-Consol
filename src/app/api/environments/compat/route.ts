import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/current";
import { checkSiteCompatibility } from "@/lib/capture/compat";
import { getContentStore } from "@/lib/content/store";

export const maxDuration = 30;

/** POST { url, envId? } → the red/green site-compatibility verdict (stored per env when envId given). */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { url?: string; envId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.url) return NextResponse.json({ error: "url required" }, { status: 400 });
  const report = await checkSiteCompatibility(body.url);
  if (body.envId) {
    try { await (await getContentStore()).setFlag(`compat:${body.envId}`, JSON.stringify(report)); } catch { /* best-effort */ }
  }
  return NextResponse.json({ report });
}
