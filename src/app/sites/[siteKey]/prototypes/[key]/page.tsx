import Link from "next/link";
import { notFound } from "next/navigation";
import { getContentStore } from "@/lib/content/store";
import { listArtifactVersions } from "@/lib/prototypes/versions";
import { Badge } from "@/components/ui";
import { ArtifactVersions } from "@/components/ArtifactVersions";
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

export default async function PrototypeDetail({ params }: { params: Promise<{ siteKey: string; key: string }> }) {
  const { siteKey, key } = await params;
  const store = await getContentStore();
  const p = await store.getPrototype(key);
  if (!p || p.siteKey !== siteKey) notFound();
  const versions = await listArtifactVersions(key);

  const h = p.hypothesis;

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <Link href={`/sites/${siteKey}/prototypes`} className="text-[11px] text-muted-2 hover:text-foreground">← Prototypes</Link>
        <div className="flex items-center gap-3 mt-1">
          <h1 className="text-[16px] font-semibold">{p.name}</h1>
          <Badge tone={STAGE_TONE[normalizeStage(p.status)]}>{STAGE_LABEL[normalizeStage(p.status)]}</Badge>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border text-[12px] font-semibold">Target</div>
        <Field label="Page">{p.targets[0] ? <span className="font-mono">{p.targets[0].url} · {p.targets[0].source}</span> : "not set"}</Field>
      </div>

      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border text-[12px] font-semibold">Brief</div>
        <Field label="Problem / opportunity">{p.brief.problem}</Field>
        <Field label="What it changes">{p.brief.change}</Field>
        <Field label="Done looks like">{p.brief.doneLooksLike}</Field>
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
        <div className="px-4 py-2.5 border-b border-border text-[12px] font-semibold">Measurement & ownership</div>
        <Field label="Primary metric">{p.metrics.primary}</Field>
        <Field label="Guardrail metrics">{p.metrics.guardrails.join(", ")}</Field>
        <Field label="Owner">{p.owner}</Field>
        <Field label="Ticket">{p.ticketUrl ? <a href={p.ticketUrl} target="_blank" rel="noreferrer" className="text-accent hover:text-accent-hover font-mono break-all">{p.ticketUrl}</a> : ""}</Field>
      </div>

      <ArtifactVersions prototypeKey={key} initialVersions={versions} />

      <div className="rounded-xl border border-dashed border-border p-4 text-[12px] text-muted-2 leading-relaxed">
        Next: promote a version through this site&apos;s environments (staging → production) — that&apos;s where the Optimizely experiment gets created.
      </div>
    </div>
  );
}
