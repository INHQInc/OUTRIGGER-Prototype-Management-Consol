/**
 * Outrigger home page — explorer navigation (step one of the Grid/Map explorer)
 *
 * No back arrow, no levels, no hidden state. Both tiers are on screen at once
 * and one thing in each is always selected:
 *
 *   Hawaii  Thailand  Fiji  Mauritius  Maldives     ← destination; selected one is the headline
 *   [Oahu 4] [Maui 2] [Hawaii Island 1] [Kauai 1]   ← regions of it; one always selected
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

  var REGION_COUNTS = { 'Oahu': 4, 'Maui': 2, 'Hawaii Island (Big Island)': 1, 'Kauai': 1 };
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
      '#opmc-dests h2.destination-selection-selected{margin:0 !important;position:relative;padding-bottom:6px}',
      '#opmc-dests h2.destination-selection-selected::after{content:"";position:absolute;left:0;right:0;bottom:0;' +
        'height:3px;background:' + NAVY + '}',
      '#opmc-dests button{font:500 18px/18px DuplicateSans-Medium,sans-serif;color:rgba(51,41,38,.5);' +
        'background:none;border:0;padding:6px 0;cursor:pointer;transition:color .15s;white-space:nowrap}',
      '#opmc-dests button:hover{color:' + NAVY + '}',
      '#opmc-dests button:focus-visible{outline:2px solid ' + NAVY + ';outline-offset:3px}',

      // tier 2 — regions of the selected destination
      '#' + NAV_ID + '{display:block;width:100%;margin:0 0 6px}',
      '#opmc-regions{display:flex;flex-wrap:wrap;gap:8px;padding:0;margin:0;list-style:none;align-items:center}',
      '#opmc-regions button{font:500 16px/16px DuplicateSans-Medium,sans-serif;color:' + INK + ';' +
        'background:transparent;border:1px solid rgba(51,41,38,.28);border-radius:7px;padding:11px 16px;' +
        'cursor:pointer;transition:.15s;white-space:nowrap;display:inline-flex;align-items:center;gap:7px}',
      '#opmc-regions button:hover{border-color:' + NAVY + ';color:' + NAVY + '}',
      '#opmc-regions button.on{background:' + NAVY + ';color:#fff;border-color:' + NAVY + '}',
      '#opmc-regions button:focus-visible{outline:2px solid ' + NAVY + ';outline-offset:2px}',
      '#opmc-regions button i{font-style:normal;font-size:14px;opacity:.5;font-weight:500}',
      '#opmc-regions button:hover i,#opmc-regions button.on i{opacity:.75}',
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

    function render() {
      dests.innerHTML = ''; regs.innerHTML = ''; note.textContent = '';

      // tier 1 — the selected destination IS the headline; the rest sit beside it
      destItems().forEach(function (item) {
        var name = label(item);
        if (!name) return;
        var li = document.createElement('li');
        if (name === state.dest) {
          h2.textContent = name;
          li.appendChild(h2);
        } else {
          var b = document.createElement('button');
          b.type = 'button'; b.textContent = name;
          b.setAttribute('data-tag-item', 'home_destination_select');
          b.addEventListener('click', function () {
            item.click();
            state.dest = name; state.region = null;
            setTimeout(render, 900);
          });
          li.appendChild(b);
        }
        dests.appendChild(li);
      });

      // tier 2 — regions of it, one always selected
      var rb = regionBtns();
      if (!rb.length) {
        note.textContent = 'All resorts in ' + state.dest + ' shown';
        return;
      }
      if (!state.region) state.region = label(rb[0]);   // match what the site is already showing

      rb.forEach(function (src) {
        var name = label(src);
        var li = document.createElement('li'), b = document.createElement('button');
        b.type = 'button';
        b.textContent = name.replace(' (Big Island)', '');
        if (name === state.region) { b.className = 'on'; b.setAttribute('aria-current', 'true'); }
        var n = REGION_COUNTS[name];
        if (n) { var i = document.createElement('i'); i.textContent = n; b.appendChild(i); }
        b.setAttribute('data-tag-item', 'home_region_select');
        b.addEventListener('click', function () {
          src.click();
          state.region = name;
          setTimeout(render, 700);
        });
        li.appendChild(b); regs.appendChild(li);
      });
    }

    render();
    var ctl = { render: render, state: state };
    nav.__ctl = ctl;
    return ctl;
  }

  function apply() { build(); }

  apply();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true });
  window.__outriggerExplorerNav = apply;
})();
