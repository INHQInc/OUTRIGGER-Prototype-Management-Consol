"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ExperimentationStatus } from "@/lib/experimentation/types";
import { Badge } from "@/components/ui";

/**
 * Brand-level A/B platform connection. Optimizely-first; the layout is
 * provider-agnostic so other platforms slot in later. The API token is entered
 * here by the user and stored server-side — it's never sent back to the browser.
 */
export function ExperimentationSettings({ initialStatus, canManage }: { initialStatus: ExperimentationStatus; canManage: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projSel, setProjSel] = useState(initialStatus.defaultProjectId ?? "");
  const [projSaved, setProjSaved] = useState(false);

  async function saveProject() {
    if (busy || !projSel) return;
    const r = await call("PATCH", { defaultProjectId: projSel });
    if (r) setProjSaved(true);
  }

  async function call(method: string, body?: unknown) {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/experimentation", {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong"); return null; }
      if (data.status) { setStatus(data.status); setProjSel(data.status.defaultProjectId ?? ""); }
      router.refresh();
      return data;
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    if (!token.trim() || busy) return;
    const r = await call("POST", { apiToken: token });
    if (r) { setToken(""); setReplacing(false); }
  }

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold">Experimentation platform</div>
          <div className="text-[11px] text-muted-2 mt-0.5">The A/B testing platform this brand promotes experiments into.</div>
        </div>
        {status.connected
          ? <Badge tone="ok">Connected</Badge>
          : <Badge tone="neutral">Not connected</Badge>}
      </div>

      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-surface-2 border border-border flex items-center justify-center text-[12px] font-bold">O</div>
          <div className="text-[13px] font-medium">Optimizely</div>
          <span className="text-[10px] text-muted-2">Web Experimentation · other platforms coming</span>
        </div>

        {error && <div className="text-[12px] text-danger">{error}</div>}

        {!status.connected || replacing ? (
          <div className="space-y-2">
            <label className="block text-[12px] text-muted">Personal Access Token</label>
            <div className="flex items-end gap-2">
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && connect()}
                spellCheck={false}
                placeholder="Optimizely API token"
                disabled={!canManage}
                className="flex-1 rounded-lg bg-background border border-border px-3 py-2 text-[13px] font-mono text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none disabled:opacity-50"
              />
              <button onClick={connect} disabled={busy || !token.trim() || !canManage} className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40 transition-colors">
                {busy ? "Verifying…" : "Connect"}
              </button>
              {replacing && (
                <button onClick={() => { setReplacing(false); setToken(""); setError(null); }} disabled={busy} className="h-9 px-3 rounded-lg text-[13px] text-muted hover:text-foreground">Cancel</button>
              )}
            </div>
            <div className="text-[11px] text-muted-2 leading-relaxed space-y-1">
              <p><span className="text-muted font-medium">Use a dedicated service-account user, not a personal admin token.</span> Tokens are user-scoped (never project-scoped) — they reach every project that user can access. Create a machine user in the customer&apos;s Optimizely, grant it only the intended project(s) (e.g. Prep), then generate its token under Profile → API Access.</p>
              <p>Validated against its projects on connect, stored server-side, never shown again. The console only ever creates <span className="text-muted">paused drafts</span> — it never starts traffic.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[12px] text-muted">Token <span className="font-mono text-foreground">••••{status.tokenLast4}</span></div>
              {canManage && (
                <div className="flex items-center gap-3">
                  <button onClick={() => setReplacing(true)} className="text-[12px] text-muted-2 hover:text-foreground">Replace</button>
                  <button onClick={() => call("DELETE")} disabled={busy} className="text-[12px] text-danger hover:opacity-80">Disconnect</button>
                </div>
              )}
            </div>

            {status.error ? (
              <div className="text-[12px] text-danger">Couldn&apos;t reach Optimizely: {status.error}</div>
            ) : (
              <div>
                <label className="block text-[12px] text-muted mb-1.5">Default project</label>
                <div className="flex items-center gap-2">
                  <select
                    value={projSel}
                    onChange={(e) => { setProjSel(e.target.value); setProjSaved(false); }}
                    disabled={busy || !canManage}
                    className="flex-1 rounded-lg bg-background border border-border px-3 py-2 text-[13px] text-foreground focus:border-accent focus:outline-none disabled:opacity-50"
                  >
                    <option value="" disabled>Select a project…</option>
                    {status.projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
                    ))}
                  </select>
                  <button
                    onClick={saveProject}
                    disabled={busy || !canManage || !projSel || projSel === (status.defaultProjectId ?? "")}
                    className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                  >
                    {busy ? "Saving…" : "Save"}
                  </button>
                </div>
                <p className="text-[11px] mt-1.5">
                  {projSaved && projSel === (status.defaultProjectId ?? "") ? (
                    <span className="text-ok">Default project saved.</span>
                  ) : projSel !== (status.defaultProjectId ?? "") ? (
                    <span className="text-warn">Unsaved change — click Save to apply.</span>
                  ) : (
                    <span className="text-muted-2">{status.projects.length} project{status.projects.length === 1 ? "" : "s"} available on this token.</span>
                  )}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
