import { notFound } from "next/navigation";
import { getSite } from "@/lib/sites";
import { listPages } from "@/lib/registry";
import { getContentStore } from "@/lib/content/store";
import { listEnvironments } from "@/lib/environments";
import { EnvironmentsManager } from "@/components/EnvironmentsManager";
import { LoaderSnippet } from "@/components/LoaderSnippet";
import { TimeAgo } from "@/components/ui";
import { DeleteSite } from "@/components/DeleteSite";

export const dynamic = "force-dynamic";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3 border-b border-border last:border-0">
      <span className="text-[12px] text-muted-2">{label}</span>
      <span className="text-[12px] text-right">{children}</span>
    </div>
  );
}

export default async function SiteSettings({ params }: { params: Promise<{ siteKey: string }> }) {
  const { siteKey } = await params;
  const site = await getSite(siteKey);
  if (!site) notFound();

  const store = await getContentStore();
  const loaderSeenAt = await store.getFlag(`loader:seen:${siteKey}`);
  const [pages, protos, repo, environments] = await Promise.all([
    listPages(siteKey),
    store.listPrototypes(siteKey),
    store.getRepoBinding(siteKey),
    listEnvironments(siteKey),
  ]);

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <span className="text-[13px] font-semibold">Site configuration</span>
        </div>
        <Row label="Label">{site.label}</Row>
        <Row label="Key"><span className="font-mono">{site.siteKey}</span></Row>
        <Row label="Origin"><span className="font-mono break-all">{site.origin}</span></Row>
        <Row label="Asset hosts"><span className="font-mono break-all">{site.assetHosts.join(", ")}</span></Row>
      </div>

      <EnvironmentsManager siteKey={siteKey} initialEnvironments={environments} canManage />

      <div className="space-y-1.5">
        <LoaderSnippet siteKey={siteKey} />
        {loaderSeenAt ? (
          <div className="text-[11px] text-ok px-1">✓ Loader verified on this environment — last seen <TimeAgo iso={loaderSeenAt} />.</div>
        ) : (
          <div className="text-[11px] text-muted-2 px-1">Loader not detected yet — install the tag, then open the site once; it reports in automatically.</div>
        )}
      </div>


      <div className="rounded-xl border border-dashed border-border p-4 text-[12px] text-muted-2 leading-relaxed">
        Coming soon: edit label/asset hosts, and per-site <span className="text-muted">design context</span> (brand tokens)
        + <span className="text-muted">Optimizely project</span> connector.
      </div>

      <DeleteSite
        siteKey={siteKey}
        siteLabel={site.label}
        pageCount={pages.length}
        prototypeCount={protos.length}
        hasRepo={!!repo}
      />
    </div>
  );
}
