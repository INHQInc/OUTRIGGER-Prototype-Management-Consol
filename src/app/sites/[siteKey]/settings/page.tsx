import { notFound } from "next/navigation";
import { getSite, CONFIG_SITES } from "@/lib/sites";
import { Badge } from "@/components/ui";
import { RepoSettings } from "@/components/RepoSettings";

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
  const builtIn = siteKey in CONFIG_SITES;

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <span className="text-[13px] font-semibold">Site configuration</span>
          <Badge tone={builtIn ? "neutral" : "accent"}>{builtIn ? "built-in" : "user-added"}</Badge>
        </div>
        <Row label="Label">{site.label}</Row>
        <Row label="Key"><span className="font-mono">{site.siteKey}</span></Row>
        <Row label="Origin"><span className="font-mono break-all">{site.origin}</span></Row>
        <Row label="Asset hosts"><span className="font-mono break-all">{site.assetHosts.join(", ")}</span></Row>
      </div>

      <RepoSettings siteKey={siteKey} />

      <div className="rounded-xl border border-dashed border-border p-4 text-[12px] text-muted-2 leading-relaxed">
        Coming soon: edit label/asset hosts, and per-site <span className="text-muted">design context</span> (brand tokens)
        + <span className="text-muted">Optimizely project</span> connector.
      </div>
    </div>
  );
}
