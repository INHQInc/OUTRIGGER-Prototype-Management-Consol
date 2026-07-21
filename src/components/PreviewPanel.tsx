"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";

interface Env { id: string; label: string; kind: string; url: string }

function linkFor(env: Env, previewPath: string, prototypeKey: string): string {
  let base = env.url;
  try { base = new URL(previewPath || "/", env.url).toString(); } catch { /* keep origin */ }
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}opmc=${encodeURIComponent(prototypeKey)}`;
}

/** Review: the token link on the primary lower environment (others tucked away). */
export function PreviewPanel({ prototypeKey, environments, previewPath }: { prototypeKey: string; environments: Env[]; previewPath: string }) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(url: string, id: string) {
    try { await navigator.clipboard.writeText(url); setCopied(id); setTimeout(() => setCopied(null), 1500); } catch { /* ignore */ }
  }

  const primary = environments.find((e) => e.kind === "staging")
    ?? environments.find((e) => e.kind === "development")
    ?? environments[0];
  const rest = environments.filter((e) => e.id !== primary?.id);

  const row = (env: Env) => {
    const url = linkFor(env, previewPath, prototypeKey);
    return (
      <div key={env.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
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
  };

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border">
        <span className="text-[12px] font-semibold">Review</span>
        <span className="text-[11px] text-muted-2 ml-2">Share this link — the real page with the prototype injected, visible only to link-holders.</span>
      </div>
      {!primary ? (
        <div className="px-4 py-4 text-[12px] text-muted-2">No environments yet — add one in Configuration → Environments.</div>
      ) : (
        <>
          {row(primary)}
          {rest.length > 0 && (
            <details className="border-t border-border">
              <summary className="px-4 py-2 text-[11px] text-muted-2 cursor-pointer hover:text-foreground">Other environments ({rest.length})</summary>
              <div className="divide-y divide-border border-t border-border">{rest.map(row)}</div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
