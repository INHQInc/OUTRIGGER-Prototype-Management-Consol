"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { PrototypeRepoRef } from "@/lib/prototypes/types";

const inp = "w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] font-mono text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none";

/**
 * Configure where this prototype's code lives. Repos come ONLY from the
 * customer's registry (fed by the GitHub connection) — never typed by hand.
 * Missing connection / empty registry render as errors linking to the fix.
 */
export function RepoBranchSettings({ prototypeKey, initialRepo }: { prototypeKey: string; initialRepo: PrototypeRepoRef | null }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [gitConnected, setGitConnected] = useState(true);
  const [orgRepos, setOrgRepos] = useState<{ id: string; fullName: string; roles: string[]; defaultFor: string[] }[]>([]);
  const [repoSel, setRepoSel] = useState(initialRepo?.fullName ?? "");
  const [branch, setBranch] = useState(initialRepo?.branch ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([
      fetch("/api/git/connection").then((r) => (r.ok ? r.json() : { status: {} })).catch(() => ({ status: {} })),
      fetch("/api/orgs/repos").then((r) => (r.ok ? r.json() : { repos: [] })).catch(() => ({ repos: [] })),
    ]).then(([conn, reg]) => {
      if (!live) return;
      setGitConnected(Boolean(conn.status?.connected || conn.status?.envFallback));
      const repos = (reg.repos ?? []).filter((x: { roles?: string[] }) => x.roles?.includes("prototypes"));
      setOrgRepos(repos);
      setRepoSel((cur) => cur || (repos.find((x: { defaultFor?: string[] }) => x.defaultFor?.includes("prototypes")) ?? repos[0])?.fullName || "");
      setLoading(false);
    });
    return () => { live = false; };
  }, []);

  async function save() {
    if (busy || !repoSel.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/prototypes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: prototypeKey, repo: { fullName: repoSel, branch: branch.trim() || undefined } }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg({ ok: false, text: data.error ?? "Save failed" }); return; }
      setMsg({ ok: true, text: "Saved." });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const blocked = !loading && (!gitConnected || orgRepos.length === 0);

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border">
        <span className="text-[12px] font-semibold">Code location</span>
        <span className="text-[11px] text-muted-2 ml-2">Which registered repo + branch this prototype builds in.</span>
      </div>
      <div className="p-4 space-y-3">
        {loading ? (
          <div className="text-[12px] text-muted-2">Loading repositories…</div>
        ) : blocked ? (
          <div className="rounded-lg border border-danger/40 bg-[color-mix(in_srgb,var(--danger)_6%,transparent)] px-3 py-2.5 flex items-center justify-between gap-3">
            <span className="text-[12px] text-danger">
              {!gitConnected
                ? "GitHub isn't connected for this customer — repos can't be listed."
                : "No prototype repositories registered for this customer."}
            </span>
            <Link href="/settings/repositories" className="text-[12px] text-accent hover:text-accent-hover font-medium shrink-0">
              {!gitConnected ? "Connect GitHub →" : "Manage repositories →"}
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-muted-2 mb-1">Repository</label>
                <select value={repoSel} onChange={(e) => { setRepoSel(e.target.value); setMsg(null); }} className={inp}>
                  {!orgRepos.some((r) => r.fullName === repoSel) && repoSel && <option value={repoSel}>{repoSel} (not in registry)</option>}
                  {orgRepos.map((r) => <option key={r.id} value={r.fullName}>{r.fullName}{r.defaultFor.includes("prototypes") ? " (default)" : ""}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-muted-2 mb-1">Branch</label>
                <input value={branch} onChange={(e) => { setBranch(e.target.value); setMsg(null); }} spellCheck={false} placeholder={`prototype/${prototypeKey}`} className={inp} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-[12px] ${msg ? (msg.ok ? "text-ok" : "text-danger") : "text-muted-2"}`}>
                {msg ? msg.text : initialRepo ? `Currently ${initialRepo.fullName}@${initialRepo.branch}` : "No repo attached yet — pick one and save."}
              </span>
              <button onClick={save} disabled={busy || !repoSel.trim()} className="h-8 px-3 rounded-lg bg-accent text-accent-fg text-[12px] font-semibold hover:bg-accent-hover disabled:opacity-40">{busy ? "Saving…" : "Save"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
