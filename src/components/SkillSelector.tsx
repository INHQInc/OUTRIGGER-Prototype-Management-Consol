"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Skill, SkillScope } from "@/lib/skills/skills";

const SCOPE_LABEL: Record<SkillScope, string> = { global: "generic", brand: "brand", prototype: "this prototype" };

/**
 * Which skills this prototype's Claude wakes up with. The set is materialised
 * into `.claude/skills/` on the branch at provision — so a change here only
 * reaches Claude after a Re-sync, which the UI says out loud.
 */
export function SkillSelector({ prototypeKey, initial }: { prototypeKey: string; initial: { skill: Skill; enabled: boolean }[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [saved, setSaved] = useState(initial.filter((r) => r.enabled).map((r) => r.skill.id).sort().join(","));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const enabledIds = rows.filter((r) => r.enabled).map((r) => r.skill.id).sort();
  const dirty = enabledIds.join(",") !== saved;

  function toggle(id: string) {
    setRows((rs) => rs.map((r) => (r.skill.id === id ? { ...r, enabled: !r.enabled } : r)));
    setMsg(null);
  }

  async function save() {
    if (busy || !dirty) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/skills/selection", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: prototypeKey, enabledIds }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg({ ok: false, text: data.error ?? "Couldn't save" }); return; }
      setRows(data.skills ?? rows);
      setSaved(enabledIds.join(","));
      setMsg({ ok: true, text: `Saved · ${enabledIds.length} skill${enabledIds.length === 1 ? "" : "s"}. Re-sync to write them into the branch.` });
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between gap-3">
        <div>
          <span className="text-[12px] font-semibold">Skills</span>
          <span className="text-[11px] text-muted-2 ml-2">What Claude wakes up knowing. Written into <span className="font-mono">.claude/skills/</span> on provision.</span>
        </div>
        <Link href="/skills" className="text-[12px] text-accent hover:text-accent-hover font-medium shrink-0">Library →</Link>
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-4 text-[12px] text-muted-2">No skills in the library yet. <Link href="/skills" className="text-accent hover:text-accent-hover">Add one →</Link></div>
      ) : (
        rows.map(({ skill, enabled }) => (
          <div key={skill.id} className="border-b border-border/60 last:border-0">
            <div className="px-4 py-2.5 flex items-start gap-3">
              <input type="checkbox" checked={enabled} onChange={() => toggle(skill.id)} className="mt-0.5 accent-[var(--accent)] shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12px] font-mono font-medium">{skill.name}</span>
                  <span className="text-[10px] text-muted-2">{SCOPE_LABEL[skill.scope]}</span>
                </div>
                {skill.description && <p className="text-[11px] text-muted-2 mt-0.5 leading-relaxed">{skill.description}</p>}
              </div>
              <button onClick={() => setOpen(open === skill.id ? null : skill.id)} className="text-[11px] text-accent hover:text-accent-hover shrink-0">{open === skill.id ? "Hide" : "Read"}</button>
            </div>
            {open === skill.id && (
              <pre className="px-4 py-2.5 text-[11px] font-mono text-muted leading-relaxed whitespace-pre-wrap bg-background/40 border-t border-border/60 max-h-80 overflow-y-auto">{skill.body}</pre>
            )}
          </div>
        ))
      )}

      <div className="px-4 py-2.5 border-t border-border flex items-center justify-between gap-3">
        <span className={`text-[11px] ${msg ? (msg.ok ? "text-ok" : "text-danger") : dirty ? "text-warn" : "text-muted-2"}`}>
          {msg ? msg.text : dirty ? "Unsaved changes" : `${enabledIds.length} enabled`}
        </span>
        {dirty ? (
          <button onClick={save} disabled={busy} className="h-8 px-3 rounded-lg bg-accent text-accent-fg text-[12px] font-semibold hover:bg-accent-hover disabled:opacity-40 shrink-0">{busy ? "Saving…" : "Save"}</button>
        ) : (
          <span className="h-8 px-3 rounded-lg border border-ok/40 text-ok text-[12px] font-semibold flex items-center shrink-0">Saved ✓</span>
        )}
      </div>
    </div>
  );
}
