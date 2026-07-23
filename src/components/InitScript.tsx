"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const inp = "w-full rounded-lg bg-background border border-border px-3 py-2 text-[12px] font-mono text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none";

/** `~` doesn't expand inside quotes; rewrite to $HOME (which does) so paths with spaces stay safe. */
function expandHome(p: string): string {
  return p.startsWith("~") ? `$HOME${p.slice(1)}` : p;
}

const isAbsolute = (p: string) => /^[/~]/.test(p);

/**
 * "Build with Claude" — the init prompt. You say WHERE it lives on your machine
 * (required) and optionally where the real website source is checked out; the
 * browser can't read absolute paths from a folder picker, so you paste them.
 * The command then clones straight into your folder and symlinks the site
 * source in (git-ignored) so Claude builds against real markup, not a scrape.
 *
 * Paths are machine-specific, so they persist to localStorage rather than the
 * DB — but behind an EXPLICIT Save with success/failure confirmation. Saving on
 * every keystroke "worked" but left you guessing whether it had; the generated
 * command deliberately reflects the SAVED values, so Save is what makes it real.
 */
export function InitScript({ prototypeKey, repo, provisioned, previewUrl, buildStatus }: {
  prototypeKey: string;
  repo?: { fullName: string; branch: string };
  provisioned: boolean;
  previewUrl?: string;
  buildStatus: { found: boolean | null; headSha?: string; bytes?: number; branchExists?: boolean };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [synced, setSynced] = useState<string | null>(null);

  // draft (what's in the inputs) vs saved (what's persisted + drives the command)
  const [draftPath, setDraftPath] = useState("");
  const [draftSource, setDraftSource] = useState("");
  const [savedPath, setSavedPath] = useState("");
  const [savedSource, setSavedSource] = useState("");
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const pathKey = `opmc:initpath:${prototypeKey}`;
  // The site source is per-repo (same checkout for every prototype in it).
  const sourceKey = `opmc:sourcepath:${repo?.fullName ?? "default"}`;

  useEffect(() => {
    try {
      const p = localStorage.getItem(pathKey) ?? "";
      const s = localStorage.getItem(sourceKey) ?? "";
      setDraftPath(p); setSavedPath(p);
      setDraftSource(s); setSavedSource(s);
    } catch { /* no localStorage (private window) — Save will report it */ }
  }, [pathKey, sourceKey]);

  const path = savedPath.trim();
  const src = savedSource.trim();
  const pathOk = path.length > 0;
  const srcOk = src.length > 0;
  const dirty = draftPath.trim() !== savedPath.trim() || draftSource.trim() !== savedSource.trim();

  function savePaths() {
    const p = draftPath.trim();
    const s = draftSource.trim();
    if (!p) { setSaveMsg({ ok: false, text: "Local folder is required — paste the absolute path." }); return; }
    if (!isAbsolute(p)) { setSaveMsg({ ok: false, text: "Local folder must be an absolute path (start with / or ~)." }); return; }
    if (s && !isAbsolute(s)) { setSaveMsg({ ok: false, text: "Website source must be an absolute path (start with / or ~)." }); return; }
    try {
      localStorage.setItem(pathKey, p);
      localStorage.setItem(sourceKey, s);
      // Read back — proves it actually persisted rather than assuming.
      if (localStorage.getItem(pathKey) !== p) throw new Error("read-back mismatch");
      setSavedPath(p); setSavedSource(s);
      setSaveMsg({ ok: true, text: `Saved · clones to ${p}${s ? " · source will be linked as source-site" : ""}` });
    } catch {
      setSaveMsg({ ok: false, text: "Couldn't save — this browser blocked local storage (private window?). Paths won't persist." });
    }
  }

  /** Re-provision an existing branch: rewrite .opmc/** + .claude/skills/**. */
  async function resync() {
    if (busy) return;
    setBusy(true); setErr(null); setSynced(null);
    try {
      const res = await fetch("/api/prototypes/provision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: prototypeKey }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error ?? "Re-sync failed"); return; }
      const r = data.result ?? data;
      setSynced(r?.noChange
        ? "Already up to date — nothing changed."
        : `Synced${r?.commitSha ? ` · ${String(r.commitSha).slice(0, 7)}` : ""}. Run git pull, then restart Claude to load new skills.`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Re-sync failed");
    } finally { setBusy(false); }
  }

  async function prepare() {
    if (busy || !pathOk) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/prototypes/provision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: prototypeKey }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error ?? "Couldn't set up the workspace"); return; }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't set up the workspace");
    } finally { setBusy(false); }
  }

  if (!repo) {
    return <div className="rounded-xl border border-warn/40 bg-[color-mix(in_srgb,var(--warn)_5%,transparent)] px-4 py-3 text-[12px]">This prototype has no repo. <Link href={`/prototypes/${prototypeKey}/settings`} className="text-accent hover:text-accent-hover font-medium">Set one →</Link></div>;
  }

  const pathFields = (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="block text-[11px] text-muted-2">Local folder — where the prototype clones to <span className="text-danger">*</span></label>
        <input value={draftPath} onChange={(e) => { setDraftPath(e.target.value); setSaveMsg(null); }} spellCheck={false} placeholder="/Users/you/Projects/room-detail-overlay" className={inp} />
        <div className="text-[10px] text-muted-2 leading-relaxed">
          In Finder: right-click the folder → hold <span className="font-mono">⌥ Option</span> → &ldquo;Copy … as Pathname&rdquo; → paste. The clone lands here; nothing else on your machine is touched.
        </div>
      </div>
      <div className="space-y-1">
        <label className="block text-[11px] text-muted-2">Website source checkout <span className="text-muted-2">(optional — lets Claude read the real markup)</span></label>
        <input value={draftSource} onChange={(e) => { setDraftSource(e.target.value); setSaveMsg(null); }} spellCheck={false} placeholder="/Users/you/Projects/Outrigger_Website" className={inp} />
        <div className="text-[10px] text-muted-2 leading-relaxed">
          Your local checkout of the production site repo. It gets symlinked in as <span className="font-mono">source-site</span> (git-ignored, never committed) so Claude builds against real components/CSS instead of only the page snapshot.
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 pt-0.5">
        <span className={`text-[11px] ${saveMsg ? (saveMsg.ok ? "text-ok" : "text-danger") : dirty ? "text-warn" : pathOk ? "text-ok" : "text-muted-2"}`}>
          {saveMsg
            ? saveMsg.text
            : dirty
              ? "Unsaved changes — the command below still uses the saved paths."
              : pathOk
                ? "Saved in this browser."
                : "Paste the folder path, then Save."}
        </span>
        {dirty ? (
          <button onClick={savePaths} className="h-8 px-3 rounded-lg bg-accent text-accent-fg text-[12px] font-semibold hover:bg-accent-hover shrink-0">Save</button>
        ) : (
          <span className="h-8 px-3 rounded-lg border border-ok/40 text-ok text-[12px] font-semibold flex items-center shrink-0">Saved ✓</span>
        )}
      </div>
    </div>
  );

  if (!provisioned) {
    const tokenIssue = err ? /(403|not allowed|not accessible|Contents|reconnect|token)/i.test(err) : false;
    return (
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-4 py-3 space-y-3">
          <div className="text-[12px] text-muted-2 max-w-md">Get your init script — sets up the branch so Claude wakes up loaded with this prototype and its page(s).</div>
          {pathFields}
          <div className="flex items-center justify-between gap-4 border-t border-border/60 pt-3">
            <span className="text-[11px] text-muted-2">{pathOk ? "Ready — this is where it clones to." : "Save the local folder first."}</span>
            <button onClick={prepare} disabled={busy || !pathOk} className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40 shrink-0">{busy ? "Setting up…" : err ? "Try again" : "Get init script"}</button>
          </div>
        </div>
        {err && (
          <div className="px-4 py-3 border-t border-danger/30 bg-[color-mix(in_srgb,var(--danger)_6%,transparent)] space-y-1.5">
            <div className="text-[12px] text-danger leading-relaxed">{err}</div>
            {tokenIssue && <Link href="/settings/repositories" className="inline-block text-[12px] text-accent hover:text-accent-hover font-medium">Manage the GitHub connection in Settings → Repositories →</Link>}
          </div>
        )}
      </div>
    );
  }

  // provisioned → build the command from the SAVED paths
  const fullName = repo.fullName;
  const branch = repo.branch || `prototype/${prototypeKey}`;
  const checkout = buildStatus.branchExists ? `git checkout ${branch}` : `git checkout -b ${branch} origin/starter && git push -u origin ${branch}`;
  const linkLine = srcOk
    ? `\nln -sfn "${expandHome(src)}" source-site && echo "source-site" >> .git/info/exclude   # real site source — local only`
    : "";
  const preview = previewUrl ? `TARGET_URL="${previewUrl}" node dev.mjs      # preview → http://localhost:4400` : `node dev.mjs      # preview → http://localhost:4400`;
  const cmds = `git clone git@github.com:${fullName}.git "${expandHome(path)}"\ncd "${expandHome(path)}"\n${checkout}${linkLine}\nclaude\n${preview}`;

  async function copy() { try { await navigator.clipboard.writeText(cmds); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ } }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-surface p-4">{pathFields}</div>

      {/* Re-sync — the console rewrites .opmc/** and .claude/skills/** on the
          branch. Without this there is no way to push an edited brief, fresh
          page snapshots, or a changed skill set to an already-provisioned
          prototype. Safe on a live branch: compare-and-swap, and it never
          touches src/ or dist/. */}
      <div className="rounded-xl border border-border bg-surface px-4 py-3 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold">Branch content</div>
          <div className="text-[11px] text-muted-2 mt-0.5 leading-relaxed">
            Re-sync writes the current brief, page snapshots (<span className="font-mono">data.md</span>, <span className="font-mono">design-tokens.md</span>) and the selected skills into the branch. Then <span className="font-mono">git pull</span> — and restart Claude so it picks up new skills.
          </div>
          {err && <div className="text-[11px] text-danger mt-1">{err}</div>}
          {synced && <div className="text-[11px] text-ok mt-1">{synced}</div>}
        </div>
        <button onClick={resync} disabled={busy} className="h-8 px-3 rounded-lg border border-border text-[12px] font-semibold text-muted hover:text-foreground hover:border-border-strong disabled:opacity-40 shrink-0">
          {busy ? "Re-syncing…" : "Re-sync"}
        </button>
      </div>

      {pathOk ? (
        <div className="rounded-xl border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] overflow-hidden">
          <div className="px-4 py-2.5 flex items-center justify-between border-b border-accent/30">
            <span className="text-[12px] font-semibold">Run this to build</span>
            <button onClick={copy} className="text-[12px] text-accent hover:text-accent-hover font-medium">{copied ? "Copied" : "Copy"}</button>
          </div>
          <pre className="px-4 py-3 text-[11px] font-mono text-muted leading-relaxed overflow-x-auto">{cmds}</pre>
          <div className="px-4 pb-3 text-[11px] text-muted-2 border-t border-border/60 pt-2.5">
            Clones straight into <span className="font-mono">{path}</span> — that folder becomes the repo (no nested subfolder).
            {srcOk
              ? <> Claude reads the real site source at <span className="font-mono">source-site/</span>, plus the page snapshot in <span className="font-mono">.opmc/</span>.</>
              : <> Add the website source checkout above and Claude can build against real components instead of only the page snapshot.</>}
            {buildStatus.found === true && <span className="text-ok"> · ✓ built ({buildStatus.headSha?.slice(0, 7)})</span>}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-warn/40 bg-[color-mix(in_srgb,var(--warn)_6%,transparent)] px-4 py-3 text-[12px] text-warn">Save the local folder above to generate your clone command.</div>
      )}
    </div>
  );
}
