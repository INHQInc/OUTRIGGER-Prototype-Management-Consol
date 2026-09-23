"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inp = "w-full rounded-lg bg-background border border-border px-3 py-2 text-[15px] text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none";

function setActiveSiteCookie(id: string) {
  document.cookie = "opmc_site=" + encodeURIComponent(id) + "; path=/; max-age=31536000; samesite=lax";
}

/**
 * Step 1 of site setup, "Site details". Slice 2 of the Sites build: name and
 * URL. The site source and design files join this card in slice 3, with the
 * rest of the setup steps (docs/HANDOFF.md → "IN FLIGHT — SITE").
 */
export function AddSiteForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (busy || !name.trim() || !url.trim()) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/sites", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "The site couldn't be added."); return; }
      setActiveSiteCookie(data.site.id);
      router.push("/");
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl border border-border-strong bg-surface overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-3">
        <span className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[12.5px] font-bold bg-accent text-accent-fg">1</span>
        <span className="text-[15px] font-semibold">Site details</span>
      </div>
      <div className="px-4 pb-4 border-t border-border/60 pt-2 divide-y divide-border/60">
        <div className="py-3.5 space-y-2">
          <div>
            <label htmlFor="site-name" className="text-[14px] font-medium">Site name</label>
            <p className="text-[13px] text-muted-2 max-w-[68ch]">Shown in the sidebar.</p>
          </div>
          <input id="site-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main website" className={inp} autoFocus />
        </div>
        <div className="py-3.5 space-y-2">
          <div>
            <label htmlFor="site-url" className="text-[14px] font-medium">Site URL</label>
            <p className="text-[13px] text-muted-2 max-w-[68ch]">The address of the site&apos;s home page.</p>
          </div>
          <input id="site-url" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="www.example.com" spellCheck={false} className={`${inp} font-mono`} />
        </div>
        {error && <p className="pt-3 text-[13.5px] text-danger">{error}</p>}
        <div className="pt-3 flex items-center justify-end gap-2">
          <button onClick={() => router.back()} className="h-9 px-3 text-[15px] font-medium text-muted-2 hover:text-foreground">Cancel</button>
          <button onClick={add} disabled={busy || !name.trim() || !url.trim()}
            className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[15px] font-semibold hover:bg-accent-hover disabled:opacity-40">
            {busy ? "Adding…" : "Add site"}
          </button>
        </div>
      </div>
    </div>
  );
}
