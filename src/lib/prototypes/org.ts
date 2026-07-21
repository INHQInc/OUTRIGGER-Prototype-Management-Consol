/**
 * Resolve (and lazily backfill) a prototype's owning customer. New prototypes
 * carry orgId directly; legacy records resolve it through their old site link
 * and get healed in place.
 */
import { getContentStore } from "../content/store";
import { getSite } from "../sites";
import type { PrototypeRecord } from "./types";

export async function resolvePrototypeOrg(proto: PrototypeRecord): Promise<string> {
  if (proto.orgId) return proto.orgId;
  if (proto.siteKey) {
    const site = await getSite(proto.siteKey);
    if (site?.orgId) {
      await (await getContentStore()).putPrototype({ ...proto, orgId: site.orgId });
      return site.orgId;
    }
  }
  return "";
}
