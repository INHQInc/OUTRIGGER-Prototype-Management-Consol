"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [email, setEmail] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/auth/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, secret }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? "Sign-in failed"); return; }
      router.push(next);
      router.refresh();
    } catch {
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center text-accent-fg font-bold">O</div>
          <div className="text-[15px] font-semibold">Prototype Console</div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6">
          <h1 className="text-[15px] font-semibold mb-1">Admin sign in</h1>
          <p className="text-[12px] text-muted-2 mb-5">Members: open the access link you were sent instead.</p>

          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="block text-[12px] font-medium text-muted mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                className="w-full h-10 rounded-lg bg-background border border-border px-3 text-[13px] focus:border-accent focus:outline-none"
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-muted mb-1.5">Access secret</label>
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                autoComplete="current-password"
                className="w-full h-10 rounded-lg bg-background border border-border px-3 text-[13px] focus:border-accent focus:outline-none"
                placeholder="••••••••"
              />
            </div>
            {err && <div className="text-[12px] text-danger">{err}</div>}
            <button
              type="submit"
              disabled={busy || !email || !secret}
              className="w-full h-10 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40 transition-colors"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-[11px] text-muted-2 text-center mt-4">Sessions last 365 days · noindex · tracking-free clones</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
