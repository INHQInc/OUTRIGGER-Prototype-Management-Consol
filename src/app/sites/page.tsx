import Link from "next/link";
import { listSites } from "@/lib/registry";
import { PageHeader, Badge } from "@/components/ui";
import { SiteActions } from "@/components/SiteActions";
import { AddSiteButton } from "@/components/AddSiteButton";

export const dynamic = "force-dynamic";

/** Sites = the brand's web properties (setup: environments, repo, pages, settings). */
export default async function SitesPage() {
  const sites = await listSites();

  return (
    <>
      <PageHeader
        title="Sites"
        subtitle="The brand's web properties — environments, repo, pages, and integrations"
        actions={<AddSiteButton />}
      />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {sites.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <div className="text-[13px] font-medium">No websites yet.</div>
            <div className="text-[12px] text-muted-2 mt-1">Add the brand&apos;s website — it becomes the site&apos;s Production environment, and you build prototypes against it.</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {sites.map((site) => (
              <div key={site.key} className="rounded-xl border border-border bg-surface p-5 hover:border-border-strong transition-colors">
                <Link href={`/sites/${site.key}`} className="block">
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
                <div className="mt-4 pt-3 border-t border-border">
                  <SiteActions siteKey={site.key} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
