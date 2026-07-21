import { NextRequest, NextResponse } from "next/server";
import { getContentStore } from "@/lib/content/store";
import { capturePage } from "@/lib/capture/capture";
import { listPages } from "@/lib/registry";
import { getSite } from "@/lib/sites";
import { canAccessOrg } from "@/lib/active-org";

export const maxDuration = 300;

async function guard(siteKey: string | null) {
  if (!siteKey) return { error: "site required", status: 400 as const };
  const site = await getSite(siteKey);
  if (!site) return { error: "Unknown site", status: 404 as const };
  if (site.orgId && !(await canAccessOrg(site.orgId))) return { error: "Forbidden", status: 403 as const };
  return { siteKey };
}

/** GET ?site=<key> → the site's captured pages (slug + url), for target suggestions. */
export async function GET(req: NextRequest) {
  const g = await guard(req.nextUrl.searchParams.get("site"));
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const pages = await listPages(g.siteKey);
  return NextResponse.json({ pages: pages.map((p) => ({ slug: p.slug, url: p.url })) });
}

/** POST { siteKey, url } → re-sync (re-capture) a page, creating a new version. */
export async function POST(req: NextRequest) {
  let body: { siteKey?: string; url?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const g = await guard(body.siteKey ?? null);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  if (!body.url?.trim()) return NextResponse.json({ error: "url required" }, { status: 400 });
  try {
    const meta = await capturePage(body.url, g.siteKey);
    return NextResponse.json({ ok: true, slug: meta.pageSlug, version: meta.version });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

/** DELETE ?site=<key>&slug=<slug> → delete a captured page (all versions). */
export async function DELETE(req: NextRequest) {
  const g = await guard(req.nextUrl.searchParams.get("site"));
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
  await (await getContentStore()).deletePage(g.siteKey, slug);
  return NextResponse.json({ ok: true });
}
