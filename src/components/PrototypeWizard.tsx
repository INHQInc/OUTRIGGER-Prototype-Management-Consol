"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Target = { url: string; source: "clone" | "live" };

const inp = "w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none";
const ta = inp + " resize-none leading-relaxed";
const lbl = "block text-[12px] font-medium text-muted mb-1";
const hint = "text-[11px] text-muted-2 mt-1";

const STEPS = [
  { key: "where", label: "Target" },
  { key: "what", label: "The change" },
  { key: "guardrails", label: "Guardrails" },
  { key: "review", label: "Review" },
] as const;

/**
 * Prototype wizard — captures the critical-path inputs Claude needs to start
 * building, one concern per step. Design is NOT captured here (no mockups —
 * it's discovered by iterating with Claude); we capture intent + where + the
 * success rubric, and let the target page itself be the visual reference.
 */
export function PrototypeWizard({ envUrls }: { envUrls: string[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [targets, setTargets] = useState<Target[]>([{ url: "", source: "live" }]);
  const [change, setChange] = useState("");
  const [where, setWhere] = useState("");
  const [success, setSuccess] = useState("");
  const [constraints, setConstraints] = useState("");
  const [reference, setReference] = useState("");

  const cleanTargets = targets.filter((t) => t.url.trim()).map((t) => ({ url: t.url.trim(), source: t.source }));

  const valid: Record<number, boolean> = {
    0: name.trim().length > 0 && targets.every((t) => !t.url.trim() || isUrl(t.url)),
    1: change.trim().length > 0,
    2: true,
    3: true,
  };

  function setTarget(i: number, patch: Partial<Target>) {
    setTargets((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  }

  async function create() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/prototypes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          targets: cleanTargets,
          brief: { change: change.trim(), doneLooksLike: success.trim(), where: where.trim(), constraints: constraints.trim(), reference: reference.trim() },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Could not create prototype"); setBusy(false); return; }
      router.push(`/prototypes/${data.prototype.key}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e)); setBusy(false);
    }
  }

  const last = step === STEPS.length - 1;

  return (
    <div className="max-w-xl">
      {/* Stepper */}
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <button
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              className={`flex items-center gap-1.5 text-[12px] ${i === step ? "text-foreground font-semibold" : i < step ? "text-muted hover:text-foreground" : "text-muted-2"}`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${i < step ? "bg-accent/15 text-accent border-accent/40" : i === step ? "border-accent text-accent" : "border-border"}`}>
                {i < step ? "✓" : i + 1}
              </span>
              {s.label}
            </button>
            {i < STEPS.length - 1 && <span className="w-6 h-px bg-border" />}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-surface p-5 space-y-4 min-h-[280px]">
        {step === 0 && (
          <>
            <div>
              <label className={lbl}>Name</label>
              <input className={inp} value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Favorites on room cards" />
              <div className={hint}>Becomes the prototype key + branch (prototype/&lt;key&gt;).</div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={`${lbl} mb-0`}>Target page(s)</label>
                <button type="button" onClick={() => setTargets((ts) => [...ts, { url: "", source: "live" }])} className="text-[12px] text-accent hover:text-accent-hover font-medium">+ Add page</button>
              </div>
              {targets.map((t, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <input list={`w-envs-${i}`} className={`${inp} font-mono`} value={t.url} onChange={(e) => setTarget(i, { url: e.target.value })} placeholder="https://prep.example.com/path/to/page" spellCheck={false} />
                  <datalist id={`w-envs-${i}`}>{envUrls.map((u) => <option key={u} value={u} />)}</datalist>
                  {targets.length > 1 && <button type="button" onClick={() => setTargets((ts) => ts.filter((_, j) => j !== i))} className="text-[13px] text-danger hover:opacity-80 px-1">✕</button>}
                </div>
              ))}
              <div className={hint}>The page(s) the prototype changes and gets reviewed on. The console snapshots them for offline selector work when you provision the branch.</div>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div>
              <label className={lbl}>What changes on the page?</label>
              <textarea className={ta} rows={3} value={change} onChange={(e) => setChange(e.target.value)} autoFocus placeholder="Plain words — the thing to build. e.g. Add a heart to each room card that saves the room to a favorites tray." />
              <div className={hint}>This is what Claude builds toward. The design itself you&apos;ll iterate on together.</div>
            </div>
            <div>
              <label className={lbl}>Where on the page? <span className="text-muted-2 font-normal">(optional)</span></label>
              <input className={inp} value={where} onChange={(e) => setWhere(e.target.value)} placeholder="e.g. the room-listing cards / the sticky header CTA / a selector" />
            </div>
            <div>
              <label className={lbl}>Success looks like <span className="text-muted-2 font-normal">(in words, not a mockup)</span></label>
              <textarea className={ta} rows={2} value={success} onChange={(e) => setSuccess(e.target.value)} placeholder="How you'll know it's right. e.g. Heart toggles + persists across reload; tray opens from the Trip Planner button." />
              <div className={hint}>The rubric we verify against — it can start loose and sharpen as we iterate.</div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <label className={lbl}>Guardrails / do-not-touch <span className="text-muted-2 font-normal">(optional)</span></label>
              <textarea className={ta} rows={3} value={constraints} onChange={(e) => setConstraints(e.target.value)} autoFocus placeholder="What must not change or regress. e.g. Don't alter the booking widget; keep brand fonts; no layout shift on the hero." />
            </div>
            <div>
              <label className={lbl}>Reference <span className="text-muted-2 font-normal">(optional)</span></label>
              <input className={inp} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="A reference URL or example, if you have one (often none)" />
              <div className={hint}>No mockup needed — the target page is the visual reference, and design is discovered by iterating with Claude.</div>
            </div>
          </>
        )}

        {step === 3 && (
          <div className="space-y-3 text-[13px]">
            <Row k="Name" v={name || "—"} />
            <Row k="Target page(s)" v={cleanTargets.length ? cleanTargets.map((t) => t.url).join("  ·  ") : "none yet"} mono />
            <Row k="What changes" v={change || "—"} />
            {where && <Row k="Where" v={where} />}
            {success && <Row k="Success looks like" v={success} />}
            {constraints && <Row k="Guardrails" v={constraints} />}
            {reference && <Row k="Reference" v={reference} mono />}
            <div className="text-[11px] text-muted-2 pt-1 border-t border-border/60">Creating lands you on the prototype&apos;s Setup tab. Attach the repo on the Build tab, then provision the branch to hand Claude everything in-tree.</div>
          </div>
        )}
      </div>

      {error && <div className="text-[12px] text-danger mt-3">{error}</div>}

      <div className="flex items-center justify-between mt-4">
        <button onClick={() => (step === 0 ? router.push("/prototypes") : setStep(step - 1))} disabled={busy} className="h-9 px-4 rounded-lg text-[13px] text-muted hover:text-foreground disabled:opacity-40">
          {step === 0 ? "Cancel" : "← Back"}
        </button>
        {last ? (
          <button onClick={create} disabled={busy || !valid[0] || !valid[1]} className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {busy ? "Creating…" : "Create prototype"}
          </button>
        ) : (
          <button onClick={() => setStep(step + 1)} disabled={!valid[step]} className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            Next →
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-3">
      <span className="text-[12px] text-muted-2">{k}</span>
      <span className={`${mono ? "font-mono text-[12px]" : ""} text-foreground leading-relaxed whitespace-pre-wrap`}>{v}</span>
    </div>
  );
}

function isUrl(s: string): boolean {
  try { new URL(s.trim()); return true; } catch { return false; }
}
