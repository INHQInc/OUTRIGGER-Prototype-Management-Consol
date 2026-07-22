"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * "Build with Claude" — the init prompt. Provisions behind the button (so
 * Claude wakes up with the brief + page context), then hands the command that
 * clones the branch, launches Claude, and previews on localhost:4400.
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

  async function prepare() {
    if (busy) return;
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

  if (!provisioned) {
    return (
      <div className="rounded-xl border border-border bg-surface px-4 py-3 flex items-center justify-between gap-3">
        <span className="text-[12px] text-muted-2">Get your init script — it sets up the workspace so Claude starts loaded with this prototype.</span>
        <button onClick={prepare} disabled={busy} className="h-8 px-3 rounded-lg bg-accent text-accent-fg text-[12px] font-semibold hover:bg-accent-hover disabled:opacity-40 shrink-0">{busy ? "Setting up…" : "Get init script"}</button>
        {err && <span className="text-[12px] text-danger">{err}</span>}
      </div>
    );
  }

  const fullName = repo.fullName;
  const branch = repo.branch || `prototype/${prototypeKey}`;
  const dir = fullName.split("/")[1] ?? prototypeKey;
  const checkout = buildStatus.branchExists ? `git checkout ${branch}` : `git checkout -b ${branch} origin/starter && git push -u origin ${branch}`;
  const preview = previewUrl ? `\nTARGET_URL="${previewUrl}" node dev.mjs      # preview → http://localhost:4400` : "\nnode dev.mjs      # preview → http://localhost:4400";
  const cmds = `git clone git@github.com:${fullName}.git ${dir}\ncd ${dir} && ${checkout}\nclaude${preview}`;

  async function copy() { try { await navigator.clipboard.writeText(cmds); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* */ } }

  return (
    <div className="rounded-xl border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] overflow-hidden">
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-accent/30">
        <span className="text-[12px] font-semibold">Run this to build</span>
        <button onClick={copy} className="text-[12px] text-accent hover:text-accent-hover font-medium">{copied ? "Copied" : "Copy"}</button>
      </div>
      <pre className="px-4 py-3 text-[11px] font-mono text-muted leading-relaxed overflow-x-auto">{cmds}</pre>
      <div className="px-4 pb-3 text-[11px] text-muted-2 border-t border-border/60 pt-2.5">
        Claude wakes up loaded with this prototype + the page(s). Edit → save → <span className="font-mono">localhost:4400</span> reloads on the real page. Push when it&apos;s good.
        {buildStatus.found === true && <span className="text-ok"> · ✓ built v-present ({buildStatus.headSha?.slice(0, 7)})</span>}
      </div>
    </div>
  );
}
