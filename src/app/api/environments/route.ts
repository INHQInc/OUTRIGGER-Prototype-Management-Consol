import { NextRequest, NextResponse } from "next/server";
import { listEnvironments, addEnvironment, deleteEnvironment, type EnvironmentKind } from "@/lib/environments";
import { getSite } from "@/lib/sites";
import { canAccessOrg } from "@/lib/active-org";

/** Resolve + tenant-guard a site by key (from ?site= or a body field). */
async function guardSite(siteKey: string | null): Promise<{ siteKey: string } | { error: string; status: 400 | 403 | 404 }> {
  if (!siteKey) return { error: "site required", status: 400 };
  const site = await getSite(siteKey);
  if (!site) return { error: "Unknown site", status: 404 };
  if (site.orgId && !(await canAccessOrg(site.orgId))) return { error: "Forbidden", status: 403 };
  return { siteKey };
}

/** GET ?site=<key> → the site's environments (production seeded on first read). */
export async function GET(req: NextRequest) {
  const g = await guardSite(req.nextUrl.searchParams.get("site"));
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  return NextResponse.json({ environments: await listEnvironments(g.siteKey) });
}

/** POST { siteKey, url, label?, kind } → add an environment. */
export async function POST(req: NextRequest) {
  let body: { siteKey?: string; label?: string; url?: string; kind?: EnvironmentKind };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const g = await guardSite(body.siteKey ?? null);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  if (!body.url?.trim()) return NextResponse.json({ error: "A URL is required" }, { status: 400 });
  const kind: EnvironmentKind = body.kind === "development" || body.kind === "staging" ? body.kind : "production";
  try {
    const environment = await addEnvironment(g.siteKey, { label: body.label, url: body.url, kind });
    return NextResponse.json({ environment }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

/** DELETE ?site=<key>&id=<envId> → remove an environment (a site keeps ≥1). */
export async function DELETE(req: NextRequest) {
  const g = await guardSite(req.nextUrl.searchParams.get("site"));
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    await deleteEnvironment(g.siteKey, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
