"use client";

import { useState, useEffect } from "react";

const inp = "w-full rounded-lg bg-background border border-border px-3 py-2 text-[14px] font-mono text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none";

const isAbsolute = (p: string) => /^[/~]/.test(p);

/**
 * SETUP: where things live on this machine. Saved to localStorage (paths are
 * machine-specific, never the DB) behind an explicit Save with read-back
 * confirmation. The Build room reads these saved values to generate the
 * Start Claude command — same keys, different room.
 */
export function LocalFolders({ prototypeKey, repoFullName }: { prototypeKey: string; repoFullName?: string }) {
  const [draftPath, setDraftPath] = useState("");
  const [draftSource, setDraftSource] = useState("");
  const [savedPath, setSavedPath] = useState("");
  const [savedSource, setSavedSource] = useState("");
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const pathKey = `opmc:initpath:${prototypeKey}`;
  // The site source is per-repo (same checkout for every prototype in it).
  const sourceKey = `opmc:sourcepath:${repoFullName ?? "default"}`;

  useEffect(() => {
    try {
      const p = localStorage.getItem(pathKey) ?? "";
      let s = localStorage.getItem(sourceKey) ?? "";
      // Migrate: a source path saved BEFORE the repo was configured lives under
      // the "default" key — carry it to the repo's key instead of losing it.
      if (!s && repoFullName) {
        const orphan = localStorage.getItem("opmc:sourcepath:default") ?? "";
        if (orphan) { s = orphan; localStorage.setItem(sourceKey, orphan); localStorage.removeItem("opmc:sourcepath:default"); }
      }
      setDraftPath(p); setSavedPath(p);
      setDraftSource(s); setSavedSource(s);
    } catch { /* no localStorage (private window) — Save will report it */ }
  }, [pathKey, sourceKey, repoFullName]);

  const pathOk = savedPath.trim().length > 0;
  const dirty = draftPath.trim() !== savedPath.trim() || draftSource.trim() !== savedSource.trim();

  function savePaths() {
    const p = draftPath.trim();
    const s = draftSource.trim();
    if (!p) { setSaveMsg({ ok: false, text: "Local folder is required — paste the absolute path." }); return; }
    if (!isAbsolute(p)) { setSaveMsg({ ok: false, text: "Local folder must be an absolute path (start with / or ~)." }); return; }
    if (s && !isAbsolute(s)) { setSaveMsg({ ok: false, text: "Website source must be an absolute path (start with / or ~)." }); return; }
    try {
      localStorage.setItem(pathKey, p);
      localStorage.setItem(sourceKey, s);
      // Read back — proves it actually persisted rather than assuming.
      if (localStorage.getItem(pathKey) !== p) throw new Error("read-back mismatch");
      setSavedPath(p); setSavedSource(s);
      setSaveMsg({ ok: true, text: `Saved · clones to ${p}${s ? " · source will be linked as source-site" : ""}` });
    } catch {
      setSaveMsg({ ok: false, text: "Couldn't save — this browser blocked local storage (private window?). Paths won't persist." });
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border">
        <span className="text-[14px] font-semibold">Local folders</span>
        <span className="text-[13px] text-muted-2 ml-2">Where it clones on your machine, and your site-source checkout. Saved in this browser.</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="space-y-1">
          <label className="block text-[13px] text-muted-2">Local folder — where the prototype clones to <span className="text-danger">*</span></label>
          <input value={draftPath} onChange={(e) => { setDraftPath(e.target.value); setSaveMsg(null); }} spellCheck={false} placeholder="/Users/you/Projects/room-detail-overlay" className={inp} />
          <div className="text-[12.5px] text-muted-2 leading-relaxed">
            In Finder: right-click the folder → hold <span className="font-mono">⌥ Option</span> → &ldquo;Copy … as Pathname&rdquo; → paste. The clone lands here; nothing else on your machine is touched.
          </div>
        </div>
        <div className="space-y-1">
          <label className="block text-[13px] text-muted-2">Website source checkout <span className="text-muted-2">(optional — lets Claude read the real markup)</span></label>
          <input value={draftSource} onChange={(e) => { setDraftSource(e.target.value); setSaveMsg(null); }} spellCheck={false} placeholder="/Users/you/Projects/Outrigger_Website" className={inp} />
          <div className="text-[12.5px] text-muted-2 leading-relaxed">
            Your local checkout of the production site repo. It gets symlinked in as <span className="font-mono">source-site</span> (git-ignored, never committed) so Claude builds against real components/CSS instead of only the page snapshot.
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-0.5">
          <span className={`text-[13px] ${saveMsg ? (saveMsg.ok ? "text-ok" : "text-danger") : dirty ? "text-warn" : pathOk ? "text-ok" : "text-muted-2"}`}>
            {saveMsg
              ? saveMsg.text
              : dirty
                ? "Unsaved changes — Build uses the saved paths."
                : pathOk
                  ? "Saved in this browser."
                  : "Paste the folder path, then Save."}
          </span>
          {dirty ? (
            <button onClick={savePaths} className="h-8 px-3 rounded-lg bg-accent text-accent-fg text-[14px] font-semibold hover:bg-accent-hover shrink-0">Save</button>
          ) : (
            <span className="h-8 px-3 rounded-lg border border-ok/40 text-ok text-[14px] font-semibold flex items-center shrink-0">Saved ✓</span>
          )}
        </div>
      </div>
    </div>
  );
}
