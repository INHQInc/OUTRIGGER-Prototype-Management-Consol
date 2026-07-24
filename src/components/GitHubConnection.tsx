"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GitConnectionStatus, RepoWriteProbe } from "@/lib/git/connection";
import { Badge } from "@/components/ui";

/**
 * Customer-level GitHub connection — mirrors the Optimizely tile. The token is
 * entered once, validated, stored server-side, never shown again. All git
 * operations for this customer (repo pickers, artifact pulls) use it.
 */
export function GitHubConnection({ initialStatus, writeProbe, canManage }: { initialStatus: GitConnectionStatus; writeProbe?: RepoWriteProbe | null; canManage: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [token, setToken] = useState("");
  const [replacing, setReplacing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(method: string, body?: unknown) {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/git/connection", {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong"); return null; }
      if (data.status) setStatus(data.status);
      router.refresh();
      return data;
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    if (!token.trim() || busy) return;
    const r = await call("POST", { token });
    if (r) { setToken(""); setReplacing(false); }
  }

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold">GitHub connection</div>
          <div className="text-[13px] text-muted-2 mt-0.5">The account this customer&apos;s repos are read through.</div>
        </div>
        {status.connected
          ? <Badge tone="ok">Connected · {status.login}</Badge>
          : status.envFallback
            ? <Badge tone="neutral">Console default</Badge>
            : <Badge tone="warn">Not connected</Badge>}
      </div>

      <div className="px-4 py-3 space-y-3">
        {error && <div className="text-[14px] text-danger">{error}</div>}

        {writeProbe && (
          writeProbe.canWrite === true ? (
            <div className="rounded-lg border border-ok/30 bg-[color-mix(in_srgb,var(--ok)_6%,transparent)] px-3 py-2 text-[14px] text-ok">
              ✓ This token can create branches in <span className="font-mono">{writeProbe.repo}</span> — builds will work.
            </div>
          ) : writeProbe.canWrite === false ? (
            <div className="rounded-lg border border-danger/40 bg-[color-mix(in_srgb,var(--danger)_7%,transparent)] px-3 py-2 text-[14px] text-danger leading-relaxed">
              ✗ This token is <b>read-only</b> on <span className="font-mono">{writeProbe.repo}</span> — “Get init script” will 403 when it tries to create the branch. Reconnect a token with <b>Contents: Read &amp; write</b> below.
            </div>
          ) : (
            <div className="rounded-lg border border-warn/40 bg-[color-mix(in_srgb,var(--warn)_6%,transparent)] px-3 py-2 text-[14px] text-warn leading-relaxed">
              Couldn’t verify write access to <span className="font-mono">{writeProbe.repo}</span>{writeProbe.reason ? ` — ${writeProbe.reason}` : ""}.
            </div>
          )
        )}

        {!status.connected || replacing ? (
          <div className="space-y-2">
            <label className="block text-[14px] text-muted">Personal Access Token</label>
            <div className="flex items-end gap-2">
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && connect()}
                spellCheck={false}
                placeholder="GitHub PAT"
                disabled={!canManage}
                className="flex-1 rounded-lg bg-background border border-border px-3 py-2 text-[15px] font-mono text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none disabled:opacity-50"
              />
              <button onClick={connect} disabled={busy || !token.trim() || !canManage} className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[15px] font-semibold hover:bg-accent-hover disabled:opacity-40 transition-colors">
                {busy ? "Verifying…" : "Connect"}
              </button>
              {replacing && (
                <button onClick={() => { setReplacing(false); setToken(""); setError(null); }} disabled={busy} className="h-9 px-3 rounded-lg text-[15px] text-muted hover:text-foreground">Cancel</button>
              )}
            </div>
            <div className="text-[13px] text-muted-2 leading-relaxed space-y-1">
              <p><span className="text-muted font-medium">Use a machine account with a fine-grained PAT, not a personal token.</span> Grant it only the customer&apos;s prototype repo(s), with Contents read/write + Pull requests read/write.</p>
              <p>Validated on connect, stored server-side, never shown again.{status.envFallback ? " Until connected, this customer uses the console's default GitHub credential." : ""}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="text-[14px] text-muted">
              <span className="font-mono text-foreground">{status.login}</span> · token <span className="font-mono text-foreground">••••{status.tokenLast4}</span>
            </div>
            {canManage && (
              <div className="flex items-center gap-3">
                <button onClick={() => setReplacing(true)} className="text-[14px] text-muted-2 hover:text-foreground">Replace</button>
                <button onClick={() => call("DELETE")} disabled={busy} className="text-[14px] text-danger hover:opacity-80">Disconnect</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
