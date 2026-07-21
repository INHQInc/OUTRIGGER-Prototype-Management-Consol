import Link from "next/link";
import { notFound } from "next/navigation";
import { getContentStore } from "@/lib/content/store";
import { getSite } from "@/lib/sites";
import { canAccessOrg } from "@/lib/active-org";
import { listArtifactVersions } from "@/lib/prototypes/versions";
import { listEnvironments } from "@/lib/environments";
import { listPromotions } from "@/lib/promotions";
import { Badge } from "@/components/ui";
import { ArtifactVersions } from "@/components/ArtifactVersions";
import { SourcePanel } from "@/components/SourcePanel";
import { PreviewPanel } from "@/components/PreviewPanel";
import { PromotePanel } from "@/components/PromotePanel";
import { PipelineHeader } from "@/components/PipelineHeader";
import { DeletePrototype } from "@/components/DeletePrototype";
import { STAGE_TONE, STAGE_LABEL, normalizeStage } from "@/lib/prototypes/types";

export const dynamic = "force-dynamic";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 border-b border-border last:border-0">
      <div className="text-[11px] text-muted-2 mb-1">{label}</div>
      <div className="text-[13px] leading-relaxed">{children || <span className="text-muted-2">—</span>}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-2 px-1 pt-1">{children}</div>;
}

/** First target's path, for building the preview URL (patterns collapsed). */
function toPath(url?: string): string {
  if (!url) return "/";
  try { return new URL(url).pathname.replace(/\/\*+$/, "") || "/"; }
  catch { return url.replace(/\*+$/, "") || "/"; }
}

/** The prototype workspace — top-level, the primary object (site is context, not chrome). */
export default async function PrototypeWorkspace({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const store = await getContentStore();
  const p = await store.getPrototype(key);
  if (!p) notFound();
  const site = await getSite(p.siteKey);
  // Tenant isolation via the owning site's org.
  if (site?.orgId && !(await canAccessOrg(site.orgId))) notFound();

  const [versions, environments, promotions] = await Promise.all([
    listArtifactVersions(key),
    listEnvironments(p.siteKey),
    listPromotions(key),
  ]);
  const stage = normalizeStage(p.status);
  const h = p.hypothesis;
  const previewPath = toPath(p.targets[0]?.url);

  return (
    <>
      <div className="px-8 pt-5 pb-4 border-b border-border">
        <div className="text-[11px] text-muted-2 mb-1">
          <Link href="/" className="hover:text-foreground">Prototypes</Link>
          <span className="mx-1.5">›</span>
          <span className="text-muted">{p.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-[18px] font-semibold tracking-tight">{p.name}</h1>
          <Badge tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</Badge>
        </div>
        {site && (
          <div className="text-[12px] text-muted-2 mt-0.5">
            on <Link href={`/sites/${site.siteKey}`} className="text-muted hover:text-accent">{site.label}</Link>
            {p.targets[0] && <span className="font-mono"> · {p.targets[0].url}</span>}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="space-y-5 max-w-2xl">
          <PipelineHeader prototypeKey={key} initialStage={stage} />

          <section className="space-y-2.5">
            <SectionLabel>Build</SectionLabel>
            <SourcePanel prototypeKey={key} />
            <ArtifactVersions versions={versions} />
          </section>

          <section className="space-y-2.5">
            <SectionLabel>Review</SectionLabel>
            <PreviewPanel prototypeKey={key} environments={environments} previewPath={previewPath} />
          </section>

          <section className="space-y-2.5">
            <SectionLabel>Promote</SectionLabel>
            <PromotePanel prototypeKey={key} environments={environments} versions={versions} initialPromotions={promotions} canPromote />
          </section>

          <section className="space-y-2.5">
            <SectionLabel>Details</SectionLabel>
            <div className="rounded-xl border border-border bg-surface overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border text-[12px] font-semibold">Target pages</div>
              <Field label={p.targets.length > 1 ? `${p.targets.length} pages` : "Page"}>
                {p.targets.length ? (
                  <div className="space-y-1">
                    {p.targets.map((t, i) => (
                      <div key={i} className="font-mono">{t.url} <span className="text-muted-2">· {t.source}</span></div>
                    ))}
                  </div>
                ) : "not set"}
              </Field>
            </div>

            <div className="rounded-xl border border-border bg-surface overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border text-[12px] font-semibold">Hypothesis</div>
              <div className="px-4 py-3 text-[13px] leading-relaxed">
                We believe <span className="text-foreground font-medium">{h.change || "[change]"}</span> for{" "}
                <span className="text-foreground font-medium">{h.audience || "[audience]"}</span> will cause{" "}
                <span className="text-foreground font-medium">{h.outcome || "[outcome]"}</span>
                {h.rationale ? <> because <span className="text-foreground font-medium">{h.rationale}</span></> : ""}.
              </div>
            </div>

            <div className="rounded-xl border border-border bg-surface overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border text-[12px] font-semibold">Brief & measurement</div>
              <Field label="Problem / opportunity">{p.brief.problem}</Field>
              <Field label="What it changes">{p.brief.change}</Field>
              <Field label="Done looks like">{p.brief.doneLooksLike}</Field>
              <Field label="Primary metric">{p.metrics.primary}</Field>
              <Field label="Guardrail metrics">{p.metrics.guardrails.join(", ")}</Field>
              <Field label="Owner">{p.owner}</Field>
              <Field label="Ticket">{p.ticketUrl ? <a href={p.ticketUrl} target="_blank" rel="noreferrer" className="text-accent hover:text-accent-hover font-mono break-all">{p.ticketUrl}</a> : ""}</Field>
            </div>
          </section>

          <DeletePrototype prototypeKey={key} name={p.name} />
        </div>
      </div>
    </>
  );
}
