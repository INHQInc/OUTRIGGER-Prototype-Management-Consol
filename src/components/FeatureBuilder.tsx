"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Injection, InjectionMode } from "@/lib/features/types";

/** Placement presets — each maps to a (selector, mode) pair for the exporter. */
type Placement =
  | { kind: "body-end" }
  | { kind: "body-start" }
  | { kind: "head-end" }
  | { kind: "el"; mode: InjectionMode };

const PLACEMENTS: { value: string; label: string; placement: Placement; needsAnchor: boolean }[] = [
  { value: "body-end", label: "End of <body>", placement: { kind: "body-end" }, needsAnchor: false },
  { value: "body-start", label: "Start of <body>", placement: { kind: "body-start" }, needsAnchor: false },
  { value: "head-end", label: "End of <head>", placement: { kind: "head-end" }, needsAnchor: false },
  { value: "el-after", label: "After element…", placement: { kind: "el", mode: "after" }, needsAnchor: true },
  { value: "el-before", label: "Before element…", placement: { kind: "el", mode: "before" }, needsAnchor: true },
  { value: "el-prepend", label: "Prepend inside element…", placement: { kind: "el", mode: "prepend" }, needsAnchor: true },
  { value: "el-append", label: "Append inside element…", placement: { kind: "el", mode: "append" }, needsAnchor: true },
  { value: "el-replace", label: "Replace element…", placement: { kind: "el", mode: "replace" }, needsAnchor: true },
];

interface Row {
  type: "html" | "css" | "js";
  fragment?: string;
  file?: string;
  placement: string; // PLACEMENTS value
  selector: string; // anchor for element placements
}

function toRow(inj: Injection): Row {
  let placement = "el-after";
  if (inj.type === "html") {
    const sel = inj.selector ?? "";
    const mode = inj.mode ?? "after";
    if (sel === "body" && mode === "append") placement = "body-end";
    else if (sel === "body" && mode === "prepend") placement = "body-start";
    else if (sel === "head" && mode === "append") placement = "head-end";
    else placement = "el-" + mode;
  }
  return { type: inj.type, fragment: inj.fragment, file: inj.file, placement, selector: inj.type === "html" && !["body", "head"].includes(inj.selector ?? "") ? inj.selector ?? "" : "" };
}

function toInjection(r: Row): Injection {
  if (r.type !== "html") return { type: r.type, file: r.file };
  const p = PLACEMENTS.find((x) => x.value === r.placement)!.placement;
  if (p.kind === "body-end") return { type: "html", fragment: r.fragment, selector: "body", mode: "append" };
  if (p.kind === "body-start") return { type: "html", fragment: r.fragment, selector: "body", mode: "prepend" };
  if (p.kind === "head-end") return { type: "html", fragment: r.fragment, selector: "head", mode: "append" };
  return { type: "html", fragment: r.fragment, selector: r.selector, mode: p.mode };
}

const DEVICES = [
  { key: "desktop", w: 1280 },
  { key: "tablet", w: 768 },
  { key: "mobile", w: 375 },
];

export function FeatureBuilder({ featureKey, initialInjections }: { featureKey: string; initialInjections: Injection[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initialInjections.map(toRow));
  const [variant, setVariant] = useState(true);
  const [device, setDevice] = useState("desktop");
  const [nonce, setNonce] = useState(0);
  const [pickingIdx, setPickingIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const w = DEVICES.find((d) => d.key === device)!.w;
  const picking = pickingIdx !== null;
  const src = picking
    ? `/preview/feature/${featureKey}?pick=1&variant=0&n=${nonce}`
    : `/preview/feature/${featureKey}?variant=${variant ? "1" : "0"}&n=${nonce}`;

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (!e.data || !e.data.opmcPick) return;
      if (e.data.selector && pickingIdx !== null) {
        setRows((rs) => rs.map((r, i) => (i === pickingIdx ? { ...r, selector: e.data.selector } : r)));
        setDirty(true);
      }
      setPickingIdx(null);
      setNonce((n) => n + 1);
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [pickingIdx]);

  function update(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setDirty(true);
  }
  function remove(i: number) {
    setRows((rs) => rs.filter((_, idx) => idx !== i));
    setDirty(true);
  }
  function add(type: Row["type"]) {
    setRows((rs) => [...rs, type === "html" ? { type, fragment: "", placement: "body-end", selector: "" } : { type, file: type === "css" ? "overlay.css" : "overlay.js", placement: "body-end", selector: "" }]);
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const injections = rows.map(toInjection);
      const res = await fetch(`/api/features/${featureKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ injections }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error ?? "Save failed"); return; }
      setDirty(false);
      setNonce((n) => n + 1);
      setMsg("Saved");
      router.refresh();
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 2500);
    }
  }

  return (
    <div className="space-y-4">
      {/* Preview */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="h-11 border-b border-border flex items-center gap-3 px-3">
          <div className="flex items-center rounded-lg bg-background border border-border p-0.5">
            <button onClick={() => setVariant(false)} disabled={picking} className={`px-3 py-1 rounded-md text-[13px] font-medium ${!variant && !picking ? "bg-surface-2 text-foreground" : "text-muted-2 hover:text-foreground"}`}>Control</button>
            <button onClick={() => setVariant(true)} disabled={picking} className={`px-3 py-1 rounded-md text-[13px] font-medium ${variant && !picking ? "bg-accent text-accent-fg" : "text-muted-2 hover:text-foreground"}`}>Variant</button>
          </div>
          <div className="w-px h-5 bg-border" />
          <div className="flex items-center gap-1">
            {DEVICES.map((d) => (
              <button key={d.key} onClick={() => setDevice(d.key)} className={`px-2.5 py-1 rounded-md text-[13px] font-medium ${device === d.key ? "bg-surface-2 text-foreground" : "text-muted-2 hover:text-foreground"}`}>{d.key}</button>
            ))}
          </div>
          {picking && <span className="text-[13px] text-accent font-medium ml-2">Picking… click an element (Esc cancels)</span>}
          <button onClick={() => setNonce((n) => n + 1)} title="Reload" className="ml-auto text-muted-2 hover:text-foreground p-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
          </button>
          <span className="text-[13px] text-muted-2 font-mono">{w}px</span>
        </div>
        <div className="bg-[#0a0a0a] flex justify-center overflow-auto" style={{ height: 560 }}>
          <iframe ref={iframeRef} key={`${device}-${src}`} src={src} style={{ width: w, height: 560, border: 0 }} title="preview" sandbox="allow-scripts allow-same-origin" />
        </div>
      </div>

      {/* Injection editor */}
      <div className="rounded-xl border border-border bg-surface">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-[15px] font-semibold">Injection points <span className="text-muted-2 font-normal">({rows.length})</span></h3>
          <div className="flex items-center gap-2">
            {msg && <span className="text-[13px] text-muted-2">{msg}</span>}
            <button onClick={save} disabled={!dirty || saving} className="h-8 px-3 rounded-lg bg-accent text-accent-fg text-[14px] font-semibold hover:bg-accent-hover disabled:opacity-40">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        <div className="divide-y divide-border">
          {rows.map((r, i) => {
            const placement = PLACEMENTS.find((p) => p.value === r.placement);
            const needsAnchor = r.type === "html" && (placement?.needsAnchor ?? false);
            return (
              <div key={i} className="px-4 py-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[13px] font-medium border ${r.type === "html" ? "border-accent/40 text-accent" : "border-border text-muted"}`}>{r.type}</span>
                  {r.type === "html" ? (
                    <input value={r.fragment ?? ""} onChange={(e) => update(i, { fragment: e.target.value })} placeholder="fragment.html" className="w-44 h-7 rounded-md bg-background border border-border px-2 text-[13px] font-mono focus:border-accent focus:outline-none" />
                  ) : (
                    <input value={r.file ?? ""} onChange={(e) => update(i, { file: e.target.value })} placeholder={r.type === "css" ? "overlay.css" : "overlay.js"} className="w-44 h-7 rounded-md bg-background border border-border px-2 text-[13px] font-mono focus:border-accent focus:outline-none" />
                  )}
                  <button onClick={() => remove(i)} className="ml-auto text-[13px] text-danger hover:opacity-80">Remove</button>
                </div>

                {r.type === "html" && (
                  <div className="flex items-center gap-2">
                    <select value={r.placement} onChange={(e) => update(i, { placement: e.target.value })} className="h-7 rounded-md bg-background border border-border px-2 text-[13px] focus:border-accent focus:outline-none">
                      {PLACEMENTS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                    {needsAnchor && (
                      <>
                        <input value={r.selector} onChange={(e) => update(i, { selector: e.target.value })} placeholder=".class or #id or path" className="flex-1 h-7 rounded-md bg-background border border-border px-2 text-[13px] font-mono focus:border-accent focus:outline-none" />
                        <button onClick={() => { setPickingIdx(i); setNonce((n) => n + 1); }} className="h-7 px-3 rounded-md bg-surface-2 border border-border text-[13px] font-medium hover:border-accent hover:text-accent whitespace-nowrap">
                          ⌖ Pick
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {rows.length === 0 && <div className="px-4 py-6 text-center text-[14px] text-muted-2">No injections yet.</div>}
        </div>

        <div className="px-4 py-3 border-t border-border flex gap-2">
          <button onClick={() => add("html")} className="h-8 px-3 rounded-lg border border-border text-[14px] font-medium hover:border-accent hover:text-accent">+ HTML</button>
          <button onClick={() => add("css")} className="h-8 px-3 rounded-lg border border-border text-[14px] font-medium hover:border-accent hover:text-accent">+ CSS</button>
          <button onClick={() => add("js")} className="h-8 px-3 rounded-lg border border-border text-[14px] font-medium hover:border-accent hover:text-accent">+ JS</button>
        </div>
      </div>
    </div>
  );
}
