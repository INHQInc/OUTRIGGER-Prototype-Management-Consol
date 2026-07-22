"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PrototypeBrief } from "@/lib/prototypes/types";
import type { SetupStepState } from "@/lib/prototypes/setup";
import { ProvisionButton } from "@/components/ProvisionButton";

const ta = "w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none resize-none";

function tabHref(base: string, tab: SetupStepState["tab"]): string {
  return tab === "setup" ? `${base}#brief` : `${base}/${tab}`;
}

/** The prototype's own setup checklist + the local-build command block it
 *  generates once everything's wired. Mirrors the org Customer-setup card. */
export function PrototypeSetup({ prototypeKey, steps, ready, repo, brief, consoleUrl, previewUrl, buildStatus, provisioned }: {
  prototypeKey: string;
  steps: SetupStepState[];
  ready: boolean;
  repo?: { fullName: string; branch: string };
  brief: PrototypeBrief;
  consoleUrl: string;
  previewUrl?: string;
  buildStatus: { found: boolean | null; headSha?: string; bytes?: number; branchExists?: boolean };
  provisioned: boolean;
}) {
  const router = useRouter();
  const base = `/prototypes/${prototypeKey}`;
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="space-y-4 max-w-2xl">
      <Checklist base={base} steps={steps} doneCount={doneCount} />
      <BriefCard prototypeKey={prototypeKey} initial={brief} onSaved={() => router.refresh()} />
      <BuildSection prototypeKey={prototypeKey} base={base} repo={repo} provisioned={provisioned} consoleUrl={consoleUrl} previewUrl={previewUrl} buildStatus={buildStatus} />
    </div>
  );
}

/** The one adaptive next-action block: fix the branch → provision → build.
 *  Always visible so the user is never stuck guessing what's next. */
function BuildSection({ prototypeKey, base, repo, provisioned, consoleUrl, previewUrl, buildStatus }: {
  prototypeKey: string; base: string; repo?: { fullName: string; branch: string };
  provisioned: boolean; consoleUrl: string; previewUrl?: string;
  buildStatus: { found: boolean | null; headSha?: string; bytes?: number; branchExists?: boolean };
}) {
  if (!repo) {
    return <Guidance tone="warn">Attach a repo + branch on the <b>Build</b> tab to continue. <Link href={`${base}/build`} className="text-accent hover:text-accent-hover font-medium">Go to Build →</Link></Guidance>;
  }
  if (repo.branch === "starter") {
    return <Guidance tone="warn">This prototype&apos;s branch is <span className="font-mono">starter</span> — the shared template (skill + build tooling), not a prototype branch. Set a dedicated branch like <span className="font-mono">prototype/{prototypeKey}</span> on the <b>Build</b> tab, then provision here. <Link href={`${base}/build`} className="text-accent hover:text-accent-hover font-medium">Go to Build →</Link></Guidance>;
  }
  return (
    <>
      <ProvisionButton prototypeKey={prototypeKey} provisioned={provisioned} />
      {provisioned
        ? <Commands prototypeKey={prototypeKey} repo={repo} consoleUrl={consoleUrl} previewUrl={previewUrl} buildStatus={buildStatus} />
        : <Guidance tone="muted">Click <b>Provision branch</b> above — it commits the brief + page snapshots so <span className="font-mono">clone + claude</span> starts build-ready. The exact commands appear here right after.</Guidance>}
    </>
  );
}

function Guidance({ tone, children }: { tone: "warn" | "muted"; children: React.ReactNode }) {
  const cls = tone === "warn"
    ? "border-warn/40 bg-[color-mix(in_srgb,var(--warn)_5%,transparent)] text-foreground"
    : "border-border bg-surface text-muted-2";
  return <div className={`rounded-xl border ${cls} px-4 py-3 text-[12px] leading-relaxed`}>{children}</div>;
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

function Commands({ prototypeKey, repo, consoleUrl, previewUrl, buildStatus }: { prototypeKey: string; repo?: { fullName: string; branch: string }; consoleUrl: string; previewUrl?: string; buildStatus: { found: boolean | null; headSha?: string; bytes?: number; branchExists?: boolean } }) {
  const [copied, setCopied] = useState(false);
  const fullName = repo?.fullName ?? "owner/repo";
  const branch = repo?.branch || `prototype/${prototypeKey}`;
  const dir = fullName.split("/")[1] ?? prototypeKey;

  // (BuildSection guards the starter-branch case before we get here.)
  // Existing branch → checkout; new branch → fork off starter (never clobber).
  const checkout = buildStatus.branchExists
    ? `git checkout ${branch}`
    : `git checkout -b ${branch} origin/starter && git push -u origin ${branch}`;

  const previewLine = previewUrl
    ? `\n\n# 3. LOCAL DEV — the real page with your build injected, reloads on save (no token)\nTARGET_URL="${previewUrl}" node dev.mjs      # open http://localhost:4400`
    : `\n\n# 3. LOCAL DEV — the real page with your build injected (add a target page on the Pages tab)\nTARGET_URL="https://<your target page>" node dev.mjs      # open http://localhost:4400`;

  const cmds =
`# 1. clone + get on your prototype branch (zero install, zero token)
git clone git@github.com:${fullName}.git ${dir}
cd ${dir} && ${checkout}

# 2. build with Claude — it reads .opmc/ (your brief + the page snapshot)
claude${previewLine}`;

  async function copy() {
    try { await navigator.clipboard.writeText(cmds); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  }

  return (
    <div className="rounded-xl border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] overflow-hidden">
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-accent/30">
        <div>
          <span className="text-[12px] font-semibold">✓ Provisioned — run this to build locally</span>
          <span className="text-[11px] text-muted-2 ml-2">Claude wakes up with your brief + page snapshot in the tree.</span>
        </div>
        <button onClick={copy} className="text-[12px] text-accent hover:text-accent-hover font-medium">{copied ? "Copied" : "Copy"}</button>
      </div>
      <pre className="px-4 py-3 text-[11px] font-mono text-muted leading-relaxed overflow-x-auto">{cmds}</pre>
      <div className="px-4 pb-3 text-[11px] text-muted-2 border-t border-border/60 pt-2.5 space-y-1">
        <div>
          <span className="font-medium text-muted">The loop:</span> edit → save (localhost:4400 reloads) → happy? commit + push → review on real prep at{" "}
          <span className="font-mono">{previewUrl ? `${previewUrl}?opmc=${prototypeKey}` : `<page>?opmc=${prototypeKey}`}</span>.
          The API token (<Link href="/settings/repositories" className="text-accent hover:text-accent-hover">API access</Link>) is only needed to <em>cut a version</em>.
        </div>
        <div>
          Build status:{" "}
          {buildStatus.found === true
            ? <span className="text-ok">✓ built variation present{buildStatus.headSha ? ` · ${buildStatus.headSha.slice(0, 7)}` : ""}{typeof buildStatus.bytes === "number" ? ` · ${buildStatus.bytes.toLocaleString()} bytes` : ""}</span>
            : buildStatus.found === false
            ? <span className="text-warn">not built yet — build it locally, then Cut a version on the Build tab</span>
            : <span className="text-muted-2">couldn&apos;t read the repo (check GitHub connection)</span>}
        </div>
      </div>
    </div>
  );
}
