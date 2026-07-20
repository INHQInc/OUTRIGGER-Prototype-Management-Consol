"use client";

import { useState, useEffect } from "react";

/** Shows the one-line loader snippet to install on a Live site's pages. */
export function LoaderSnippet({ siteKey }: { siteKey: string }) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => setOrigin(window.location.origin), []);
  const snippet = origin ? `<script src="${origin}/loader/${siteKey}" async></script>` : "";

  function copy() {
    if (!snippet) return;
    navigator.clipboard?.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <span className="text-[13px] font-semibold">Live loader</span>
        {copied && <span className="text-[11px] text-ok">copied</span>}
      </div>
      <div className="p-4 space-y-3">
        <p className="text-[12px] text-muted-2 leading-relaxed">
          Add this one tag to the site&apos;s pages (prep first). It&apos;s inert for normal visitors — it only runs a
          prototype when a page is opened with <span className="font-mono text-muted">?opmc=&lt;prototype-key&gt;</span>.
          Share that link to preview a prototype on the real site.
        </p>
        <div className="flex items-stretch gap-2">
          <code className="flex-1 rounded-lg bg-background border border-border px-3 py-2 text-[11px] font-mono text-muted break-all">{snippet || "…"}</code>
          <button onClick={copy} disabled={!snippet} className="px-3 rounded-lg border border-border text-[12px] text-muted hover:text-foreground shrink-0 disabled:opacity-40">Copy</button>
        </div>
      </div>
    </div>
  );
}
