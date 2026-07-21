/**
 * Tenant guard for prototype-scoped API routes. Fail-closed: if the owning
 * customer cannot be resolved, access is denied — a prototype is never
 * silently public. Accepts either a signed-in member session or the owning
 * org's API token (Bearer opmc_…).
 */
import { getContentStore } from "../content/store";
import { canAccessOrg } from "../active-org";
import { apiOrgFromAuthHeader } from "../api-token";
import { resolvePrototypeOrg } from "./org";
import type { PrototypeRecord } from "./types";

export type PrototypeGuard =
  | { error: string; status: 400 | 403 | 404 }
  | { proto: PrototypeRecord; orgId: string; viaToken: boolean };

export async function guardPrototypeAccess(
  prototypeKey: string | null,
  authHeader: string | null = null,
  opts: { tokenAllowed?: boolean } = {},
): Promise<PrototypeGuard> {
  const tokenAllowed = opts.tokenAllowed ?? true;
  if (!prototypeKey) return { error: "prototype key required", status: 400 };
  const proto = await (await getContentStore()).getPrototype(prototypeKey);
  if (!proto) return { error: "Unknown prototype", status: 404 };
  const orgId = await resolvePrototypeOrg(proto);
  if (!orgId) return { error: "Forbidden", status: 403 };
  const tokenOrg = tokenAllowed ? await apiOrgFromAuthHeader(authHeader) : null;
  const viaToken = tokenOrg !== null && tokenOrg === orgId;
  if (!viaToken && !(await canAccessOrg(orgId))) return { error: "Forbidden", status: 403 };
  return { proto, orgId, viaToken };
}
