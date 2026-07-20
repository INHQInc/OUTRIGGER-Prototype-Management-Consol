import { NextRequest, NextResponse } from "next/server";
import { getSite } from "@/lib/sites";
import { getPageVersions } from "@/lib/registry";
import { getContentStore } from "@/lib/content/store";

/**
 * POST { siteKey, slug } → same-site links found in that page's latest
 * captured HTML, so the user can add sub-pages as checkboxes. Reads the
 * stored snapshot (no extra Firecrawl cost).
 */
export async function POST(req: NextRequest) {
  let body: { siteKey?: string; slug?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { siteKey, slug } = body;
  const site = siteKey ? await getSite(siteKey) : null;
  if (!site || !slug) {
    return NextResponse.json({ error: "siteKey and slug required" }, { status: 400 });
  }

  const versions = await getPageVersions(siteKey!, slug);
  if (!versions.length) return NextResponse.json({ links: [] });
  const latest = versions[0].version;

  const store = await getContentStore();
  const html = await store.getHtml(siteKey!, slug, latest);
  if (!html) return NextResponse.json({ links: [] });

  const origin = site.origin;
  const originHost = new URL(origin).host;
  const found = new Set<string>();

  const hrefRe = /href="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html))) {
    const raw = m[1];
    if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:")) continue;
    let abs: URL;
    try {
      abs = new URL(raw, origin);
    } catch {
      continue;
    }
    if (abs.host !== originHost) continue;
    abs.hash = "";
    abs.search = "";
    const clean = abs.href.replace(/\/$/, "");
    if (clean === origin.replace(/\/$/, "")) continue;
    found.add(clean);
  }

  const links = [...found].sort();
  return NextResponse.json({ links });
}
