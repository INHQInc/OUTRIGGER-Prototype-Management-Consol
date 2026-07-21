"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PrototypeOverlay, OverlayBlock, OverlayMode } from "@/lib/prototypes/types";
import type { LintFinding } from "@/lib/optimizely/export";

const MODES: OverlayMode[] = ["after", "before", "prepend", "append", "replace"];
const ta = "w-full rounded-lg bg-background border border-border px-3 py-2 text-[12px] font-mono text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none";

/**
 * Author the prototype's overlay code — HTML blocks (anchored by selector),
 * CSS, and behavior JS. Compiles to the variation injected on staging and
 * shipped to Optimizely. Closes the overlay-authoring gap.
 */
export function OverlayEditor({ prototypeKey, initialOverlay, initialLint }: { prototypeKey: string; initialOverlay: PrototypeOverlay | null; initialLint: LintFinding[] }) {
  const router = useRouter();
  const [blocks, setBlocks] = useState<OverlayBlock[]>(initialOverlay?.blocks ?? []);
  const [css, setCss] = useState(initialOverlay?.css ?? "");
  const [js, setJs] = useState(initialOverlay?.js ?? "");
  const [lint, setLint] = useState<LintFinding[]>(initialLint);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setBlock(i: number, patch: Partial<OverlayBlock>) {
    setBlocks((bs) => bs.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  }
  function addBlock() { setBlocks((bs) => [...bs, { selector: "", mode: "after", html: "" }]); }
  function removeBlock(i: number) { setBlocks((bs) => bs.filter((_, j) => j !== i)); }

  async function save() {
    if (busy) return;
    setBusy(true); setError(null); setSaved(false);
    try {
      const res = await fetch("/api/prototypes/overlay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prototypeKey, css, js, blocks }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Could not save overlay"); return; }
      setLint(data.lint ?? []);
      setSaved(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <div>
          <span className="text-[12px] font-semibold">Overlay code</span>
          <span className="text-[11px] text-muted-2 ml-2">HTML blocks + CSS + JS — compiled to the injected variation.</span>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-[11px] text-ok">Saved</span>}
          <button onClick={save} disabled={busy} className="h-8 px-3 rounded-lg bg-accent text-accent-fg text-[12px] font-semibold hover:bg-accent-hover disabled:opacity-40 transition-colors">{busy ? "Saving…" : "Save overlay"}</button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* HTML blocks */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">HTML blocks</span>
            <button onClick={addBlock} className="text-[12px] text-accent hover:text-accent-hover font-medium">+ Add block</button>
          </div>
          {blocks.length === 0 && <div className="text-[12px] text-muted-2">No HTML injected. Add a block to place markup at a selector.</div>}
          {blocks.map((b, i) => (
            <div key={i} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input value={b.selector} onChange={(e) => setBlock(i, { selector: e.target.value })} spellCheck={false} placeholder="anchor selector, e.g. .hero" className={`${ta} flex-1`} />
                <select value={b.mode} onChange={(e) => setBlock(i, { mode: e.target.value as OverlayMode })} className="rounded-lg bg-background border border-border px-2 py-2 text-[12px] text-foreground focus:border-accent focus:outline-none">
                  {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <button onClick={() => removeBlock(i)} className="text-[12px] text-danger hover:opacity-80 px-1">Remove</button>
              </div>
              <textarea value={b.html} onChange={(e) => setBlock(i, { html: e.target.value })} rows={4} spellCheck={false} placeholder="<div class='promo'>…</div>" className={ta} />
            </div>
          ))}
        </div>

        {/* CSS */}
        <div className="space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">CSS</span>
          <textarea value={css} onChange={(e) => setCss(e.target.value)} rows={5} spellCheck={false} placeholder=".promo { … }" className={ta} />
        </div>

        {/* JS */}
        <div className="space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">Behavior JS <span className="normal-case text-muted-2">(runs after injection, wrapped safely)</span></span>
          <textarea value={js} onChange={(e) => setJs(e.target.value)} rows={5} spellCheck={false} placeholder="document.querySelector('.promo')?.addEventListener('click', …)" className={ta} />
        </div>

        {error && <div className="text-[12px] text-danger">{error}</div>}

        {lint.length > 0 && (
          <div className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">Selector lint</span>
            {lint.map((l, i) => (
              <div key={i} className={`text-[11px] ${l.level === "error" ? "text-danger" : l.level === "warn" ? "text-warn" : "text-muted-2"}`}>
                {l.level === "error" ? "✘" : l.level === "warn" ? "⚠" : "ℹ"} {l.selector ? <span className="font-mono">{l.selector}</span> : null} {l.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
