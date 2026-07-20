import Link from "next/link";
import { listSites, listPages } from "@/lib/registry";
import { PageHeader, Badge } from "@/components/ui";
import { AddPages } from "@/components/AddPages";
import { PagesTable } from "@/components/PagesTable";

export const dynamic = "force-dynamic";

export default async function Home() {
  const sites = await listSites();
  const pagesBySite = await Promise.all(sites.map((s) => listPages(s.key)));

  return (
    <>
      <PageHeader
        title="Sites & Pages"
        subtitle="Frozen, sanitized clones — pick a site to manage its pages and prototypes"
        actions={<AddPages sites={sites.map((s) => ({ key: s.key, label: s.label }))} />}
      />

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8">
        {/* Site summary cards → workspace */}
        <div className="grid grid-cols-2 gap-4">
          {sites.map((site) => (
            <Link key={site.key} href={`/sites/${site.key}`} className="rounded-xl border border-border bg-surface p-5 hover:border-border-strong transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[14px] font-semibold">{site.label}</div>
                  <div className="text-[12px] text-muted-2 mt-0.5 font-mono">{new URL(site.origin).host}</div>
                </div>
                <Badge tone="accent">{site.key}</Badge>
              </div>
              <div className="flex gap-6 mt-4">
                <div>
                  <div className="text-[20px] font-semibold tabular-nums">{site.pageCount}</div>
                  <div className="text-[11px] text-muted-2">pages</div>
                </div>
                <div>
                  <div className="text-[20px] font-semibold tabular-nums">{site.versionCount}</div>
                  <div className="text-[11px] text-muted-2">versions</div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Page tables per site */}
        {sites.map((site, i) => (
          <section key={site.key}>
            <div className="flex items-center gap-2 mb-3">
              <Link href={`/sites/${site.key}`} className="text-[13px] font-semibold hover:text-accent">{site.label}</Link>
              <span className="text-[11px] text-muted-2">{pagesBySite[i].length} pages</span>
            </div>
            <PagesTable siteKey={site.key} pages={pagesBySite[i]} emptyLabel={`No pages captured for ${site.label} yet.`} />
          </section>
        ))}
      </div>
    </>
  );
}
