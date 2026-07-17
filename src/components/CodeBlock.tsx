"use client";

import { useState } from "react";

export function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="h-10 border-b border-border flex items-center justify-between px-3">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 text-[12px] font-medium text-muted hover:text-foreground">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>
            <path d="M9 18l6-6-6-6" />
          </svg>
          {label ?? "Code"} <span className="text-muted-2">({(code.length / 1024).toFixed(1)} KB)</span>
        </button>
        <button onClick={copy} className="text-[11px] text-accent hover:text-accent-hover font-medium">
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      {open && (
        <pre className="p-4 text-[11px] font-mono text-muted overflow-x-auto max-h-96 overflow-y-auto leading-relaxed">
          {code}
        </pre>
      )}
    </div>
  );
}
