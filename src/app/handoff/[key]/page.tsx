"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader, Badge } from "@/components/ui";
import { DiffView } from "@/components/DiffView";

interface DiffRow { left: string | null; right: string | null; type: "same" | "add" | "del" }
interface Piece {
  kind: "html" | "css" | "js";
  confidence: string;
  placement: string;
  note?: string;
  targetFile: string | null;
  targetLabel: string;
  selector?: string;
  candidates?: { block: string; file: string }[];
  chosen?: string | null;
  hasOriginal: boolean;
  rows: DiffRow[];
}
interface Pkg {
  featureKey: string; featureName: string; summary: string;
  primaryBlock: string | null; warnings: string[]; pieces: Piece[];
}

const CONF_TONE: Record<string, "ok" | "warn" | "danger"> = { high: "ok", medium: "warn", low: "danger" };

export default function HandoffDetail({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const [pkg, setPkg] = useState<Pkg | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/handoff/${key}`);
    if (!res.ok) { setErr((await res.json()).error ?? "Failed"); return; }
    setPkg(await res.json());
  }, [key]);

  useEffect(() => { load(); }, [load]);

  async function pick(selector: string, targetFile: string) {
    await fetch(`/api/handoff/${key}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selector, targetFile }),
    });
    load();
  }

  return (
    <>
      <PageHeader
        title={`Handoff · ${pkg?.featureName ?? key}`}
        subtitle="Origin ↔ integrated source compare"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/handoff" className="h-9 px-3 flex items-center rounded-lg text-[13px] text-muted hover:text-foreground">← Handoff</Link>
            <a href={`/preview/feature/${key}?variant=1`} target="_blank" rel="noreferrer" className="h-9 px-3 flex items-center rounded-lg text-[13px] text-muted hover:text-foreground border border-border">Prototype ↗</a>
            <a href={`/api/handoff/${key}/patch`} className="h-9 px-4 flex items-center rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover">Download .patch</a>
          </div>
        }
      />
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
        {err && <div className="text-[13px] text-danger">{err}</div>}
        {!pkg && !err && <div className="text-[13px] text-muted-2">Computing compare…</div>}

        {pkg && (
          <>
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-[13px] text-muted leading-relaxed">{pkg.summary}</p>
              {pkg.warnings.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {pkg.warnings.map((w, i) => (
                    <li key={i} className="text-[11px] text-muted-2">• {w}</li>
                  ))}
                </ul>
              )}
            </div>

            {pkg.pieces.map((p, i) => (
              <div key={i} className="space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge tone={p.kind === "html" ? "accent" : "neutral"}>{p.kind}</Badge>
                  <Badge tone={CONF_TONE[p.confidence]}>{p.confidence} confidence</Badge>
                  <span className="text-[12px] text-muted">{p.placement}</span>
                </div>

                {/* Candidate picker for HTML pieces with multiple owning views */}
                {p.kind === "html" && p.candidates && p.candidates.length > 0 && (
                  <div className="flex items-center gap-2 text-[12px]">
                    <span className="text-muted-2">Target view:</span>
                    <select
                      value={p.chosen ?? p.targetFile ?? ""}
                      onChange={(e) => p.selector && pick(p.selector, e.target.value)}
                      className="h-8 rounded-md bg-background border border-border px-2 text-[11px] font-mono focus:border-accent focus:outline-none max-w-[520px]"
                    >
                      {p.candidates.map((c) => (
                        <option key={c.file} value={c.file}>{c.block} — {c.file}</option>
                      ))}
                    </select>
                    {p.candidates.length > 1 && <span className="text-muted-2 text-[11px]">{p.candidates.length} candidates — pick the right one</span>}
                  </div>
                )}
                {p.note && <div className="text-[11px] text-muted-2">{p.note}</div>}

                <DiffView
                  rows={p.rows}
                  leftLabel={p.hasOriginal ? `origin · ${p.targetFile}` : `new file · ${p.targetFile ?? p.targetLabel}`}
                  rightLabel={p.hasOriginal ? "integrated (proposed)" : "integrated"}
                />
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}
