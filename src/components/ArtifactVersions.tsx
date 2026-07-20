"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ArtifactVersion } from "@/lib/prototypes/types";
import { TimeAgo } from "@/components/ui";

/** Immutable, git-SHA-pinned versions of a prototype — the promotion unit. */
export function ArtifactVersions({ prototypeKey, initialVersions }: { prototypeKey: string; initialVersions: ArtifactVersion[] }) {
  const router = useRouter();
  const [versions, setVersions] = useState(initialVersions);
  const [open, setOpen] = useState(false);
  const [gitSha, setGitSha] = useState("");
  const [gitRef, setGitRef] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cut() {
    if (!gitSha.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/prototypes/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prototypeKey, gitSha, gitRef, notes }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Could not cut version"); return; }
      setVersions((v) => [data.version, ...v]);
      setGitSha(""); setGitRef(""); setNotes(""); setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <div>
          <span className="text-[12px] font-semibold">Versions</span>
          <span className="text-[11px] text-muted-2 ml-2">Immutable builds pinned to a commit — promoted across environments unchanged.</span>
        </div>
        <button onClick={() => setOpen((o) => !o)} className="text-[12px] text-accent hover:text-accent-hover font-medium">{open ? "Cancel" : "Cut version"}</button>
      </div>

      {open && (
        <div className="px-4 py-3 border-b border-border bg-surface-2/30 space-y-2">
          {error && <div className="text-[12px] text-danger">{error}</div>}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-[11px] text-muted-2 mb-1">Commit SHA</label>
              <input value={gitSha} onChange={(e) => setGitSha(e.target.value)} spellCheck={false} placeholder="e.g. a1b2c3d" className="w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] font-mono text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none" />
            </div>
            <div className="w-40">
              <label className="block text-[11px] text-muted-2 mb-1">Branch/ref <span className="text-muted-2">(optional)</span></label>
              <input value={gitRef} onChange={(e) => setGitRef(e.target.value)} spellCheck={false} placeholder="prototype/…" className="w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] font-mono text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-muted-2 mb-1">Notes <span className="text-muted-2">(optional)</span></label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="what changed in this build" className="w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none" />
          </div>
          <div className="flex justify-end">
            <button onClick={cut} disabled={busy || !gitSha.trim()} className="h-8 px-3 rounded-lg bg-accent text-accent-fg text-[12px] font-semibold hover:bg-accent-hover disabled:opacity-40 transition-colors">{busy ? "Cutting…" : "Cut version"}</button>
          </div>
        </div>
      )}

      {versions.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px] text-muted-2">No versions yet. Cut one from a commit to make it promotable.</div>
      ) : (
        versions.map((v) => (
          <div key={v.id} className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border last:border-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold tabular-nums">v{v.version}</span>
                <span className="text-[11px] font-mono text-muted-2">{v.gitSha.slice(0, 10)}</span>
                {v.gitRef && <span className="text-[11px] font-mono text-muted-2">· {v.gitRef}</span>}
              </div>
              {v.notes && <div className="text-[12px] text-muted mt-0.5 truncate">{v.notes}</div>}
            </div>
            <div className="text-[11px] text-muted-2 shrink-0 text-right">
              <TimeAgo iso={v.createdAt} />
              {v.createdBy && <div>{v.createdBy}</div>}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
