/**
 * Outrigger home page — explorer navigation (step one of the Grid/Map explorer)
 *
 * This is the NAV LAYER ONLY. The map and grid views come later and plug into
 * this same hierarchy — on the map, zooming IS navigating, so the levels here
 * are the levels there.
 *
 *   Level 0  "Where to?"     → the five destinations, with counts
 *   Level 1  "Hawaii"        → its four islands, with counts
 *   Level 1  "Thailand"      → no sub-regions; the row stops, it does not sit empty
 *   Level 2  "Oahu"          → properties only
 *
 * The rule: THE ROW SHOWS THE CHILDREN OF WHEREVER YOU ARE. One rule, every
 * depth, never an empty row — which matters because the estate is lopsided:
 * Hawaii has regions beneath it and the other four destinations do not. A fixed
 * two-row strip would show an empty second row four times out of five.
 *
 * The large destination name is the "you are here"; the back chips above it are
 * the way out. Counts do real work — "Mauritius 1" tells you not to bother
 * drilling, "Hawaii 8" tells you there is something to explore.
 *
 * Switching is delegated to the site's own controls (the destination dropdown's
 * .dropdown-item, and the region tab buttons), so this changes the affordance
 * and not the behaviour.
 *
 * KNOWN GAP: at level 0 the property cards below still show the last-selected
 * destination — the site has no "all destinations" card state. That is exactly
 * the slot the world-scale map fills in step two. Do not ship level 0 without
 * it, or run the test with level 0 disabled.
 *
 * Runs ALONE: it alters the best-performing surface on the page (dropdown
 * +12.7%, tabs +8.3%). Guardrail: explorer engagement must not fall.
 */
(function () {
  'use strict';

  var COUNTS = {
    dest:   { 'Hawaii': 8, 'Thailand': 4, 'Fiji': 2, 'Mauritius': 1, 'Maldives': 1 },
    region: { 'Oahu': 4, 'Maui': 2, 'Hawaii Island (Big Island)': 1, 'Kauai': 1 }
  };
  var STYLE_ID = 'opmc-nav-style', NAV_ID = 'opmc-nav';

  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  function styles() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = [
      '.destination-selection-dropdown{display:none !important}',
      '#destination-selection .col-md-4{display:none !important}',
      '#destination-selection .col-md-8{flex:0 0 100%;max-width:100%}',
      '.destination-selection-tabs-list{display:none !important}',  // site's own tabs — we drive them
      '#' + NAV_ID + '{width:100%}',
      '#opmc-crumb{display:flex;align-items:center;gap:10px;margin:0 0 2px;min-height:26px}',
      '#opmc-crumb button{font:500 15px/15px DuplicateSans-Medium,sans-serif;color:rgba(51,41,38,.7);' +
        'background:none;border:0;padding:4px 0;cursor:pointer;display:inline-flex;align-items:center;gap:6px}',
      '#opmc-crumb button:hover{color:rgb(0,69,97)}',
      '#opmc-crumb button:focus-visible{outline:2px solid rgb(0,69,97);outline-offset:2px}',
      '#opmc-title{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin:0 0 14px}',
      'h2.destination-selection-selected{position:relative;padding-bottom:6px;margin:0 !important}',
      'h2.destination-selection-selected::after{content:"";position:absolute;left:0;right:0;bottom:0;' +
        'height:3px;background:rgb(0,69,97)}',
      '#opmc-count{font:500 15px/15px Montserrat-Light,sans-serif;color:rgba(51,41,38,.6)}',
      '#opmc-children{display:flex;flex-wrap:wrap;gap:8px;padding:0;margin:0;list-style:none}',
      '#opmc-children button{font:500 16px/16px DuplicateSans-Medium,sans-serif;color:rgb(51,41,38);' +
        'background:transparent;border:1px solid rgba(51,41,38,.32);border-radius:999px;padding:10px 18px;' +
        'cursor:pointer;transition:.15s;white-space:nowrap;display:inline-flex;align-items:center;gap:7px}',
      '#opmc-children button:hover{background:rgb(0,69,97);border-color:rgb(0,69,97);color:#fff}',
      '#opmc-children button:focus-visible{outline:2px solid rgb(0,69,97);outline-offset:2px}',
      '#opmc-children button i{font-style:normal;opacity:.55;font-size:13px}',
      '#opmc-children button:hover i{opacity:.8}',
      '@media(max-width:767px){#opmc-children button{font-size:14px;padding:8px 14px}}'
    ].join('');
    document.head.appendChild(st);
  }

  function destItems()  { return [].slice.call(document.querySelectorAll('.destination-selection-dropdown .dropdown-item')); }
  function regionBtns() { return [].slice.call(document.querySelectorAll('.destination-selection-tabs-lists button')); }

  function build() {
    var h2 = document.querySelector('h2.destination-selection-selected');
    if (!h2) return null;
    if (document.getElementById(NAV_ID)) return document.getElementById(NAV_ID).__ctl;
    if (!destItems().length) return null;   // dropdown not rendered yet

    styles();

    var nav    = document.createElement('div'); nav.id = NAV_ID;
    var crumb  = document.createElement('div'); crumb.id = 'opmc-crumb';
    var title  = document.createElement('div'); title.id = 'opmc-title';
    var count  = document.createElement('span'); count.id = 'opmc-count';
    var kids   = document.createElement('ul');  kids.id = 'opmc-children';
    kids.setAttribute('aria-label', 'Choose a destination');

    h2.parentNode.insertBefore(nav, h2);
    nav.appendChild(crumb); nav.appendChild(title);
    title.appendChild(h2); title.appendChild(count);
    nav.appendChild(kids);

    var state = { level: 1, dest: (h2.textContent || '').trim(), region: null };

    function pill(label, n, onClick) {
      var li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.textContent = label;
      if (n) { var i = document.createElement('i'); i.textContent = n; b.appendChild(i); }
      b.setAttribute('data-tag-item', 'home_destination_nav_pill');
      b.addEventListener('click', onClick);
      li.appendChild(b); kids.appendChild(li);
    }
    function crumbBtn(label, onClick) {
      var b = document.createElement('button'); b.type = 'button';
      b.innerHTML = '<span aria-hidden="true">&larr;</span>' + label;
      b.setAttribute('data-tag-item', 'home_destination_nav_back');
      b.addEventListener('click', onClick);
      crumb.appendChild(b);
    }

    function render() {
      crumb.innerHTML = ''; kids.innerHTML = ''; count.textContent = '';

      if (state.level === 0) {
        h2.textContent = 'Where to?';
        count.textContent = '5 destinations · 16 resorts';
        destItems().forEach(function (item) {
          var name = (item.innerText || '').replace(/\s+/g, ' ').trim();
          if (!name) return;
          pill(name, COUNTS.dest[name] || '', function () {
            item.click();
            state.level = 1; state.dest = name; state.region = null;
            setTimeout(render, 900);
          });
        });
        return;
      }

      crumbBtn('All destinations', function () { state.level = 0; render(); });

      if (state.level === 1) {
        h2.textContent = state.dest;
        var rb = regionBtns();
        if (rb.length) {
          count.textContent = plural(COUNTS.dest[state.dest] || rb.length, 'resort');
          rb.forEach(function (b) {
            var name = (b.innerText || '').replace(/\s+/g, ' ').trim();
            pill(name, COUNTS.region[name] || '', function () {
              b.click();
              state.level = 2; state.region = name;
              setTimeout(render, 900);
            });
          });
        } else {
          // lopsided estate: this destination has no region tier, so the row stops
          count.textContent = plural(COUNTS.dest[state.dest] || 0, 'resort') +
            ' — no sub-regions, so the row stops here';
        }
        return;
      }

      // level 2 — inside a region
      var sep = document.createElement('span'); sep.textContent = '/'; sep.style.opacity = '.35';
      crumb.appendChild(sep);
      crumbBtn(state.dest, function () { state.level = 1; state.region = null; render(); });
      h2.textContent = state.region;
      count.textContent = plural(COUNTS.region[state.region] || 0, 'resort');
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
