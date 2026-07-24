"use client";

import { useState } from "react";

/**
 * The customer's console API token — used by CLI tooling (the Claude Code
 * prototype skill) to read briefs / source status and cut versions. Read-mostly,
 * org-scoped; can never promote, delete, or configure.
 */
export function ApiAccessTile({ initialToken, consoleUrl, canManage }: { initialToken: string; consoleUrl: string; canManage: boolean }) {
  const [token, setToken] = useState(initialToken);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function copy(text: string, which: string) {
    try { await navigator.clipboard.writeText(text); setCopied(which); setTimeout(() => setCopied(null), 1500); } catch { /* ignore */ }
  }

  async function regenerate() {
    if (busy || !confirm("Regenerate the API token? The old one stops working immediately (update your dev environment).")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/orgs/api-token", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.token) { setToken(data.token); setRevealed(true); }
    } finally {
      setBusy(false);
    }
  }

  const envBlock = `export OPMC_URL="${consoleUrl}"\nexport OPMC_API_TOKEN="${token}"`;

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <div className="text-[15px] font-semibold">API access (Claude Code skill)</div>
        <div className="text-[13px] text-muted-2 mt-0.5">Lets the prototype skill read briefs, check builds, and cut versions from the dev machine. Org-scoped, read-mostly — it can never promote or configure.</div>
      </div>
      <div className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-lg bg-background border border-border px-3 py-2 text-[14px] font-mono truncate">
            {revealed ? token : `${token.slice(0, 10)}…${token.slice(-4)}`}
          </code>
          <button onClick={() => setRevealed((r) => !r)} className="text-[14px] text-muted-2 hover:text-foreground shrink-0">{revealed ? "Hide" : "Reveal"}</button>
          <button onClick={() => copy(token, "token")} className="text-[14px] text-accent hover:text-accent-hover font-medium shrink-0">{copied === "token" ? "Copied" : "Copy"}</button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => copy(envBlock, "env")} className="text-[13px] text-muted-2 hover:text-foreground">{copied === "env" ? "Copied env exports" : "Copy as env exports (OPMC_URL + OPMC_API_TOKEN)"}</button>
          {canManage && <button onClick={regenerate} disabled={busy} className="text-[14px] text-danger hover:opacity-80 disabled:opacity-40">{busy ? "…" : "Regenerate"}</button>}
        </div>
      </div>
    </div>
  );
}
