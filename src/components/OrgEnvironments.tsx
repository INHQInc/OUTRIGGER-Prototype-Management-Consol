"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Environment, EnvironmentKind } from "@/lib/environments";
import { Badge, TimeAgo } from "@/components/ui";

const inp = "rounded-lg bg-background border border-border px-3 py-2 text-[13px] text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none";

/**
 * The customer's environments — where prototypes are reviewed and promoted.
 * Each environment carries its own loader tag + verification status.
 */
export function OrgEnvironments({ initialEnvironments, seenAt, consoleUrl, canManage }: {
  initialEnvironments: Environment[];
  seenAt: Record<string, string | null>;
  consoleUrl: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<EnvironmentKind>("staging");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  function tagFor(env: Environment): string {
    return `<script src="${consoleUrl}/loader/${env.siteKey ?? env.id}" async></script>`;
  }
  async function copyTag(env: Environment) {
    try { await navigator.clipboard.writeText(tagFor(env)); setCopied(env.id); setTimeout(() => setCopied(null), 1500); } catch { /* ignore */ }
  }

  async function add() {
    if (!url.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/environments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, label, kind }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to add environment"); return; }
      setUrl(""); setLabel("");
      router.refresh();
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (busy || !confirm("Remove this environment? Review links and promotions pointing at it stop working.")) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/environments?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to remove"); return; }
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {canManage && (
        <div className="rounded-xl border border-border bg-surface p-3 flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <label className="block text-[11px] text-muted-2 mb-1">Environment URL</label>
            <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} spellCheck={false} placeholder="https://prep.example.com" className={`${inp} w-full font-mono`} />
          </div>
          <div className="w-32 shrink-0">
            <label className="block text-[11px] text-muted-2 mb-1">Label</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="optional" className={`${inp} w-full`} />
          </div>
          <select value={kind} onChange={(e) => setKind(e.target.value as EnvironmentKind)} className={`${inp} shrink-0`}>
            <option value="development">development</option>
            <option value="staging">staging</option>
            <option value="production">production</option>
          </select>
          <button onClick={add} disabled={busy || !url.trim()} className="h-9 px-4 shrink-0 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40">Add</button>
        </div>
      )}
      {error && <div className="text-[12px] text-danger">{error}</div>}

      {initialEnvironments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <div className="text-[13px] font-medium">No environments yet.</div>
          <div className="text-[12px] text-muted-2 mt-1">Add the customer&apos;s site URL(s) — prototypes are reviewed and promoted on these.</div>
        </div>
      ) : (
        initialEnvironments.map((env) => {
          const seen = seenAt[env.id] ?? null;
          return (
            <div key={env.id} className="rounded-xl border border-border bg-surface overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold">{env.label}</span>
                    <Badge tone={env.kind === "production" ? "accent" : "neutral"}>{env.kind}</Badge>
                    {seen
                      ? <span className="text-[11px] text-ok">✓ loader verified · <TimeAgo iso={seen} /></span>
                      : <span className="text-[11px] text-muted-2">loader not detected</span>}
                  </div>
                  <a href={env.url} target="_blank" rel="noreferrer" className="text-[11px] font-mono text-muted-2 hover:text-accent break-all">{env.url}</a>
                </div>
                {canManage && <button onClick={() => remove(env.id)} disabled={busy} className="text-[12px] text-danger hover:opacity-80 shrink-0">Remove</button>}
              </div>
              <div className="px-4 py-2.5 border-t border-border bg-surface-2/20 flex items-center justify-between gap-3">
                <code className="text-[11px] font-mono text-muted truncate">{tagFor(env)}</code>
                <button onClick={() => copyTag(env)} className="text-[12px] text-accent hover:text-accent-hover font-medium shrink-0">{copied === env.id ? "Copied" : "Copy tag"}</button>
              </div>
              {!seen && (
                <div className="px-4 py-2 border-t border-border text-[11px] text-muted-2">Install the tag in the environment&apos;s CMS/layout, then open the site once — it verifies itself here.</div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
