"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Environment, EnvironmentKind } from "@/lib/environments";
import { Badge } from "@/components/ui";

/** Manage a site's environments (dev/staging/production deploy targets). */
export function EnvironmentsManager({ siteKey, initialEnvironments, canManage }: { siteKey: string; initialEnvironments: Environment[]; canManage: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<EnvironmentKind>("staging");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!url.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/environments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteKey, url, label, kind }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to add environment"); return; }
      setUrl(""); setLabel("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/environments?site=${encodeURIComponent(siteKey)}&id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to remove environment"); return; }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const onlyOne = initialEnvironments.length <= 1;

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <div className="text-[13px] font-semibold">Environments</div>
        <div className="text-[11px] text-muted-2 mt-0.5">Deploy targets a prototype version is promoted through — the same build moves dev → staging → production.</div>
      </div>

      {initialEnvironments.map((e) => (
        <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border last:border-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium">{e.label}</span>
              <Badge tone={e.kind === "production" ? "accent" : "neutral"}>{e.kind}</Badge>
            </div>
            <a href={e.url} target="_blank" rel="noreferrer" className="text-[11px] font-mono text-muted-2 hover:text-accent break-all">{e.url}</a>
          </div>
          {canManage && (
            <button
              onClick={() => remove(e.id)}
              disabled={busy || onlyOne}
              title={onlyOne ? "A site must keep at least one environment" : "Remove environment"}
              className="text-[12px] text-danger hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
            >
              Remove
            </button>
          )}
        </div>
      ))}

      {canManage && (
        <div className="px-4 py-3 bg-surface-2/30 space-y-2">
          {error && <div className="text-[12px] text-danger">{error}</div>}
          <div className="flex items-end gap-2">
            <div className="flex-1 min-w-0">
              <label className="block text-[11px] text-muted-2 mb-1">Environment URL</label>
              <input value={url} onChange={(ev) => setUrl(ev.target.value)} onKeyDown={(ev) => ev.key === "Enter" && add()} spellCheck={false} placeholder="https://prep.example.com" className="w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] font-mono text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none" />
            </div>
            <div className="w-28 shrink-0">
              <label className="block text-[11px] text-muted-2 mb-1">Label</label>
              <input value={label} onChange={(ev) => setLabel(ev.target.value)} onKeyDown={(ev) => ev.key === "Enter" && add()} placeholder="optional" className="w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none" />
            </div>
            <select value={kind} onChange={(ev) => setKind(ev.target.value as EnvironmentKind)} className="shrink-0 rounded-lg bg-background border border-border px-2 py-2 text-[13px] text-foreground focus:border-accent focus:outline-none">
              <option value="development">development</option>
              <option value="staging">staging</option>
              <option value="production">production</option>
            </select>
            <button onClick={add} disabled={busy || !url.trim()} className="h-9 px-4 shrink-0 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40 transition-colors">Add</button>
          </div>
        </div>
      )}
    </div>
  );
}
