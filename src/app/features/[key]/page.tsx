import Link from "next/link";
import { notFound } from "next/navigation";
import { readManifest } from "@/lib/features/registry";
import { buildVariationExport } from "@/lib/optimizely/export";
import { getPageVersions } from "@/lib/registry";
import { PageHeader, Badge } from "@/components/ui";
import { FeaturePreview } from "@/components/FeaturePreview";
import { CodeBlock } from "@/components/CodeBlock";
import type { FeatureStatus } from "@/lib/features/types";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<FeatureStatus, "neutral" | "accent" | "warn" | "ok"> = {
  draft: "neutral",
  "demo-ready": "accent",
  experimenting: "warn",
  "handed-off": "ok",
};

const LINT_TONE = { error: "danger", warn: "warn", info: "neutral" } as const;

export default async function FeatureDetail({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const manifest = await readManifest(key);
  if (!manifest) notFound();

  const exp = await buildVariationExport(manifest);
  const target = manifest.targets[0];
  const targetVersions = target ? await getPageVersions(target.siteKey, target.slug) : [];
  const resolvedVersion =
    target?.version === "latest" ? targetVersions[0]?.version ?? "—" : target?.version ?? "—";

  return (
    <>
      <PageHeader
        title={manifest.name}
        subtitle={key}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/features" className="h-9 px-3 flex items-center rounded-lg text-[13px] text-muted hover:text-foreground">← Features</Link>
            <Badge tone={STATUS_TONE[manifest.status]}>{manifest.status}</Badge>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {manifest.description && (
          <p className="text-[13px] text-muted mb-5 max-w-3xl leading-relaxed">{manifest.description}</p>
        )}

        <div className="grid grid-cols-[1fr_340px] gap-6">
          {/* Live preview */}
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[13px] font-semibold">QA preview</h2>
                {target && (
                  <Link href={`/pages/${target.siteKey}/${target.slug}`} className="text-[12px] text-accent hover:text-accent-hover font-medium">
                    /{target.slug.replace(/__/g, "/")} ↗
                  </Link>
                )}
              </div>
              <FeaturePreview featureKey={key} />
              <p className="text-[11px] text-muted-2 mt-2">
                Toggle Control ⇄ Variant to see the overlay. This is the exact variation JS exported to Optimizely — what you QA here is what ships.
              </p>
            </div>

            {/* Optimizely variation export */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[13px] font-semibold">Optimizely variation</h2>
                <span className="text-[11px] text-muted-2">{(exp.bytes / 1024).toFixed(1)} KB JS · {(exp.css.length / 1024).toFixed(1)} KB CSS</span>
              </div>
              <CodeBlock code={exp.variationJs} label="variation.js" />
            </div>
          </div>

          {/* Right rail */}
          <div className="space-y-6">
            {/* Target */}
            <div>
              <h2 className="text-[13px] font-semibold mb-3">Target</h2>
              <div className="rounded-xl border border-border bg-surface p-4 space-y-2 text-[12px]">
                {target ? (
                  <>
                    <Row label="Site" value={target.siteKey} />
                    <Row label="Page" value={`/${target.slug.replace(/__/g, "/")}`} mono />
                    <Row label="Version" value={target.version === "latest" ? `latest (${resolvedVersion.slice(0, 10)})` : resolvedVersion} mono />
                  </>
                ) : (
                  <span className="text-muted-2">No target set.</span>
                )}
              </div>
            </div>

            {/* Injections */}
            <div>
              <h2 className="text-[13px] font-semibold mb-3">Injection points <span className="text-muted-2 font-normal">({manifest.injections.length})</span></h2>
              <div className="rounded-xl border border-border bg-surface divide-y divide-border">
                {manifest.injections.map((inj, i) => (
                  <div key={i} className="px-4 py-3 text-[12px]">
                    <div className="flex items-center gap-2">
                      <Badge tone={inj.type === "html" ? "accent" : "neutral"}>{inj.type}</Badge>
                      {inj.mode && <span className="text-muted-2 text-[11px]">{inj.mode}</span>}
                    </div>
                    {inj.selector && <div className="font-mono text-muted mt-1.5 break-all">{inj.selector}</div>}
                    <div className="text-muted-2 text-[11px] mt-0.5">{inj.fragment ?? inj.file ?? "—"}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Robustness lint */}
            <div>
              <h2 className="text-[13px] font-semibold mb-3 flex items-center gap-2">
                Selector lint
                {exp.lint.length === 0 ? <Badge tone="ok">clean</Badge> : <Badge tone="warn">{exp.lint.length}</Badge>}
              </h2>
              <div className="rounded-xl border border-border bg-surface p-4">
                {exp.lint.length === 0 ? (
                  <p className="text-[12px] text-muted-2">No fragile selectors detected. Safe to promote to a live experiment.</p>
                ) : (
                  <ul className="space-y-2">
                    {exp.lint.map((f, i) => (
                      <li key={i} className="text-[11px]">
                        <Badge tone={LINT_TONE[f.level]}>{f.level}</Badge>
                        <span className="text-muted ml-2">{f.message}</span>
                        {f.selector && <div className="font-mono text-muted-2 mt-1 break-all">{f.selector}</div>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Live URLs */}
            {manifest.liveUrls?.length ? (
              <div>
                <h2 className="text-[13px] font-semibold mb-3">Live URL targeting</h2>
                <div className="rounded-xl border border-border bg-surface p-4 space-y-1.5">
                  {manifest.liveUrls.map((u) => (
                    <div key={u} className="text-[11px] font-mono text-muted break-all">{u}</div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-2">{label}</span>
      <span className={`text-muted ${mono ? "font-mono text-[11px]" : ""} text-right break-all`}>{value}</span>
    </div>
  );
}
