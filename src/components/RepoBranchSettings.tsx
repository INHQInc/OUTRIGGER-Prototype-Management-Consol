"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { PrototypeRepoRef } from "@/lib/prototypes/types";

const inp = "w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] font-mono text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none";

/** Configure where this prototype's code lives — repo (brand registry) + branch. */
export function RepoBranchSettings({ prototypeKey, initialRepo }: { prototypeKey: string; initialRepo: PrototypeRepoRef | null }) {
  const router = useRouter();
  const [orgRepos, setOrgRepos] = useState<{ id: string; fullName: string; roles: string[]; defaultFor: string[] }[]>([]);
  const [repoSel, setRepoSel] = useState(initialRepo?.fullName ?? "");
  const [branch, setBranch] = useState(initialRepo?.branch ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/orgs/repos")
      .then((r) => (r.ok ? r.json() : { repos: [] }))
      .then((d) => {
        const repos = (d.repos ?? []).filter((x: { roles?: string[] }) => x.roles?.includes("prototypes"));
        setOrgRepos(repos);
        setRepoSel((cur) => cur || (repos.find((x: { defaultFor?: string[] }) => x.defaultFor?.includes("prototypes")) ?? repos[0])?.fullName || "");
      })
      .catch(() => setOrgRepos([]));
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

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border">
        <span className="text-[12px] font-semibold">Code location</span>
        <span className="text-[11px] text-muted-2 ml-2">Which repo + branch this prototype builds in (repos are registered in Settings → Repositories).</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] text-muted-2 mb-1">Repository</label>
            {orgRepos.length > 0 ? (
              <select value={repoSel} onChange={(e) => setRepoSel(e.target.value)} className={inp}>
                {!orgRepos.some((r) => r.fullName === repoSel) && repoSel && <option value={repoSel}>{repoSel}</option>}
                {orgRepos.map((r) => <option key={r.id} value={r.fullName}>{r.fullName}{r.defaultFor.includes("prototypes") ? " (default)" : ""}</option>)}
              </select>
            ) : (
              <input value={repoSel} onChange={(e) => setRepoSel(e.target.value)} spellCheck={false} placeholder="owner/repo" className={inp} />
            )}
          </div>
          <div>
            <label className="block text-[11px] text-muted-2 mb-1">Branch</label>
            <input value={branch} onChange={(e) => setBranch(e.target.value)} spellCheck={false} placeholder={`prototype/${prototypeKey}`} className={inp} />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className={`text-[12px] ${msg ? (msg.ok ? "text-ok" : "text-danger") : "text-muted-2"}`}>
            {msg ? msg.text : initialRepo ? `Currently ${initialRepo.fullName}@${initialRepo.branch}` : "No repo attached yet."}
          </span>
          <button onClick={save} disabled={busy || !repoSel.trim()} className="h-8 px-3 rounded-lg bg-accent text-accent-fg text-[12px] font-semibold hover:bg-accent-hover disabled:opacity-40">{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
