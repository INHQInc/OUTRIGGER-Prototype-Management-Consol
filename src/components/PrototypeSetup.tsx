"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PrototypeBrief } from "@/lib/prototypes/types";

const ta = "w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none resize-none";
const link = "text-accent hover:text-accent-hover font-medium";

/**
 * Overview — the ladder to local dev. Each rung lights up as it's done; the
 * final rung (Start local dev) unlocks the run command once the rest are done.
 * Below it: the build brief (you + Claude both edit).
 */
export function PrototypeSetup({ prototypeKey, repo, brief, hasPages, consoleUrl, previewUrl, buildStatus, provisioned }: {
  prototypeKey: string;
  repo?: { fullName: string; branch: string };
  brief: PrototypeBrief;
  hasPages: boolean;
  consoleUrl: string;
  previewUrl?: string;
  buildStatus: { found: boolean | null; headSha?: string; bytes?: number; branchExists?: boolean };
  provisioned: boolean;
}) {
  const router = useRouter();
  const base = `/prototypes/${prototypeKey}`;
  const hasRepo = Boolean(repo);
  const hasBrief = Boolean(brief.change?.trim());
  const ready = hasRepo && hasBrief && hasPages && provisioned;

  return (
    <div className="space-y-4 max-w-2xl">
      <Ladder
        base={base}
        prototypeKey={prototypeKey}
        hasRepo={hasRepo}
        hasBrief={hasBrief}
        hasPages={hasPages}
        provisioned={provisioned}
        ready={ready}
        repo={repo}
        onChange={() => router.refresh()}
      />
      {ready && <Commands prototypeKey={prototypeKey} repo={repo} consoleUrl={consoleUrl} previewUrl={previewUrl} buildStatus={buildStatus} />}
      <BriefCard prototypeKey={prototypeKey} initial={brief} onSaved={() => router.refresh()} />
    </div>
  );
}

/** The ladder to local dev — steps light up; the final rung reveals the command. */
function Ladder({ base, prototypeKey, hasRepo, hasBrief, hasPages, provisioned, ready, repo, onChange }: {
  base: string;
  prototypeKey: string;
  hasRepo: boolean;
  hasBrief: boolean;
  hasPages: boolean;
  provisioned: boolean;
  ready: boolean;
  repo?: { fullName: string; branch: string };
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function prepare() {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/prototypes/provision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: prototypeKey }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error ?? "Couldn't prepare the workspace"); return; }
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't prepare the workspace");
    } finally { setBusy(false); }
  }

  const steps: { label: string; sub?: string; done: boolean; action: React.ReactNode }[] = [
    { label: "Code location", sub: hasRepo ? repo?.fullName : undefined, done: hasRepo,
      action: hasRepo ? null : <Link href="/settings/repositories" className={link}>Connect your code repo →</Link> },
    { label: "Build brief", sub: hasBrief ? undefined : "what to build — a line or two", done: hasBrief,
      action: hasBrief ? null : <a href="#brief" className={link}>Write it below →</a> },
    { label: "Test page(s)", done: hasPages,
      action: hasPages ? null : <Link href={`${base}/pages`} className={link}>Add a page →</Link> },
    { label: "Prepare workspace", sub: provisioned ? "ready" : "snapshots the page so Claude works offline", done: provisioned,
      action: provisioned ? null : <button onClick={prepare} disabled={busy || !hasRepo} className="h-7 px-3 rounded-lg bg-accent text-accent-fg text-[12px] font-semibold hover:bg-accent-hover disabled:opacity-40">{busy ? "Preparing…" : "Prepare"}</button> },
  ];

  return (
    <div className="rounded-xl border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] overflow-hidden">
      <div className="px-4 py-3 border-b border-accent/30">
        <span className="text-[13px] font-semibold">Get to local dev</span>
        <span className="text-[11px] text-muted-2 ml-2">Finish these and your run command unlocks below.</span>
      </div>
      {steps.map((s, i) => (
        <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold border shrink-0 ${s.done ? "bg-accent/15 text-accent border-accent/40" : "bg-surface-2 text-muted-2 border-border"}`}>{s.done ? "✓" : i + 1}</span>
            <div className="min-w-0">
              <span className={`text-[13px] ${s.done ? "text-muted-2" : ""}`}>{s.label}</span>
              {s.sub && <span className="text-[11px] text-muted-2 ml-2 font-mono">{s.sub}</span>}
            </div>
          </div>
          {s.action && <div className="shrink-0">{s.action}</div>}
        </div>
      ))}
      <div className={`flex items-center gap-2.5 px-4 py-2.5 ${ready ? "" : "opacity-60"}`}>
        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold border shrink-0 ${ready ? "bg-accent text-accent-fg border-accent" : "bg-surface-2 text-muted-2 border-border"}`}>{ready ? "★" : "5"}</span>
        <span className={`text-[13px] font-medium ${ready ? "text-foreground" : "text-muted-2"}`}>
          {ready ? "Start local dev — your run command is below 👇" : "Start local dev — locked until the steps above are done"}
        </span>
      </div>
      {err && <div className="px-4 pb-3 text-[12px] text-danger">{err}</div>}
    </div>
  );
}

function BriefCard({ prototypeKey, initial, onSaved }: { prototypeKey: string; initial: PrototypeBrief; onSaved: () => void }) {
  const [problem, setProblem] = useState(initial.problem);
  const [change, setChange] = useState(initial.change);
  const [done, setDone] = useState(initial.doneLooksLike);
  const [where, setWhere] = useState(initial.where ?? "");
  const [constraints, setConstraints] = useState(initial.constraints ?? "");
  const [reference, setReference] = useState(initial.reference ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = problem !== initial.problem || change !== initial.change || done !== initial.doneLooksLike
    || where !== (initial.where ?? "") || constraints !== (initial.constraints ?? "") || reference !== (initial.reference ?? "");
  const clr = () => setMsg(null);

  async function save() {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/prototypes", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: prototypeKey, brief: { problem, change, doneLooksLike: done, where, constraints, reference } }),
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
        <span className="text-[11px] text-muted-2 ml-2">What Claude builds. You and Claude both edit this — it grows as you go.</span>
      </div>
      <div className="p-4 space-y-2.5">
        <div>
          <label className="block text-[11px] text-muted-2 mb-1">What it changes <span className="text-danger">*</span></label>
          <textarea rows={2} value={change} onChange={(e) => { setChange(e.target.value); clr(); }} placeholder="The change on the page — the thing to build. This is what Claude builds toward." className={ta} />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="block text-[11px] text-muted-2 mb-1">Where on the page</label>
            <textarea rows={2} value={where} onChange={(e) => { setWhere(e.target.value); clr(); }} placeholder="e.g. the room-listing cards / a selector" className={ta} />
          </div>
          <div>
            <label className="block text-[11px] text-muted-2 mb-1">Done looks like</label>
            <textarea rows={2} value={done} onChange={(e) => { setDone(e.target.value); clr(); }} placeholder="How you'll know it's right, in words." className={ta} />
          </div>
        </div>
        <details className="rounded-lg border border-border/60">
          <summary className="px-3 py-1.5 text-[11px] text-muted-2 cursor-pointer hover:text-foreground">More — problem, guardrails, reference</summary>
          <div className="p-3 space-y-2.5 border-t border-border/60">
            <div>
              <label className="block text-[11px] text-muted-2 mb-1">Problem / opportunity</label>
              <textarea rows={2} value={problem} onChange={(e) => { setProblem(e.target.value); clr(); }} placeholder="What's not working, or the opportunity you're testing." className={ta} />
            </div>
            <div>
              <label className="block text-[11px] text-muted-2 mb-1">Guardrails / do-not-touch</label>
              <textarea rows={2} value={constraints} onChange={(e) => { setConstraints(e.target.value); clr(); }} placeholder="What must not change or regress." className={ta} />
            </div>
            <div>
              <label className="block text-[11px] text-muted-2 mb-1">Reference</label>
              <textarea rows={1} value={reference} onChange={(e) => { setReference(e.target.value); clr(); }} placeholder="A reference URL or example, if any." className={ta} />
            </div>
          </div>
        </details>
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
