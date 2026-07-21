"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { OrgRepo, RepoRole, RepoProvider } from "@/lib/git/types";
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
  const [roles, setRoles] = useState<RepoRole[]>(["prototypes"]);
  const [provider, setProvider] = useState<RepoProvider>("github");
  const [branches, setBranches] = useState<string[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);

  function toggleRole(role: RepoRole) {
    setRoles((rs) => {
      const next = rs.includes(role) ? rs.filter((r) => r !== role) : [...rs, role];
      return next.length ? next : rs; // at least one role
    });
  }
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

  // Branches of the entered repo, from GitHub — base branch is a pick, not typed.
  useEffect(() => {
    const clean = repo.trim();
    if (provider !== "github" || !/^[\w.-]+\/[\w.-]+$/.test(clean)) { setBranches([]); return; }
    let live = true;
    setBranchesLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/git/branches?repo=${encodeURIComponent(clean)}`)
        .then((r) => r.json())
        .then((d) => {
          if (!live) return;
          const list: string[] = d.branches ?? [];
          setBranches(list);
          if (list.length) setBaseBranch((cur) => (list.includes(cur) ? cur : (account.find((a) => a.fullName === clean)?.defaultBranch && list.includes(account.find((a) => a.fullName === clean)!.defaultBranch) ? account.find((a) => a.fullName === clean)!.defaultBranch : list.includes("main") ? "main" : list[0])));
        })
        .catch(() => { if (live) setBranches([]); })
        .finally(() => { if (live) setBranchesLoading(false); });
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [repo, provider, account]);

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
    if (await call({ repo, baseBranch, artifactPath, roles, provider })) { setRepo(""); setAdding(false); }
  }

  const isProto = roles.includes("prototypes");

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
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              {(["prototypes", "source"] as RepoRole[]).map((role) => (
                <label key={role} className="flex items-center gap-1.5 text-[12px] text-muted cursor-pointer">
                  <input type="checkbox" checked={roles.includes(role)} onChange={() => toggleRole(role)} className="accent-[var(--accent)]" />
                  {role === "prototypes" ? "Prototype code" : "Production source"}
                </label>
              ))}
            </div>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as RepoProvider)}
              disabled={isProto}
              title={isProto ? "Prototype repos must be on GitHub (the console pulls built artifacts)" : undefined}
              className="ml-auto rounded-lg bg-background border border-border px-2 py-1.5 text-[12px] text-foreground focus:border-accent focus:outline-none disabled:opacity-50"
            >
              <option value="github">GitHub</option>
              <option value="azure-devops">Azure DevOps</option>
              <option value="external">External</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-muted-2 mb-1">{provider === "github" ? "Repo" : "Repo locator (URL or name)"}</label>
            <input list={provider === "github" ? "registry-repo-options" : undefined} value={repo} onChange={(e) => onRepoInput(e.target.value)} spellCheck={false} placeholder={provider === "github" ? (account.length ? "pick from the connected account or type owner/repo" : "owner/repo") : "e.g. dev.azure.com/outrigger/website"} className="w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] font-mono focus:border-accent focus:outline-none" />
            <datalist id="registry-repo-options">
              {account.map((r) => <option key={r.fullName} value={r.fullName}>{r.private ? "private" : "public"}</option>)}
            </datalist>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-muted-2 mb-1">Base branch</label>
              {branches.length > 0 ? (
                <select value={baseBranch} onChange={(e) => setBaseBranch(e.target.value)} className="w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] font-mono focus:border-accent focus:outline-none">
                  {branches.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              ) : (
                <input value={baseBranch} onChange={(e) => setBaseBranch(e.target.value)} spellCheck={false} placeholder={branchesLoading ? "loading branches…" : "main"} className="w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] font-mono focus:border-accent focus:outline-none" />
              )}
              {provider === "github" && <div className="text-[10px] text-muted-2 mt-0.5">{branchesLoading ? "Loading branches…" : branches.length ? `${branches.length} branches from GitHub.` : "Enter owner/repo to load branches."}</div>}
            </div>
            {isProto && (
              <div>
                <label className="block text-[11px] text-muted-2 mb-1">Built variation path</label>
                <input value={artifactPath} onChange={(e) => setArtifactPath(e.target.value)} spellCheck={false} className="w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] font-mono focus:border-accent focus:outline-none" />
              </div>
            )}
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
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[13px] font-mono font-medium truncate">{r.fullName}</span>
                {r.provider !== "github" && <Badge tone="neutral">{r.provider}</Badge>}
                {r.roles.map((role) => (
                  <Badge key={role} tone={r.defaultFor.includes(role) ? "accent" : "neutral"}>
                    {role === "prototypes" ? "prototype code" : "source"}{r.defaultFor.includes(role) ? " · default" : ""}
                  </Badge>
                ))}
              </div>
              <div className="text-[11px] text-muted-2 font-mono">{r.baseBranch}{r.roles.includes("prototypes") ? ` · ${r.artifactPath}` : ""}</div>
            </div>
            {canManage && (
              <div className="flex items-center gap-3 shrink-0">
                {r.roles.filter((role) => !r.defaultFor.includes(role)).map((role) => (
                  <button key={role} onClick={() => call({ setDefault: { id: r.id, role } })} disabled={busy} className="text-[12px] text-muted-2 hover:text-foreground">
                    Default for {role === "prototypes" ? "prototypes" : "source"}
                  </button>
                ))}
                <button onClick={() => call(undefined, "DELETE", `?id=${encodeURIComponent(r.id)}`)} disabled={busy} className="text-[12px] text-danger hover:opacity-80">Remove</button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
