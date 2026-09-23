import { NextRequest, NextResponse } from "next/server";
import { getActiveOrgId } from "@/lib/active-org";
import { currentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";
import { listSites, createSite, updateSite } from "@/lib/site/sites";
import type { Site, SiteIndustry, SiteSource } from "@/lib/site/types";

/**
 * The active customer's sites (lib/site/).
 *
 *   GET                                                  → { sites }          any member
 *   POST  { name, url, industry?, source? }              → { site } 201       admin
 *   PATCH { id, name?, url?, industry?, source?, status? } → { site }         admin
 *
 * Admin-only writes, matching Brand and Repositories: a site's settings reach
 * a customer's live pages. The GET also moves a customer's existing
 * environments and prototypes into its starting site on first read.
 */
export async function GET() {
  const [user, orgId] = await Promise.all([currentUser(), getActiveOrgId()]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!orgId) return NextResponse.json({ error: "No active customer." }, { status: 400 });
  return NextResponse.json({ sites: await listSites(orgId) });
}

async function adminGuard() {
  const [user, orgId] = await Promise.all([currentUser(), getActiveOrgId()]);
  if (!user || user.role !== "admin") return { error: "Only an admin can add or change a site.", status: 403 as const };
  if (!orgId) return { error: "No active customer.", status: 400 as const };
  return { orgId, actor: user.name ?? user.sub };
}

export async function POST(req: NextRequest) {
  const g = await adminGuard();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  let body: { name?: string; url?: string; industry?: SiteIndustry; source?: SiteSource };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  try {
    const site = await createSite(g.orgId, { name: body.name ?? "", url: body.url ?? "", industry: body.industry, source: body.source });
    await audit(g.orgId, g.actor, "site.create", "site", `${site.name} (${site.url})`).catch(() => {});
    return NextResponse.json({ site }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const g = await adminGuard();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  let body: { id?: string; name?: string; url?: string; industry?: SiteIndustry | null; source?: SiteSource | null; status?: Site["status"] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    const site = await updateSite(g.orgId, body.id, {
      name: body.name, url: body.url, industry: body.industry, source: body.source, status: body.status,
    });
    await audit(g.orgId, g.actor, "site.update", "site", site.name).catch(() => {});
    return NextResponse.json({ site });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg }, { status: msg === "Unknown site." ? 404 : 400 });
  }
}
