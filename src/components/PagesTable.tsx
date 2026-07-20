import Link from "next/link";
import { Badge, EmptyState, TimeAgo } from "@/components/ui";
import type { PageSummary } from "@/lib/registry";

/** Reusable per-site captured-pages table. */
export function PagesTable({ siteKey, pages, emptyLabel }: { siteKey: string; pages: PageSummary[]; emptyLabel?: string }) {
  if (pages.length === 0) {
    return <EmptyState title={emptyLabel ?? "No pages captured yet."} hint="Use Add Pages to clone a URL." />;
  }
  return (
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
                <Link href={`/pages/${siteKey}/${p.slug}`} className="font-medium hover:text-accent">
                  /{p.url.replace(/^https?:\/\/[^/]+\/?/, "")}
                </Link>
              </td>
              <td className="px-4 py-3 text-muted"><TimeAgo iso={p.latestCapturedAt} /></td>
              <td className="px-4 py-3 text-right tabular-nums text-muted">{p.versionCount}</td>
              <td className="px-4 py-3 text-right tabular-nums text-muted">{p.latestAssetCount}</td>
              <td className="px-4 py-3 text-right">
                <Badge tone="ok">{p.latestRemovedCount} removed</Badge>
              </td>
              <td className="px-4 py-3 text-right">
                <Link href={`/pages/${siteKey}/${p.slug}`} className="text-accent hover:text-accent-hover font-medium">Open →</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
