import Link from "next/link";
import { notFound } from "next/navigation";
import { getSite } from "@/lib/sites";

export const dynamic = "force-dynamic";

export default async function SiteLayout(props: LayoutProps<"/sites/[siteKey]">) {
  const { children } = props;
  const { siteKey } = await props.params;
  const site = await getSite(siteKey);
  if (!site) notFound();

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="px-8 pt-5 pb-4">
        <div className="text-[11px] text-muted-2 mb-1">
          <Link href="/" className="hover:text-foreground">Sites</Link>
          <span className="mx-1.5">/</span>
          <span className="text-muted">{site.label}</span>
        </div>
        <h1 className="text-[18px] font-semibold tracking-tight">{site.label}</h1>
        <a href={site.origin} target="_blank" rel="noreferrer" className="text-[12px] text-muted-2 font-mono mt-0.5 hover:text-accent">
          {new URL(site.origin).host}
        </a>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-6 border-t border-border pt-6">{children}</div>
    </div>
  );
}
