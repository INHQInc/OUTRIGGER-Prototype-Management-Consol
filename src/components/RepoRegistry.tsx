"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { OrgRepo } from "@/lib/git/types";
import { Badge } from "@/components/ui";

interface AccountRepo { fullName: string; private: boolean; defaultBranch: string }

/**
 * Brand-level repo registry — the repos this customer's prototypes live in.
 * Kept deliberately simple: a repo is a repo. Every repo added here is a GitHub
 * prototypes repo (the console pulls built artifacts from it); base branch is
 * auto-detected and the artifact path defaults to dist/variation.js.
 */
export function RepoRegistry({ initialRepos, canManage }: { initialRepos: OrgRepo[]; canManage: boolean }) {
  const router = useRouter();
  const [repos, setRepos] = useState(initialRepos);
  const [account, setAccount] = useState<AccountRepo[]>([]);
  const [adding, setAdding] = useState(false);
  const [repo, setRepo] = useState("");
  const [baseBranch, setBaseBranch] = useState("main");
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
    setBaseBranch(match?.defaultBranch || "main");
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
    // Every registry repo is a GitHub prototypes repo with the default artifact path.
    if (await call({ repo: repo.trim(), baseBranch, artifactPath: "dist/variation.js", roles: ["prototypes"], provider: "github" })) {
      setRepo(""); setAdding(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <div className="text-[15px] font-semibold">Repositories</div>
          <div className="text-[13px] text-muted-2 mt-0.5">The repos this brand&apos;s prototypes live in — each prototype picks one and a branch.</div>
        </div>
        {canManage && <button onClick={() => { setAdding((a) => !a); setError(null); }} className="text-[14px] text-accent hover:text-accent-hover font-medium">{adding ? "Cancel" : "+ Add repo"}</button>}
      </div>

      {adding && (
        <div className="px-4 py-3 border-b border-border bg-surface-2/30 space-y-2">
          {error && <div className="text-[14px] text-danger">{error}</div>}
          <label className="block text-[13px] text-muted-2">Repository</label>
          <div className="flex items-center gap-2">
            <input
              list="registry-repo-options"
              value={repo}
              onChange={(e) => onRepoInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              spellCheck={false}
              placeholder={account.length ? "pick from the connected account, or type owner/repo" : "owner/repo"}
              className="w-full rounded-lg bg-background border border-border px-3 py-2 text-[15px] font-mono focus:border-accent focus:outline-none"
            />
            <button onClick={add} disabled={busy || !repo.trim()} className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[15px] font-semibold hover:bg-accent-hover disabled:opacity-40 shrink-0">Add</button>
          </div>
          <datalist id="registry-repo-options">
            {account.map((r) => <option key={r.fullName} value={r.fullName}>{r.private ? "private" : "public"}</option>)}
          </datalist>
          <div className="text-[12.5px] text-muted-2">Needs a <span className="font-mono">starter</span> template branch — prototype branches fork from it.</div>
        </div>
      )}

      {!adding && error && <div className="px-4 py-2 text-[14px] text-danger">{error}</div>}

      {repos.length === 0 ? (
        <div className="px-4 py-6 text-center text-[14px] text-muted-2">No repos registered.{canManage ? " Add the repo this brand's prototypes live in." : ""}</div>
      ) : (
        repos.map((r) => {
          const isDefault = r.defaultFor.includes("prototypes");
          return (
            <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border last:border-0">
              <div className="min-w-0 flex items-center gap-2 flex-wrap">
                <span className="text-[15px] font-mono font-medium truncate">{r.fullName}</span>
                {isDefault && <Badge tone="accent">default</Badge>}
              </div>
              {canManage && (
                <div className="flex items-center gap-3 shrink-0">
                  {!isDefault && (
                    <button onClick={() => call({ setDefault: { id: r.id, role: "prototypes" } })} disabled={busy} className="text-[14px] text-muted-2 hover:text-foreground">Make default</button>
                  )}
                  <button onClick={() => call(undefined, "DELETE", `?id=${encodeURIComponent(r.id)}`)} disabled={busy} className="text-[14px] text-danger hover:opacity-80">Remove</button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
