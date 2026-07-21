"use client";

import { useEffect, useState } from "react";

type SourceMode = "same" | "repo" | "external";
interface RepoOption { fullName: string; private: boolean; defaultBranch: string }

const input = "w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] font-mono text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none";
const labelCls = "block text-[12px] font-medium text-muted mb-1.5";

/** Per-site Repositories config: feature repo (deploy) + source repo (integrate). */
export function RepoSettings({ siteKey }: { siteKey: string }) {
  const [loading, setLoading] = useState(true);
  const [tokenPresent, setTokenPresent] = useState(false);
  const [featureRepo, setFeatureRepo] = useState("");
  const [featureBase, setFeatureBase] = useState("main");
  const [branchPrefix, setBranchPrefix] = useState("prototype/");
  const [artifactPath, setArtifactPath] = useState("dist/variation.js");
  const [sourceMode, setSourceMode] = useState<SourceMode>("same");
  const [sourceRepo, setSourceRepo] = useState("");
  const [sourceBase, setSourceBase] = useState("main");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [repoOptions, setRepoOptions] = useState<RepoOption[]>([]);

  // Auto-fill the base branch when a picked repo is recognized.
  function onFeatureRepoChange(value: string) {
    setFeatureRepo(value);
    const match = repoOptions.find((r) => r.fullName === value.trim());
    if (match) setFeatureBase(match.defaultBranch);
  }
  function onSourceRepoChange(value: string) {
    setSourceRepo(value);
    const match = repoOptions.find((r) => r.fullName === value.trim());
    if (match) setSourceBase(match.defaultBranch);
  }

  useEffect(() => {
    fetch("/api/git/repos")
      .then((r) => (r.ok ? r.json() : { repos: [] }))
      .then((d) => setRepoOptions(d.repos ?? []))
      .catch(() => setRepoOptions([]));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/git/repo?site=${encodeURIComponent(siteKey)}`);
        const data = await res.json();
        setTokenPresent(!!data.tokenPresent);
        const bnd = data.binding;
        if (bnd) {
          setFeatureRepo(`${bnd.feature.owner}/${bnd.feature.repo}`);
          setFeatureBase(bnd.feature.baseBranch);
          setBranchPrefix(bnd.feature.branchPrefix);
          if (bnd.feature.artifactPath) setArtifactPath(bnd.feature.artifactPath);
          setSourceMode(bnd.sourceMode);
          if (bnd.source) { setSourceRepo(`${bnd.source.owner}/${bnd.source.repo}`); setSourceBase(bnd.source.baseBranch); }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [siteKey]);

  async function save() {
    setBusy(true); setResult(null);
    try {
      const res = await fetch("/api/git/repo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteKey, featureRepo, featureBase, branchPrefix, artifactPath, sourceMode, sourceRepo, sourceBase }),
      });
      const data = await res.json();
      if (!res.ok) setResult({ ok: false, message: data.error ?? "Save failed" });
      else setResult(data.validation ?? { ok: true, message: tokenPresent ? "Saved." : "Saved. Add GITHUB_TOKEN to validate the connection." });
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="rounded-xl border border-border bg-surface p-4 text-[12px] text-muted-2">Loading repositories…</div>;

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <span className="text-[13px] font-semibold">Repositories</span>
        <span className={`text-[11px] ${tokenPresent ? "text-ok" : "text-muted-2"}`}>{tokenPresent ? "GitHub connected" : "GITHUB_TOKEN not set"}</span>
      </div>

      <div className="p-4 space-y-4">
        {/* Feature repo */}
        <div>
          <label className={labelCls}>Feature repo <span className="text-muted-2">— prototypes branch + deploy from here</span></label>
          <input list="repo-options" className={input} value={featureRepo} onChange={(e) => onFeatureRepoChange(e.target.value)} placeholder={repoOptions.length ? "pick a repo or type owner/repo" : "owner/repo or https://github.com/owner/repo"} spellCheck={false} />
          <datalist id="repo-options">
            {repoOptions.map((r) => <option key={r.fullName} value={r.fullName}>{r.private ? "private" : "public"}</option>)}
          </datalist>
          {repoOptions.length > 0 && <p className="text-[11px] text-muted-2 mt-1">{repoOptions.length} repos from the connected GitHub account.</p>}
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <label className="block text-[11px] text-muted-2 mb-1">Base branch</label>
              <input className={input} value={featureBase} onChange={(e) => setFeatureBase(e.target.value)} placeholder="main" spellCheck={false} />
            </div>
            <div>
              <label className="block text-[11px] text-muted-2 mb-1">Branch prefix</label>
              <input className={input} value={branchPrefix} onChange={(e) => setBranchPrefix(e.target.value)} placeholder="prototype/" spellCheck={false} />
            </div>
          </div>
          <div className="mt-2">
            <label className="block text-[11px] text-muted-2 mb-1">Built variation path <span className="text-muted-2">— the console pulls this from each prototype branch</span></label>
            <input className={input} value={artifactPath} onChange={(e) => setArtifactPath(e.target.value)} placeholder="dist/variation.js" spellCheck={false} />
          </div>
        </div>

        {/* Source mode */}
        <div>
          <label className={labelCls}>Source repo <span className="text-muted-2">— where a winner integrates</span></label>
          <div className="space-y-1.5">
            {([
              ["same", "Same as feature repo", "Native flow — PR to base branch = ships."],
              ["repo", "A different GitHub repo", "Winner is PR'd into a separate source repo."],
              ["external", "External / read-only", "Integration via handoff (e.g. Azure DevOps). No push."],
            ] as [SourceMode, string, string][]).map(([mode, title, hint]) => (
              <label key={mode} className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${sourceMode === mode ? "border-accent bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]" : "border-border hover:bg-surface-2/40"}`}>
                <input type="radio" name="sourceMode" checked={sourceMode === mode} onChange={() => setSourceMode(mode)} className="mt-0.5 accent-[var(--accent)]" />
                <div>
                  <div className="text-[12px] font-medium">{title}</div>
                  <div className="text-[11px] text-muted-2">{hint}</div>
                </div>
              </label>
            ))}
          </div>

          {sourceMode === "repo" && (
            <div className="mt-2 grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-[11px] text-muted-2 mb-1">Source repo</label>
                <input list="repo-options" className={input} value={sourceRepo} onChange={(e) => onSourceRepoChange(e.target.value)} placeholder="pick a repo or type owner/repo" spellCheck={false} />
              </div>
              <div>
                <label className="block text-[11px] text-muted-2 mb-1">Base branch</label>
                <input className={input} value={sourceBase} onChange={(e) => setSourceBase(e.target.value)} placeholder="main" spellCheck={false} />
              </div>
            </div>
          )}
        </div>

        {result && <div className={`text-[12px] ${result.ok ? "text-ok" : "text-danger"}`}>{result.message}</div>}
      </div>

      <div className="px-4 py-3 border-t border-border flex justify-end">
        <button onClick={save} disabled={busy || !featureRepo.trim()} className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          {busy ? "Saving…" : "Save repositories"}
        </button>
      </div>
    </div>
  );
}
