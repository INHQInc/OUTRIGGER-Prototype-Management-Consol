"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Target = { url: string; source: "clone" | "live" };

const inp = "w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none";
const lbl = "block text-[12px] font-medium text-muted mb-1.5";
const section = "text-[11px] font-semibold uppercase tracking-wider text-muted-2 pt-1";

/**
 * "New prototype" button + structured creation form. Works two ways: fixed to a
 * site (`siteKey`, the site's Prototypes tab) or brand-level with a site picker
 * (`sites`, the board). Lands in the new prototype's workspace.
 */
export function NewPrototype({ siteKey, sites, defaultSite, defaultSource = "live" }: { siteKey?: string; sites?: { key: string; label: string }[]; defaultSite?: string; defaultSource?: "clone" | "live" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // identity + target
  const [siteSel, setSiteSel] = useState(siteKey ?? defaultSite ?? sites?.[0]?.key ?? "");
  const [name, setName] = useState("");
  const [targets, setTargets] = useState<Target[]>([{ url: "", source: defaultSource }]);
  const [sitePages, setSitePages] = useState<{ slug: string; url: string }[]>([]);
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

  // Load the selected site's captured pages as target suggestions.
  const activeSite = siteKey ?? siteSel;
  useEffect(() => {
    if (!open || !activeSite) { setSitePages([]); return; }
    let live = true;
    fetch(`/api/pages?site=${encodeURIComponent(activeSite)}`)
      .then((r) => (r.ok ? r.json() : { pages: [] }))
      .then((d) => { if (live) setSitePages(d.pages ?? []); })
      .catch(() => { if (live) setSitePages([]); });
    return () => { live = false; };
  }, [open, activeSite]);

  function setTarget(i: number, patch: Partial<Target>) {
    setTargets((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  }
  function addTarget() { setTargets((ts) => [...ts, { url: "", source: defaultSource }]); }
  function removeTarget(i: number) { setTargets((ts) => ts.filter((_, j) => j !== i)); }

  function reset() {
    setName(""); setTargets([{ url: "", source: defaultSource }]); setProblem(""); setChange(""); setDone("");
    setHChange(""); setHAudience(""); setHOutcome(""); setHRationale(""); setPrimary(""); setGuardrails("");
    setOwner(""); setTicketUrl(""); setError(null); setBusy(false);
  }
  function close() { if (busy) return; reset(); setOpen(false); }

  async function create() {
    const targetSite = siteKey ?? siteSel;
    if (!targetSite) { setError("Choose a site for this prototype"); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/prototypes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteKey: targetSite,
          name,
          targets: targets.filter((t) => t.url.trim()).map((t) => ({ url: t.url.trim(), source: t.source })),
          brief: { problem, change, doneLooksLike },
          hypothesis: { change: hChange, audience: hAudience, outcome: hOutcome, rationale: hRationale },
          metrics: { primary, guardrails: guardrails.split(",").map((s) => s.trim()).filter(Boolean) },
          owner, ticketUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Could not create prototype"); setBusy(false); return; }
      reset(); setOpen(false);
      router.push(`/sites/${data.prototype.siteKey}/prototypes/${data.prototype.key}`);
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
          {/* Site (brand-level creation only) */}
          {!siteKey && sites && sites.length > 0 && (
            <div>
              <label className={lbl}>Site</label>
              <select className={inp} value={siteSel} onChange={(e) => setSiteSel(e.target.value)}>
                {sites.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          )}
          {/* Identity + target */}
          <div>
            <label className={lbl}>Name</label>
            <input className={inp} value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Favorites bar on room cards" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className={`${lbl} mb-0`}>Target pages</label>
              <button type="button" onClick={addTarget} className="text-[12px] text-accent hover:text-accent-hover font-medium">+ Add page</button>
            </div>
            {targets.map((t, i) => (
              <div key={i} className="rounded-lg border border-border p-2.5 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    list={`np-pages-${i}`}
                    className={`${inp} font-mono`}
                    value={t.url}
                    onChange={(e) => setTarget(i, { url: e.target.value })}
                    placeholder="https://…/rooms  or  /rooms/*"
                    spellCheck={false}
                  />
                  <datalist id={`np-pages-${i}`}>
                    {sitePages.map((p) => <option key={p.slug} value={p.url} />)}
                  </datalist>
                  {targets.length > 1 && (
                    <button type="button" onClick={() => removeTarget(i)} title="Remove" className="text-[13px] text-danger hover:opacity-80 px-1">✕</button>
                  )}
                </div>
                <div className="flex gap-2">
                  {(["live", "clone"] as const).map((s) => (
                    <button type="button" key={s} onClick={() => setTarget(i, { source: s })} className={`px-3 py-1 rounded-lg text-[11px] font-medium border transition-colors ${t.source === s ? "border-accent text-accent bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]" : "border-border text-muted hover:text-foreground"}`}>
                      {s === "live" ? "Live (real page)" : "Clone (snapshot)"}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-[11px] text-muted-2">
              {sitePages.length > 0
                ? `${sitePages.length} captured page${sitePages.length === 1 ? "" : "s"} suggested — or type any URL / pattern (e.g. /rooms/*).`
                : "Type the URL(s) this runs on — a full URL or a pattern like /rooms/*."}
            </p>
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
