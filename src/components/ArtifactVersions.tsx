import type { ArtifactVersion } from "@/lib/prototypes/types";
import { TimeAgo } from "@/components/ui";

/** Immutable, git-SHA-pinned versions of a prototype — the promotion unit.
 *  Cut from the repo via the Source panel; listed here read-only. */
export function ArtifactVersions({ versions }: { versions: ArtifactVersion[] }) {
  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border">
        <span className="text-[12px] font-semibold">Versions</span>
        <span className="text-[11px] text-muted-2 ml-2">Immutable builds pinned to a commit — promoted across environments unchanged.</span>
      </div>

      {versions.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px] text-muted-2">No versions yet. Cut one from the repo (Source, above) to make it promotable.</div>
      ) : (
        versions.map((v) => (
          <div key={v.id} className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border last:border-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold tabular-nums">v{v.version}</span>
                <span className="text-[11px] font-mono text-muted-2">{v.gitSha.slice(0, 10)}</span>
                {v.gitRef && <span className="text-[11px] font-mono text-muted-2">· {v.gitRef}</span>}
                {!v.variationJs && <span className="text-[10px] text-warn">no code</span>}
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
