import { notFound } from "next/navigation";
import { listPages } from "@/lib/registry";
import { getSite } from "@/lib/sites";
import { PagesTable } from "@/components/PagesTable";
import { AddPages } from "@/components/AddPages";

export const dynamic = "force-dynamic";

export default async function SitePages({ params }: { params: Promise<{ siteKey: string }> }) {
  const { siteKey } = await params;
  const site = await getSite(siteKey);
  if (!site) notFound();
  const pages = await listPages(siteKey);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[12px] text-muted-2">{pages.length} page{pages.length === 1 ? "" : "s"} captured</div>
        <AddPages sites={[{ key: site.siteKey, label: site.label }]} />
      </div>
      <PagesTable siteKey={siteKey} pages={pages} emptyLabel={`No pages captured for ${site.label} yet.`} />
    </div>
  );
}
