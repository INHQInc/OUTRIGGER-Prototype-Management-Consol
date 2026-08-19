/**
 * Outrigger home page — explorer navigation (step one of the Grid/Map explorer)
 *
 * No back arrow, no levels, no hidden state. Both tiers are on screen at once
 * and one thing in each is always selected:
 *
 *   Hawaii  Thailand  Fiji  Mauritius  Maldives   ← destination; selected one is the headline
 *   [Oahu] [Maui] [Hawaii Island] [Kauai]         ← regions of it; one always selected
 *
 * No property counts: the destination tier has none, so counts on the island
 * tier alone singled Hawaii out for no reason a guest would understand.
 *
 * WHY NO BACK ARROW. A drill-down was tried and abandoned. On first load nobody
 * has navigated anywhere, so "←" answers a question the visitor never asked —
 * back to what? It also buried destination switching one click deeper, and that
 * is the fastest-growing action on the page (dropdown +12.7% vs tabs +8.3%).
 *
 * WHY NOTHING IS BEHIND A DISCLOSURE. Verndale's reviewer reported missing the
 * dropdown entirely — "I also missed the drop down at first" — while it was the
 * single biggest gainer in the experiment. Whatever replaces it has to be MORE
 * discoverable, not more elegant, so the whole set stays visible at rest.
 *
 * Type is the site's own: 60px/66px DuplicateSans-Regular for the selected
 * destination, 18px DuplicateSans-Medium for the others, 16px for the chips.
 * Navy (rgb(0,69,97)) is reserved for the selected state — a solid navy bar
 * fought the sand section, and a white bar read as a stray card inside it.
 *
 * Switching delegates to the site's own controls (the dropdown's .dropdown-item
 * and the region tab buttons), so this changes the affordance, not the behaviour.
 *
 * NOTE: render() owns every mutation inside the nav. Do NOT add a MutationObserver
 * that edits it — an earlier version did and hung the renderer.
 *
 * Runs ALONE: it alters the best-performing surface on the page.
 * Guardrail: explorer engagement (tabs + destination selection) must not fall.
 */
(function () {
  'use strict';
  var STYLE_ID = 'opmc-nav-style', NAV_ID = 'opmc-nav', NAVY = 'rgb(0,69,97)', INK = 'rgb(51,41,38)';

  function styles() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = [
      '.destination-selection-dropdown{display:none !important}',
      '#destination-selection .col-md-4{display:none !important}',
      '#destination-selection .col-md-8{flex:0 0 100%;max-width:100%}',
      '.destination-selection-tabs-list{display:none !important}',   // site's own tabs — we drive them
      '.destination-selection-tabs{display:block !important}',        // wrapper is flex; without this the tiers sit side by side

      // tier 1 — destinations. Selected one keeps the site's 60px headline;
      // the rest sit on its baseline at the site's tab size.
      '#opmc-dests{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px 20px;padding:0;margin:0 0 18px;list-style:none}',
      'h2.destination-selection-selected{display:none !important}',   // we render the name ourselves
      // margin:0 is load-bearing — a site button rule adds margin-left:15px,
      // which pushed both rows 15px right of the "Explore" heading above them.
      '#opmc-dests button{font:500 18px/18px DuplicateSans-Medium,sans-serif;color:rgba(51,41,38,.5);' +
        'background:none;border:0;padding:6px 0;margin:0;cursor:pointer;white-space:nowrap;position:relative;' +
        'transition:color .15s}',
      '#opmc-dests button:hover{color:' + NAVY + '}',
      // the selected destination IS the headline — a class change, never a DOM move
      '#opmc-dests button.on{font:60px/66px DuplicateSans-Regular,sans-serif;color:rgb(33,37,41);' +
        'padding:0 0 6px;margin:0;cursor:default}',
      '#opmc-dests button.on::after{content:"";position:absolute;left:0;right:0;bottom:0;height:3px;' +
        'background:' + NAVY + '}',
      '@media(max-width:767px){#opmc-dests button.on{font-size:38px;line-height:44px}}',
      '#opmc-dests button:focus-visible{outline:2px solid ' + NAVY + ';outline-offset:3px}',

      // tier 2 — regions of the selected destination
      '#' + NAV_ID + '{display:block;width:100%;margin:0 0 6px}',
      '#opmc-regions{display:flex;flex-wrap:wrap;gap:8px;padding:0;margin:0;list-style:none;align-items:center}',
      '#opmc-regions button{font:500 16px/16px DuplicateSans-Medium,sans-serif;color:' + INK + ';' +
        'background:transparent;border:1px solid rgba(51,41,38,.28);border-radius:7px;padding:11px 16px;' +
        'margin:0;cursor:pointer;transition:.15s;white-space:nowrap;display:inline-flex;align-items:center}',
      '#opmc-regions button:hover{border-color:' + NAVY + ';color:' + NAVY + '}',
      '#opmc-regions button.on{background:' + NAVY + ';color:#fff;border-color:' + NAVY + '}',
      '#opmc-regions button:focus-visible{outline:2px solid ' + NAVY + ';outline-offset:2px}',
      '#opmc-note{font:16px/25px Montserrat-Light,sans-serif;color:rgba(51,41,38,.6)}',

      '@media(max-width:767px){#opmc-dests{gap:4px 16px;margin-bottom:14px}' +
        '#opmc-dests button{font-size:16px}' +
        '#opmc-regions button{font-size:15px;padding:10px 14px}}'
    ].join('');
    document.head.appendChild(st);
  }

  function destItems()  { return [].slice.call(document.querySelectorAll('.destination-selection-dropdown .dropdown-item')); }
  function regionBtns() { return [].slice.call(document.querySelectorAll('.destination-selection-tabs-lists button')); }
  function label(el)    { return (el.innerText || '').replace(/\s+/g, ' ').trim(); }

  function build() {
    var h2 = document.querySelector('h2.destination-selection-selected');
    if (!h2 || !destItems().length) return null;
    if (document.getElementById(NAV_ID)) return document.getElementById(NAV_ID).__ctl;

    styles();

    var dests = document.createElement('ul'); dests.id = 'opmc-dests';
    dests.setAttribute('aria-label', 'Destination');
    var nav   = document.createElement('div'); nav.id = NAV_ID;
    var regs  = document.createElement('ul'); regs.id = 'opmc-regions';
    regs.setAttribute('aria-label', 'Region');
    var note  = document.createElement('span'); note.id = 'opmc-note';

    h2.parentNode.insertBefore(dests, h2);
    dests.parentNode.insertBefore(nav, dests.nextSibling);
    nav.appendChild(regs); nav.appendChild(note);

    var state = { dest: label(h2), region: null };
    var destBtns = {};   // name -> button, built once

    // Destination row is built ONCE. Switching only toggles a class — clearing
    // and rebuilding it (and moving the 60px heading between list items) made
    // the whole row collapse and re-flow for a frame, which read as a flicker.
    function buildDests() {
      destItems().forEach(function (item) {
        var name = label(item);
        if (!name || destBtns[name]) return;
        var li = document.createElement('li');
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = name;
        b.setAttribute('data-tag-item', 'home_destination_select');
        b.addEventListener('click', function () {
          if (state.dest === name) return;
          state.dest = name; state.region = null;
          paintDests();          // repaint immediately; no waiting, no jump
          // resolve live, for the same detached-node reason as the regions
          var live = destItems().filter(function (x) { return label(x) === name; })[0] || item;
          live.click();
          lastSig = null;            // force a re-read once the site has switched
          setTimeout(syncRegions, 400);
        });
        destBtns[name] = b;
        li.appendChild(b);
        dests.appendChild(li);
      });
    }

    function paintDests() {
      Object.keys(destBtns).forEach(function (name) {
        var b = destBtns[name], on = name === state.dest;
        b.classList.toggle('on', on);
        if (on) { b.setAttribute('aria-current', 'true'); b.setAttribute('role', 'heading'); b.setAttribute('aria-level', '2'); }
        else { b.removeAttribute('aria-current'); b.removeAttribute('role'); b.removeAttribute('aria-level'); }
      });
    }

    // Regions genuinely differ per destination, so this row is rebuilt — but it
    // is the small row, and it is rebuilt only after the site has switched.
    function renderRegions() {
      var rb = regionBtns();
      regs.innerHTML = ''; note.textContent = '';
      if (!rb.length) { note.textContent = 'All resorts in ' + state.dest + ' shown'; return; }
      if (!state.region) state.region = label(rb[0]);

      rb.forEach(function (src) {
        var name = label(src);
        // The site REPLACES these tab nodes after render, so a captured reference
        // goes detached and .click() on it silently does nothing. Resolve the
        // live node at click time instead — data-region-index is stable.
        var idx = src.getAttribute('data-region-index');
        var li = document.createElement('li'), b = document.createElement('button');
        b.type = 'button';
        b.textContent = name.replace(' (Big Island)', '');
        if (name === state.region) { b.className = 'on'; b.setAttribute('aria-current', 'true'); }
        b.setAttribute('data-tag-item', 'home_region_select');
        b.addEventListener('click', function () {
          if (state.region === name) return;
          state.region = name;
          // paint the selection now; the site filters the cards underneath
          [].slice.call(regs.querySelectorAll('button')).forEach(function (x) { x.classList.remove('on'); x.removeAttribute('aria-current'); });
          b.classList.add('on'); b.setAttribute('aria-current', 'true');
          var live = idx !== null
            ? document.querySelector('.destination-selection-tabs-lists button[data-region-index="' + idx + '"]')
            : null;
          if (!live) {
            live = regionBtns().filter(function (x) { return label(x) === name; })[0];
          }
          if (live) live.click();
        });
        li.appendChild(b); regs.appendChild(li);
      });
    }

    // The site renders its region tabs AFTER this builds on a cold load, and
    // build() early-returns once the nav exists — so a one-shot render left the
    // island chips empty until some unrelated re-render happened to rebuild us.
    // Track the site's tab set and re-render only when it actually changes
    // (a signature check, so observing the document can't loop us).
    var lastSig = null;
    function regionSig() {
      return regionBtns().map(label).join('|') + '@' + state.dest + '#' + (state.region || '');
    }
    function syncRegions() {
      var sig = regionSig();
      if (sig === lastSig) return;
      lastSig = sig;
      renderRegions();
    }

    function render() { buildDests(); paintDests(); syncRegions(); }

    render();
    var ctl = { render: render, sync: syncRegions, state: state };
    nav.__ctl = ctl;
    return ctl;
  }

  function apply() {
    var ctl = build();
    if (ctl && ctl.sync) ctl.sync();   // cheap: no-ops unless the site's tabs changed
  }

  apply();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true });
  window.__outriggerExplorerNav = apply;
})();
