/* OPMC event overlay — MOCKUP (24 Sep 2026).
 *
 * Turned on by ?opmc_metrics=1 (any case). Draws every element an experiment's
 * click events are bound to: a semi-transparent box per element, one colour per
 * event, and a draggable callout naming the event. It follows the page live —
 * scroll, resize, and whatever the variation reveals as you click around. A
 * panel lists every event: not seen yet, hidden on this page, on screen, on the
 * page, seen earlier. The panel floats or docks left / bottom / right, like a
 * browser's developer tools.
 *
 * Everything lives in ONE shadow root, so the page's CSS cannot reach it (the
 * host's Bootstrap `.row` was wrapping the panel's rows) and the page's
 * querySelectorAll can never match the overlay's own nodes.
 *
 * In the product the OPMC loader runs this when the URL carries opmc_metrics=1,
 * with the events fetched from Optimizely through the console. In the mockup it
 * is injected by hand with the events inlined (window.__OPMC_EVENTS__).
 */
(function () {
  var Q = new URLSearchParams(location.search);
  var on = false;
  Q.forEach(function (v, k) { if (k.toLowerCase() === "opmc_metrics" && v === "1") on = true; });
  if (!on && !window.__OPMC_FORCE_METRICS__) return;
  if (window.__opmcMetricsOverlay) window.__opmcMetricsOverlay.destroy();

  var CFG = window.__OPMC_EVENTS__ || { variation: "", events: [] };
  var PALETTE = ["#E6194B", "#3CB44B", "#4363D8", "#F58231", "#911EB4", "#0AAFC0", "#F032E6",
                 "#9A6324", "#469990", "#808000", "#000075", "#800000", "#D4A000", "#5C5C5C"];
  var DARK_TEXT = { "#D4A000": 1 };
  var TEST_ROOT = CFG.testRoot || "";
  var events = CFG.events.map(function (e, i) {
    return { name: e.name, selector: e.selector, color: PALETTE[i % PALETTE.length], on: true,
             els: [], shown: [], visible: [], shared: [], seen: false, status: "none", error: null, outside: 0 };
  });

  // ── layout preference (per browser) ───────────────────────────────────────
  var LS = "opmc-metrics-layout";
  var layout = { dock: "float", w: 340, h: 260, x: null, y: null, min: false };
  try { var saved = JSON.parse(localStorage.getItem(LS) || "null"); if (saved) for (var k in saved) layout[k] = saved[k]; } catch (x) {}
  function saveLayout() { try { localStorage.setItem(LS, JSON.stringify(layout)); } catch (x) {} }

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
  };
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
    "#panel.min .list{display:none}" +
    "header{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #E3E8EE;flex-shrink:0}.ttl{flex:1 1 180px;min-width:0}" +
    "#panel.min header{border-bottom:0}" +
    "#panel.float header{cursor:move}" +
    "h2{margin:0;font-size:14px;font-weight:600;line-height:1.3}" +
    ".sub{color:#5D6B7E;font-size:12.5px;margin-top:2px}" +
    ".tools{margin-left:auto;display:flex;gap:2px;align-items:center;flex-shrink:0}" +
    ".ic{width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border:1px solid transparent;border-radius:6px;" +
      "background:transparent;color:#5D6B7E;cursor:pointer;padding:0;margin:0}" +
    ".ic:hover{background:#F1F4F8;color:#17202B}" +
    ".ic[aria-pressed=true]{background:#EAF0FB;color:#1D4ED8;border-color:rgba(29,78,216,.35)}" +
    ".sep{width:1px;height:18px;background:#E3E8EE;margin:0 4px}" +
    ".btn{height:28px;padding:0 10px;border:1px solid #C9D2DC;border-radius:6px;background:#fff;color:#17202B;font:12.5px/1 " + FONT + ";white-space:nowrap;cursor:pointer;margin:0}" +
    ".btn:hover{border-color:#1D4ED8;color:#1D4ED8}" +
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
        '<div class="ttl"><h2>Tracked events</h2><div class="sub"></div></div>' +
        '<div class="tools">' +
          '<button type="button" class="ic" data-dock="float" title="Float" aria-label="Float">' + icon("float") + "</button>" +
          '<button type="button" class="ic" data-dock="left" title="Dock to left" aria-label="Dock to left">' + icon("left") + "</button>" +
          '<button type="button" class="ic" data-dock="bottom" title="Dock to bottom" aria-label="Dock to bottom">' + icon("bottom") + "</button>" +
          '<button type="button" class="ic" data-dock="right" title="Dock to right" aria-label="Dock to right">' + icon("right") + "</button>" +
          '<span class="sep"></span>' +
          '<button type="button" class="btn" data-a="toggle">Hide boxes</button>' +
          '<button type="button" class="ic" data-a="min" title="Minimise" aria-label="Minimise">–</button>' +
        "</div>" +
      "</header>" +
      '<div class="list"></div>' +
    "</section>";
  document.documentElement.appendChild(host);

  var boxes = sh.getElementById("boxes"), svg = sh.getElementById("lines"), labels = sh.getElementById("labels");
  var panel = sh.getElementById("panel"), sub = sh.querySelector(".sub"), list = sh.querySelector(".list");
  var svgNS = "http://www.w3.org/2000/svg";
  var showBoxes = true, hover = null;

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
      if (a === "toggle") { showBoxes = !showBoxes; b.textContent = showBoxes ? "Hide boxes" : "Show boxes"; draw(); }
      if (a === "min") { layout.min = !layout.min; applyLayout(); }
      return;
    }
    var row = ev.target.closest(".ev[data-i]");
    if (!row) return;
    var e = events[+row.getAttribute("data-i")];
    var target = e.visible[0] || e.shown[0] || e.els[0];
    if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
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
    } else if (head && layout.dock === "float" && !ev.target.closest("button")) {
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
  function measure() {
    var owner = new Map();
    events.forEach(function (e) {
      e.error = null;
      try { e.els = Array.prototype.slice.call(document.querySelectorAll(e.selector)); }
      catch (err) { e.els = []; e.error = "The selector isn't valid CSS."; }
      e.shown = e.els.filter(isShown);
      e.visible = e.shown.filter(function (el) { return inViewport(el.getBoundingClientRect()); });
      if (e.shown.length) e.seen = true;
      // screen · page (scroll to it) · earlier (appeared this visit, gone now) ·
      // hidden (matches, never visible: can't be clicked) · none (never matched yet)
      e.status = e.error ? "none" : e.visible.length ? "screen" : e.shown.length ? "page" : e.seen ? "earlier" : e.els.length ? "hidden" : "none";
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
  var drag = null;
  function ensureCallout(e) {
    if (e.labelEl) return;
    var l = document.createElement("div");
    l.className = "cl";
    l.title = "Drag to move · double-click to put back";
    l.style.background = e.color; l.style.color = textOn(e.color);
    l.addEventListener("pointerdown", function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      var r = l.getBoundingClientRect();
      drag = { e: e, ox: ev.clientX - r.left, oy: ev.clientY - r.top };
      try { l.setPointerCapture(ev.pointerId); } catch (x) {}
      l.style.cursor = "grabbing";
    });
    l.addEventListener("pointermove", function (ev) {
      if (!drag || drag.e !== e || !e.anchor) return;
      e.pin = { dx: ev.clientX - drag.ox - e.anchor.left, dy: ev.clientY - drag.oy - e.anchor.top };
      draw();
    });
    function end(ev) {
      if (!drag || drag.e !== e) return;
      drag = null; l.style.cursor = "grab";
      try { l.releasePointerCapture(ev.pointerId); } catch (x) {}
    }
    l.addEventListener("pointerup", end);
    l.addEventListener("pointercancel", end);
    l.addEventListener("click", function (ev) { ev.preventDefault(); ev.stopPropagation(); });
    l.addEventListener("dblclick", function (ev) { ev.preventDefault(); ev.stopPropagation(); e.pin = null; draw(); });
    labels.appendChild(l);
    e.labelEl = l;
    e.lineEl = document.createElementNS(svgNS, "line");
    e.lineEl.setAttribute("stroke", e.color); e.lineEl.setAttribute("stroke-width", "2");
    e.dotEl = document.createElementNS(svgNS, "circle");
    e.dotEl.setAttribute("r", "3.5"); e.dotEl.setAttribute("fill", e.color);
    svg.appendChild(e.lineEl); svg.appendChild(e.dotEl);
  }
  function hideCallout(e) {
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
      e.visible.forEach(function (el) {
        var r = el.getBoundingClientRect();
        var b = document.createElement("div");
        b.className = "box";
        b.style.cssText = "left:" + (r.left - 2) + "px;top:" + (r.top - 2) + "px;width:" + (r.width + 4) + "px;height:" + (r.height + 4) + "px;" +
          "border-color:" + e.color + ";background:" + e.color + (dim ? "0D" : "33") + ";opacity:" + (dim ? 0.25 : 1) + ";";
        boxes.appendChild(b);
      });
      ensureCallout(e);
      var l = e.labelEl;
      var a = e.visible[0].getBoundingClientRect();
      e.anchor = a;
      var text = e.name + (e.visible.length > 1 ? "  ×" + e.visible.length : "");
      if (l.textContent !== text) l.textContent = text;
      l.style.display = ""; e.lineEl.style.display = ""; e.dotEl.style.display = "";
      var w = l.offsetWidth || 160, h = 22, x, y;
      if (e.pin) {
        x = a.left + e.pin.dx; y = a.top + e.pin.dy;
      } else {
        var right = a.right + 18 + w < innerWidth;
        x = right ? a.right + 18 : Math.max(4, a.left - 18 - w);
        y = Math.max(4, a.top - 30);
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
    });
  }

  // ── the list ──────────────────────────────────────────────────────────────
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function grp(cls, label, n) {
    return '<div class="grp' + (cls ? " " + cls : "") + '"><span class="dot"></span><span>' + label + '</span><span class="n">' + n + "</span></div>";
  }
  function row(e, i, extra, cls) {
    var warn = [];
    if (e.outside) warn.push(e.outside + " outside this test's area");
    if (e.shared.length) warn.push("Same element also counted by: " + e.shared.join(", "));
    return '<div class="ev' + (cls ? " " + cls : "") + '" data-i="' + i + '"><span class="sw" style="background:' + e.color + '"></span><div class="txt">' +
      '<div class="nm">' + esc(e.name) + "</div>" +
      '<div class="meta">' + extra + "</div>" +
      (warn.length ? '<div class="warn">' + esc(warn.join(" · ")) + "</div>" : "") +
      "</div></div>";
  }
  var lastList = "";
  function renderList() {
    var g = { none: [], hidden: [], screen: [], page: [], earlier: [] };
    events.forEach(function (e, i) { g[e.status].push([e, i]); });
    var out = "";
    if (g.none.length) {
      out += grp("bad", "Not seen yet", g.none.length);
      g.none.forEach(function (p) {
        var e = p[0];
        var why = e.error || "Not on the page yet. Click around to reveal it. If it never appears, this event can't fire.";
        out += row(e, p[1], '<span style="color:#C42B2B">' + esc(why) + '</span><div class="sel">' + esc(e.selector) + "</div>", "missing");
      });
    }
    if (g.hidden.length) {
      out += grp("amber", "Hidden on this page", g.hidden.length);
      g.hidden.forEach(function (p) {
        var e = p[0];
        out += row(e, p[1], '<span style="color:#B45309">' + e.els.length + " matching, none visible. Can't be clicked here.</span>" + '<div class="sel">' + esc(e.selector) + "</div>");
      });
    }
    if (g.screen.length) {
      out += grp("good", "On screen now", g.screen.length);
      g.screen.forEach(function (p) { var e = p[0]; out += row(e, p[1], e.visible.length + " on screen" + (e.shown.length > e.visible.length ? " · " + e.shown.length + " on the page" : "")); });
    }
    if (g.page.length) {
      out += grp("", "On the page, scroll to see", g.page.length);
      g.page.forEach(function (p) { var e = p[0]; out += row(e, p[1], e.shown.length + " on the page"); });
    }
    if (g.earlier.length) {
      out += grp("", "Seen earlier", g.earlier.length);
      g.earlier.forEach(function (p) { var e = p[0]; out += row(e, p[1], "Appeared earlier in this visit"); });
    }
    var seen = events.filter(function (e) { return e.seen; }).length;
    sub.textContent = (CFG.variation ? CFG.variation + " · " : "") + seen + " of " + events.length + " events seen so far";
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
    setDock: function (d) { layout.dock = d; applyLayout(); },
    destroy: function () {
      clearInterval(iv); mo.disconnect();
      removeEventListener("scroll", tick, { capture: true }); removeEventListener("resize", onResize);
      restorePads(); host.remove(); window.__opmcMetricsOverlay = null;
    },
  };
})();
