"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui";
import type { Skill, SkillScope } from "@/lib/skills/skills";

const inp = "w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none";
const ta = inp + " font-mono text-[12px] leading-relaxed resize-y";

const SCOPE_LABEL: Record<SkillScope, string> = {
  global: "generic · every prototype",
  brand: "brand · this customer",
  prototype: "prototype-specific",
};
const SCOPE_TONE: Record<SkillScope, "accent" | "ok" | "neutral"> = {
  global: "accent",
  brand: "ok",
  prototype: "neutral",
};

/**
 * The skill library — what a Claude instance is told when it opens a prototype.
 * Three tiers (generic / brand / prototype); each entry carries a full
 * description AND its actual SKILL.md, readable in place, because "which
 * instructions is Claude actually running?" should never be a mystery.
 */
export function SkillLibrary({ initial, canManage }: { initial: Skill[]; canManage: boolean }) {
  const router = useRouter();
  const [skills, setSkills] = useState<Skill[]>(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<Skill | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // draft fields
  const [name, setName] = useState("");
  const [scope, setScope] = useState<SkillScope>("global");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");

  function startAdd() {
    setEditing(null); setAdding(true); setError(null);
    setName(""); setScope("global"); setDescription("");
    setBody("---\nname: my-skill\ndescription: When Claude should load this and what it covers.\n---\n\n# My skill\n\nInstructions here.\n");
  }
  function startEdit(s: Skill) {
    setAdding(false); setEditing(s); setError(null);
    setName(s.name); setScope(s.scope); setDescription(s.description); setBody(s.body);
  }
  function cancel() { setAdding(false); setEditing(null); setError(null); }

  async function save() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing?.id, name, scope, description, body }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Couldn't save the skill"); return; }
      setSkills(data.skills ?? []);
      cancel();
      router.refresh();
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/skills?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Couldn't delete"); return; }
      setSkills(data.skills ?? []);
      router.refresh();
    } finally { setBusy(false); }
  }

  const editorOpen = adding || editing;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-[13px] font-semibold">Skill library</div>
            <div className="text-[11px] text-muted-2 mt-0.5">What Claude is told when it opens a prototype. Generic skills apply everywhere; brand skills to this customer; prototype skills to one build.</div>
          </div>
          {canManage && !editorOpen && <button onClick={startAdd} className="text-[12px] text-accent hover:text-accent-hover font-medium shrink-0">+ New skill</button>}
        </div>

        {error && <div className="px-4 py-2 text-[12px] text-danger border-b border-border">{error}</div>}

        {editorOpen && (
          <div className="px-4 py-3 border-b border-border bg-surface-2/30 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-muted-2 mb-1">Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="brand-fidelity" className={inp} />
              </div>
              <div>
                <label className="block text-[11px] text-muted-2 mb-1">Applies to</label>
                <select value={scope} onChange={(e) => setScope(e.target.value as SkillScope)} className={inp}>
                  <option value="global">Every prototype (generic)</option>
                  <option value="brand">This customer&apos;s prototypes</option>
                  <option value="prototype">A single prototype</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-muted-2 mb-1">Full description — what it covers and when it applies</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inp + " resize-y"} placeholder="Brand fidelity rules: reuse site classes, namespace custom CSS, never redefine a site class globally." />
            </div>
            <div>
              <label className="block text-[11px] text-muted-2 mb-1">SKILL.md — the instructions Claude reads</label>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={16} className={ta} spellCheck={false} />
              <div className="text-[10px] text-muted-2 mt-1">Keep the <span className="font-mono">---</span> frontmatter with <span className="font-mono">name</span> + <span className="font-mono">description</span> — that&apos;s what Claude reads to decide whether to load it.</div>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button onClick={cancel} disabled={busy} className="h-8 px-3 rounded-lg text-[12px] text-muted hover:text-foreground">Cancel</button>
              <button onClick={save} disabled={busy || !name.trim() || !body.trim()} className="h-8 px-3 rounded-lg bg-accent text-accent-fg text-[12px] font-semibold hover:bg-accent-hover disabled:opacity-40">{busy ? "Saving…" : editing ? "Save changes" : "Create skill"}</button>
            </div>
          </div>
        )}

        {skills.length === 0 ? (
          <div className="px-4 py-8 text-center text-[12px] text-muted-2">No skills yet.{canManage ? " Add one, or it'll seed from the starter branch on next load." : ""}</div>
        ) : (
          skills.map((s) => (
            <div key={s.id} className="border-b border-border last:border-0">
              <div className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-mono font-medium">{s.name}</span>
                    <Badge tone={SCOPE_TONE[s.scope]}>{SCOPE_LABEL[s.scope]}</Badge>
                    {s.builtIn && <Badge tone="neutral">built-in</Badge>}
                    {s.scope === "prototype" && s.prototypeKey && <span className="text-[11px] text-muted-2 font-mono">{s.prototypeKey}</span>}
                  </div>
                  <p className="text-[12px] text-muted mt-1 leading-relaxed">{s.description || <span className="text-muted-2">No description.</span>}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button onClick={() => setOpen(open === s.id ? null : s.id)} className="text-[12px] text-accent hover:text-accent-hover font-medium">
                    {open === s.id ? "Hide" : "Read"}
                  </button>
                  {canManage && <button onClick={() => startEdit(s)} className="text-[12px] text-muted-2 hover:text-foreground">Edit</button>}
                  {canManage && !s.builtIn && <button onClick={() => remove(s.id)} disabled={busy} className="text-[12px] text-danger hover:opacity-80">Remove</button>}
                </div>
              </div>
              {open === s.id && (
                <div className="border-t border-border/60 bg-background/40">
                  <pre className="px-4 py-3 text-[11px] font-mono text-muted leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-[28rem] overflow-y-auto">{s.body}</pre>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
