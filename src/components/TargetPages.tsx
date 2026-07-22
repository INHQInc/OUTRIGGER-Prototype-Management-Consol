"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PrototypeTarget, TargetInjection } from "@/lib/prototypes/types";

interface EnvLite { id: string; label: string; kind: string; url: string; loaderKey: string; heartbeatAt: string | null }

const inp = "w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] font-mono text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none";

/** Append the ?opmc token that triggers the loader for this prototype. */
function withToken(url: string, key: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("opmc", key);
    return u.toString();
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}opmc=${encodeURIComponent(key)}`;
  }
}

/**
 * The pages this prototype injects on. Add as many as you want; each gets a
 * one-click "Open" (with the ?opmc token pre-set) and a live red/green check
 * that the loader script is actually installed on that page.
 */
export function TargetPages({ prototypeKey, initialTargets, environments, consoleUrl }: {
  prototypeKey: string;
  initialTargets: PrototypeTarget[];
  environments: EnvLite[];
  consoleUrl: string;
}) {
  const router = useRouter();
  const [targets, setTargets] = useState<PrototypeTarget[]>(initialTargets);
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copiedTag, setCopiedTag] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const verifiedCount = targets.filter((t) => t.injection?.state === "present" || t.injection?.state === "confirmed").length;

  async function persist(next: PrototypeTarget[]) {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/prototypes", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: prototypeKey, targets: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error ?? "Save failed"); return false; }
      setTargets(next);
      router.refresh();
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
      return false;
    } finally { setBusy(false); }
  }

  async function add() {
    const url = adding.trim();
    if (!url || busy) return;
    try { new URL(url); } catch { setErr("Enter a full URL, e.g. https://prep.example.com/page"); return; }
    if (targets.some((t) => t.url === url)) { setErr("That page is already added."); return; }
    if (await persist([...targets, { url, source: "live" }])) setAdding("");
  }
  async function remove(url: string) {
    if (busy) return;
    await persist(targets.filter((t) => t.url !== url));
  }

  function tagFor(env: EnvLite) { return `<script src="${consoleUrl}/loader/${env.loaderKey}" async></script>`; }
  async function copyTag(env: EnvLite) {
    try { await navigator.clipboard.writeText(tagFor(env)); setCopiedTag(env.id); setTimeout(() => setCopiedTag(null), 1500); } catch { /* ignore */ }
  }
  async function copyLink(url: string) {
    try { await navigator.clipboard.writeText(withToken(url, prototypeKey)); setCopiedLink(url); setTimeout(() => setCopiedLink(null), 1500); } catch { /* ignore */ }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Injection script — placed on the site once per environment */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border">
          <span className="text-[12px] font-semibold">Injection script</span>
          <span className="text-[11px] text-muted-2 ml-2">The dev adds this tag once to the site&apos;s global template (e.g. before <span className="font-mono">&lt;/head&gt;</span>). Inert until a page is opened with <span className="font-mono">?opmc</span>.</span>
        </div>
        {environments.length === 0 ? (
          <div className="px-4 py-3 text-[12px] text-muted-2">
            No environments yet. Add one in <Link href="/environments" className="text-accent hover:text-accent-hover">Configuration → Environments</Link> to get a loader tag.
          </div>
        ) : (
          environments.map((env) => (
            <div key={env.id} className="px-4 py-3 border-b border-border/60 last:border-0 flex items-center justify-between gap-3">
              <pre className="text-[11px] font-mono text-muted-2 overflow-x-auto flex-1 min-w-0">{tagFor(env)}</pre>
              <button onClick={() => copyTag(env)} className="text-[12px] text-accent hover:text-accent-hover font-medium shrink-0">{copiedTag === env.id ? "Copied" : "Copy"}</button>
            </div>
          ))
        )}
      </div>

      {/* Test pages */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border">
          <span className="text-[12px] font-semibold">Test pages</span>
          <span className="text-[11px] text-muted-2 ml-2">Where the prototype injects. Each page: <b>Open ↗</b> to preview with the review token, and <b>Verify</b> that the loader is deployed on it.</span>
        </div>
        <div className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <input value={adding} onChange={(e) => { setAdding(e.target.value); setErr(null); }} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="https://prep.example.com/path/to/page" className={inp} />
            <button onClick={add} disabled={busy || !adding.trim()} className="h-9 px-3 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40 shrink-0">Add</button>
          </div>
          {err && <div className="text-[12px] text-danger">{err}</div>}
          {targets.length === 0 ? (
            <div className="text-[12px] text-muted-2 py-1">No pages yet — add the URL(s) this prototype changes.</div>
          ) : (
            <>
              <div className={`text-[11px] ${verifiedCount === targets.length ? "text-ok" : "text-muted-2"}`}>
                {verifiedCount} of {targets.length} page{targets.length === 1 ? "" : "s"} inject{verifiedCount === targets.length ? " ✓" : " verified"}
              </div>
              <div className="space-y-2">
                {targets.map((t) => (
                  <PageRow
                    key={t.url}
                    url={t.url}
                    prototypeKey={prototypeKey}
                    injection={t.injection}
                    reviewLink={withToken(t.url, prototypeKey)}
                    onCopyLink={() => copyLink(t.url)}
                    copied={copiedLink === t.url}
                    onRemove={() => remove(t.url)}
                    onVerified={() => router.refresh()}
                    busy={busy}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PageRow({ url, prototypeKey, injection, reviewLink, onCopyLink, copied, onRemove, onVerified, busy }: {
  url: string; prototypeKey: string; injection?: TargetInjection; reviewLink: string; onCopyLink: () => void; copied: boolean; onRemove: () => void; onVerified: () => void; busy: boolean;
}) {
  const [inj, setInj] = useState<TargetInjection | undefined>(injection);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function act(confirm: boolean) {
    if (checking) return;
    setChecking(true); setErr(null);
    try {
      const res = await fetch("/api/prototypes/check-injection", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: prototypeKey, url, ...(confirm ? { confirm: true } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error ?? "Verify failed"); return; }
      setInj(data.injection);
      onVerified();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Verify failed");
    } finally { setChecking(false); }
  }

  const passing = inj?.state === "present" || inj?.state === "confirmed";
  return (
    <div className="rounded-lg border border-border bg-surface-2/20 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[12px] text-foreground truncate">{url}</div>
          <InjectionBadge injection={inj} checking={checking} />
          {err && <div className="text-[11px] text-danger">{err}</div>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={() => act(false)} disabled={checking} className="text-[12px] px-2 py-0.5 rounded-md border border-border text-muted hover:text-foreground hover:border-border-strong disabled:opacity-40">{checking ? "Verifying…" : "Verify"}</button>
          {inj && !passing && <button onClick={() => act(true)} disabled={checking} title="I opened the page and saw the prototype inject" className="text-[12px] px-2 py-0.5 rounded-md border border-warn/50 text-warn hover:border-warn disabled:opacity-40">Confirm</button>}
          <button onClick={onCopyLink} className="text-[12px] text-muted-2 hover:text-foreground">{copied ? "Copied" : "Copy link"}</button>
          <a href={reviewLink} target="_blank" rel="noreferrer" className="text-[12px] text-accent hover:text-accent-hover font-medium">Open ↗</a>
          <button onClick={onRemove} disabled={busy} className="text-[12px] text-danger hover:opacity-80 disabled:opacity-40">Remove</button>
        </div>
      </div>
    </div>
  );
}

function InjectionBadge({ injection, checking }: { injection?: TargetInjection; checking: boolean }) {
  if (checking && !injection) return <div className="text-[11px] text-muted-2">Verifying injection…</div>;
  if (!injection) return <div className="text-[11px] text-muted-2">● Not verified yet — click Verify</div>;
  const who = injection.by ? ` · ${injection.by}` : "";
  switch (injection.state) {
    case "present": return <div className="text-[11px] text-ok">● Loader detected on this page{who}</div>;
    case "confirmed": return <div className="text-[11px] text-ok">● Confirmed injecting (human-verified){who}</div>;
    case "wrong-env": return <div className="text-[11px] text-warn">● Loader present but for {injection.foundEnvLabel ?? "another environment"} — Confirm if it still injects{who}</div>;
    case "absent": return <div className="text-[11px] text-danger">● Loader not found on this page — install the tag, or Confirm if it&apos;s injected client-side{who}</div>;
    default: return <div className="text-[11px] text-muted-2">● Couldn&apos;t reach the page to auto-check — open it and Confirm{who}</div>;
  }
}
