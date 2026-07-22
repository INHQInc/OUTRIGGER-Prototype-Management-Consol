"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui";
import type { PrototypeTarget } from "@/lib/prototypes/types";

interface EnvLite { id: string; label: string; kind: string; url: string; loaderKey: string; heartbeatAt: string | null }

type CheckResult = {
  result: "present" | "wrong-env" | "absent" | "unreachable";
  httpStatus?: number;
  reason?: string;
  foundLoaderKey?: string;
  foundEnvLabel?: string | null;
  environment?: { label: string; kind: string; expectedKey: string } | null;
  heartbeatAt?: string | null;
};

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
          <span className="text-[11px] text-muted-2 ml-2">Add this tag once to the site&apos;s global template (e.g. before <span className="font-mono">&lt;/head&gt;</span>). It&apos;s inert until a page is opened with the <span className="font-mono">?opmc</span> token.</span>
        </div>
        {environments.length === 0 ? (
          <div className="px-4 py-3 text-[12px] text-muted-2">
            No environments yet. Add one in <Link href="/environments" className="text-accent hover:text-accent-hover">Configuration → Environments</Link> to get a loader tag.
          </div>
        ) : (
          environments.map((env) => (
            <div key={env.id} className="px-4 py-3 border-b border-border/60 last:border-0">
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium">{env.label}</span>
                  <Badge tone={env.kind === "production" ? "accent" : "neutral"}>{env.kind}</Badge>
                  {env.heartbeatAt
                    ? <span className="text-[11px] text-ok">✓ verified live</span>
                    : <span className="text-[11px] text-muted-2">not detected yet</span>}
                </div>
                <button onClick={() => copyTag(env)} className="text-[12px] text-accent hover:text-accent-hover font-medium shrink-0">{copiedTag === env.id ? "Copied" : "Copy tag"}</button>
              </div>
              <pre className="text-[11px] font-mono text-muted-2 overflow-x-auto">{tagFor(env)}</pre>
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
            <div className="space-y-2">
              {targets.map((t) => (
                <PageRow
                  key={t.url}
                  url={t.url}
                  prototypeKey={prototypeKey}
                  reviewLink={withToken(t.url, prototypeKey)}
                  onCopyLink={() => copyLink(t.url)}
                  copied={copiedLink === t.url}
                  onRemove={() => remove(t.url)}
                  busy={busy}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PageRow({ url, prototypeKey, reviewLink, onCopyLink, copied, onRemove, busy }: {
  url: string; prototypeKey: string; reviewLink: string; onCopyLink: () => void; copied: boolean; onRemove: () => void; busy: boolean;
}) {
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);

  const run = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(`/api/prototypes/check-injection?key=${encodeURIComponent(prototypeKey)}&url=${encodeURIComponent(url)}`);
      const data = await res.json().catch(() => null);
      setCheck(res.ok ? data : { result: "unreachable" });
    } catch { setCheck({ result: "unreachable" }); }
    finally { setChecking(false); }
  }, [prototypeKey, url]);

  useEffect(() => { run(); }, [run]);

  return (
    <div className="rounded-lg border border-border bg-surface-2/20 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[12px] text-foreground truncate">{url}</div>
          <InjectionStatus check={check} checking={checking} />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={run} disabled={checking} className="text-[12px] px-2 py-0.5 rounded-md border border-border text-muted hover:text-foreground hover:border-border-strong disabled:opacity-40">{checking ? "Verifying…" : "Verify"}</button>
          <button onClick={onCopyLink} className="text-[12px] text-muted-2 hover:text-foreground">{copied ? "Copied" : "Copy link"}</button>
          <a href={reviewLink} target="_blank" rel="noreferrer" className="text-[12px] text-accent hover:text-accent-hover font-medium">Open ↗</a>
          <button onClick={onRemove} disabled={busy} className="text-[12px] text-danger hover:opacity-80 disabled:opacity-40">Remove</button>
        </div>
      </div>
    </div>
  );
}

function InjectionStatus({ check, checking }: { check: CheckResult | null; checking: boolean }) {
  if (checking && !check) return <div className="text-[11px] text-muted-2">Verifying injection…</div>;
  if (!check) return null;
  if (check.result === "present")
    return <div className="text-[11px] text-ok">● Injection script detected on this page</div>;
  if (check.result === "wrong-env")
    return <div className="text-[11px] text-warn">● Loader present but for {check.foundEnvLabel ?? "another environment"} — expected this page&apos;s environment</div>;
  if (check.result === "absent") {
    // Not in the raw HTML — but the loader may be injected client-side (GTM/SPA);
    // the heartbeat proves it runs in real browsers.
    if (check.heartbeatAt)
      return <div className="text-[11px] text-warn">● Not in the page HTML, but the loader is verified live on this environment (likely injected client-side)</div>;
    return <div className="text-[11px] text-danger">● Loader script not found on this page — add the tag above to the site</div>;
  }
  // unreachable
  if (check.heartbeatAt)
    return <div className="text-[11px] text-warn">● Loader active on this environment (page couldn&apos;t be auto-checked — some sites block bots)</div>;
  return <div className="text-[11px] text-muted-2">● Couldn&apos;t verify — open the page once to trigger the loader{typeof check.httpStatus === "number" && check.httpStatus > 0 ? ` (HTTP ${check.httpStatus})` : ""}</div>;
}
