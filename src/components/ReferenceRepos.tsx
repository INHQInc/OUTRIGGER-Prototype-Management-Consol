"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ReferenceRepo } from "@/lib/git/reference-repos";

const inp = "w-full rounded-lg bg-background border border-border px-3 py-2 text-[12px] font-mono text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none";

/**
 * Read-only production-source repos. These go into `.opmc/context.json` as
 * identity + notes so Claude knows the real SCSS/components exist and where to
 * look — runtime-computed styles miss media queries and pseudo-states. The
 * local checkout path is machine-specific and set on the prototype's init
 * script (symlinked in as `source-site/`), never committed here.
 */
export function ReferenceRepos({ initial, canManage }: { initial: ReferenceRepo[]; canManage: boolean }) {
  const router = useRouter();
  const [repos, setRepos] = useState<ReferenceRepo[]>(initial);
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: ReferenceRepo[]) {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/orgs/reference-repos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repos: next }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Save failed"); return false; }
      setRepos(data.repos ?? []);
      router.refresh();
      return true;
    } finally { setBusy(false); }
  }

  async function add() {
    if (!url.trim() || busy) return;
    const name = url.trim().replace(/\/+$/, "").split("/").slice(-1)[0] || url.trim();
    if (await save([...repos, { name, url: url.trim(), access: "read-only", notes: notes.trim() || undefined }])) {
      setUrl(""); setNotes("");
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <div className="text-[13px] font-semibold">Reference source</div>
        <div className="text-[11px] text-muted-2 mt-0.5">Read-only production repos Claude should consult for real markup + tokens. Recorded in the prototype context; never written to.</div>
      </div>

      {canManage && (
        <div className="px-4 py-3 border-b border-border bg-surface-2/30 space-y-2">
          {error && <div className="text-[12px] text-danger">{error}</div>}
          <input value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} placeholder="https://dev.azure.com/org/project/_git/Website  (or owner/repo)" className={inp} />
          <div className="flex items-center gap-2">
            <input value={notes} onChange={(e) => setNotes(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} spellCheck={false} placeholder="where to look — e.g. SCSS in prototype/src/components; tokens in base/variables.scss" className={inp} />
            <button onClick={add} disabled={busy || !url.trim()} className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40 shrink-0">Add</button>
          </div>
        </div>
      )}

      {repos.length === 0 ? (
        <div className="px-4 py-5 text-center text-[12px] text-muted-2">None set. Add the production site repo so Claude builds against real components instead of scraped CSS.</div>
      ) : (
        repos.map((r, i) => (
          <div key={`${r.url}-${i}`} className="flex items-start justify-between gap-3 px-4 py-2.5 border-b border-border last:border-0">
            <div className="min-w-0">
              <div className="text-[12px] font-mono truncate">{r.url}</div>
              {r.notes && <div className="text-[11px] text-muted-2 mt-0.5">{r.notes}</div>}
            </div>
            {canManage && (
              <button onClick={() => save(repos.filter((_, j) => j !== i))} disabled={busy} className="text-[12px] text-danger hover:opacity-80 shrink-0">Remove</button>
            )}
          </div>
        ))
      )}
    </div>
  );
}
