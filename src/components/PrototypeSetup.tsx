"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PrototypeBrief } from "@/lib/prototypes/types";
import type { SetupStepState } from "@/lib/prototypes/setup";

const ta = "w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none resize-none";

function tabHref(base: string, tab: SetupStepState["tab"]): string {
  return tab === "setup" ? `${base}#brief` : `${base}/${tab}`;
}

/** The prototype's own setup checklist + the local-build command block it
 *  generates once everything's wired. Mirrors the org Customer-setup card. */
export function PrototypeSetup({ prototypeKey, steps, ready, repo, brief, consoleUrl, buildStatus }: {
  prototypeKey: string;
  steps: SetupStepState[];
  ready: boolean;
  repo?: { fullName: string; branch: string };
  brief: PrototypeBrief;
  consoleUrl: string;
  buildStatus: { found: boolean | null; headSha?: string; bytes?: number; branchExists?: boolean };
}) {
  const router = useRouter();
  const base = `/prototypes/${prototypeKey}`;
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="space-y-4 max-w-2xl">
      <Checklist base={base} steps={steps} doneCount={doneCount} />
      <BriefCard prototypeKey={prototypeKey} initial={brief} onSaved={() => router.refresh()} />
      {ready
        ? <Commands repo={repo} consoleUrl={consoleUrl} buildStatus={buildStatus} />
        : <div className="rounded-xl border border-border bg-surface px-4 py-3 text-[12px] text-muted-2">
            Finish the {steps.length - doneCount} step{steps.length - doneCount === 1 ? "" : "s"} above and the exact local build commands appear here — copy-paste to clone, branch, and start Claude.
          </div>}
    </div>
  );
}

function Checklist({ base, steps, doneCount }: { base: string; steps: SetupStepState[]; doneCount: number }) {
  return (
    <div className="rounded-xl border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] overflow-hidden">
      <div className="px-4 py-3 border-b border-accent/30 flex items-center justify-between">
        <div>
          <span className="text-[13px] font-semibold">Ready to build</span>
          <span className="text-[11px] text-muted-2 ml-2">What this prototype needs before you start building it.</span>
        </div>
        <span className="text-[12px] font-semibold tabular-nums">{doneCount} of {steps.length}</span>
      </div>
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border/60 last:border-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold border shrink-0 ${s.done ? "bg-accent/15 text-accent border-accent/40" : "bg-surface-2 text-muted-2 border-border"}`}>
              {s.done ? "✓" : i + 1}
            </span>
            <div className="min-w-0">
              <span className={`text-[13px] ${s.done ? "text-muted-2 line-through" : ""}`}>{s.label}</span>
              {s.hint && !s.done && <div className="text-[11px] text-muted-2">{s.hint}</div>}
            </div>
          </div>
          {!s.done && (
            <Link href={tabHref(base, s.tab)} className="text-[12px] text-accent hover:text-accent-hover font-medium shrink-0">{s.action} →</Link>
          )}
        </div>
      ))}
    </div>
  );
}

function BriefCard({ prototypeKey, initial, onSaved }: { prototypeKey: string; initial: PrototypeBrief; onSaved: () => void }) {
  const [problem, setProblem] = useState(initial.problem);
  const [change, setChange] = useState(initial.change);
  const [done, setDone] = useState(initial.doneLooksLike);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = problem !== initial.problem || change !== initial.change || done !== initial.doneLooksLike;

  async function save() {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/prototypes", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: prototypeKey, brief: { problem, change, doneLooksLike: done } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ ok: false, text: data.error ?? "Save failed" }); return; }
      setMsg({ ok: true, text: "Saved." });
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Save failed" });
    } finally { setBusy(false); }
  }

  return (
    <div id="brief" className="rounded-xl border border-border bg-surface overflow-hidden scroll-mt-4">
      <div className="px-4 py-2.5 border-b border-border">
        <span className="text-[12px] font-semibold">Build brief</span>
        <span className="text-[11px] text-muted-2 ml-2">What Claude builds — the skill reads this from the console.</span>
      </div>
      <div className="p-4 space-y-2.5">
        <div>
          <label className="block text-[11px] text-muted-2 mb-1">Problem / opportunity</label>
          <textarea rows={2} value={problem} onChange={(e) => { setProblem(e.target.value); setMsg(null); }} placeholder="What's not working, or the opportunity you're testing." className={ta} />
        </div>
        <div>
          <label className="block text-[11px] text-muted-2 mb-1">What it changes</label>
          <textarea rows={2} value={change} onChange={(e) => { setChange(e.target.value); setMsg(null); }} placeholder="The change on the page — the thing to build." className={ta} />
        </div>
        <div>
          <label className="block text-[11px] text-muted-2 mb-1">Done looks like</label>
          <textarea rows={2} value={done} onChange={(e) => { setDone(e.target.value); setMsg(null); }} placeholder="How you'll know it's built right." className={ta} />
        </div>
        <div className="flex items-center justify-between">
          <span className={`text-[12px] ${msg ? (msg.ok ? "text-ok" : "text-danger") : "text-muted-2"}`}>{msg?.text ?? (dirty ? "Unsaved changes" : "")}</span>
          <button onClick={save} disabled={busy || !dirty} className="h-8 px-3 rounded-lg bg-accent text-accent-fg text-[12px] font-semibold hover:bg-accent-hover disabled:opacity-40">{busy ? "Saving…" : "Save brief"}</button>
        </div>
      </div>
    </div>
  );
}

function Commands({ repo, consoleUrl, buildStatus }: { repo?: { fullName: string; branch: string }; consoleUrl: string; buildStatus: { found: boolean | null; headSha?: string; bytes?: number } }) {
  const [copied, setCopied] = useState(false);
  const fullName = repo?.fullName ?? "owner/repo";
  const branch = repo?.branch ?? "prototype/key";
  const dir = fullName.split("/")[1] ?? "prototype";
  const cmds =
`# 1. env — once per machine (token: Settings → Repositories → API access)
export OPMC_URL="${consoleUrl}"
export OPMC_API_TOKEN="opmc_…"

# 2. clone + branch off the starter (skill + build tooling live there)
git clone git@github.com:${fullName}.git ${dir}   # once
cd ${dir}
git checkout -b ${branch} origin/starter && git push -u origin ${branch}

# 3. build with Claude — the opmc-prototype skill loads, reads this brief
claude`;

  async function copy() {
    try { await navigator.clipboard.writeText(cmds); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  }

  return (
    <div className="rounded-xl border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] overflow-hidden">
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-accent/30">
        <div>
          <span className="text-[12px] font-semibold">✓ Wired up — build it</span>
          <span className="text-[11px] text-muted-2 ml-2">Run this on your machine to start building.</span>
        </div>
        <button onClick={copy} className="text-[12px] text-accent hover:text-accent-hover font-medium">{copied ? "Copied" : "Copy"}</button>
      </div>
      <pre className="px-4 py-3 text-[11px] font-mono text-muted leading-relaxed overflow-x-auto">{cmds}</pre>
      <div className="px-4 pb-3 text-[11px] text-muted-2 border-t border-border/60 pt-2.5">
        Build status:{" "}
        {buildStatus.found === true
          ? <span className="text-ok">✓ built variation present{buildStatus.headSha ? ` · ${buildStatus.headSha.slice(0, 7)}` : ""}{typeof buildStatus.bytes === "number" ? ` · ${buildStatus.bytes.toLocaleString()} bytes` : ""}</span>
          : buildStatus.found === false
          ? <span className="text-warn">not built yet — build in the repo, commit the artifact, then cut a version on the Build tab</span>
          : <span className="text-muted-2">couldn&apos;t read the repo (check GitHub connection)</span>}
      </div>
    </div>
  );
}
