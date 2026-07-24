"use client";

import { useState } from "react";

/**
 * Optimizely handoff bundle — everything to run this prototype as a Web
 * Experiment by hand: the frozen variation.js (paste as the variation's custom
 * JS), the URL targeting, the name + metric, and the steps. The variation is
 * self-contained (injects its own CSS/HTML/behavior), so it drops straight in.
 */
export function OptimizelyBundle({ prototypeKey, name, metric, targetUrls, version, variationJs }: {
  prototypeKey: string;
  name: string;
  metric: string;
  targetUrls: string[];
  version?: number;
  variationJs?: string | null;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(text: string, id: string) {
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 1500); } catch { /* ignore */ }
  }
  function download() {
    if (!variationJs) return;
    const blob = new Blob([variationJs], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${prototypeKey}-v${version}.js`; a.click();
    URL.revokeObjectURL(url);
  }

  const header = (
    <div className="px-4 py-2.5 border-b border-border">
      <span className="text-[14px] font-semibold">Optimizely bundle</span>
      <span className="text-[13px] text-muted-2 ml-2">Everything to run this as a Web Experiment by hand.</span>
    </div>
  );

  if (!version) {
    return <div className="rounded-xl border border-border bg-surface overflow-hidden">{header}<div className="px-4 py-3 text-[14px] text-muted-2">Cut a version first — the bundle packages the frozen build.</div></div>;
  }
  if (!variationJs) {
    return <div className="rounded-xl border border-border bg-surface overflow-hidden">{header}<div className="px-4 py-3 text-[14px] text-warn">v{version} has no code snapshot — cut a fresh version from repo.</div></div>;
  }

  const bytes = variationJs.length;
  return (
    <div className="rounded-xl border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] overflow-hidden">
      {header}
      <div className="p-4 space-y-4 text-[14px]">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="font-semibold">1 · Variation code <span className="text-muted-2 font-normal">· v{version} · {bytes.toLocaleString()} bytes</span></span>
            <div className="flex items-center gap-3">
              <button onClick={() => copy(variationJs, "js")} className="text-accent hover:text-accent-hover font-medium">{copied === "js" ? "Copied" : "Copy"}</button>
              <button onClick={download} className="text-muted-2 hover:text-foreground">Download .js</button>
            </div>
          </div>
          <p className="text-[13px] text-muted-2">Paste as the variation&apos;s <b>custom JavaScript</b> — it&apos;s self-contained (injects its own CSS/HTML/behavior), so nothing else to add.</p>
        </div>

        <div>
          <div className="font-semibold mb-1">2 · URL targeting</div>
          <div className="space-y-1">
            {targetUrls.length === 0 ? <span className="text-muted-2">No target pages set.</span> : targetUrls.map((u) => (
              <div key={u} className="flex items-center justify-between gap-3">
                <span className="font-mono text-[13px] text-muted truncate">{u}</span>
                <button onClick={() => copy(u, u)} className="text-muted-2 hover:text-foreground shrink-0">{copied === u ? "Copied" : "Copy"}</button>
              </div>
            ))}
          </div>
          <p className="text-[13px] text-muted-2 mt-1">Target the experiment to these page(s) (exact URL, or a path match).</p>
        </div>

        <div>
          <div className="font-semibold mb-1">3 · Experiment</div>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <span className="text-muted-2">Name</span><span>{name}</span>
            <span className="text-muted-2">Primary metric</span><span>{metric || <span className="text-warn">— set one on the Brief tab</span>}</span>
          </div>
        </div>

        <ol className="list-decimal ml-4 space-y-1 text-[13px] text-muted-2 border-t border-border/60 pt-3">
          <li>In Optimizely, create a new <b>Web Experiment</b>.</li>
          <li>Set URL targeting to the page(s) in step 2.</li>
          <li>Add a variation → paste the step-1 code as its <b>custom JavaScript</b>.</li>
          <li>Set the primary metric.</li>
          <li>Save as a <b>paused draft</b>; a human starts traffic when ready.</li>
        </ol>
      </div>
    </div>
  );
}
