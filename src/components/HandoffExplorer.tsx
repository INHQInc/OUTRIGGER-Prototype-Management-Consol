"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export interface HandoffVersionMeta { version: number; gitSha: string; createdAt: string; certPassed: boolean | null }

interface TreeFile { path: string; size: number }
interface DirNode { name: string; path: string; dirs: DirNode[]; files: TreeFile[] }

/** Flat GitHub tree → nested folders, dirs-first at every level. */
function buildTree(files: TreeFile[]): DirNode {
  const root: DirNode = { name: "", path: "", dirs: [], files: [] };
  for (const f of files) {
    const parts = f.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const dirPath = parts.slice(0, i + 1).join("/");
      let next = node.dirs.find((d) => d.path === dirPath);
      if (!next) { next = { name: parts[i], path: dirPath, dirs: [], files: [] }; node.dirs.push(next); }
      node = next;
    }
    node.files.push(f);
  }
  return root;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ── Lightweight syntax tokens — enough to read like an editor, zero deps. ──
type TokKind = "comment" | "string" | "keyword" | "number" | "plain";
const JS_TOKEN = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\[\s\S])*`)|\b(\d+(?:\.\d+)?)\b|\b(const|let|var|function|return|if|else|for|while|class|new|import|export|from|default|async|await|try|catch|finally|throw|typeof|instanceof|this|null|undefined|true|false|switch|case|break|continue|do|void|delete|in|of|yield|static|extends|super|interface|type|enum|readonly|public|private|protected)\b/g;
const CSS_TOKEN = /(\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|((?<![\w-])-?\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|ms|fr|deg)?\b)|(@[\w-]+|![\w-]+)/g;

const CODE_EXT = /\.(m?[jt]sx?|css|scss|json|html?|md|ya?ml|sh|mjs)$/i;
function tokenize(content: string, path: string): { kind: TokKind; text: string }[] {
  if (!CODE_EXT.test(path)) return [{ kind: "plain", text: content }];
  const re = /\.(css|scss)$/i.test(path) ? CSS_TOKEN : JS_TOKEN;
  const out: { kind: TokKind; text: string }[] = [];
  let last = 0;
  re.lastIndex = 0;
  for (let m = re.exec(content); m; m = re.exec(content)) {
    if (m.index > last) out.push({ kind: "plain", text: content.slice(last, m.index) });
    const kind: TokKind = m[1] ? "comment" : m[2] ? "string" : m[3] ? "number" : "keyword";
    out.push({ kind, text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < content.length) out.push({ kind: "plain", text: content.slice(last) });
  return out;
}

const TOK_CLASS: Record<TokKind, string> = {
  comment: "text-muted-2 italic",
  string: "text-ok",
  keyword: "text-accent font-medium",
  number: "text-warn",
  plain: "",
};

/**
 * The Handoff explorer — a VS-style, read-only browse of a CUT VERSION at its
 * exact git SHA. What the dev sees here is byte-for-byte what was certified
 * and ran in the experiment; the live branch may have moved on, this hasn't.
 */
export function HandoffExplorer({ prototypeKey, versions }: { prototypeKey: string; versions: HandoffVersionMeta[] }) {
  const [sha, setSha] = useState(versions[0]?.gitSha ?? "");
  const [files, setFiles] = useState<TreeFile[] | null>(null);
  const [treeErr, setTreeErr] = useState<string | null>(null);
  const [selPath, setSelPath] = useState<string | null>(null);
  const [file, setFile] = useState<{ path: string; content?: string; binary?: boolean; truncated?: boolean } | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const meta = versions.find((v) => v.gitSha === sha);

  // Load the tree whenever the version changes; auto-open the artifact.
  useEffect(() => {
    if (!sha) return;
    let live = true;
    setFiles(null); setTreeErr(null); setSelPath(null); setFile(null);
    fetch(`/api/prototypes/handoff-files?key=${encodeURIComponent(prototypeKey)}&sha=${encodeURIComponent(sha)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!live) return;
        if (d.error) { setTreeErr(d.error); return; }
        const fs: TreeFile[] = d.files ?? [];
        setFiles(fs);
        // Fold repo plumbing by default; the dev came for src/ + dist/.
        setCollapsed(new Set(fs.map((f) => f.path.split("/")[0]).filter((top, i, a) => a.indexOf(top) === i && (top === ".opmc" || top === ".claude" || top === ".github"))));
        const artifact = fs.find((f) => f.path === "dist/variation.js") ?? fs.find((f) => f.path.startsWith("src/")) ?? fs[0];
        if (artifact) setSelPath(artifact.path);
      })
      .catch((e) => { if (live) setTreeErr(String(e)); });
    return () => { live = false; };
  }, [sha, prototypeKey]);

  // Load a file when selected.
  useEffect(() => {
    if (!selPath || !sha) return;
    let live = true;
    setLoadingFile(true); setFileErr(null);
    fetch(`/api/prototypes/handoff-files?key=${encodeURIComponent(prototypeKey)}&sha=${encodeURIComponent(sha)}&path=${encodeURIComponent(selPath)}`)
      .then((r) => r.json())
      .then((d) => { if (!live) return; if (d.error) setFileErr(d.error); else setFile(d); })
      .catch((e) => { if (live) setFileErr(String(e)); })
      .finally(() => { if (live) setLoadingFile(false); });
    return () => { live = false; };
  }, [selPath, sha, prototypeKey]);

  const tree = useMemo(() => (files ? buildTree(files) : null), [files]);
  const selMeta = files?.find((f) => f.path === selPath);
  const lines = file?.content != null ? file.content.split("\n") : [];
  const tokens = useMemo(
    () => (file?.content != null && file.path === selPath ? tokenize(file.content, file.path) : null),
    [file, selPath],
  );

  const toggleDir = useCallback((p: string) => {
    setCollapsed((prev) => { const next = new Set(prev); if (next.has(p)) next.delete(p); else next.add(p); return next; });
  }, []);

  async function copy() {
    if (file?.content == null) return;
    try { await navigator.clipboard.writeText(file.content); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  }

  if (versions.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface px-4 py-3 text-[14px] text-muted-2">
        <span className="font-semibold text-muted">Version explorer</span> — cut a version first (Experimentation); the handoff browses the frozen winner, never the moving branch.
      </div>
    );
  }

  const renderDir = (node: DirNode, depth: number): React.ReactNode => (
    <div key={node.path || "root"}>
      {node.dirs.map((d) => (
        <div key={d.path}>
          <button onClick={() => toggleDir(d.path)} style={{ paddingLeft: `${depth * 14 + 10}px` }}
            className="w-full flex items-center gap-1.5 py-1 text-left text-[13px] text-muted hover:text-foreground hover:bg-surface-2/50">
            <span className="text-[10px] w-3 shrink-0">{collapsed.has(d.path) ? "▸" : "▾"}</span>
            <span className="font-medium">{d.name}/</span>
          </button>
          {!collapsed.has(d.path) && renderDir(d, depth + 1)}
        </div>
      ))}
      {node.files.map((f) => {
        const name = f.path.split("/").pop();
        const active = selPath === f.path;
        return (
          <button key={f.path} onClick={() => setSelPath(f.path)} style={{ paddingLeft: `${depth * 14 + 27}px` }}
            className={`w-full flex items-center gap-2 py-1 text-left text-[13px] font-mono truncate ${active ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-foreground" : "text-muted hover:text-foreground hover:bg-surface-2/50"}`}>
            <span className="truncate">{name}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      {/* Toolbar: WHICH frozen cut you are looking at */}
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-3 flex-wrap">
        <span className="text-[14px] font-semibold">Version explorer</span>
        <select value={sha} onChange={(e) => setSha(e.target.value)}
          className="rounded-lg bg-background border border-border px-2.5 py-1.5 text-[13px] font-mono text-foreground focus:border-accent focus:outline-none">
          {versions.map((v) => (
            <option key={v.gitSha} value={v.gitSha}>v{v.version} · {v.gitSha.slice(0, 7)} · {new Date(v.createdAt).toLocaleDateString()}</option>
          ))}
        </select>
        {meta && (
          <span className={`text-[12.5px] px-2 py-0.5 rounded-full border ${meta.certPassed === true ? "border-ok/40 text-ok" : meta.certPassed === false ? "border-danger/40 text-danger" : "border-border text-muted-2"}`}>
            {meta.certPassed === true ? "certified ✓" : meta.certPassed === false ? "cert FAILED" : "pre-certification"}
          </span>
        )}
        <span className="text-[12.5px] text-muted-2 ml-auto">read-only · pinned to <span className="font-mono">{sha.slice(0, 7)}</span></span>
      </div>

      {treeErr ? (
        <div className="px-4 py-4 text-[14px] text-danger">{treeErr}</div>
      ) : !files ? (
        <div className="px-4 py-6 text-[14px] text-muted-2">Loading the tree at {sha.slice(0, 7)}…</div>
      ) : (
        <div className="grid grid-cols-[15rem_minmax(0,1fr)] min-h-[26rem] max-h-[42rem]">
          {/* File tree */}
          <div className="border-r border-border overflow-y-auto py-1.5 bg-surface-2/20">
            {tree && renderDir(tree, 0)}
          </div>

          {/* Code pane */}
          <div className="flex flex-col min-w-0">
            <div className="px-3.5 py-2 border-b border-border flex items-center gap-3 text-[12.5px] text-muted-2">
              <span className="font-mono truncate text-muted">{selPath ?? "select a file"}</span>
              {selMeta && <span className="shrink-0">{fmtBytes(selMeta.size)}</span>}
              {file?.content != null && lines.length > 0 && <span className="shrink-0">{lines.length.toLocaleString()} lines</span>}
              {file?.content != null && (
                <button onClick={copy} className="ml-auto shrink-0 text-accent hover:text-accent-hover font-medium text-[13px]">{copied ? "Copied" : "Copy file"}</button>
              )}
            </div>
            <div className="flex-1 overflow-auto bg-background/60">
              {fileErr ? (
                <div className="px-4 py-4 text-[14px] text-danger">{fileErr}</div>
              ) : loadingFile ? (
                <div className="px-4 py-4 text-[13px] text-muted-2">Loading…</div>
              ) : file?.binary ? (
                <div className="px-4 py-4 text-[14px] text-muted-2">Binary file — not rendered.</div>
              ) : file?.content != null ? (
                <div className="flex text-[12.5px] leading-[1.6] font-mono">
                  <pre aria-hidden className="px-3 py-3 text-right text-muted-2/70 select-none border-r border-border/60 bg-surface-2/20 shrink-0">
                    {lines.map((_, i) => `${i + 1}\n`).join("")}
                  </pre>
                  <pre className="px-4 py-3 text-foreground/90 min-w-0">
                    {tokens?.map((t, i) => t.kind === "plain" ? t.text : <span key={i} className={TOK_CLASS[t.kind]}>{t.text}</span>)}
                    {file.truncated && <span className="text-warn">
{"\n"}… truncated at 400 KB — pull the branch to see the rest.</span>}
                  </pre>
                </div>
              ) : (
                <div className="px-4 py-4 text-[13px] text-muted-2">Select a file on the left.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
