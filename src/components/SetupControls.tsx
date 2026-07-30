"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The client-side helpers of guided setup:
 * - a slow poll so ground-truth steps ("agent checked in", "first build")
 *   tick THEMSELVES while the user watches. Enabled only while a step is
 *   actually waiting on external truth, paused while the tab is hidden —
 *   each tick is a full force-dynamic render with GitHub reads behind it,
 *   so an unconditional interval was a cost leak.
 * - the power-user escape hatch to the working model (audited server-side).
 */
export function SetupRefresh({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const tick = () => { if (!document.hidden) router.refresh(); };
    const iv = setInterval(tick, 15_000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", tick); };
  }, [router, enabled]);
  return null;
}

export function SkipSetup({ prototypeKey }: { prototypeKey: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function skip() {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/prototypes/setup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: prototypeKey, skip: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr((data as { error?: string }).error ?? "Couldn't skip — try again.");
        return;
      }
      router.refresh();
    } catch {
      setErr("Couldn't skip — check the connection and try again.");
    } finally { setBusy(false); }
  }
  return (
    <span className="flex items-center gap-2.5">
      {err && <span className="text-[12.5px] text-danger">{err}</span>}
      <button onClick={skip} disabled={busy} className="text-[12.5px] text-muted-2 hover:text-foreground underline underline-offset-2 disabled:opacity-40">
        {busy ? "Leaving…" : "Skip setup — I know what I'm doing"}
      </button>
    </span>
  );
}
