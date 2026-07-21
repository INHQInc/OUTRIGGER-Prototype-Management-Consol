import { NextRequest, NextResponse } from "next/server";
import { getContentStore } from "@/lib/content/store";
import { getActiveOrgId } from "@/lib/active-org";
import { currentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";

/** POST { loaderInstalled: true } → mark the manual loader-tag setup step done. */
export async function POST(req: NextRequest) {
  const [user, orgId] = await Promise.all([currentUser(), getActiveOrgId()]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!orgId) return NextResponse.json({ error: "No active customer." }, { status: 400 });
  let body: { loaderInstalled?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (body.loaderInstalled !== undefined) {
    await (await getContentStore()).setFlag(`setup:loader:${orgId}`, body.loaderInstalled ? "1" : "");
    if (body.loaderInstalled) await audit(orgId, user.name ?? user.sub, "setup.loader-installed", orgId);
  }
  return NextResponse.json({ ok: true });
}
