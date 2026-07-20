import Link from "next/link";
import { notFound } from "next/navigation";
import { getPageVersions, readVersionMeta } from "@/lib/registry";
import { PageHeader, Badge, TimeAgo, bytes } from "@/components/ui";
import { SyncButton } from "@/components/SyncButton";
import { PagePreview } from "@/components/PagePreview";

export const dynamic = "force-dynamic";

export default async function PageDetail({ params }: { params: Promise<{ siteKey: string; slug: string }> }) {
  const { siteKey, slug } = await params;
  const versions = await getPageVersions(siteKey, slug);
  if (!versions.length) notFound();

  const latest = versions[0];
  const meta = await readVersionMeta(siteKey, slug, latest.version);
  if (!meta) notFound();

  // Group removed artifacts by reason for the report
  const byReason = new Map<string, number>();
  for (const r of meta.report.removed) byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + 1);
  const reasons = [...byReason.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PageHeader
        title={`/${meta.url.replace(/^https?:\/\/[^/]+\/?/, "")}`}
        subtitle={meta.url}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/" className="h-9 px-3 flex items-center rounded-lg text-[13px] text-muted hover:text-foreground">← All pages</Link>
            <SyncButton siteKey={siteKey} url={meta.url} />
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="grid grid-cols-[1fr_320px] gap-6">
          {/* Live preview */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[13px] font-semibold">Preview · latest</h2>
              <a
                href={`/snap/${siteKey}/${slug}/latest`}
                target="_blank"
                rel="noreferrer"
                className="text-[12px] text-accent hover:text-accent-hover font-medium"
              >
                Open full ↗
              </a>
            </div>
            <PagePreview src={`/snap/${siteKey}/${slug}/latest`} />
          </div>

          {/* Right rail */}
          <div className="space-y-6">
            {/* Version timeline */}
            <div>
              <h2 className="text-[13px] font-semibold mb-3">Versions <span className="text-muted-2 font-normal">({versions.length})</span></h2>
              <div className="rounded-xl border border-border bg-surface divide-y divide-border">
                {versions.map((v, idx) => (
                  <div key={v.version} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <div className="text-[12px] font-medium flex items-center gap-2">
                        <TimeAgo iso={v.capturedAt} />
                        {idx === 0 && <Badge tone="accent">latest</Badge>}
                      </div>
                      <div className="text-[11px] text-muted-2 mt-0.5">
                        {v.assetCount} assets · {bytes(v.assetBytes)} · {v.removedCount} sanitized
                      </div>
                    </div>
                    <a href={`/snap/${siteKey}/${slug}/${v.version}`} target="_blank" rel="noreferrer" className="text-[11px] text-accent hover:text-accent-hover">view</a>
                  </div>
                ))}
              </div>
            </div>

            {/* Sanitization report */}
            <div>
              <h2 className="text-[13px] font-semibold mb-3 flex items-center gap-2">
                Sanitization report <Badge tone="ok">{meta.report.removed.length} removed</Badge>
              </h2>
              <div className="rounded-xl border border-border bg-surface p-4 space-y-2">
                {reasons.map(([reason, count]) => (
                  <div key={reason} className="flex items-center justify-between text-[11px]">
                    <span className="text-muted">{reason}</span>
                    <span className="tabular-nums text-muted-2">{count}</span>
                  </div>
                ))}
                <div className="pt-2 mt-1 border-t border-border text-[11px] text-muted-2">
                  Runtime clone-guard active · {meta.report.blockedDomains.length} tracking domains blocked
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
