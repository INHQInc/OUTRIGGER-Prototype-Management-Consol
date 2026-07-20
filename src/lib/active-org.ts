import { cookies } from "next/headers";
import { currentUser } from "./auth/current";
import { listOrgs, orgsForMember } from "./orgs";

export const ORG_COOKIE = "opmc_org";

/**
 * Orgs the current user can access. Global admins (console role = admin) see
 * every org; everyone else sees only orgs they're a member of. This is the
 * tenant isolation boundary.
 */
export async function accessibleOrgIds(): Promise<string[]> {
  const user = await currentUser();
  if (!user) return [];
  const all = await listOrgs();
  if (user.role === "admin") return all.map((o) => o.id);
  const mine = new Set(await orgsForMember(user.sub));
  return all.filter((o) => mine.has(o.id)).map((o) => o.id);
}

/** The active org (from the switcher cookie), constrained to accessible orgs. */
export async function getActiveOrgId(): Promise<string | null> {
  const ids = await accessibleOrgIds();
  if (!ids.length) return null;
  const c = await cookies();
  const val = c.get(ORG_COOKIE)?.value;
  return val && ids.includes(val) ? val : ids[0];
}

/** Whether the current user may access a given org (isolation guard). */
export async function canAccessOrg(orgId: string): Promise<boolean> {
  return (await accessibleOrgIds()).includes(orgId);
}
