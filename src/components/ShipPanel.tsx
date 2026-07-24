"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CertificationReport } from "@/lib/certify/certify";
import type { PrototypeExperimentBinding } from "@/lib/prototypes/types";
import type { PushResult } from "@/lib/prototypes/ship";

const sel = "w-full rounded-lg bg-background border border-border px-3 py-2 text-[14px] font-mono text-foreground focus:border-accent focus:outline-none";

/**
 * Ship to Optimizely — the end of the paste era. Pick the project, then bind
 * an existing experiment OR create one from here (paused draft, URL-targeted
 * from the prototype's page, seeded with the latest cut). Every push replaces
 * the variation's custom code by API and read-back verifies it. The
 * certification report gates the button; a failed cert requires an explicit
 * override.
 */
export function ShipPanel({ prototypeKey, latestVersion, certification, initialBinding, initialLastPush, optiProjectId, targetCount = 0, prototypeName }: {
  prototypeKey: string;
  latestVersion?: { version: number; gitSha: string; hasCode: boolean };
  certification?: CertificationReport | null;
  initialBinding: PrototypeExperimentBinding | null;
  initialLastPush: PushResult | null;
  optiProjectId?: string | null;
  targetCount?: number;
  prototypeName?: string;
}) {
  const router = useRouter();
  const [binding, setBinding] = useState(initialBinding);
  const [last, setLast] = useState(initialLastPush);
  const [editing, setEditing] = useState(!initialBinding);
  const [mode, setMode] = useState<"existing" | "create">("existing");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState(optiProjectId ?? "");
  const [experiments, setExperiments] = useState<{ id: string; name: string; status: string }[]>([]);
  const [variations, setVariations] = useState<{ id: string; name: string; hasCustomCode: boolean }[]>([]);
  const [expSel, setExpSel] = useState(initialBinding?.experimentId ?? "");
  const [varSel, setVarSel] = useState(initialBinding?.variationId ?? "");
  const [newName, setNewName] = useState(prototypeName ?? "");
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [override, setOverride] = useState(false);
  const [showChecks, setShowChecks] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  // Load projects + the experiment list when the picker is open.
  useEffect(() => {
    if (!editing) return;
    let live = true;
    fetch(`/api/optimizely/experiments?key=${encodeURIComponent(prototypeKey)}&projects=1`)
      .then((r) => r.json())
      .then((d) => { if (!live) return; if (!d.error) { setProjects(d.projects ?? []); if (d.defaultProjectId) setProjectId(d.defaultProjectId); } })
      .catch(() => { /* project row simply stays hidden */ });
    fetch(`/api/optimizely/experiments?key=${encodeURIComponent(prototypeKey)}`)
      .then((r) => r.json())
      .then((d) => { if (!live) return; if (d.error) setLoadErr(d.error); else { setExperiments(d.experiments ?? []); setLoadErr(null); } })
      .catch((e) => { if (live) setLoadErr(String(e)); });
    return () => { live = false; };
  }, [editing, prototypeKey, reloadTick]);

  // Load variations for the selected experiment.
  useEffect(() => {
    if (!editing || !expSel) { setVariations([]); return; }
    let live = true;
    fetch(`/api/optimizely/experiments?key=${encodeURIComponent(prototypeKey)}&experimentId=${encodeURIComponent(expSel)}`)
      .then((r) => r.json())
      .then((d) => { if (!live) return; if (d.error) setLoadErr(d.error); else { setVariations(d.variations ?? []); setLoadErr(null); } })
      .catch((e) => { if (live) setLoadErr(String(e)); });
    return () => { live = false; };
  }, [editing, expSel, prototypeKey]);

  async function changeProject(id: string) {
    setProjectId(id);
    if (!id) return;
    setMsg(null);
    const res = await fetch("/api/optimizely/experiments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: prototypeKey, setProjectId: id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg({ ok: false, text: data.error ?? "Couldn't switch the project" }); return; }
    setExpSel(""); setVarSel(""); setReloadTick((t) => t + 1);
  }

  async function saveBinding() {
    if (busy || !expSel || !varSel) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/prototypes/ship", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: prototypeKey,
          bind: {
            experimentId: expSel, variationId: varSel,
            experimentName: experiments.find((e) => e.id === expSel)?.name,
            variationName: variations.find((v) => v.id === varSel)?.name,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg({ ok: false, text: data.error ?? "Couldn't save the binding" }); return; }
      setBinding(data.experiment); setEditing(false);
      setMsg({ ok: true, text: "Bound. Pushes now target this variation." });
      router.refresh();
    } finally { setBusy(false); }
  }

  async function createExperiment() {
    if (busy || !newName.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/optimizely/experiments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: prototypeKey, create: { name: newName.trim() } }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg({ ok: false, text: data.error ?? "Couldn't create the experiment" }); return; }
      setBinding(data.binding); setEditing(false);
      setMsg({ ok: true, text: `Created "${data.experiment.name}" as a paused draft${data.seededVersion ? ` · seeded with v${data.seededVersion}` : ""} — it's bound; start it in Optimizely when you're ready.` });
      router.refresh();
    } finally { setBusy(false); }
  }

  const certFails = certification?.checks.filter((c) => c.level === "fail") ?? [];
  const certWarns = certification?.checks.filter((c) => c.level === "warn") ?? [];
  const canPush = Boolean(binding && latestVersion?.hasCode && (certification ? certification.passed || override : true));
  const stale = last && latestVersion && last.version < latestVersion.version;
  const expUrl = binding && (projectId || optiProjectId) ? `https://app.optimizely.com/v2/projects/${projectId || optiProjectId}/experiments/${binding.experimentId}/variations` : null;

  async function push() {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/prototypes/ship", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: prototypeKey, push: true, override: override || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg({ ok: false, text: data.error ?? "Push failed" }); return; }
      setLast(data.result);
      setMsg({ ok: true, text: `Pushed v${data.result.version} · ${Number(data.result.bytes).toLocaleString()} bytes · read-back verified ✓` });
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-accent/30 flex items-center justify-between">
        <div>
          <span className="text-[14px] font-semibold">Ship to Optimizely</span>
          <span className="text-[13px] text-muted-2 ml-2">Push the cut version into the experiment by API — no paste, read-back verified.</span>
        </div>
        {expUrl && <a href={expUrl} target="_blank" rel="noreferrer" className="text-[14px] text-accent hover:text-accent-hover font-medium shrink-0">Open in Optimizely ↗</a>}
      </div>
      <div className="p-4 space-y-3 text-[14px]">

        {/* Certification */}
        {latestVersion?.hasCode && (
          <div className={`rounded-lg border px-3 py-2.5 ${certification ? (certification.passed ? "border-ok/40 bg-[color-mix(in_srgb,var(--ok)_5%,transparent)]" : "border-danger/40 bg-[color-mix(in_srgb,var(--danger)_6%,transparent)]") : "border-border bg-surface-2/20"}`}>
            <div className="flex items-center justify-between gap-3">
              <span>
                {certification
                  ? certification.passed
                    ? <span className="text-ok font-semibold">✓ Certified{certWarns.length ? <span className="font-normal text-muted-2"> · {certWarns.length} warning{certWarns.length === 1 ? "" : "s"}</span> : null}</span>
                    : <span className="text-danger font-semibold">✗ Certification failed · {certFails.map((c) => c.title).join(" · ")}</span>
                  : <span className="text-muted-2">v{latestVersion.version} predates certification — re-cut to run the QA gate.</span>}
                <span className="text-muted-2"> · v{latestVersion.version} · {latestVersion.gitSha.slice(0, 7)}</span>
              </span>
              {certification && (
                <button onClick={() => setShowChecks(!showChecks)} className="text-[14px] text-accent hover:text-accent-hover font-medium shrink-0">{showChecks ? "Hide checks" : `Checks (${certification.checks.length})`}</button>
              )}
            </div>
            {showChecks && certification && (
              <div className="mt-2 space-y-1 border-t border-border/60 pt-2">
                {certification.checks.map((c) => (
                  <div key={c.id} className="flex items-start gap-2">
                    <span className={`shrink-0 font-bold ${c.level === "pass" ? "text-ok" : c.level === "warn" ? "text-warn" : "text-danger"}`}>{c.level === "pass" ? "✓" : c.level === "warn" ? "◐" : "✗"}</span>
                    <span><b className="text-foreground">{c.title}.</b> <span className="text-muted-2">{c.detail}</span></span>
                  </div>
                ))}
              </div>
            )}
            {certification && !certification.passed && (
              <label className="flex items-center gap-2 mt-2 pt-2 border-t border-border/60 text-[14px] text-warn cursor-pointer">
                <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="accent-[var(--warn)]" />
                Push anyway (recorded in the audit log as an override)
              </label>
            )}
          </div>
        )}

        {/* The experiment: bound, or pick/create */}
        {binding && !editing ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2/20 px-3 py-2">
            <span className="min-w-0 truncate">
              <span className="text-muted-2">Target: </span>
              <span className="font-medium">{binding.experimentName ?? `experiment ${binding.experimentId}`}</span>
              <span className="text-muted-2"> → </span>
              <span className="font-medium">{binding.variationName ?? `variation ${binding.variationId}`}</span>
            </span>
            <button onClick={() => setEditing(true)} className="text-[14px] text-muted-2 hover:text-foreground shrink-0">Change</button>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-surface-2/20 px-3 py-2.5 space-y-2.5">
            {projects.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-muted-2 shrink-0">Project</span>
                <select value={projectId} onChange={(e) => changeProject(e.target.value)} className={sel}>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}

            <div className="flex items-center gap-1 text-[13px]">
              {(["existing", "create"] as const).map((m) => (
                <button key={m} onClick={() => { setMode(m); setMsg(null); }}
                  className={`px-2.5 py-1 rounded-md font-medium ${mode === m ? "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-accent" : "text-muted-2 hover:text-foreground"}`}>
                  {m === "existing" ? "Use an existing experiment" : "Create one from this prototype"}
                </button>
              ))}
            </div>
            {loadErr && <div className="text-[14px] text-danger">{loadErr} {loadErr.includes("connected") && <Link href="/settings/experimentation" className="text-accent hover:text-accent-hover">Connect →</Link>}</div>}

            {mode === "existing" ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <select value={expSel} onChange={(e) => { setExpSel(e.target.value); setVarSel(""); }} className={sel}>
                    <option value="">— experiment —</option>
                    {experiments.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.status})</option>)}
                  </select>
                  <select value={varSel} onChange={(e) => setVarSel(e.target.value)} disabled={!expSel} className={sel}>
                    <option value="">— variation —</option>
                    {variations.map((v) => <option key={v.id} value={v.id}>{v.name}{v.hasCustomCode ? " · has code" : ""}</option>)}
                  </select>
                </div>
                <div className="flex items-center justify-end gap-3">
                  {binding && <button onClick={() => setEditing(false)} className="text-[14px] text-muted hover:text-foreground">Cancel</button>}
                  <button onClick={saveBinding} disabled={busy || !expSel || !varSel} className="h-8 px-3 rounded-lg bg-accent text-accent-fg text-[14px] font-semibold hover:bg-accent-hover disabled:opacity-40">{busy ? "Saving…" : "Save binding"}</button>
                </div>
              </>
            ) : (
              <>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Experiment name" spellCheck={false} className={sel} />
                <div className="text-[13px] text-muted-2 leading-relaxed">
                  Creates a <b>paused draft</b> A/B in Optimizely: URL-targeted to the prototype&apos;s page, Original vs Variation #1 at 50/50{latestVersion ? <>, seeded with <span className="font-mono">v{latestVersion.version}</span></> : ", seeded with a placeholder until you cut + push"}. No traffic runs until a human starts it there.
                  {targetCount === 0 && <span className="text-warn"> Add a target page (Review) first — it defines the URL targeting.</span>}
                </div>
                <div className="flex items-center justify-end gap-3">
                  {binding && <button onClick={() => setEditing(false)} className="text-[14px] text-muted hover:text-foreground">Cancel</button>}
                  <button onClick={createExperiment} disabled={busy || !newName.trim() || targetCount === 0} className="h-8 px-3 rounded-lg bg-accent text-accent-fg text-[14px] font-semibold hover:bg-accent-hover disabled:opacity-40">{busy ? "Creating…" : "Create & bind"}</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Push + state */}
        <div className="flex items-center justify-between gap-3">
          <span className={`text-[14px] min-w-0 ${msg ? (msg.ok ? "text-ok" : "text-danger") : stale ? "text-warn" : "text-muted-2"}`}>
            {msg ? msg.text
              : !latestVersion?.hasCode ? "Cut a version from the repo first — the push ships the frozen cut."
              : !binding ? "Bind or create an experiment to enable the push."
              : last ? (stale
                  ? `v${last.version} is live in Optimizely · latest cut is v${latestVersion.version} — push to update`
                  : `v${last.version} live · pushed ${new Date(last.at).toLocaleString()} · read-back ${last.verified ? "verified ✓" : "MISMATCH"}${last.overridden ? " · cert overridden" : ""}`)
              : "Never pushed — the variation in Optimizely is empty or hand-pasted."}
          </span>
          <button onClick={push} disabled={busy || !canPush} className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[15px] font-semibold hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
            {busy ? "Pushing…" : latestVersion ? `Push v${latestVersion.version} to Optimizely` : "Push"}
          </button>
        </div>
      </div>
    </div>
  );
}
