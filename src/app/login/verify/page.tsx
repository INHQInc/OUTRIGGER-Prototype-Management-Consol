"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function Verifier() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<"verifying" | "ok" | "error">("verifying");
  const [msg, setMsg] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token) { setState("error"); setMsg("No access token in this link."); return; }
    (async () => {
      try {
        const res = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (!res.ok) { setState("error"); setMsg(data.error ?? "Verification failed"); return; }
        setState("ok");
        setMsg(`Signed in as ${data.email}`);
        setTimeout(() => { router.push("/"); router.refresh(); }, 900);
      } catch {
        setState("error");
        setMsg("Network error");
      }
    })();
  }, [token, router]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center text-accent-fg font-bold">O</div>
          <div className="text-[15px] font-semibold">Prototype Console</div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-8">
          {state === "verifying" && (
            <>
              <div className="w-6 h-6 mx-auto mb-4 border-2 border-border border-t-accent rounded-full animate-spin" />
              <p className="text-[13px] text-muted">Verifying your access link…</p>
            </>
          )}
          {state === "ok" && (
            <>
              <div className="text-2xl mb-2">✔</div>
              <p className="text-[13px] text-ok">{msg}</p>
              <p className="text-[12px] text-muted-2 mt-1">Redirecting…</p>
            </>
          )}
          {state === "error" && (
            <>
              <div className="text-2xl mb-2">✕</div>
              <p className="text-[13px] text-danger">{msg}</p>
              <a href="/login" className="text-[12px] text-accent hover:text-accent-hover mt-3 inline-block">Go to sign in</a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <Verifier />
    </Suspense>
  );
}
