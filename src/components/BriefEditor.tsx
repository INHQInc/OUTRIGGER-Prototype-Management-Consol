"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PrototypeBrief } from "@/lib/prototypes/types";

const ta = "w-full rounded-lg bg-background border border-border px-3 py-2 text-[13px] text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none resize-none";

/** The build brief — what Claude builds. You and Claude both edit it (Claude
 *  via the API); the console DB is the source of truth. It grows as you go. */
export function BriefEditor({ prototypeKey, initial }: { prototypeKey: string; initial: PrototypeBrief }) {
  const router = useRouter();
  const [problem, setProblem] = useState(initial.problem);
  const [change, setChange] = useState(initial.change);
  const [done, setDone] = useState(initial.doneLooksLike);
  const [where, setWhere] = useState(initial.where ?? "");
  const [constraints, setConstraints] = useState(initial.constraints ?? "");
  const [reference, setReference] = useState(initial.reference ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = problem !== initial.problem || change !== initial.change || done !== initial.doneLooksLike
    || where !== (initial.where ?? "") || constraints !== (initial.constraints ?? "") || reference !== (initial.reference ?? "");
  const clr = () => setMsg(null);

  async function save() {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/prototypes", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: prototypeKey, brief: { problem, change, doneLooksLike: done, where, constraints, reference } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ ok: false, text: data.error ?? "Save failed" }); return; }
      setMsg({ ok: true, text: "Saved." });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Save failed" });
    } finally { setBusy(false); }
  }

  return (
    <div className="max-w-2xl rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border">
        <span className="text-[12px] font-semibold">Build brief</span>
        <span className="text-[11px] text-muted-2 ml-2">What Claude builds. You and Claude both edit this — it grows as you go.</span>
      </div>
      <div className="p-4 space-y-2.5">
        <div>
          <label className="block text-[11px] text-muted-2 mb-1">What it changes <span className="text-danger">*</span></label>
          <textarea rows={3} value={change} onChange={(e) => { setChange(e.target.value); clr(); }} placeholder="The change on the page — the thing to build. This is what Claude builds toward." className={ta} />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="block text-[11px] text-muted-2 mb-1">Where on the page</label>
            <textarea rows={2} value={where} onChange={(e) => { setWhere(e.target.value); clr(); }} placeholder="e.g. the room-listing cards / a selector" className={ta} />
          </div>
          <div>
            <label className="block text-[11px] text-muted-2 mb-1">Done looks like</label>
            <textarea rows={2} value={done} onChange={(e) => { setDone(e.target.value); clr(); }} placeholder="How you'll know it's right, in words." className={ta} />
          </div>
        </div>
        <div>
          <label className="block text-[11px] text-muted-2 mb-1">Problem / opportunity</label>
          <textarea rows={2} value={problem} onChange={(e) => { setProblem(e.target.value); clr(); }} placeholder="What's not working, or the opportunity you're testing." className={ta} />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="block text-[11px] text-muted-2 mb-1">Guardrails / do-not-touch</label>
            <textarea rows={2} value={constraints} onChange={(e) => { setConstraints(e.target.value); clr(); }} placeholder="What must not change or regress." className={ta} />
          </div>
          <div>
            <label className="block text-[11px] text-muted-2 mb-1">Reference</label>
            <textarea rows={2} value={reference} onChange={(e) => { setReference(e.target.value); clr(); }} placeholder="A reference URL or example, if any." className={ta} />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className={`text-[12px] ${msg ? (msg.ok ? "text-ok" : "text-danger") : "text-muted-2"}`}>{msg?.text ?? (dirty ? "Unsaved changes" : "")}</span>
          <button onClick={save} disabled={busy || !dirty} className="h-8 px-3 rounded-lg bg-accent text-accent-fg text-[12px] font-semibold hover:bg-accent-hover disabled:opacity-40">{busy ? "Saving…" : "Save brief"}</button>
        </div>
      </div>
    </div>
  );
}
