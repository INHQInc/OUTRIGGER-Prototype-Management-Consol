"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Environment } from "@/lib/environments";
import type { ArtifactVersion } from "@/lib/prototypes/types";
import { defaultVehicle, type Promotion } from "@/lib/promotions/types";
import { Badge, TimeAgo } from "@/components/ui";

function currentByEnv(promotions: Promotion[]): Record<string, Promotion> {
  const out: Record<string, Promotion> = {};
  for (const p of promotions) if (p.status === "active" && !out[p.environmentId]) out[p.environmentId] = p;
  return out;
}

/**
 * Experiment: one primary action — send the latest version to production
 * (a PAUSED Optimizely draft; a human starts traffic). The full per-environment
 * matrix and history live behind a disclosure.
 */
export function PromotePanel({ prototypeKey, environments, versions, initialPromotions, canPromote }: {
  prototypeKey: string;
  environments: Environment[];
  versions: ArtifactVersion[];
  initialPromotions: Promotion[];
  canPromote: boolean;
}) {
  const router = useRouter();
  const [promotions, setPromotions] = useState(initialPromotions);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [busyEnv, setBusyEnv] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = currentByEnv(promotions);
  const latest = versions[0];
  const prodEnv = environments.find((e) => e.kind === "production");
  const prodLive = prodEnv ? current[prodEnv.id] : undefined;

  async function promote(envId: string, versionId?: string) {
    const vid = versionId ?? picks[envId] ?? latest?.id;
    if (!vid || busyEnv) return;
    setBusyEnv(envId); setError(null);
    try {
      const res = await fetch("/api/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prototypeKey, versionId: vid, environmentId: envId }),
      });
      const data = await res.json().catch(() => ({}));
      // Refetch history either way — a failed promotion is persisted as a "failed" row.
      const list = await fetch(`/api/promotions?key=${encodeURIComponent(prototypeKey)}`);
      if (list.ok) setPromotions((await list.json()).promotions ?? []);
      if (!res.ok) { setError(data.error ?? "Promotion failed"); return; }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Promotion failed");
    } finally {
      setBusyEnv(null);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border">
        <span className="text-[12px] font-semibold">Experiment</span>
        <span className="text-[11px] text-muted-2 ml-2">Creates a paused Optimizely draft with the frozen version — a human starts traffic.</span>
      </div>

      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="text-[12px] min-w-0">
          {prodLive ? (
            <span className="text-muted">
              Live on <span className="font-medium text-foreground">{prodLive.environmentLabel}</span>: v{prodLive.versionNumber}
              {prodLive.experimentUrl && <> · <a href={prodLive.experimentUrl} target="_blank" rel="noreferrer" className="text-accent hover:text-accent-hover">Open in Optimizely ↗</a></>}
            </span>
          ) : (
            <span className="text-muted-2">
              {!prodEnv ? "No production environment configured." : !latest ? "Cut a version first (Build tab)." : `Ready: v${latest.version} → ${prodEnv.label}.`}
            </span>
          )}
        </div>
        {canPromote && prodEnv && (
          <button
            onClick={() => promote(prodEnv.id, latest?.id)}
            disabled={!latest || busyEnv === prodEnv.id}
            className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {busyEnv === prodEnv.id ? "Sending…" : prodLive ? `Send v${latest?.version} to Optimizely` : "Send to Optimizely"}
          </button>
        )}
      </div>

      {error && <div className="px-4 pb-2 text-[12px] text-danger">{error}</div>}

      <details className="border-t border-border">
        <summary className="px-4 py-2 text-[11px] text-muted-2 cursor-pointer hover:text-foreground">All environments & history</summary>
        <div className="border-t border-border">
          {environments.map((env) => {
            const cur = current[env.id];
            const vehicle = defaultVehicle(env.kind);
            return (
              <div key={env.id} className="px-4 py-3 border-b border-border last:border-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[13px] font-medium">{env.label}</span>
                    <Badge tone={env.kind === "production" ? "accent" : "neutral"}>{env.kind}</Badge>
                    <span className="text-[10px] text-muted-2 uppercase tracking-wide">{vehicle}</span>
                  </div>
                  {canPromote && (
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={picks[env.id] ?? latest?.id ?? ""}
                        onChange={(e) => setPicks((p) => ({ ...p, [env.id]: e.target.value }))}
                        className="rounded-lg bg-background border border-border px-2 py-1.5 text-[12px] text-foreground focus:border-accent focus:outline-none"
                      >
                        {versions.map((v) => <option key={v.id} value={v.id}>v{v.version} · {v.gitSha.slice(0, 7)}</option>)}
                      </select>
                      <button onClick={() => promote(env.id)} disabled={!versions.length || busyEnv === env.id} className="h-8 px-3 rounded-lg bg-accent text-accent-fg text-[12px] font-semibold hover:bg-accent-hover disabled:opacity-40 transition-colors">
                        {busyEnv === env.id ? "Promoting…" : "Promote"}
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-1.5 text-[11px]">
                  {cur ? (
                    <span className="text-muted">
                      Live: <span className="font-semibold text-foreground">v{cur.versionNumber}</span> · <TimeAgo iso={cur.promotedAt} />
                      {cur.promotedBy && <> · {cur.promotedBy}</>}
                      {cur.experimentUrl && <> · <a href={cur.experimentUrl} target="_blank" rel="noreferrer" className="text-accent hover:text-accent-hover">Optimizely ↗</a></>}
                    </span>
                  ) : (
                    <span className="text-muted-2">Nothing deployed here yet.</span>
                  )}
                </div>
              </div>
            );
          })}
          {promotions.length > 0 && (
            <div className="border-t border-border">
              <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-2">History</div>
              {promotions.slice(0, 8).map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-2 text-[11px] border-t border-border">
                  <span className="text-muted truncate">v{p.versionNumber} → {p.environmentLabel} · {p.vehicle}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <Badge tone={p.status === "active" ? "ok" : p.status === "failed" ? "danger" : "neutral"}>{p.status}</Badge>
                    <span className="text-muted-2"><TimeAgo iso={p.promotedAt} /></span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
