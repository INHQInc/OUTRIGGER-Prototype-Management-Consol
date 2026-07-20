import Link from "next/link";
import { listSites, listPages } from "@/lib/registry";
import { PageHeader, Badge, EmptyState, TimeAgo } from "@/components/ui";
import { AddPages } from "@/components/AddPages";

export const dynamic = "force-dynamic";

export default async function Home() {
  const sites = await listSites();
  const pagesBySite = await Promise.all(sites.map((s) => listPages(s.key)));

  return (
    <>
      <PageHeader
        title="Sites & Pages"
        subtitle="Frozen, sanitized clones of Outrigger properties"
        actions={<AddPages sites={sites.map((s) => ({ key: s.key, label: s.label }))} />}
      />

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8">
        {/* Site summary cards */}
        <div className="grid grid-cols-2 gap-4">
          {sites.map((site) => (
            <div key={site.key} className="rounded-xl border border-border bg-surface p-5">
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
            </div>
          ))}
        </div>

        {/* Page tables per site */}
        {sites.map((site, i) => {
          const pages = pagesBySite[i];
          return (
            <section key={site.key}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-[13px] font-semibold">{site.label}</h2>
                <span className="text-[11px] text-muted-2">{pages.length} pages</span>
              </div>

              {pages.length === 0 ? (
                <EmptyState title={`No pages captured for ${site.label} yet.`} hint="Use Add Pages to clone a URL." />
              ) : (
                <div className="rounded-xl border border-border bg-surface overflow-hidden">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="text-left text-muted-2 border-b border-border">
                        <th className="font-medium px-4 py-2.5">Page</th>
                        <th className="font-medium px-4 py-2.5">Last synced</th>
                        <th className="font-medium px-4 py-2.5 text-right">Versions</th>
                        <th className="font-medium px-4 py-2.5 text-right">Assets</th>
                        <th className="font-medium px-4 py-2.5 text-right">Sanitized</th>
                        <th className="font-medium px-4 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pages.map((p) => (
                        <tr key={p.slug} className="border-b border-border last:border-0 hover:bg-surface-2/40">
                          <td className="px-4 py-3">
                            <Link href={`/pages/${site.key}/${p.slug}`} className="font-medium hover:text-accent">
                              /{p.url.replace(/^https?:\/\/[^/]+\//, "")}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-muted"><TimeAgo iso={p.latestCapturedAt} /></td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted">{p.versionCount}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted">{p.latestAssetCount}</td>
                          <td className="px-4 py-3 text-right">
                            <Badge tone="ok">{p.latestRemovedCount} removed</Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link href={`/pages/${site.key}/${p.slug}`} className="text-accent hover:text-accent-hover font-medium">Open →</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
