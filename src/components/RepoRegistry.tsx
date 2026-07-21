"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { OrgRepo } from "@/lib/git/types";
import { Badge } from "@/components/ui";

interface AccountRepo { fullName: string; private: boolean; defaultBranch: string }

/** Brand-level repo registry — the repos this customer's prototypes live in. */
export function RepoRegistry({ initialRepos, canManage }: { initialRepos: OrgRepo[]; canManage: boolean }) {
  const router = useRouter();
  const [repos, setRepos] = useState(initialRepos);
  const [account, setAccount] = useState<AccountRepo[]>([]);
  const [adding, setAdding] = useState(false);
  const [repo, setRepo] = useState("");
  const [baseBranch, setBaseBranch] = useState("main");
  const [artifactPath, setArtifactPath] = useState("dist/variation.js");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/git/repos")
      .then((r) => (r.ok ? r.json() : { repos: [] }))
      .then((d) => setAccount(d.repos ?? []))
      .catch(() => setAccount([]));
  }, []);

  function onRepoInput(value: string) {
    setRepo(value);
    const match = account.find((r) => r.fullName === value.trim());
    if (match) setBaseBranch(match.defaultBranch);
  }

  async function call(body?: unknown, method = "POST", query = "") {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/orgs/repos${query}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong"); return false; }
      setRepos(data.repos ?? []);
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!repo.trim() || busy) return;
    if (await call({ repo, baseBranch, artifactPath })) { setRepo(""); setAdding(false); }
  }

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold">Repositories</div>
          <div className="text-[11px] text-muted-2 mt-0.5">The brand&apos;s repos — each prototype picks one (+ its branch).</div>
        </div>
        {canManage && <button onClick={() => setAdding((a) => !a)} className="text-[12px] text-accent hover:text-accent-hover font-medium">{adding ? "Cancel" : "+ Add repo"}</button>}
      </div>

      {adding && (
        <div className="px-4 py-3 border-b border-border bg-surface-2/30 space-y-2">
          {error && <div className="text-[12px] text-danger">{error}</div>}
          <div>
            <label className="block text-[11px] text-muted-2 mb-1">Repo</label>
            <input list="registry-repo-options" value={repo} onChange={(e) => onRepoInput(e.target.value)} spellCheck={false} placeholder={account.length ? "pick from the connected account or type owner/repo" : "owner/repo"} className="w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] font-mono focus:border-accent focus:outline-none" />
            <datalist id="registry-repo-options">
              {account.map((r) => <option key={r.fullName} value={r.fullName}>{r.private ? "private" : "public"}</option>)}
            </datalist>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-muted-2 mb-1">Base branch</label>
              <input value={baseBranch} onChange={(e) => setBaseBranch(e.target.value)} spellCheck={false} className="w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] font-mono focus:border-accent focus:outline-none" />
            </div>
            <div>
              <label className="block text-[11px] text-muted-2 mb-1">Built variation path</label>
              <input value={artifactPath} onChange={(e) => setArtifactPath(e.target.value)} spellCheck={false} className="w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] font-mono focus:border-accent focus:outline-none" />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={add} disabled={busy || !repo.trim()} className="h-8 px-3 rounded-lg bg-accent text-accent-fg text-[12px] font-semibold hover:bg-accent-hover disabled:opacity-40">Add repository</button>
          </div>
        </div>
      )}

      {!adding && error && <div className="px-4 py-2 text-[12px] text-danger">{error}</div>}

      {repos.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px] text-muted-2">No repos registered.{canManage ? " Add the repo(s) this brand's prototypes live in." : ""}</div>
      ) : (
        repos.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border last:border-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-mono font-medium truncate">{r.fullName}</span>
                {r.isDefault && <Badge tone="accent">default</Badge>}
              </div>
              <div className="text-[11px] text-muted-2 font-mono">{r.baseBranch} · {r.artifactPath}</div>
            </div>
            {canManage && (
              <div className="flex items-center gap-3 shrink-0">
                {!r.isDefault && <button onClick={() => call({ setDefault: r.id })} disabled={busy} className="text-[12px] text-muted-2 hover:text-foreground">Make default</button>}
                <button onClick={() => call(undefined, "DELETE", `?id=${encodeURIComponent(r.id)}`)} disabled={busy} className="text-[12px] text-danger hover:opacity-80">Remove</button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
