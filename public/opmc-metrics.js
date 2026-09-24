/* Tracked-events overlay (opmc-metrics.js).
 *
 * The loader (/loader/<siteKey>) adds this to a page ONLY when the address
 * carries ?opmc_metrics=1, after setting window.__OPMC_EVENTS__ from
 * /api/loader/metrics. It draws every element an experiment's click events are
 * bound to: a see-through box per element, one colour per event, and a
 * draggable callout naming the event. It follows the page live: scroll,
 * resize, and whatever the variation reveals as you click around. A panel
 * lists every event: on screen, covered on screen (under a popup), on the
 * page, seen earlier, hidden on this page, not seen yet. It floats or docks left / bottom / right, like a
 * browser's developer tools, and a switcher at the top opens the
 * experiment's other variations.
 *
 * Everything lives in ONE shadow root, so the page's CSS cannot reach it (the
 * host's Bootstrap `.row` was wrapping the panel's rows) and the page's
 * querySelectorAll can never match the overlay's own nodes.
 *
 * Lower environments only: nothing here goes into an experiment's code or
 * onto a production site.
 */
(function () {
  var Q = new URLSearchParams(location.search);
  var on = false;
  Q.forEach(function (v, k) { k = k.toLowerCase(); if ((k === "opmc_metrics" || k === "opmc_analytics") && v === "1") on = true; });
  if (!on) return;
  if (window.__opmcMetricsOverlay) window.__opmcMetricsOverlay.destroy();

  var CFG = window.__OPMC_EVENTS__ || { variation: "", events: [] };
  var PALETTE = ["#E6194B", "#3CB44B", "#4363D8", "#F58231", "#911EB4", "#0AAFC0", "#F032E6",
                 "#9A6324", "#469990", "#808000", "#000075", "#800000", "#D4A000", "#5C5C5C"];
  var DARK_TEXT = { "#D4A000": 1 };
  // The experiment's variations, from Optimizely. Which one this page shows
  // comes from the URL: ?opmc= is the prototype that shows its variation, and
  // &opmc_variation=<id> (set by the switcher) names a variation that isn't
  // ours, usually the original, for which the loader skipped our code.
  var here = "", only = "";
  Q.forEach(function (v, k) { k = k.toLowerCase(); if (k === "opmc") here = v; if (k === "opmc_variation") only = v; });
  var VARS = CFG.variations && CFG.variations.length ? CFG.variations
    : [{ id: "", name: CFG.variation || "This page", opmc: here || null }];
  var CUR = VARS.filter(function (v) { return only ? v.id === only : (v.opmc || "") === here; })[0] || null;
  var TEST_ROOT = (CUR && CUR.testRoot) || CFG.testRoot || "";
  // Results (opmc_analytics=1): one reading per event, worded as on the
  // Evidence board. Variation first, then control.
  var A = CFG.analytics || null, RD = {};
  if (A && A.readings) A.readings.forEach(function (r) { RD[r.event] = r; });
  function readingLong(r) {
    return r.tone === "new" ? "Only in the variation · " + r.variationRate + " used it (" + r.counts + ")"
      : r.delta + " · " + r.variationRate + " vs " + r.controlRate + " · " + r.settled;
  }
  var events = CFG.events.map(function (e, i) {
    return { name: e.name, selector: e.selector, color: PALETTE[i % PALETTE.length], on: true,
             els: [], shown: [], visible: [], shared: [], seen: false, status: "none", error: null, outside: 0 };
  });

  // ── layout preference (per browser) ───────────────────────────────────────
  var LS = "opmc-metrics-layout";
  var layout = { dock: "float", w: 340, h: 260, x: null, y: null, min: false };
  try { var saved = JSON.parse(localStorage.getItem(LS) || "null"); if (saved) for (var k in saved) layout[k] = saved[k]; } catch (x) {}
  function saveLayout() { try { localStorage.setItem(LS, JSON.stringify(layout)); } catch (x) {} }
  var openGroups = layout.open && typeof layout.open === "object" ? layout.open : (layout.open = {});

  // ── the host and its shadow root ──────────────────────────────────────────
  var Z = 2147483000;
  var host = document.createElement("opmc-metrics");
  host.setAttribute("style", "all:initial;position:fixed;inset:0;pointer-events:none;z-index:" + Z + ";");
  var sh = host.attachShadow({ mode: "open" });
  var FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
  var MONO = "ui-monospace,SFMono-Regular,Menlo,monospace";
  var ICON = {
    float: '<rect x="3" y="7" width="13" height="12" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-3"/>',
    left: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
    bottom: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 14h18"/>',
    right: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M10.7 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.6 3.4"/><path d="M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M3 3l18 18"/>',
  };
  var CHEVRON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235D6B7E' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E";
  function icon(name) {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[name] + "</svg>";
  }
  sh.innerHTML =
    "<style>" +
    ":host{all:initial}" +
    "*{box-sizing:border-box}" +
    "#boxes,#labels{position:fixed;inset:0;pointer-events:none}" +
    "#lines{position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;overflow:visible}" +
    ".box{position:absolute;border:2px solid;border-radius:4px}" +
    ".cl{position:absolute;height:22px;padding:0 8px;border-radius:6px;font:600 12px/22px " + FONT + ";white-space:nowrap;" +
      "box-shadow:0 2px 6px rgba(0,0,0,.25);pointer-events:auto;cursor:grab;user-select:none;-webkit-user-select:none;touch-action:none}" +
    "#panel{position:fixed;pointer-events:auto;display:flex;flex-direction:column;background:#fff;color:#17202B;" +
      "border:1px solid #C9D2DC;font:13px/1.4 " + FONT + ";box-shadow:0 12px 32px rgba(23,32,43,.22);text-align:left}" +
    "#panel.float{border-radius:12px;max-height:70vh}" +
    "#panel.right{top:0;right:0;bottom:0;border-width:0 0 0 1px;box-shadow:-8px 0 24px rgba(23,32,43,.12)}" +
    "#panel.left{top:0;left:0;bottom:0;border-width:0 1px 0 0;box-shadow:8px 0 24px rgba(23,32,43,.12)}" +
    "#panel.bottom{left:0;right:0;bottom:0;border-width:1px 0 0 0;box-shadow:0 -8px 24px rgba(23,32,43,.12)}" +
    "#panel.min.right,#panel.min.left{bottom:auto}" +
    // !important: the bottom dock's grid rule below has the same specificity
    // and would otherwise keep the list open when minimised.
    "#panel.min .list{display:none!important}" +
    "header{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #E3E8EE;flex-shrink:0}.ttl{flex:1 1 auto;min-width:0}" +
    "#panel.min header{border-bottom:0}" +
    "#panel.float header{cursor:move}" +
    "h2{margin:0;font-size:14px;font-weight:600;line-height:1.3}" +
    ".sub{flex:1 1 100%;color:#5D6B7E;font-size:12.5px}" +
    ".build{flex:1 1 100%;font-size:12px;color:#5D6B7E}.build.off{color:#B45309;font-weight:500}#panel.bottom .build{order:4}" +
    ".rsum{flex:1 1 100%;font-size:12px;color:#17202B;font-weight:600}#panel.bottom .rsum{order:5}" +
    ".res.up{color:#067A55}.res.down{color:#C42B2B}.res.flat{color:#4A5768}.res.new{color:#1D4ED8}" +
    // The Evidence board's chip (components/EvidencePanel.tsx), in results mode.
    ".cl.chip{height:auto;display:inline-flex;align-items:center;gap:8px;padding:5px 10px;border:1px solid;border-radius:8px;background:#fff;" +
      "font:700 13px/18px " + FONT + ";font-variant-numeric:tabular-nums;box-shadow:0 1px 3px rgba(23,32,43,.18)}" +
    ".cl.chip.t-up{border-color:#067A55;color:#067A55}.cl.chip.t-down{border-color:#C42B2B;color:#C42B2B}" +
    ".cl.chip.t-flat{border-color:#8A96A6;color:#4A5768}.cl.chip.t-new{border-color:rgba(29,78,216,.7);border-style:dashed;color:#1D4ED8}" +
    ".cl.chip .lb{font-weight:600;color:#17202B;max-width:22rem;overflow:hidden;text-overflow:ellipsis}" +
    ".cl.chip .rt{font-weight:600;color:#5D6B7E}.cl.chip .rt b{font-weight:600;color:#17202B}" +
    ".cl.chip .tray{position:absolute;left:100%;margin-left:-8px;top:-1px;bottom:-1px;display:flex;align-items:center;padding:0 9px 0 13px;" +
      "background:#fff;border:1px solid;border-left:0;border-color:inherit;border-radius:0 8px 8px 0;opacity:0;pointer-events:none;transform:translateX(-6px);transition:opacity .15s,transform .15s}" +
    ".cl.chip:hover .tray{opacity:1;pointer-events:auto;transform:none}" +
    ".tray button,.card .cb{all:unset;display:inline-flex;cursor:pointer;color:#5D6B7E}.tray button:hover,.card .cb:hover{color:#17202B}" +
    ".tray button:focus-visible,.card .cb:focus-visible{outline:2px solid #1D4ED8;outline-offset:2px;border-radius:3px}" +
    ".card{position:absolute;z-index:3;width:288px;border:1px solid #C9D2DC;border-radius:12px;background:#fff;box-shadow:0 10px 30px rgba(23,32,43,.18);" +
      "font:13.5px/1.4 " + FONT + ";color:#17202B;text-align:left;pointer-events:auto}" +
    ".card .ch{display:flex;align-items:flex-start;gap:8px;padding:12px 14px 8px}.card .ct{flex:1 1 auto;min-width:0;font-size:14px;font-weight:700;line-height:1.3}" +
    ".card .cb{flex:0 0 auto;margin-top:2px}.card .cb.on{color:#1D4ED8}" +
    ".card .cg{display:grid;grid-template-columns:auto 1fr;gap:6px 16px;padding:0 14px;font-variant-numeric:tabular-nums}" +
    ".card .k{color:#5D6B7E}.card .v{text-align:right;font-weight:600}.card .v.n{font-weight:400}.card .dl{font-weight:700}" +
    ".card .t-up{color:#067A55}.card .t-down{color:#C42B2B}.card .t-flat{color:#4A5768}.card .t-new{color:#1D4ED8}" +
    ".card .cd{margin:10px 14px 14px;padding-top:10px;border-top:1px solid #E3E8EE;color:#4A5768;font-size:13px;line-height:1.35}" +
    "@media (prefers-reduced-motion:reduce){.cl.chip .tray{transition:none}}" +
    ".res{font-size:12px;font-weight:600;margin-top:1px}" +
    // The variation switcher gets its own row under the title. Docked to the
    // bottom there's room, so title, switcher, count and tools share one row.
    ".vrow{flex:1 1 100%;display:flex;align-items:center;gap:8px;min-width:0}" +
    ".vrow label{flex:0 0 auto;font-size:12px;font-weight:600;color:#5D6B7E}" +
    "select{flex:1 1 auto;min-width:0;max-width:420px;height:32px;margin:0;padding:0 30px 0 10px;border:1px solid #C9D2DC;border-radius:6px;" +
      "background:#fff url(\"" + CHEVRON + "\") no-repeat right 8px center/16px 16px;color:#17202B;font:500 13px/1.2 " + FONT + ";" +
      "-webkit-appearance:none;appearance:none;cursor:pointer;text-overflow:ellipsis}" +
    "select:hover{border-color:#1D4ED8}" +
    "select:disabled{opacity:.6;cursor:default}" +
    "select:focus-visible,.ic:focus-visible{outline:2px solid #1D4ED8;outline-offset:1px}" +
    "#panel.bottom .ttl{flex:0 0 auto}#panel.bottom .vrow{order:1;flex:0 1 420px}#panel.bottom .sub{order:2;flex:1 1 160px}#panel.bottom .tools{order:3}" +
    ".tools{margin-left:auto;display:flex;gap:2px;align-items:center;flex-shrink:0}" +
    ".ic{width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border:1px solid transparent;border-radius:6px;" +
      "background:transparent;color:#5D6B7E;cursor:pointer;padding:0;margin:0}" +
    ".ic:hover{background:#F1F4F8;color:#17202B}" +
    ".ic[aria-pressed=true]{background:#EAF0FB;color:#1D4ED8;border-color:rgba(29,78,216,.35)}" +
    ".sep{width:1px;height:18px;background:#E3E8EE;margin:0 4px}" +
    ".list{overflow:auto;padding:4px 0 8px;flex:1 1 auto;min-height:0}" +
    "#panel.bottom .list{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));align-content:start}" +
    "#panel.bottom .grp{grid-column:1/-1}" +
    // Section headers: a tinted band with a rule above and below, the status
    // colour, a count badge, and sticky so the section stays named while scrolling.
    ".grp{position:sticky;top:0;z-index:1;display:flex;align-items:center;gap:8px;padding:8px 14px;margin-top:8px;" +
      "background:#F4F6F9;border-top:1px solid #C9D2DC;border-bottom:1px solid #C9D2DC;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#17202B}" +
    ".list>.grp:first-child{margin-top:0;border-top:0}" +
    ".grp .dot{width:8px;height:8px;border-radius:999px;background:#5D6B7E;flex:0 0 8px}" +
    ".grp .n{margin-left:auto;min-width:22px;height:20px;padding:0 7px;border-radius:999px;background:#5D6B7E;color:#fff;font-size:11.5px;line-height:20px;text-align:center;letter-spacing:0}" +
    ".grp.bad{background:#FDECEC;color:#A11D1D;border-color:rgba(196,43,43,.35)}.grp.bad .dot,.grp.bad .n{background:#C42B2B}" +
    ".grp.amber{background:#FFF4E5;color:#8A4B08;border-color:rgba(180,83,9,.35)}.grp.amber .dot,.grp.amber .n{background:#B45309}" +
    ".grp.good{background:#E8F5EF;color:#05603F;border-color:rgba(6,122,85,.35)}.grp.good .dot,.grp.good .n{background:#067A55}" +
    // Hidden and not-seen-yet sit last and fold away: their header is a button.
    "button.grp{width:100%;margin-left:0;margin-right:0;border-left:0;border-right:0;border-radius:0;font-family:inherit;line-height:inherit;text-align:left;cursor:pointer}" +
    "button.grp:hover{filter:brightness(.97)}button.grp:focus-visible{outline:2px solid #1D4ED8;outline-offset:-2px}" +
    ".grp .chev{flex:0 0 12px;display:inline-flex;transition:transform .15s}.grp[aria-expanded=true] .chev{transform:rotate(90deg)}" +
    "@media (prefers-reduced-motion:reduce){.grp .chev{transition:none}}" +
    ".ev+.ev{border-top:1px solid #EDF1F5}" +
    ".ev{display:flex;gap:10px;align-items:flex-start;padding:7px 14px;cursor:pointer}" +
    ".ev:hover{background:#F1F4F8}" +
    ".ev.missing{background:rgba(196,43,43,.05)}" +
    ".sw{width:12px;height:12px;border-radius:3px;margin-top:3px;flex:0 0 12px}" +
    ".txt{min-width:0;flex:1 1 auto}" +
    ".nm{font-weight:500}" +
    ".meta{color:#5D6B7E;font-size:12px}" +
    ".sel{font:11.5px/1.35 " + MONO + ";color:#4A5768;word-break:break-all}" +
    ".warn{color:#B45309;font-size:12px}" +
    ".rz{position:absolute;z-index:2}" +
    "#panel.right .rz{left:-4px;top:0;bottom:0;width:8px;cursor:ew-resize}" +
    "#panel.left .rz{right:-4px;top:0;bottom:0;width:8px;cursor:ew-resize}" +
    "#panel.bottom .rz{top:-4px;left:0;right:0;height:8px;cursor:ns-resize}" +
    "#panel.float .rz,#panel.min .rz{display:none}" +
    "</style>" +
    '<div id="boxes"></div>' +
    '<svg id="lines" xmlns="http://www.w3.org/2000/svg"></svg>' +
    '<div id="labels"></div>' +
    '<section id="panel" role="complementary" aria-label="Tracked events">' +
      '<div class="rz" data-a="resize"></div>' +
      "<header>" +
        '<div class="ttl"><h2>Tracked events</h2></div>' +
        '<div class="tools">' +
          '<button type="button" class="ic" data-dock="float" title="Float" aria-label="Float">' + icon("float") + "</button>" +
          '<button type="button" class="ic" data-dock="left" title="Dock to left" aria-label="Dock to left">' + icon("left") + "</button>" +
          '<button type="button" class="ic" data-dock="bottom" title="Dock to bottom" aria-label="Dock to bottom">' + icon("bottom") + "</button>" +
          '<button type="button" class="ic" data-dock="right" title="Dock to right" aria-label="Dock to right">' + icon("right") + "</button>" +
          '<span class="sep"></span>' +
          '<button type="button" class="ic" data-a="toggle" title="Hide boxes" aria-label="Hide boxes">' + icon("eye") + "</button>" +
          '<button type="button" class="ic" data-a="min" title="Minimise" aria-label="Minimise">–</button>' +
        "</div>" +
        '<div class="vrow"><label for="opmc-var">Variation</label><select id="opmc-var"></select></div>' +
        '<div class="sub" aria-live="polite"></div>' +
        '<div class="build" hidden></div>' +
        '<div class="rsum" hidden></div>' +
      "</header>" +
      '<div class="list"></div>' +
    "</section>";
  document.documentElement.appendChild(host);

  var boxes = sh.getElementById("boxes"), svg = sh.getElementById("lines"), labels = sh.getElementById("labels");
  var panel = sh.getElementById("panel"), sub = sh.querySelector(".sub"), list = sh.querySelector(".list");
  var svgNS = "http://www.w3.org/2000/svg";
  var showBoxes = true, hover = null;

  // ── variation switcher ────────────────────────────────────────────────────
  // Picking a variation reloads the page with opmc_metrics=1 kept: our
  // prototype's ?opmc= key for a variation we build, or this test's key plus
  // &opmc_variation=<id> for one we don't (the original), so the loader still
  // knows the test and skips our code. The loader draws the overlay again.
  var vsel = sh.getElementById("opmc-var"), switching = "";

  // The build on the page against the build Optimizely holds for this
  // variation. ?opmc= runs our latest build, which can differ from the one
  // pushed into the experiment. Say so, because the events are checked
  // against what is on the page.
  var buildEl = sh.querySelector(".build"), pageBuild = null;
  var rsumEl = sh.querySelector(".rsum");
  if (A) {
    rsumEl.hidden = false;
    rsumEl.textContent = A.readings ? "Results: " + A.visitors + " visitors, variation vs control" : "No results yet for this test.";
  }
  function findPageBuild() {
    if (pageBuild) return pageBuild;
    var ss = document.querySelectorAll("script[data-opmc]");
    for (var i = 0; i < ss.length; i++) {
      var m = /built from src ([0-9a-f]+)/.exec(ss[i].textContent.slice(0, 400));
      if (m) return (pageBuild = m[1]);
    }
    return null;
  }
  function renderBuild() {
    // A variation we don't build that still changes the page (made in
    // Optimizely's editor): prep can't show those changes.
    if (CUR && !CUR.opmc && CUR.pageAsIs === false) {
      buildEl.hidden = false;
      buildEl.className = "build off";
      buildEl.textContent = "This variation was changed in Optimizely's editor. This page doesn't show those changes.";
      return;
    }
    var want = CUR && CUR.optimizelyBuild, have = findPageBuild();
    if (!want || !have) { buildEl.hidden = true; return; }
    buildEl.hidden = false;
    buildEl.className = "build" + (have === want ? "" : " off");
    buildEl.textContent = have === want ? "Same build as in Optimizely (" + have + ")."
      : "This page runs our build " + have + ". Optimizely has " + want + ".";
  }
  vsel.innerHTML = (CUR ? "" : '<option value="" selected disabled>Not one of this test\'s variations</option>') +
    VARS.map(function (v) { return '<option value="' + esc(v.id) + '"' + (v === CUR ? " selected" : "") + ">" + esc(v.name) + "</option>"; }).join("");
  vsel.disabled = VARS.length < 2 && !!CUR;
  vsel.addEventListener("change", function () {
    var v = VARS.filter(function (x) { return x.id === vsel.value; })[0];
    if (!v || v === CUR) return;
    var u = new URL(location.href), drop = [];
    u.searchParams.forEach(function (_, k) { var l = k.toLowerCase(); if (l === "opmc" || l === "opmc_variation") drop.push(k); });
    drop.forEach(function (k) { u.searchParams.delete(k); });
    u.searchParams.set("opmc", v.opmc || here);
    if (!v.opmc) u.searchParams.set("opmc_variation", v.id);
    switching = v.name; vsel.disabled = true; renderList();
    location.assign(u.toString());
  });

  // ── docking ───────────────────────────────────────────────────────────────
  // A docked panel pushes the page aside (padding on <html>), the way a
  // browser's docked developer tools shrink the page, so nothing hides under it.
  var html = document.documentElement;
  var PADS = ["padding-left", "padding-right", "padding-bottom"];
  var original = {};
  PADS.forEach(function (p) { original[p] = [html.style.getPropertyValue(p), html.style.getPropertyPriority(p)]; });
  function restorePads() { PADS.forEach(function (p) { html.style.setProperty(p, original[p][0], original[p][1]); }); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function applyLayout() {
    var d = layout.dock;
    panel.className = d + (layout.min ? " min" : "");
    panel.style.cssText = "";
    restorePads();
    if (d === "float") {
      var w = clamp(layout.w, 280, innerWidth - 24);
      panel.style.width = w + "px";
      if (layout.x === null || layout.y === null) { panel.style.right = "12px"; panel.style.bottom = "12px"; }
      else { panel.style.left = clamp(layout.x, 0, innerWidth - 120) + "px"; panel.style.top = clamp(layout.y, 0, innerHeight - 48) + "px"; }
    } else if (d === "bottom") {
      var h = clamp(layout.h, 140, Math.round(innerHeight * 0.7));
      if (!layout.min) { panel.style.height = h + "px"; html.style.setProperty("padding-bottom", h + "px", "important"); }
    } else {
      var sw = clamp(layout.w, 260, Math.round(innerWidth * 0.6));
      panel.style.width = sw + "px";
      if (!layout.min) html.style.setProperty(d === "left" ? "padding-left" : "padding-right", sw + "px", "important");
    }
    sh.querySelectorAll("[data-dock]").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-dock") === d ? "true" : "false"); });
    var mb = sh.querySelector('[data-a="min"]');
    mb.textContent = layout.min ? "+" : "–";
    mb.title = mb.ariaLabel = layout.min ? "Expand" : "Minimise";
    saveLayout();
    tick();
  }

  panel.addEventListener("click", function (ev) {
    var dockBtn = ev.target.closest("[data-dock]");
    if (dockBtn) { layout.dock = dockBtn.getAttribute("data-dock"); applyLayout(); return; }
    var b = ev.target.closest("[data-a]");
    if (b) {
      var a = b.getAttribute("data-a");
      if (a === "toggle") {
        showBoxes = !showBoxes;
        var t = showBoxes ? "Hide boxes" : "Show boxes";
        b.innerHTML = icon(showBoxes ? "eye" : "eyeOff"); b.title = t; b.setAttribute("aria-label", t);
        draw();
      }
      if (a === "min") { layout.min = !layout.min; applyLayout(); }
      return;
    }
    var fold = ev.target.closest("button.grp[data-g]");
    if (fold) {
      var key = fold.getAttribute("data-g");
      openGroups[key] = !openGroups[key];
      saveLayout(); renderList();
      var again = list.querySelector('button.grp[data-g="' + key + '"]');
      if (again) again.focus();
      return;
    }
    var row = ev.target.closest(".ev[data-i]");
    if (!row) return;
    var e = events[+row.getAttribute("data-i")];
    var target = e.visible[0] || e.shown[0] || e.els[0];
    if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
    if (A && RD[e.name]) { cardOpen[e.name] = true; draw(); }
  });
  panel.addEventListener("mouseover", function (ev) {
    var row = ev.target.closest(".ev[data-i]");
    var i = row ? +row.getAttribute("data-i") : null;
    if (i !== hover) { hover = i; draw(); }
  });
  panel.addEventListener("mouseleave", function () { hover = null; draw(); });

  // Floating: drag by the header. Docked: drag the inner edge to resize.
  var move = null;
  panel.addEventListener("pointerdown", function (ev) {
    var rz = ev.target.closest('[data-a="resize"]');
    var head = ev.target.closest("header");
    if (rz && layout.dock !== "float") {
      move = { kind: "resize" };
    } else if (head && layout.dock === "float" && !ev.target.closest("button,select,label")) {
      var r = panel.getBoundingClientRect();
      move = { kind: "drag", ox: ev.clientX - r.left, oy: ev.clientY - r.top };
    } else return;
    ev.preventDefault();
    try { panel.setPointerCapture(ev.pointerId); } catch (x) {}
  });
  panel.addEventListener("pointermove", function (ev) {
    if (!move) return;
    if (move.kind === "drag") {
      layout.x = ev.clientX - move.ox; layout.y = ev.clientY - move.oy;
      panel.style.right = ""; panel.style.bottom = "";
      panel.style.left = clamp(layout.x, 0, innerWidth - 120) + "px";
      panel.style.top = clamp(layout.y, 0, innerHeight - 48) + "px";
    } else if (layout.dock === "right") { layout.w = innerWidth - ev.clientX; applyLayout(); }
    else if (layout.dock === "left") { layout.w = ev.clientX; applyLayout(); }
    else if (layout.dock === "bottom") { layout.h = innerHeight - ev.clientY; applyLayout(); }
  });
  function endMove(ev) {
    if (!move) return;
    move = null; saveLayout();
    try { panel.releasePointerCapture(ev.pointerId); } catch (x) {}
  }
  panel.addEventListener("pointerup", endMove);
  panel.addEventListener("pointercancel", endMove);

  // ── measure ───────────────────────────────────────────────────────────────
  function isShown(el) {
    if (!el.isConnected) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    var s = getComputedStyle(el);
    return !(s.visibility === "hidden" || s.display === "none" || +s.opacity === 0);
  }
  function inViewport(r) { return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth; }
  // ON TOP, not just on screen. An open popup or modal covers the page, and the
  // elements under it can't be clicked, so they get no box and no label. The
  // same test catches a click-area overlay that sits over the tracked element.
  // Sample the centre and four inner points and ask the browser what is
  // uppermost there, ignoring this overlay (its panel and labels aren't page).
  var SAMPLE = [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]];
  function onTop(el) {
    var r = el.getBoundingClientRect();
    for (var i = 0; i < SAMPLE.length; i++) {
      var x = r.left + r.width * SAMPLE[i][0], y = r.top + r.height * SAMPLE[i][1];
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
      var stack = document.elementsFromPoint(x, y);
      for (var j = 0; j < stack.length; j++) {
        if (stack[j] === host) continue;
        if (stack[j] === el || el.contains(stack[j])) return true;
        break;
      }
    }
    return false;
  }
  function measure() {
    var owner = new Map();
    events.forEach(function (e) {
      e.error = null;
      try { e.els = Array.prototype.slice.call(document.querySelectorAll(e.selector)); }
      catch (err) { e.els = []; e.error = "The selector isn't valid CSS."; }
      e.shown = e.els.filter(isShown);
      var inView = e.shown.filter(function (el) { return inViewport(el.getBoundingClientRect()); });
      e.visible = inView.filter(onTop);
      e.covered = inView.length - e.visible.length;
      if (e.shown.length) e.seen = true;
      // screen · covered (on screen, under a popup or another layer) · page
      // (scroll to it) · earlier (appeared this visit, gone now) · hidden
      // (matches, never visible: can't be clicked) · none (never matched yet)
      e.status = e.error ? "none" : e.visible.length ? "screen" : e.covered ? "covered" : e.shown.length ? "page" : e.seen ? "earlier" : e.els.length ? "hidden" : "none";
      e.outside = TEST_ROOT ? e.shown.filter(function (el) { return !el.closest(TEST_ROOT); }).length : 0;
      e.els.forEach(function (el) { var l = owner.get(el) || []; l.push(e); owner.set(el, l); });
    });
    events.forEach(function (e) {
      var shared = {};
      e.els.forEach(function (el) { (owner.get(el) || []).forEach(function (o) { if (o !== e) shared[o.name] = 1; }); });
      e.shared = Object.keys(shared);
    });
  }

  // ── draw ──────────────────────────────────────────────────────────────────
  // Boxes are redrawn every tick. Each event's callout (label + line + dot) is
  // one persistent set of nodes, so it can be dragged: a drag pins it at an
  // offset from its element, and it rides along as the page scrolls.
  // Double-click a callout to put it back.
  function textOn(color) { return DARK_TEXT[color] ? "#17202B" : "#fff"; }

  // Results mode (opmc_analytics=1) draws the Evidence board's chip and card:
  // a white chip with the change and both rates, in the earned tone, and on a
  // press a card with the numbers. Box, line and dot take the tone too. Only
  // the numbers button sits in the chip's tray: no colour, note or delete here.
  var TONE = {
    up: { line: "#067A55", border: "#067A55", fill: "rgba(6,122,85,.15)" },
    down: { line: "#C42B2B", border: "#C42B2B", fill: "rgba(196,43,43,.15)" },
    flat: { line: "#8A96A6", border: "#8A96A6", fill: "rgba(23,32,43,.05)" },
    "new": { line: "#1D4ED8", border: "rgba(29,78,216,.7)", fill: "rgba(29,78,216,.10)", dashed: true },
  };
  var SVG16 = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var I_EXPAND = SVG16 + '<path d="M6.5 2H2v4.5M9.5 2H14v4.5M6.5 14H2V9.5M9.5 14H14V9.5"/></svg>';
  var I_COLLAPSE = SVG16 + '<path d="M2 6.5h4.5V2M14 6.5H9.5V2M2 9.5h4.5V14M14 9.5H9.5V14"/></svg>';
  var I_PIN = SVG16 + '<circle cx="8" cy="5.4" r="3.2"/><path d="M8 8.6V14"/></svg>';
  var I_CLOSE = SVG16 + '<path d="M4 4l8 8M12 4l-8 8"/></svg>';
  // A pinned card stays open, and is remembered with the layout (it survives
  // a reload and a variation switch). An opened one lasts for this page.
  var pins = layout.pins && typeof layout.pins === "object" ? layout.pins : (layout.pins = {});
  var cardOpen = {};
  function isOpen(e) { return !!(cardOpen[e.name] || pins[e.name]); }
  function toggleCard(e) {
    if (isOpen(e)) { cardOpen[e.name] = false; pins[e.name] = false; saveLayout(); }
    else cardOpen[e.name] = true;
    draw();
  }
  function chipHtml(e, rd) {
    var name = esc(e.name + (e.visible.length > 1 ? "  ×" + e.visible.length : ""));
    if (!rd) return '<span class="lb">' + name + '</span><span class="rt">No result yet</span>';
    var open = isOpen(e);
    return '<span class="lb">' + name + '</span><span class="dl">' + esc(rd.delta) + "</span>" +
      (rd.tone === "new" ? '<span class="rt"><b>' + esc(rd.variationRate) + "</b></span>"
        : '<span class="rt"><b>' + esc(rd.variationRate) + "</b> vs " + esc(rd.controlRate) + "</span>") +
      '<span class="tray"><button type="button" data-act="open" title="' + (open ? "Collapse the numbers" : "Open the numbers") + '">' +
      (open ? I_COLLAPSE : I_EXPAND) + "</button></span>";
  }
  function cardHtml(e, rd) {
    var pinned = !!pins[e.name];
    return '<div class="ch"><div class="ct">' + esc(e.name) + "</div>" +
      '<button type="button" class="cb' + (pinned ? " on" : "") + '" data-act="pin" title="' + (pinned ? "Unpin" : "Pin open, so it stays open") + '">' + I_PIN + "</button>" +
      '<button type="button" class="cb" data-act="close" title="Close">' + I_CLOSE + "</button></div>" +
      '<div class="cg"><span class="k">Change</span><span class="v dl t-' + rd.tone + '">' + esc(rd.delta) + "</span>" +
      '<span class="k">Variation</span><span class="v">' + esc(rd.variationRate) + "</span>" +
      (rd.tone === "new" ? "" : '<span class="k">Control</span><span class="v">' + esc(rd.controlRate) + "</span>") +
      '<span class="k">Events</span><span class="v n">' + esc(rd.counts) + "</span>" +
      '<span class="k">Reading</span><span class="v n">' + esc(rd.settled) + "</span></div>" +
      '<p class="cd">' + esc(rd.detail || "") + "</p>";
  }
  var drag = null;
  function ensureCallout(e) {
    if (e.labelEl) return;
    var l = document.createElement("div");
    l.className = "cl";
    l.addEventListener("pointerdown", function (ev) {
      if (ev.target.closest(".tray")) return; // the tray's button, not a drag
      ev.preventDefault(); ev.stopPropagation();
      var r = l.getBoundingClientRect();
      drag = { e: e, ox: ev.clientX - r.left, oy: ev.clientY - r.top, sx: ev.clientX, sy: ev.clientY, moved: false };
      try { l.setPointerCapture(ev.pointerId); } catch (x) {}
      l.style.cursor = "grabbing";
    });
    l.addEventListener("pointermove", function (ev) {
      if (!drag || drag.e !== e || !e.anchor) return;
      if (!drag.moved && Math.abs(ev.clientX - drag.sx) + Math.abs(ev.clientY - drag.sy) < 4) return;
      drag.moved = true;
      e.pin = { dx: ev.clientX - drag.ox - e.anchor.left, dy: ev.clientY - drag.oy - e.anchor.top };
      draw();
    });
    function end(ev) {
      if (!drag || drag.e !== e) return;
      var pressed = !drag.moved;
      drag = null; l.style.cursor = "grab";
      try { l.releasePointerCapture(ev.pointerId); } catch (x) {}
      // A press, not a drag, opens the numbers, as on the Evidence board.
      if (pressed && ev.type === "pointerup" && A && RD[e.name]) toggleCard(e);
    }
    l.addEventListener("pointerup", end);
    l.addEventListener("pointercancel", end);
    l.addEventListener("click", function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      if (ev.target.closest('[data-act="open"]')) toggleCard(e);
    });
    l.addEventListener("dblclick", function (ev) { ev.preventDefault(); ev.stopPropagation(); e.pin = null; draw(); });
    labels.appendChild(l);
    e.labelEl = l;
    e.lineEl = document.createElementNS(svgNS, "line");
    e.lineEl.setAttribute("stroke-width", "2");
    e.dotEl = document.createElementNS(svgNS, "circle");
    e.dotEl.setAttribute("r", "3.5");
    svg.appendChild(e.lineEl); svg.appendChild(e.dotEl);
  }
  function ensureCard(e) {
    if (e.cardEl) return e.cardEl;
    var c = document.createElement("div");
    c.className = "card";
    c.addEventListener("pointerdown", function (ev) { ev.stopPropagation(); });
    c.addEventListener("click", function (ev) {
      ev.stopPropagation();
      var b = ev.target.closest("[data-act]"); if (!b) return;
      var act = b.getAttribute("data-act");
      if (act === "pin") { pins[e.name] = !pins[e.name]; if (pins[e.name]) cardOpen[e.name] = true; saveLayout(); }
      if (act === "close") { cardOpen[e.name] = false; pins[e.name] = false; saveLayout(); }
      draw();
    });
    labels.appendChild(c);
    e.cardEl = c;
    return c;
  }
  function hideCallout(e) {
    if (e.cardEl) e.cardEl.style.display = "none";
    if (!e.labelEl) return;
    e.labelEl.style.display = "none"; e.lineEl.style.display = "none"; e.dotEl.style.display = "none";
  }
  function nearest(r, px, py) { return { x: Math.max(r.left, Math.min(px, r.right)), y: Math.max(r.top, Math.min(py, r.bottom)) }; }
  function draw() {
    boxes.innerHTML = "";
    var hv = hover !== null && events[hover] && events[hover].visible.length ? hover : null;
    var placed = [];
    events.forEach(function (e, i) {
      if (!showBoxes || !e.on || !e.visible.length) { hideCallout(e); return; }
      var dim = hv !== null && hv !== i;
      var rd = A ? RD[e.name] : null;
      var T = A ? TONE[rd ? rd.tone : "flat"] : null;
      e.visible.forEach(function (el) {
        var r = el.getBoundingClientRect();
        var b = document.createElement("div");
        b.className = "box";
        b.style.cssText = "left:" + (r.left - 2) + "px;top:" + (r.top - 2) + "px;width:" + (r.width + 4) + "px;height:" + (r.height + 4) + "px;" +
          (T ? "border-color:" + T.border + ";border-style:" + (T.dashed ? "dashed" : "solid") + ";background:" + T.fill + ";"
             : "border-color:" + e.color + ";background:" + e.color + (dim ? "0D" : "33") + ";") +
          "opacity:" + (dim ? 0.25 : 1) + ";";
        boxes.appendChild(b);
      });
      ensureCallout(e);
      var l = e.labelEl;
      var a = e.visible[0].getBoundingClientRect();
      e.anchor = a;
      var html = A ? chipHtml(e, rd) : esc(e.name + (e.visible.length > 1 ? "  ×" + e.visible.length : ""));
      var cls = A ? "cl chip t-" + (rd ? rd.tone : "flat") : "cl";
      if (l._html !== html || l.className !== cls) {
        l.innerHTML = html; l._html = html; l.className = cls;
        l.style.background = A ? "" : e.color; l.style.color = A ? "" : textOn(e.color);
        l.title = (rd ? readingLong(rd) + " · press for the numbers · " : "") + "Drag to move · double-click to put back";
      }
      var ink = T ? T.line : e.color;
      e.lineEl.setAttribute("stroke", ink); e.dotEl.setAttribute("fill", ink);
      l.style.display = ""; e.lineEl.style.display = ""; e.dotEl.style.display = "";
      var w = l.offsetWidth || 160, h = l.offsetHeight || 22, x, y;
      if (e.pin) {
        x = a.left + e.pin.dx; y = a.top + e.pin.dy;
      } else {
        var right = a.right + 18 + w < innerWidth;
        x = right ? a.right + 18 : Math.max(4, a.left - 18 - w);
        y = Math.max(4, a.top - h - 8);
        for (var guard = 0; guard < 40; guard++) {
          var hit = placed.some(function (p) { return x < p.x + p.w + 4 && x + w + 4 > p.x && y < p.y + p.h + 4 && y + h + 4 > p.y; });
          if (!hit) break;
          y += h + 4;
        }
        y = Math.min(y, innerHeight - h - 4);
      }
      placed.push({ x: x, y: y, w: w, h: h });
      l.style.left = x + "px"; l.style.top = y + "px";
      l.style.opacity = dim ? 0.3 : 1;
      l.style.zIndex = drag && drag.e === e ? 2 : 1;
      var lr = { left: x, top: y, right: x + w, bottom: y + h };
      var p1 = nearest(a, x + w / 2, y + h / 2);
      var p2 = nearest(lr, p1.x, p1.y);
      e.lineEl.setAttribute("x1", p1.x); e.lineEl.setAttribute("y1", p1.y);
      e.lineEl.setAttribute("x2", p2.x); e.lineEl.setAttribute("y2", p2.y);
      e.lineEl.setAttribute("opacity", dim ? "0.25" : "1");
      e.dotEl.setAttribute("cx", p1.x); e.dotEl.setAttribute("cy", p1.y);
      e.dotEl.setAttribute("opacity", dim ? "0.25" : "1");
      // The numbers card, under its chip (above it when there's no room below).
      if (A && rd && isOpen(e)) {
        var c = ensureCard(e), ch = cardHtml(e, rd);
        if (c._html !== ch) { c.innerHTML = ch; c._html = ch; }
        c.style.display = "";
        var cw = c.offsetWidth || 288, chh = c.offsetHeight || 200;
        var cy = y + h + 6;
        if (cy + chh > innerHeight - 4) cy = Math.max(4, y - chh - 6);
        c.style.left = Math.max(4, Math.min(x, innerWidth - cw - 4)) + "px";
        c.style.top = cy + "px";
        c.style.opacity = dim ? 0.3 : 1;
      } else if (e.cardEl) e.cardEl.style.display = "none";
    });
  }

  // ── the list ──────────────────────────────────────────────────────────────
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var CHEV = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
  function grp(cls, label, n, key) {
    var inner = '<span class="dot"></span><span>' + label + '</span><span class="n">' + n + "</span>";
    if (!key) return '<div class="grp' + (cls ? " " + cls : "") + '">' + inner + "</div>";
    return '<button type="button" class="grp' + (cls ? " " + cls : "") + '" data-g="' + key + '" aria-expanded="' + (openGroups[key] ? "true" : "false") + '">' +
      '<span class="chev">' + CHEV + "</span>" + inner + "</button>";
  }
  function row(e, i, extra, cls) {
    var warn = [];
    if (e.outside) warn.push(e.outside + " outside this test's area");
    if (e.shared.length) warn.push("Same element also counted by: " + e.shared.join(", "));
    // In results mode the swatch wears the reading's tone, like the event's box and chip.
    var swatch = A ? TONE[RD[e.name] ? RD[e.name].tone : "flat"].line : e.color;
    return '<div class="ev' + (cls ? " " + cls : "") + '" data-i="' + i + '"><span class="sw" style="background:' + swatch + '"></span><div class="txt">' +
      '<div class="nm">' + esc(e.name) + "</div>" +
      (RD[e.name] ? '<div class="res ' + RD[e.name].tone + '">' + esc(readingLong(RD[e.name])) + "</div>" : "") +
      '<div class="meta">' + extra + "</div>" +
      (warn.length ? '<div class="warn">' + esc(warn.join(" · ")) + "</div>" : "") +
      "</div></div>";
  }
  var lastList = "";
  function renderList() {
    var g = { none: [], hidden: [], covered: [], screen: [], page: [], earlier: [] };
    events.forEach(function (e, i) { g[e.status].push([e, i]); });
    var out = "";
    var drawn = {}; events.forEach(function (e) { drawn[e.name] = 1; });
    var elsewhere = A && A.readings ? A.readings.filter(function (r) { return !drawn[r.event]; }) : [];
    if (elsewhere.length) {
      out += grp("", "Results without an element", elsewhere.length);
      elsewhere.forEach(function (r) {
        out += '<div class="ev"><span class="sw" style="background:#C9D2DC"></span><div class="txt"><div class="nm">' + esc(r.event) + "</div>" +
          '<div class="res ' + r.tone + '">' + esc(readingLong(r)) + "</div></div></div>";
      });
    }
    if (g.screen.length) {
      out += grp("good", "On screen now", g.screen.length);
      g.screen.forEach(function (p) { var e = p[0]; out += row(e, p[1], e.visible.length + " on screen" + (e.covered ? " · " + e.covered + " covered" : "") + (e.shown.length > e.visible.length ? " · " + e.shown.length + " on the page" : "")); });
    }
    if (g.page.length) {
      out += grp("", "On the page, scroll to see", g.page.length);
      g.page.forEach(function (p) { var e = p[0]; out += row(e, p[1], e.shown.length + " on the page"); });
    }
    if (g.earlier.length) {
      out += grp("", "Seen earlier", g.earlier.length);
      g.earlier.forEach(function (p) { var e = p[0]; out += row(e, p[1], "Appeared earlier in this visit"); });
    }
    if (g.covered.length) {
      out += grp("", "Covered on screen", g.covered.length, "covered");
      if (openGroups.covered) g.covered.forEach(function (p) {
        var e = p[0];
        out += row(e, p[1], e.covered + " on screen, under something on top, such as an open popup. It can't be clicked until that closes.");
      });
    }
    if (g.hidden.length) {
      out += grp("amber", "Hidden on this page", g.hidden.length, "hidden");
      if (openGroups.hidden) g.hidden.forEach(function (p) {
        var e = p[0];
        out += row(e, p[1], '<span style="color:#B45309">' + e.els.length + " matching, none visible yet. Click around to reveal them. If they never show, this event can't fire here.</span>" + '<div class="sel">' + esc(e.selector) + "</div>");
      });
    }
    if (g.none.length) {
      out += grp("bad", "Not seen yet", g.none.length, "none");
      if (openGroups.none) g.none.forEach(function (p) {
        var e = p[0];
        var why = e.error || "Not on the page yet. Click around to reveal it. If it never appears, this event can't fire.";
        out += row(e, p[1], '<span style="color:#C42B2B">' + esc(why) + '</span><div class="sel">' + esc(e.selector) + "</div>", "missing");
      });
    }
    var seen = events.filter(function (e) { return e.seen; }).length;
    var nd = (CFG.notDrawable || []).length;
    sub.textContent = switching ? "Opening " + switching + "…"
      : seen + " of " + events.length + " events seen so far" +
        // In results mode those events are listed, under "Results without an element".
        (nd && !(A && A.readings) ? " · " + nd + (nd === 1 ? " more isn't a click event" : " more aren't click events") + ", so not shown" : "");
    renderBuild();
    if (out !== lastList) { list.innerHTML = out; lastList = out; }
  }

  // ── keep it live ──────────────────────────────────────────────────────────
  var pending = false;
  function tick() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () { pending = false; measure(); draw(); renderList(); });
  }
  function onResize() { applyLayout(); }
  addEventListener("scroll", tick, { passive: true, capture: true });
  addEventListener("resize", onResize);
  // The overlay lives in a shadow root, so this only ever sees the page.
  var mo = new MutationObserver(tick);
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "hidden", "aria-expanded"] });
  var iv = setInterval(tick, 700);
  applyLayout();

  window.__opmcMetricsOverlay = {
    events: events,
    variation: CUR,
    setDock: function (d) { layout.dock = d; applyLayout(); },
    destroy: function () {
      clearInterval(iv); mo.disconnect();
      removeEventListener("scroll", tick, { capture: true }); removeEventListener("resize", onResize);
      restorePads(); host.remove(); window.__opmcMetricsOverlay = null;
    },
  };
})();
