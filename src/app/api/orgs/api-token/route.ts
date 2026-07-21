import { NextResponse } from "next/server";
import { regenerateApiToken } from "@/lib/api-token";
import { getActiveOrgId } from "@/lib/active-org";
import { currentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";

/** POST → regenerate the active customer's console API token (admin). */
export async function POST() {
  const [user, orgId] = await Promise.all([currentUser(), getActiveOrgId()]);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Only an admin can manage the API token." }, { status: 403 });
  if (!orgId) return NextResponse.json({ error: "No active customer." }, { status: 400 });
  const token = await regenerateApiToken(orgId);
  await audit(orgId, user.name ?? user.sub, "api-token.regenerate", orgId);
  return NextResponse.json({ token });
}
