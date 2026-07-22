"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Target = { url: string; source: "clone" | "live" };

const inp = "w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none";
const inpMono = inp + " font-mono";
const ta = inp + " resize-none leading-relaxed";
const lbl = "block text-[12px] font-medium text-muted mb-1";
const hint = "text-[11px] text-muted-2 mt-1";

function isUrl(s: string): boolean {
  try { new URL(s.trim()); return true; } catch { return false; }
}
function slugPreview(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "prototype";
}

/**
 * New-prototype form — the 3 required things to start working: name +
 * description, repo + branch, page(s). Then the workspace hands you the
 * init script for Claude.
 */
export function PrototypeWizard({ envUrls }: { envUrls: string[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [targets, setTargets] = useState<Target[]>([{ url: "", source: "live" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Repo + branch (from the customer's registry + GitHub)
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [gitConnected, setGitConnected] = useState(true);
  const [repos, setRepos] = useState<{ fullName: string; defaultFor: string[] }[]>([]);
  const [repo, setRepo] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [branch, setBranch] = useState("");
  const [branchesLoading, setBranchesLoading] = useState(false);

  const key = slugPreview(name);
  const newBranch = `prototype/${key}`;

  useEffect(() => {
    let live = true;
    Promise.all([
      fetch("/api/git/connection").then((r) => (r.ok ? r.json() : { status: {} })).catch(() => ({ status: {} })),
      fetch("/api/orgs/repos").then((r) => (r.ok ? r.json() : { repos: [] })).catch(() => ({ repos: [] })),
    ]).then(([conn, reg]) => {
      if (!live) return;
      setGitConnected(Boolean(conn.status?.connected || conn.status?.envFallback));
      const list = (reg.repos ?? []).filter((x: { roles?: string[] }) => x.roles?.includes("prototypes"));
      setRepos(list);
      setRepo((cur) => cur || (list.find((x: { defaultFor?: string[] }) => x.defaultFor?.includes("prototypes")) ?? list[0])?.fullName || "");
      setLoadingRepos(false);
    });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!repo.trim()) { setBranches([]); return; }
    let live = true;
    setBranchesLoading(true);
    fetch(`/api/git/branches?repo=${encodeURIComponent(repo.trim())}`)
      .then((r) => r.json())
      .then((d) => { if (live) setBranches((d.branches ?? []).filter((b: string) => b !== "starter")); })
      .catch(() => { if (live) setBranches([]); })
      .finally(() => { if (live) setBranchesLoading(false); });
    return () => { live = false; };
  }, [repo]);

  const cleanTargets = targets.filter((t) => t.url.trim()).map((t) => ({ url: t.url.trim(), source: t.source }));
  const branchChoice = branch || newBranch;
  const blocked = !loadingRepos && (!gitConnected || repos.length === 0);
  const valid = name.trim().length > 0 && description.trim().length > 0 && !!repo && cleanTargets.length > 0 && targets.every((t) => !t.url.trim() || isUrl(t.url));

  function setTarget(i: number, patch: Partial<Target>) { setTargets((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t))); }

  async function create() {
    if (busy || !valid) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/prototypes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), brief: { change: description.trim() }, targets: cleanTargets, repo: { fullName: repo, branch: branchChoice } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Could not create prototype"); setBusy(false); return; }
      router.push(`/prototypes/${data.prototype.key}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e)); setBusy(false);
    }
  }

  return (
    <div className="max-w-lg">
      <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
        <div>
          <label className={lbl}>Name</label>
          <input className={inp} value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. a short name for this experiment" />
          {name.trim() && <div className={hint}>Branch: <span className="font-mono">{newBranch}</span></div>}
        </div>

        <div>
          <label className={lbl}>Description</label>
          <textarea className={ta} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What are you building / testing? A sentence is fine — it grows into the brief." />
        </div>

        <div>
          <label className={lbl}>Repository &amp; branch</label>
          {loadingRepos ? (
            <div className="text-[12px] text-muted-2">Loading repositories…</div>
          ) : blocked ? (
            <div className="rounded-lg border border-danger/40 bg-[color-mix(in_srgb,var(--danger)_6%,transparent)] px-3 py-2.5 flex items-center justify-between gap-3">
              <span className="text-[12px] text-danger">{!gitConnected ? "GitHub isn't connected for this customer." : "No prototype repositories registered."}</span>
              <Link href="/settings/repositories" className="text-[12px] text-accent hover:text-accent-hover font-medium shrink-0">{!gitConnected ? "Connect GitHub →" : "Register a repo →"}</Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <select value={repo} onChange={(e) => { setRepo(e.target.value); setBranch(""); }} className={inpMono}>
                {repos.map((r) => <option key={r.fullName} value={r.fullName}>{r.fullName}{r.defaultFor.includes("prototypes") ? " (default)" : ""}</option>)}
              </select>
              <select value={branchChoice} onChange={(e) => setBranch(e.target.value)} disabled={branchesLoading} className={inpMono}>
                <option value={newBranch}>{newBranch} (new)</option>
                {branches.filter((b) => b !== newBranch).map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={`${lbl} mb-0`}>Page(s) to build on</label>
            <button type="button" onClick={() => setTargets((ts) => [...ts, { url: "", source: "live" }])} className="text-[12px] text-accent hover:text-accent-hover font-medium">+ Add page</button>
          </div>
          {targets.map((t, i) => (
            <div key={i} className="flex items-center gap-2 mb-2">
              <input list={`w-envs-${i}`} className={inpMono} value={t.url} onChange={(e) => setTarget(i, { url: e.target.value })} placeholder="https://prep.example.com/path/to/page" spellCheck={false} />
              <datalist id={`w-envs-${i}`}>{envUrls.map((u) => <option key={u} value={u} />)}</datalist>
              {targets.length > 1 && <button type="button" onClick={() => setTargets((ts) => ts.filter((_, j) => j !== i))} className="text-[13px] text-danger hover:opacity-80 px-1">✕</button>}
            </div>
          ))}
        </div>

        {error && <div className="text-[12px] text-danger">{error}</div>}
      </div>

      <div className="flex items-center justify-between mt-4">
        <button onClick={() => router.push("/prototypes")} disabled={busy} className="h-9 px-4 rounded-lg text-[13px] text-muted hover:text-foreground disabled:opacity-40">Cancel</button>
        <button onClick={create} disabled={busy || !valid} className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          {busy ? "Creating…" : "Create & set up"}
        </button>
      </div>
      <p className="text-[11px] text-muted-2 mt-3">Next: verify the injection on your page(s), then get your Claude init script to start building.</p>
    </div>
  );
}
