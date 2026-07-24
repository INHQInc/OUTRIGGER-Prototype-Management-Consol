"use client";

import { useState } from "react";

const DEVICES = [
  { key: "desktop", label: "Desktop", w: 1280 },
  { key: "tablet", label: "Tablet", w: 768 },
  { key: "mobile", label: "Mobile", w: 375 },
];

export function FeaturePreview({ featureKey }: { featureKey: string }) {
  const [variant, setVariant] = useState(true);
  const [device, setDevice] = useState("desktop");
  const [nonce, setNonce] = useState(0);
  const w = DEVICES.find((d) => d.key === device)!.w;
  const src = `/preview/feature/${featureKey}?variant=${variant ? "1" : "0"}&n=${nonce}`;

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="h-11 border-b border-border flex items-center gap-3 px-3">
        {/* control / variant */}
        <div className="flex items-center rounded-lg bg-background border border-border p-0.5">
          <button
            onClick={() => setVariant(false)}
            className={`px-3 py-1 rounded-md text-[13px] font-medium transition-colors ${
              !variant ? "bg-surface-2 text-foreground" : "text-muted-2 hover:text-foreground"
            }`}
          >
            Control
          </button>
          <button
            onClick={() => setVariant(true)}
            className={`px-3 py-1 rounded-md text-[13px] font-medium transition-colors ${
              variant ? "bg-accent text-accent-fg" : "text-muted-2 hover:text-foreground"
            }`}
          >
            Variant
          </button>
        </div>

        <div className="w-px h-5 bg-border" />

        {/* device */}
        <div className="flex items-center gap-1">
          {DEVICES.map((d) => (
            <button
              key={d.key}
              onClick={() => setDevice(d.key)}
              className={`px-2.5 py-1 rounded-md text-[13px] font-medium transition-colors ${
                device === d.key ? "bg-surface-2 text-foreground" : "text-muted-2 hover:text-foreground"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setNonce((n) => n + 1)}
          title="Reload preview"
          className="ml-auto text-muted-2 hover:text-foreground p-1"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
        <span className="text-[13px] text-muted-2 font-mono">{w}px</span>
      </div>

      <div className="bg-[#0a0a0a] flex justify-center overflow-auto" style={{ height: 640 }}>
        <iframe
          key={`${device}-${variant}-${nonce}`}
          src={src}
          style={{ width: w, height: 640, border: 0 }}
          title="feature preview"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </div>
  );
}
