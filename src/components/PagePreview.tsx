"use client";

import { useState } from "react";

const DEVICES = [
  { key: "desktop", label: "Desktop", w: 1280 },
  { key: "tablet", label: "Tablet", w: 768 },
  { key: "mobile", label: "Mobile", w: 375 },
];

export function PagePreview({ src }: { src: string }) {
  const [device, setDevice] = useState("desktop");
  const w = DEVICES.find((d) => d.key === device)!.w;
  // Scale the iframe down to fit the column while rendering at true device width
  const scale = device === "desktop" ? 1 : 1;

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="h-10 border-b border-border flex items-center gap-1 px-3">
        {DEVICES.map((d) => (
          <button
            key={d.key}
            onClick={() => setDevice(d.key)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
              device === d.key ? "bg-surface-2 text-foreground" : "text-muted-2 hover:text-foreground"
            }`}
          >
            {d.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-muted-2 font-mono">{w}px</span>
      </div>
      <div className="bg-[#0a0a0a] flex justify-center overflow-auto" style={{ height: 620 }}>
        <iframe
          src={src}
          style={{ width: w, height: 620 / scale, transform: `scale(${scale})`, transformOrigin: "top center", border: 0 }}
          title="clone preview"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </div>
  );
}
