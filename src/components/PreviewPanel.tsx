"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";

interface Env { id: string; label: string; kind: string; url: string }

/**
 * Review links: open the prototype on a real environment via the loader
 * (token-gated ?opmc=). This is how QA / stakeholders validate the current
 * build — normal visitors see nothing.
 */
export function PreviewPanel({ prototypeKey, environments, previewPath }: { prototypeKey: string; environments: Env[]; previewPath: string }) {
  const [copied, setCopied] = useState<string | null>(null);

  function linkFor(env: Env): string {
    let base = env.url;
    try { base = new URL(previewPath || "/", env.url).toString(); } catch { /* keep origin */ }
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}opmc=${encodeURIComponent(prototypeKey)}`;
  }

  async function copy(url: string, id: string) {
    try { await navigator.clipboard.writeText(url); setCopied(id); setTimeout(() => setCopied(null), 1500); } catch { /* ignore */ }
  }

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border">
        <span className="text-[12px] font-semibold">Review</span>
        <span className="text-[11px] text-muted-2 ml-2">Open the current build on a real environment — token-gated, so only the link-holder sees it.</span>
      </div>
      {environments.length === 0 ? (
        <div className="px-4 py-4 text-[12px] text-muted-2">No environments configured. Add one in the site&apos;s settings.</div>
      ) : (
        environments.map((env) => {
          const url = linkFor(env);
          return (
            <div key={env.id} className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border last:border-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium">{env.label}</span>
                  <Badge tone={env.kind === "production" ? "accent" : "neutral"}>{env.kind}</Badge>
                </div>
                <div className="text-[11px] font-mono text-muted-2 truncate">{url}</div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button onClick={() => copy(url, env.id)} className="text-[12px] text-muted-2 hover:text-foreground">{copied === env.id ? "Copied" : "Copy"}</button>
                <a href={url} target="_blank" rel="noreferrer" className="text-[12px] text-accent hover:text-accent-hover font-medium">Open ↗</a>
              </div>
            </div>
          );
        })
      )}
      <div className="px-4 py-2 text-[11px] text-muted-2 border-t border-border">Requires the loader tag (or Optimizely snippet) on the environment. Loader serves the current repo build.</div>
    </div>
  );
}
