"use client";

import { useState } from "react";
import type { IntegrationPackage, PackageFile } from "@/lib/prototypes/package";

const KIND_CHIP: Record<string, string> = {
  cshtml: "Razor view", cs: "C#", js: "JS", ts: "TS", scss: "SCSS", css: "CSS",
  config: "Config", "content-type": "Content type", other: "File",
};

/**
 * The Integration package room — the one-shot production handoff. The agent
 * (which has the prototype AND the real site source in front of it) writes
 * the complete native implementation into handoff/ on the branch: full new
 * files — Razor views, SCSS, JS, C# backend/API code — plus diffs to
 * existing site files and an integration guide. This panel presents it;
 * git carries it; the dev team applies it.
 */
export function PackagePanel({ prototypeKey, initial, skillEnabled }: {
  prototypeKey: string;
  initial: IntegrationPackage;
  /** Whether opmc-integration-package is enabled for this prototype — stored
   *  skill selections deliberately don't auto-adopt NEW skills, so the empty
   *  state must route the user to enable it instead of dead-ending. */
  skillEnabled: boolean;
}) {
  const [open, setOpen] = useState<PackageFile | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [binary, setBinary] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function openFile(f: PackageFile) {
    setOpen(f); setContent(null); setErr(null); setLoading(true); setTruncated(false); setBinary(false);
    try {
      // Pin the click to the generation this panel rendered — the agent may
      // have pushed a newer package since.
      const res = await fetch(`/api/prototypes/package?key=${encodeURIComponent(prototypeKey)}&path=${encodeURIComponent(f.source)}${initial.sha ? `&sha=${encodeURIComponent(initial.sha)}` : ""}`);
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? "Couldn't load the file"); return; }
      if (data.binary) { setBinary(true); return; }
      setContent(data.content ?? "");
      setTruncated(Boolean(data.truncated));
    } catch {
      setErr("Couldn't load the file — check the connection.");
    } finally { setLoading(false); }
  }

  // The three not-found states are DIFFERENT situations — never tell the
  // user to regenerate a package that exists (outage) or that exists but is
  // malformed (agent must fix, not regenerate blind).
  if (initial.state === "unreadable") {
    return (
      <div className="rounded-xl border border-warn/50 bg-[color-mix(in_srgb,var(--warn)_6%,transparent)] px-4 py-3 text-[14px] text-warn">
        Couldn&apos;t read the branch right now (repo unreachable) — refresh in a moment. If a package exists, it&apos;s still there.
      </div>
    );
  }
  if (initial.state === "invalid") {
    return (
      <div className="rounded-xl border border-warn/50 bg-[color-mix(in_srgb,var(--warn)_6%,transparent)] px-4 py-3 space-y-1.5">
        <p className="text-[14px] text-warn font-semibold">A package exists on the branch, but its manifest is invalid.</p>
        <p className="text-[13.5px] text-muted">{initial.problem ?? "handoff/manifest.json failed validation."}</p>
        <p className="text-[13px] text-muted-2">Don&apos;t regenerate blind — tell your agent: <span className="font-mono text-foreground/80">&ldquo;fix handoff/manifest.json — the console reports: {initial.problem ?? "invalid manifest"}&rdquo;</span></p>
      </div>
    );
  }
  if (!initial.found || !initial.manifest) {
    return (
      <div className="rounded-xl border border-border bg-surface px-4 py-4 space-y-3">
        <p className="text-[14px] text-muted-2 max-w-[75ch]">
          No integration package yet. Your agent has both codebases in front of it — the prototype it built and the real site source (<span className="font-mono text-[13px]">source-site</span>) — so it can write the complete production implementation in one shot: Razor views, SCSS, JS, C# backend/API code, diffs to existing files, and an integration guide.
        </p>
        {skillEnabled ? (
          <div className="rounded-lg border border-border bg-background px-3.5 py-2.5 text-[13px] text-muted-2">
            <span className="font-semibold text-muted">Generate it with your agent:</span> tell your running Claude <span className="font-mono text-foreground/80">&ldquo;produce the integration package&rdquo;</span> — it writes <span className="font-mono">handoff/</span> on the branch and pushes; this room fills in on the next refresh.
          </div>
        ) : (
          <div className="rounded-lg border border-warn/50 bg-[color-mix(in_srgb,var(--warn)_6%,transparent)] px-3.5 py-2.5 text-[13px] text-muted">
            <span className="font-semibold text-warn">First, enable the skill:</span> this prototype&apos;s skill selection doesn&apos;t include <span className="font-mono">opmc-integration-package</span>, so the agent doesn&apos;t know the package contract. Turn it on in <span className="font-semibold">Build → Skills</span>, hit <span className="font-semibold">Re-sync</span> in the Build room, restart your agent, then ask it to <span className="font-mono text-foreground/80">&ldquo;produce the integration package&rdquo;</span>.
          </div>
        )}
      </div>
    );
  }

  const m = initial.manifest;
  const adds = m.files.filter((f) => f.action === "add");
  const mods = m.files.filter((f) => f.action === "modify");

  const fileRow = (f: PackageFile, i: number) => (
    <button key={`${i}-${f.source}`} onClick={() => openFile(f)}
      className={`w-full text-left px-3 py-2 border-b border-border/60 last:border-0 hover:bg-surface-2/60 transition-colors ${open?.source === f.source ? "bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]" : ""}`}>
      <span className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-surface-2 text-muted-2 shrink-0">{KIND_CHIP[f.kind] ?? f.kind}</span>
        <span className="font-mono text-[12.5px] truncate">{f.path}</span>
      </span>
      {f.description && <span className="block text-[12.5px] text-muted-2 mt-0.5 leading-snug">{f.description}</span>}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-[12.5px] text-muted-2 flex-wrap">
        <span>{m.files.length} file{m.files.length === 1 ? "" : "s"} · {adds.length} new · {mods.length} modified{m.forVersion ? ` · implements v${m.forVersion}` : ""}{initial.sha ? <> · read at <span className="font-mono">{initial.sha.slice(0, 7)}</span></> : null}</span>
      </div>

      {m.summary && <p className="text-[14px] text-muted leading-relaxed max-w-[80ch]">{m.summary}</p>}

      {m.apis && m.apis.length > 0 && (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border text-[14px] font-semibold">API surface</div>
          {m.apis.map((a, i) => (
            <div key={i} className="px-4 py-2 border-b border-border/60 last:border-0 text-[13px]">
              <span className="font-mono text-[12px] font-semibold text-accent">{a.method}</span>{" "}
              <span className="font-mono text-[12.5px]">{a.route}</span>
              <span className="block text-muted-2 mt-0.5">{a.name}{a.description ? ` — ${a.description}` : ""}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="space-y-3 min-w-0">
          {adds.length > 0 && (
            <div className="rounded-xl border border-border bg-surface overflow-hidden">
              <div className="px-3 py-2 border-b border-border text-[12px] font-semibold uppercase tracking-wide text-ok">New files</div>
              {adds.map(fileRow)}
            </div>
          )}
          {mods.length > 0 && (
            <div className="rounded-xl border border-border bg-surface overflow-hidden">
              <div className="px-3 py-2 border-b border-border text-[12px] font-semibold uppercase tracking-wide text-warn">Modify existing (diffs)</div>
              {mods.map(fileRow)}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface overflow-hidden min-w-0">
          {open ? (
            <>
              <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 text-[13px]">
                <span className="font-mono truncate">{open.path}</span>
                <span className="ml-auto text-muted-2 shrink-0">{open.action === "modify" ? "unified diff" : "full file"}</span>
              </div>
              <div className="overflow-auto max-h-[60vh]">
                {loading && <p className="px-4 py-3 text-[13px] text-muted-2">Loading…</p>}
                {err && <p className="px-4 py-3 text-[13px] text-danger">{err}</p>}
                {binary && <p className="px-4 py-3 text-[13px] text-muted-2">Binary file — view it on the branch.</p>}
                {content !== null && (
                  <pre className="px-4 py-3 text-[12px] font-mono leading-relaxed whitespace-pre overflow-x-auto">{content}{truncated ? "\n… (truncated for display — the full file is on the branch)" : ""}</pre>
                )}
              </div>
            </>
          ) : initial.readme ? (
            <>
              <div className="px-4 py-2.5 border-b border-border text-[14px] font-semibold">Integration guide <span className="font-mono text-[12px] font-normal text-muted-2">handoff/README.md</span></div>
              <div className="overflow-auto max-h-[60vh]">
                <pre className="px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap font-sans text-foreground/90">{initial.readme}</pre>
              </div>
            </>
          ) : (
            <p className="px-4 py-3 text-[13px] text-muted-2">Pick a file to view it.</p>
          )}
        </div>
      </div>

      {m.notes && <p className="text-[13px] text-muted-2 leading-relaxed max-w-[80ch]">{m.notes}</p>}
    </div>
  );
}
