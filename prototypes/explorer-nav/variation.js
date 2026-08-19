/**
 * Outrigger home page — explorer navigation (step one of the Grid/Map explorer)
 *
 * This is the NAV LAYER ONLY. The map and grid views come later and plug into
 * this same hierarchy — on the map, zooming IS navigating, so the levels here
 * are the levels there.
 *
 *   Level 0  "Where to?"     → the five destinations; the live one stays selected
 *   Level 1  "Hawaii"        → its four islands; one always selected, defaulting
 *                              to whatever the site is already showing
 *   Level 1  "Thailand"      → no sub-regions; the bar says so rather than sitting empty
 *
 * There is no level 2. Drilling into a region hid its siblings and left the bar
 * with a lone back arrow — selecting a region now marks it and filters the cards
 * while the other islands stay one click away. Something is ALWAYS selected.
 *
 * The rule: THE ROW SHOWS THE CHILDREN OF WHEREVER YOU ARE. One rule, every
 * depth, never an empty row — which matters because the estate is lopsided:
 * Hawaii has regions beneath it and the other four destinations do not. A fixed
 * two-row strip would show an empty second row four times out of five.
 *
 * The large destination name is the "you are here". Navigation lives in a navy
 * bar directly beneath it: a back arrow and the child chips. Counts are dropped
 * from the name row — "Hawaii 8 resorts ← All destinations" put four competing
 * text elements on one line and read as clutter.
 *
 * NOTE: render() owns every mutation inside the bar. Do NOT add a MutationObserver
 * that edits the bar — an earlier version did and looped the renderer to a hang. Counts do real work — "Mauritius 1" tells you not to bother
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
  var STYLE_ID = 'opmc-nav-style', NAV_ID = 'opmc-nav', NAVY = 'rgb(0,69,97)';

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
      // the wrapper is flex; without this the bar sits BESIDE the name and overlaps it
      '.destination-selection-tabs{display:block !important}',

      // the destination name keeps its own line; the bar carries the navigation
      '#opmc-title{display:flex;align-items:baseline;margin:0 0 16px}',
      'h2.destination-selection-selected{margin:0 !important}',
      '#opmc-count{display:none}',

      '#' + NAV_ID + '{display:block;width:100%;margin:0 0 6px}',
      '#opmc-bar{background:' + NAVY + ';color:#fff;border-radius:8px;padding:12px 16px;' +
        'display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      '#opmc-bar .barlbl{font:600 10.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.1em;' +
        'text-transform:uppercase;opacity:.6;margin-right:2px}',
      '#opmc-bar .barnote{font-size:13px;opacity:.65}',

      '#opmc-crumb{display:flex;align-items:center;gap:10px;margin:0}',
      '#opmc-crumb button{width:30px;height:30px;border-radius:6px;border:1px solid rgba(255,255,255,.3);' +
        'background:transparent;color:#fff;cursor:pointer;font-size:15px;line-height:1;display:inline-flex;' +
        'align-items:center;justify-content:center;padding:0;transition:.15s}',
      '#opmc-crumb button:hover{background:#fff;color:' + NAVY + ';border-color:#fff}',
      '#opmc-crumb button:focus-visible{outline:2px solid #fff;outline-offset:2px}',

      '#opmc-children{display:flex;flex-wrap:wrap;gap:9px;padding:0;margin:0;list-style:none;align-items:center}',
      '#opmc-children button{font:500 13.5px/1 DuplicateSans-Medium,sans-serif;color:#fff;background:transparent;' +
        'border:1px solid rgba(255,255,255,.3);border-radius:7px;padding:8px 13px;cursor:pointer;' +
        'transition:.15s;white-space:nowrap;display:inline-flex;align-items:center;gap:6px}',
      '#opmc-children button:hover{background:#fff;color:' + NAVY + ';border-color:#fff}',
      '#opmc-children button.on{background:#fff;color:' + NAVY + ';border-color:#fff;font-weight:650}',
      '#opmc-children button.on i{opacity:.7}',
      '#opmc-children button:focus-visible{outline:2px solid #fff;outline-offset:2px}',
      '#opmc-children button i{font-style:normal;opacity:.55;font-weight:500;font-size:12px}',
      '#opmc-children button:hover i{opacity:.7}',
      '@media(max-width:767px){#opmc-bar{padding:11px 12px;gap:8px}' +
        '#opmc-children button{font-size:12.5px;padding:7px 11px}}'
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

    var bar = document.createElement('div'); bar.id = 'opmc-bar';
    var barlbl = document.createElement('span'); barlbl.className = 'barlbl'; barlbl.textContent = 'Where';

    h2.parentNode.insertBefore(nav, h2);
    nav.parentNode.insertBefore(title, nav);
    title.appendChild(h2); title.appendChild(count);
    bar.appendChild(barlbl); bar.appendChild(crumb); bar.appendChild(kids);
    nav.appendChild(bar);

    var state = { level: 1, dest: (h2.textContent || '').trim(), region: null };  // region filled in on first render

    function pill(label, n, onClick, selected) {
      var li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.textContent = label;
      if (selected) { b.className = 'on'; b.setAttribute('aria-current', 'true'); }
      if (n) { var i = document.createElement('i'); i.textContent = n; b.appendChild(i); }
      // the parenthetical is dead weight in a chip
      b.firstChild.nodeValue = b.firstChild.nodeValue.replace(' (Big Island)', '');
      b.setAttribute('data-tag-item', 'home_destination_nav_pill');
      b.addEventListener('click', onClick);
      li.appendChild(b); kids.appendChild(li);
    }
    function crumbBtn(label, onClick) {
      var b = document.createElement('button'); b.type = 'button';
      b.textContent = '\u2190';
      b.setAttribute('aria-label', 'Back to ' + label);
      b.title = 'Back to ' + label;
      b.setAttribute('data-tag-item', 'home_destination_nav_back');
      b.addEventListener('click', onClick);
      crumb.appendChild(b);
    }

    function note(text) {
      var n = document.createElement('span'); n.className = 'barnote'; n.textContent = text;
      bar.appendChild(n);
    }

    function render() {
      crumb.innerHTML = ''; kids.innerHTML = ''; count.textContent = '';
      var stale = bar.querySelector('.barnote'); if (stale) stale.remove();

      if (state.level === 0) {
        h2.textContent = 'Where to?';
        destItems().forEach(function (item) {
          var name = (item.innerText || '').replace(/\s+/g, ' ').trim();
          if (!name) return;
          pill(name, COUNTS.dest[name] || '', function () {
            item.click();
            state.level = 1; state.dest = name; state.region = null;
            setTimeout(render, 900);
          }, name === state.dest);              // the live destination stays selected
        });
        return;
      }

      // level 1 — the destination, with its regions as siblings. Selecting a
      // region marks it and filters; it does NOT drill away from the others,
      // so there is always exactly one chip selected and nothing to get lost in.
      crumbBtn('All destinations', function () { state.level = 0; render(); });
      h2.textContent = state.dest;

      var rb = regionBtns();
      if (!rb.length) {
        note('No sub-regions \u2014 all ' + plural(COUNTS.dest[state.dest] || 0, 'resort') + ' shown');
        return;
      }

      // default to whatever the site is actually showing — the first region
      if (!state.region) state.region = (rb[0].innerText || '').replace(/\s+/g, ' ').trim();

      rb.forEach(function (b) {
        var name = (b.innerText || '').replace(/\s+/g, ' ').trim();
        pill(name, COUNTS.region[name] || '', function () {
          b.click();
          state.region = name;
          setTimeout(render, 700);
        }, name === state.region);
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
