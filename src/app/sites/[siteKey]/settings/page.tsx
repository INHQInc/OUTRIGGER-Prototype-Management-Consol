import { notFound } from "next/navigation";
import { getSite } from "@/lib/sites";
import { listPages } from "@/lib/registry";
import { getContentStore } from "@/lib/content/store";
import { RepoSettings } from "@/components/RepoSettings";
import { SiteModeControl } from "@/components/SiteModeControl";
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
  const [pages, protos, repo] = await Promise.all([
    listPages(siteKey),
    store.listPrototypes(siteKey),
    store.getRepoBinding(siteKey),
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
        <Row label="Mode"><span className="capitalize">{site.mode}</span></Row>
      </div>

      <SiteModeControl siteKey={siteKey} initialMode={site.mode} />

      <RepoSettings siteKey={siteKey} />

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
