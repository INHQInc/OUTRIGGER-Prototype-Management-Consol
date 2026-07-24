"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, TimeAgo } from "@/components/ui";

export interface CustomerRow { id: string; name: string; createdAt: string; prototypeCount: number; envCount: number }

function setActiveOrgCookie(id: string) {
  document.cookie = "opmc_org=" + encodeURIComponent(id) + "; path=/; max-age=31536000; samesite=lax";
}

/** Manage customers/brands — list, create, switch, rename, cascade-delete. */
export function CustomersManager({ initialCustomers, activeOrgId, canManage }: { initialCustomers: CustomerRow[]; activeOrgId: string | null; canManage: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialCustomers);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open(id: string) {
    setActiveOrgCookie(id);
    router.push("/");
    router.refresh();
  }

  async function create() {
    if (!newName.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/orgs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Could not create customer"); return; }
      setRows((r) => [...r, { id: data.org.id, name: data.org.name, createdAt: data.org.createdAt, prototypeCount: 0, envCount: 0 }]);
      setNewName(""); setCreating(false);
      router.refresh();
    } finally { setBusy(false); }
  }

  async function rename(id: string) {
    if (!editName.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/orgs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, name: editName }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Could not rename"); return; }
      setRows((r) => r.map((o) => (o.id === id ? { ...o, name: editName.trim() } : o)));
      setEditId(null);
      router.refresh();
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/orgs?org=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Could not delete"); return; }
      setRows((r) => r.filter((o) => o.id !== id));
      setConfirmId(null); setConfirmText("");
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="max-w-3xl space-y-4">
      {canManage && (
        <div className="flex justify-end">
          {creating ? (
            <div className="flex items-end gap-2 w-full rounded-xl border border-border bg-surface p-3">
              <div className="flex-1">
                <label className="block text-[14px] text-muted mb-1.5">Customer / brand name</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} autoFocus placeholder="e.g. Outrigger Hotels & Resorts" className="w-full rounded-lg bg-background border border-border px-3 py-2 text-[15px] focus:border-accent focus:outline-none" />
              </div>
              <button onClick={() => { setCreating(false); setError(null); }} className="h-9 px-3 rounded-lg text-[15px] text-muted hover:text-foreground">Cancel</button>
              <button onClick={create} disabled={busy || !newName.trim()} className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[15px] font-semibold hover:bg-accent-hover disabled:opacity-40">Create</button>
            </div>
          ) : (
            <button onClick={() => setCreating(true)} className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[15px] font-semibold hover:bg-accent-hover transition-colors">+ New customer</button>
          )}
        </div>
      )}

      {error && <div className="text-[14px] text-danger">{error}</div>}

      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-[15px] text-muted-2">No customers yet.{canManage ? " Create one to get started." : ""}</div>
        ) : (
          rows.map((o) => (
            <div key={o.id} className="border-b border-border last:border-0">
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-foreground/10 flex items-center justify-center text-[15px] font-bold shrink-0">{o.name.slice(0, 1).toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  {editId === o.id ? (
                    <div className="flex items-center gap-2">
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && rename(o.id)} autoFocus className="rounded-lg bg-background border border-border px-2 py-1 text-[15px] focus:border-accent focus:outline-none" />
                      <button onClick={() => rename(o.id)} disabled={busy} className="text-[14px] text-accent hover:text-accent-hover font-medium">Save</button>
                      <button onClick={() => setEditId(null)} className="text-[14px] text-muted-2 hover:text-foreground">Cancel</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-semibold truncate">{o.name}</span>
                      {o.id === activeOrgId && <Badge tone="accent">Active</Badge>}
                    </div>
                  )}
                  <div className="text-[13px] text-muted-2 mt-0.5">
                    <span className="font-mono">{o.id}</span> · {o.prototypeCount} prototype{o.prototypeCount === 1 ? "" : "s"} · {o.envCount} environment{o.envCount === 1 ? "" : "s"} · created <TimeAgo iso={o.createdAt} />
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {o.id !== activeOrgId && <button onClick={() => open(o.id)} className="h-8 px-3 rounded-lg border border-border text-[14px] text-muted hover:text-foreground hover:border-border-strong">Open</button>}
                  {canManage && editId !== o.id && (
                    <>
                      <button onClick={() => { setEditId(o.id); setEditName(o.name); }} className="text-[14px] text-muted-2 hover:text-foreground">Rename</button>
                      <button onClick={() => { setConfirmId(confirmId === o.id ? null : o.id); setConfirmText(""); setError(null); }} className="text-[14px] text-danger hover:opacity-80">Delete</button>
                    </>
                  )}
                </div>
              </div>

              {confirmId === o.id && (
                <div className="px-4 pb-3 pt-0">
                  <div className="rounded-lg border border-danger/40 bg-danger/5 p-3 space-y-2">
                    <div className="text-[14px] text-foreground">
                      This permanently deletes <span className="font-semibold">{o.name}</span> and cascades <span className="font-semibold">all {o.prototypeCount} prototype{o.prototypeCount === 1 ? "" : "s"} and {o.envCount} environment{o.envCount === 1 ? "" : "s"}</span> — versions, promotions, repositories, integrations, and members included. This cannot be undone.
                    </div>
                    <div className="text-[13px] text-muted-2">It does not remove branches/deploys already on the feature repo or Vercel, or experiments already in Optimizely.</div>
                    <div className="flex items-center gap-2">
                      <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={`type "${o.name}" to confirm`} className="flex-1 rounded-lg bg-background border border-border px-3 py-2 text-[14px] focus:border-danger focus:outline-none" />
                      <button onClick={() => remove(o.id)} disabled={busy || confirmText !== o.name} className="h-9 px-4 rounded-lg bg-danger text-white text-[14px] font-semibold disabled:opacity-30 disabled:cursor-not-allowed">Delete customer</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
