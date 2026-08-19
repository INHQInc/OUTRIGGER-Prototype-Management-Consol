/**
 * Outrigger home page — explorer navigation (step one of the Grid/Map explorer)
 *
 * No back arrow, no levels, no hidden state. Both tiers are on screen at once
 * and one thing in each is always selected:
 *
 *   Hawaii   Thailand Fiji Mauritius Maldives   ← headline is fixed at the left;
 *                                              the others sit beside it
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
      // The headline is its OWN element, always first, always flush with the
      // "Explore" heading above. Making the selected chip the headline meant the
      // 60px name sat wherever that destination fell in the row — pick Maldives
      // and it landed 289px to the right of where Hawaii had been.
      '#opmc-topline{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px 22px;margin:0 0 18px}',
      '#opmc-head{font:60px/66px DuplicateSans-Regular,sans-serif;color:rgb(33,37,41);' +
        'position:relative;padding-bottom:6px;margin:0;white-space:nowrap}',
      '#opmc-head::after{content:"";position:absolute;left:0;right:0;bottom:0;height:3px;background:' + NAVY + '}',
      '#opmc-dests{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px 20px;padding:0;margin:0;list-style:none}',
      'h2.destination-selection-selected{display:none !important}',
      // margin:0 is load-bearing — a site button rule adds margin-left:15px
      '#opmc-dests button{font:500 18px/18px DuplicateSans-Medium,sans-serif;color:rgba(51,41,38,.5);' +
        'background:none;border:0;padding:6px 0;margin:0;cursor:pointer;white-space:nowrap;transition:color .15s}',
      '#opmc-dests button:hover{color:' + NAVY + '}',
      '#opmc-dests button:focus-visible{outline:2px solid ' + NAVY + ';outline-offset:3px}',
      '#opmc-dests li.on{display:none}',        // the selected one IS the headline
      // MOBILE. Wrapping was the problem: the four destinations landed beside the
      // headline on one cramped line, and the chips reflowed into ragged rows.
      // Both tiers become single-line scrollers instead, and touch targets go to
      // 44px. The site hides its own "Explore" eyebrow here, so the name leads.
      '@media(max-width:767px){' +
        '#opmc-topline{display:block;margin:0 0 12px}' +
        '#opmc-head{font-size:34px;line-height:40px;white-space:normal;margin:0 0 12px;display:inline-block}' +
        '#opmc-dests{flex-wrap:nowrap;overflow-x:auto;gap:20px;scrollbar-width:none;-ms-overflow-style:none;' +
          'padding:0 12px 2px 0;scroll-snap-type:x proximity;overscroll-behavior-x:contain}' +
        '#opmc-dests::-webkit-scrollbar{display:none}' +
        '#opmc-dests li{scroll-snap-align:start;flex:0 0 auto}' +
        '#opmc-dests button{font-size:16px;padding:10px 0}' +
        '#opmc-regions{flex-wrap:nowrap;overflow-x:auto;gap:8px;scrollbar-width:none;-ms-overflow-style:none;' +
          'padding:0 12px 2px 0;scroll-snap-type:x proximity;overscroll-behavior-x:contain}' +
        '#opmc-regions::-webkit-scrollbar{display:none}' +
        '#opmc-regions li{scroll-snap-align:start;flex:0 0 auto}' +
        '#opmc-regions button{font-size:15px;padding:14px 16px}' +   // 44px tall
        '#opmc-note{font-size:15px}' +
      '}',
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

    var topline = document.createElement('div'); topline.id = 'opmc-topline';
    var head    = document.createElement('div'); head.id = 'opmc-head';
    head.setAttribute('role', 'heading'); head.setAttribute('aria-level', '2');
    var dests   = document.createElement('ul'); dests.id = 'opmc-dests';
    dests.setAttribute('aria-label', 'Choose a destination');
    var nav     = document.createElement('div'); nav.id = NAV_ID;
    var regs    = document.createElement('ul'); regs.id = 'opmc-regions';
    regs.setAttribute('aria-label', 'Choose a region');
    var note    = document.createElement('span'); note.id = 'opmc-note';

    h2.parentNode.insertBefore(topline, h2);
    topline.appendChild(head); topline.appendChild(dests);
    topline.parentNode.insertBefore(nav, topline.nextSibling);
    nav.appendChild(regs); nav.appendChild(note);

    var state = { dest: label(h2), region: null };
    var destLis = {};   // name -> li, built once and never moved

    function buildDests() {
      destItems().forEach(function (item) {
        var name = label(item);
        if (!name || destLis[name]) return;
        var li = document.createElement('li');
        var b  = document.createElement('button');
        b.type = 'button';
        b.textContent = name;
        b.setAttribute('data-tag-item', 'home_destination_select');
        b.addEventListener('click', function () {
          if (state.dest === name) return;
          state.dest = name; state.region = null;
          paintDests();                        // repaint now — no wait, no jump
          var live = destItems().filter(function (x) { return label(x) === name; })[0] || item;
          live.click();
          lastSig = null;
          setTimeout(syncRegions, 400);
        });
        li.appendChild(b);
        destLis[name] = li;
        dests.appendChild(li);
      });
    }

    // Selection is text on the headline plus one hidden li — nothing moves.
    function paintDests() {
      head.textContent = state.dest;
      Object.keys(destLis).forEach(function (name) {
        destLis[name].classList.toggle('on', name === state.dest);
      });
    }

    function renderRegions() {
      var rb = regionBtns();
      regs.innerHTML = ''; note.textContent = '';
      if (!rb.length) { note.textContent = 'All resorts in ' + state.dest + ' shown'; return; }
      if (!state.region) state.region = label(rb[0]);

      rb.forEach(function (src) {
        var name = label(src);
        // the site replaces these nodes, so resolve the live one at click time
        var idx = src.getAttribute('data-region-index');
        var li = document.createElement('li'), b = document.createElement('button');
        b.type = 'button';
        b.textContent = name.replace(' (Big Island)', '');
        if (name === state.region) { b.className = 'on'; b.setAttribute('aria-current', 'true'); }
        b.setAttribute('data-tag-item', 'home_region_select');
        b.addEventListener('click', function () {
          if (state.region === name) return;
          state.region = name;
          [].slice.call(regs.querySelectorAll('button')).forEach(function (x) {
            x.classList.remove('on'); x.removeAttribute('aria-current');
          });
          b.classList.add('on'); b.setAttribute('aria-current', 'true');
          var live = (idx !== null && document.querySelector('.destination-selection-tabs-lists button[data-region-index="' + idx + '"]'))
                     || regionBtns().filter(function (x) { return label(x) === name; })[0];
          if (live) live.click();
        });
        li.appendChild(b); regs.appendChild(li);
      });
    }

    // The site renders its region tabs AFTER this builds on a cold load, so a
    // one-shot render left the island chips empty. Signature-gated so watching
    // the document cannot loop us.
    var lastSig = null;
    function regionSig() { return regionBtns().map(label).join('|') + '@' + state.dest + '#' + (state.region || ''); }
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
