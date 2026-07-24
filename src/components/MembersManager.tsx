"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OrgMember } from "@/lib/orgs";
import { Badge } from "@/components/ui";

/** Manage the active org's members (invite by email + role, remove). */
export function MembersManager({ initialMembers, canManage }: { initialMembers: OrgMember[]; canManage: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!email.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/orgs/members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, role }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to add member"); return; }
      setEmail("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(em: string) {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/orgs/members?email=" + encodeURIComponent(em), { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      {canManage && (
        <div className="rounded-xl border border-border bg-surface p-4 flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-[14px] text-muted mb-1.5">Add member</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} spellCheck={false} placeholder="email@company.com" className="w-full rounded-lg bg-background border border-border px-3 py-2 text-[15px] font-mono text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none" />
          </div>
          <select value={role} onChange={(e) => setRole(e.target.value as "admin" | "member")} className="rounded-lg bg-background border border-border px-3 py-2 text-[15px] text-foreground focus:border-accent focus:outline-none">
            <option value="member">member</option>
            <option value="admin">admin</option>
          </select>
          <button onClick={add} disabled={busy || !email.trim()} className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[15px] font-semibold hover:bg-accent-hover disabled:opacity-40 transition-colors">Add</button>
        </div>
      )}
      {error && <div className="text-[14px] text-danger">{error}</div>}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        {initialMembers.length === 0 ? (
          <div className="px-4 py-8 text-center text-[15px] text-muted-2">No members yet — this org is only visible to operator admins.</div>
        ) : (
          initialMembers.map((m) => (
            <div key={m.email} className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0">
              <div className="text-[15px] font-mono truncate">{m.email}</div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge tone={m.role === "admin" ? "accent" : "neutral"}>{m.role}</Badge>
                {canManage && <button onClick={() => remove(m.email)} className="text-[14px] text-danger hover:opacity-80">Remove</button>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
