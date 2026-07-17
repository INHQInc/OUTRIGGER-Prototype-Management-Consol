import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { readManifest } from "@/lib/features/registry";
import { buildVariationExport } from "@/lib/optimizely/export";
import { snapshotsRoot } from "@/lib/registry";

/**
 * Serve a captured page with a feature overlaid — the QA harness.
 *   /preview/feature/<key>?variant=1   → clone + overlay (variant)
 *   /preview/feature/<key>             → clone as-is (control)
 *   optional &target=<index> to pick among the feature's targets.
 *
 * The overlay is the exact same variation JS we export to Optimizely, so what
 * you QA here is what ships as the experiment variation.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) return new NextResponse("Not found", { status: 404 });

  const manifest = await readManifest(key);
  if (!manifest || !manifest.targets.length) return new NextResponse("No target", { status: 404 });

  const idx = Number(req.nextUrl.searchParams.get("target") ?? "0") || 0;
  const target = manifest.targets[idx] ?? manifest.targets[0];
  const variant = req.nextUrl.searchParams.get("variant") === "1";
  const pick = req.nextUrl.searchParams.get("pick") === "1";

  const pageDir = join(snapshotsRoot(), target.siteKey, "pages", target.slug);
  let version = target.version;
  try {
    if (version === "latest") {
      const versions = (await readdir(pageDir)).sort();
      if (!versions.length) return new NextResponse("No versions", { status: 404 });
      version = versions[versions.length - 1];
    }
    let html = await readFile(join(pageDir, version, "index.html"), "utf8");

    if (variant) {
      const exp = await buildVariationExport(manifest);
      const script = `\n<script data-opmc-preview="${key}">\n${exp.variationJs}\n</script>\n`;
      html = html.includes("</body>") ? html.replace("</body>", `${script}</body>`) : html + script;
    }

    if (pick) {
      html = html.includes("</body>") ? html.replace("</body>", `${PICKER_SCRIPT}</body>`) : html + PICKER_SCRIPT;
    }

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}

/**
 * Element-picker overlay. On hover it highlights; on click it computes a
 * robust selector (id → unique class → nth-of-type path) and postMessages it
 * to the parent console. Esc cancels.
 */
const PICKER_SCRIPT = `
<script data-opmc-picker="1">
(function () {
  var HL, LABEL;
  function esc(s){ return (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/([^a-zA-Z0-9_-])/g, "\\\\$1"); }
  function unique(sel){ try { return document.querySelectorAll(sel).length === 1; } catch(e){ return false; } }
  function selectorFor(el){
    if (el.id && unique("#" + esc(el.id))) return "#" + el.id;
    var cls = (typeof el.className === "string" ? el.className : "").trim().split(/\\s+/).filter(Boolean);
    for (var i = 0; i < cls.length; i++) { if (unique("." + esc(cls[i]))) return "." + cls[i]; }
    var parts = [], cur = el;
    while (cur && cur.nodeType === 1 && cur.tagName.toLowerCase() !== "body") {
      if (cur.id && unique("#" + esc(cur.id))) { parts.unshift("#" + cur.id); break; }
      var tag = cur.tagName.toLowerCase(), idx = 1, sib = cur;
      while ((sib = sib.previousElementSibling)) { if (sib.tagName === cur.tagName) idx++; }
      parts.unshift(tag + ":nth-of-type(" + idx + ")");
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  }
  function ensure(){
    if (HL) return;
    HL = document.createElement("div");
    HL.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;border:2px solid #17b3a6;background:rgba(23,179,166,.15);border-radius:2px;transition:all .04s;";
    LABEL = document.createElement("div");
    LABEL.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;background:#17b3a6;color:#04110f;font:600 11px/1.4 ui-monospace,monospace;padding:2px 6px;border-radius:4px;max-width:60vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    document.body.appendChild(HL); document.body.appendChild(LABEL);
    var bar = document.createElement("div");
    bar.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#17b3a6;color:#04110f;font:600 12px/1 ui-sans-serif,system-ui;padding:8px;text-align:center;pointer-events:none;";
    bar.textContent = "Pick an element — click to select, Esc to cancel";
    document.body.appendChild(bar); HL._bar = bar;
  }
  function onMove(e){
    var el = e.target; if (!el || el === document.documentElement || el === document.body) return;
    ensure();
    var r = el.getBoundingClientRect();
    HL.style.top = r.top + "px"; HL.style.left = r.left + "px"; HL.style.width = r.width + "px"; HL.style.height = r.height + "px";
    LABEL.textContent = selectorFor(el);
    LABEL.style.top = Math.max(28, r.top - 20) + "px"; LABEL.style.left = r.left + "px";
  }
  function cleanup(){
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey, true);
    if (HL){ if (HL._bar) HL._bar.remove(); HL.remove(); LABEL.remove(); HL = null; }
  }
  function onClick(e){
    e.preventDefault(); e.stopPropagation();
    var sel = selectorFor(e.target);
    parent.postMessage({ opmcPick: true, selector: sel }, "*");
    cleanup();
  }
  function onKey(e){ if (e.key === "Escape"){ parent.postMessage({ opmcPick: true, cancelled: true }, "*"); cleanup(); } }
  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKey, true);
})();
</script>`;
