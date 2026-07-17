"use client";

import { useState } from "react";
import type { ConsoleUser } from "@/lib/auth/types";
import { Badge, TimeAgo } from "./ui";

export function UsersManager({ initialUsers, me }: { initialUsers: ConsoleUser[]; me: string }) {
  const [users, setUsers] = useState(initialUsers);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    const res = await fetch("/api/auth/users");
    if (res.ok) setUsers((await res.json()).users);
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/auth/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name: name || undefined, role }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? "Failed"); return; }
      setEmail(""); setName(""); setRole("member");
      await refresh();
    } finally { setBusy(false); }
  }

  async function genLink(userEmail: string) {
    setErr(null); setLink(null); setCopied(false);
    const res = await fetch("/api/auth/users/code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: userEmail }),
    });
    const data = await res.json();
    if (!res.ok) { setErr(data.error ?? "Failed"); return; }
    setLink({ email: userEmail, url: data.link });
  }

  async function remove(userEmail: string) {
    if (!confirm(`Remove ${userEmail}? Their access is revoked immediately.`)) return;
    await fetch(`/api/auth/users?email=${encodeURIComponent(userEmail)}`, { method: "DELETE" });
    await refresh();
  }

  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Add user */}
      <form onSubmit={addUser} className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-[13px] font-semibold mb-3">Add user</h2>
        <div className="flex gap-2">
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="person@rightpoint.com"
            className="flex-1 h-9 rounded-lg bg-background border border-border px-3 text-[13px] focus:border-accent focus:outline-none"
          />
          <input
            value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)"
            className="w-40 h-9 rounded-lg bg-background border border-border px-3 text-[13px] focus:border-accent focus:outline-none"
          />
          <select
            value={role} onChange={(e) => setRole(e.target.value as "member" | "admin")}
            className="h-9 rounded-lg bg-background border border-border px-2 text-[13px] focus:border-accent focus:outline-none"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button type="submit" disabled={busy || !email} className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40">
            Add
          </button>
        </div>
        {err && <div className="text-[12px] text-danger mt-2">{err}</div>}
      </form>

      {/* Generated link banner */}
      {link && (
        <div className="rounded-xl border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-medium">One-time access link for {link.email}</span>
            <button onClick={() => setLink(null)} className="text-muted-2 hover:text-foreground text-sm">×</button>
          </div>
          <div className="flex gap-2">
            <input readOnly value={link.url} className="flex-1 h-9 rounded-lg bg-background border border-border px-3 text-[11px] font-mono text-muted" />
            <button onClick={copy} className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[12px] font-semibold hover:bg-accent-hover">
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <p className="text-[11px] text-muted-2 mt-2">Send this to {link.email}. Single-use, valid 30 days; grants a 365-day session on first open.</p>
        </div>
      )}

      {/* User list */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-muted-2 border-b border-border">
              <th className="font-medium px-4 py-2.5">User</th>
              <th className="font-medium px-4 py-2.5">Role</th>
              <th className="font-medium px-4 py-2.5">Last login</th>
              <th className="font-medium px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-2">No users yet.</td></tr>
            )}
            {users.map((u) => (
              <tr key={u.email} className="border-b border-border last:border-0 hover:bg-surface-2/40">
                <td className="px-4 py-3">
                  <div className="font-medium">{u.name ?? u.email}</div>
                  {u.name && <div className="text-[11px] text-muted-2">{u.email}</div>}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={u.role === "admin" ? "accent" : "neutral"}>{u.role}</Badge>
                  {u.status === "disabled" && <span className="ml-1"><Badge tone="danger">disabled</Badge></span>}
                </td>
                <td className="px-4 py-3 text-muted"><TimeAgo iso={u.lastLoginAt ?? null} /></td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => genLink(u.email)} className="text-[12px] text-accent hover:text-accent-hover font-medium">Access link</button>
                  {u.email !== me && (
                    <button onClick={() => remove(u.email)} className="text-[12px] text-danger hover:opacity-80 font-medium ml-3">Remove</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
