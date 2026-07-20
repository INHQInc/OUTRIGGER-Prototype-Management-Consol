"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inp = "w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none";
const lbl = "block text-[12px] font-medium text-muted mb-1.5";
const section = "text-[11px] font-semibold uppercase tracking-wider text-muted-2 pt-1";

/** "New prototype" button + structured creation form (brief + hypothesis + metrics). */
export function NewPrototype({ siteKey, defaultSource = "clone" }: { siteKey: string; defaultSource?: "clone" | "live" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // identity + target
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [source, setSource] = useState<"clone" | "live">(defaultSource);
  // brief
  const [problem, setProblem] = useState("");
  const [change, setChange] = useState("");
  const [doneLooksLike, setDone] = useState("");
  // hypothesis
  const [hChange, setHChange] = useState("");
  const [hAudience, setHAudience] = useState("");
  const [hOutcome, setHOutcome] = useState("");
  const [hRationale, setHRationale] = useState("");
  // metrics + ownership
  const [primary, setPrimary] = useState("");
  const [guardrails, setGuardrails] = useState("");
  const [owner, setOwner] = useState("");
  const [ticketUrl, setTicketUrl] = useState("");

  function reset() {
    setName(""); setUrl(""); setSource("clone"); setProblem(""); setChange(""); setDone("");
    setHChange(""); setHAudience(""); setHOutcome(""); setHRationale(""); setPrimary(""); setGuardrails("");
    setOwner(""); setTicketUrl(""); setError(null); setBusy(false);
  }
  function close() { if (busy) return; reset(); setOpen(false); }

  async function create() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/prototypes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteKey,
          name,
          targets: url.trim() ? [{ url, source }] : [],
          brief: { problem, change, doneLooksLike },
          hypothesis: { change: hChange, audience: hAudience, outcome: hOutcome, rationale: hRationale },
          metrics: { primary, guardrails: guardrails.split(",").map((s) => s.trim()).filter(Boolean) },
          owner, ticketUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Could not create prototype"); setBusy(false); return; }
      reset(); setOpen(false);
      router.push(`/sites/${siteKey}/prototypes`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e)); setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover transition-colors">
        + New prototype
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-8 overflow-y-auto" onClick={close}>
      <div className="w-full max-w-2xl bg-surface border border-border rounded-2xl shadow-2xl my-8" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-border flex items-center justify-between sticky top-0 bg-surface rounded-t-2xl">
          <h2 className="text-[14px] font-semibold">New prototype</h2>
          <button onClick={close} disabled={busy} className="text-muted-2 hover:text-foreground text-lg leading-none disabled:opacity-40">×</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Identity + target */}
          <div>
            <label className={lbl}>Name</label>
            <input className={inp} value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Favorites bar on room cards" />
          </div>
          <div>
            <label className={lbl}>Target page <span className="text-muted-2">(URL)</span></label>
            <input className={`${inp} font-mono`} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.example.com/rooms" spellCheck={false} />
            <div className="flex gap-2 mt-2">
              {(["clone", "live"] as const).map((s) => (
                <button key={s} onClick={() => setSource(s)} className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${source === s ? "border-accent text-accent bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]" : "border-border text-muted hover:text-foreground"}`}>
                  {s === "clone" ? "Clone (snapshot)" : "Live (real page)"}
                </button>
              ))}
            </div>
          </div>

          {/* Brief */}
          <div className="space-y-2">
            <div className={section}>Brief</div>
            <div><label className={lbl}>Problem / opportunity</label><textarea className={inp} rows={2} value={problem} onChange={(e) => setProblem(e.target.value)} /></div>
            <div><label className={lbl}>What it changes</label><textarea className={inp} rows={2} value={change} onChange={(e) => setChange(e.target.value)} /></div>
            <div><label className={lbl}>Done looks like</label><input className={inp} value={doneLooksLike} onChange={(e) => setDone(e.target.value)} /></div>
          </div>

          {/* Hypothesis */}
          <div className="space-y-2">
            <div className={section}>Hypothesis</div>
            <p className="text-[11px] text-muted-2 leading-relaxed">
              We believe <span className="text-muted">[change]</span> for <span className="text-muted">[audience]</span> will cause <span className="text-muted">[outcome]</span> because <span className="text-muted">[rationale]</span>.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div><label className={lbl}>Change</label><input className={inp} value={hChange} onChange={(e) => setHChange(e.target.value)} placeholder="adding a favorites bar" /></div>
              <div><label className={lbl}>Audience</label><input className={inp} value={hAudience} onChange={(e) => setHAudience(e.target.value)} placeholder="returning visitors" /></div>
              <div><label className={lbl}>Outcome</label><input className={inp} value={hOutcome} onChange={(e) => setHOutcome(e.target.value)} placeholder="more room-detail views" /></div>
              <div><label className={lbl}>Rationale</label><input className={inp} value={hRationale} onChange={(e) => setHRationale(e.target.value)} placeholder="they compare rooms" /></div>
            </div>
          </div>

          {/* Metrics */}
          <div className="space-y-2">
            <div className={section}>Measurement</div>
            <div><label className={lbl}>Primary metric</label><input className={inp} value={primary} onChange={(e) => setPrimary(e.target.value)} placeholder="room-detail click-through rate" /></div>
            <div><label className={lbl}>Guardrail metrics <span className="text-muted-2">(comma-separated — must not regress)</span></label><input className={inp} value={guardrails} onChange={(e) => setGuardrails(e.target.value)} placeholder="bounce rate, page load time" /></div>
          </div>

          {/* Ownership */}
          <div className="space-y-2">
            <div className={section}>Ownership</div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className={lbl}>Owner</label><input className={inp} value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="name / squad" /></div>
              <div><label className={lbl}>Ticket link</label><input className={`${inp} font-mono`} value={ticketUrl} onChange={(e) => setTicketUrl(e.target.value)} placeholder="jira / linear URL" spellCheck={false} /></div>
            </div>
          </div>

          {error && <div className="text-[12px] text-danger">{error}</div>}
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-between sticky bottom-0 bg-surface rounded-b-2xl">
          <span className="text-[11px] text-muted-2">Repo binding + branch/deploy attach after creation.</span>
          <div className="flex gap-2">
            <button onClick={close} disabled={busy} className="h-9 px-4 rounded-lg text-[13px] text-muted hover:text-foreground disabled:opacity-40">Cancel</button>
            <button onClick={create} disabled={busy || !name.trim()} className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {busy ? "Creating…" : "Create prototype"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
