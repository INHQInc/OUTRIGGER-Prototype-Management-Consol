/**
 * Outrigger home page — test 04: destination name as the selector
 *
 * Removes the destination dropdown and puts every region on the page at rest:
 * the active one stays as the 60px editorial headline, the rest sit beside it
 * as pills. Nothing is hidden behind a disclosure, which is the point —
 * Verndale's reviewer reported missing the dropdown entirely, and it is the
 * single biggest gainer on the page (+12.7%), so the replacement has to be MORE
 * discoverable, not more elegant.
 *
 * Pills proxy their click to the site's own `.dropdown-item`, so the existing
 * region-switching logic runs untouched — this changes the affordance, not the
 * behaviour.
 *
 * Runs ALONE: it alters the best-performing surface on the page, so a
 * regression here must not be maskable by another test's win.
 * Guardrail: explorer engagement (tabs + destination selection) must not fall.
 */
(function () {
  'use strict';

  var STYLE_ID = 'opmc-pills-style';
  var PILLS_ID = 'opmc-region-pills';
  var ROW_ID   = 'opmc-region-row';

  function styles() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = [
      // the dropdown this replaces
      '.destination-selection-dropdown{display:none !important}',
      '#destination-selection .col-md-4{display:none !important}',
      '#destination-selection .col-md-8{flex:0 0 100%;max-width:100%}',

      // row 1 — the region: active name + the other regions as pills
      '#' + ROW_ID + '{display:flex;align-items:baseline;flex-wrap:wrap;gap:10px 22px;margin:0 0 6px;width:100%}',
      'h2.destination-selection-selected{position:relative;padding-bottom:6px;margin:0 !important}',
      'h2.destination-selection-selected::after{content:"";position:absolute;left:0;right:0;bottom:0;' +
        'height:3px;background:rgb(0,69,97)}',
      '#' + PILLS_ID + '{display:flex;flex-wrap:wrap;gap:8px;padding:0;margin:0 0 4px;list-style:none}',
      '#' + PILLS_ID + ' button{font:500 16px/16px DuplicateSans-Medium,sans-serif;color:rgb(51,41,38);' +
        'background:transparent;border:1px solid rgba(51,41,38,.32);border-radius:999px;padding:10px 18px;' +
        'cursor:pointer;transition:background .15s,border-color .15s,color .15s;white-space:nowrap}',
      '#' + PILLS_ID + ' button:hover{background:rgb(0,69,97);border-color:rgb(0,69,97);color:#fff}',
      '#' + PILLS_ID + ' button:focus-visible{outline:2px solid rgb(0,69,97);outline-offset:2px}',

      // row 2 — sub-destinations, quieter so the two levels never read as one set
      '.destination-selection-tabs{display:block !important}',
      '.destination-selection-tabs-list{display:flex;flex-wrap:wrap;gap:0 26px;margin-top:14px}',
      '.destination-selection-tabs-lists button{font:500 17px/17px DuplicateSans-Medium,sans-serif !important;' +
        'color:rgba(51,41,38,.72) !important;padding:6px 0 !important}',
      '.destination-selection-tabs-lists button:hover{color:rgb(0,69,97) !important}',

      '@media(max-width:767px){#' + ROW_ID + '{gap:10px 14px}' +
        '#' + PILLS_ID + ' button{font-size:14px;padding:8px 14px}}'
    ].join('');
    document.head.appendChild(st);
  }

  function regionItems() {
    return [].slice.call(document.querySelectorAll('.destination-selection-dropdown .dropdown-item'));
  }

  /** Rebuild the pills for whatever region is currently active. */
  function render() {
    var h2 = document.querySelector('h2.destination-selection-selected');
    var ul = document.getElementById(PILLS_ID);
    if (!h2 || !ul) return;

    var active = (h2.textContent || '').trim();
    var items = regionItems();
    var want = [];
    for (var i = 0; i < items.length; i++) {
      var n = (items[i].innerText || '').replace(/\s+/g, ' ').trim();
      if (n && n !== active) want.push(n);
    }
    var have = [].slice.call(ul.querySelectorAll('button')).map(function (b) { return b.textContent; });
    if (want.join('|') === have.join('|')) return;   // nothing changed — leave the DOM alone

    ul.innerHTML = '';
    items.forEach(function (item) {
      var name = (item.innerText || '').replace(/\s+/g, ' ').trim();
      if (!name || name === active) return;          // the active region IS the headline
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = name;
      b.setAttribute('data-tag-item', 'home_destination_pill_link');
      b.addEventListener('click', function () { item.click(); });  // reuse the site's own switching
      li.appendChild(b);
      ul.appendChild(li);
    });
  }

  function build() {
    var h2 = document.querySelector('h2.destination-selection-selected');
    if (!h2 || document.getElementById(ROW_ID)) return !!document.getElementById(ROW_ID);
    if (!regionItems().length) return false;         // dropdown not rendered yet

    styles();

    var row = document.createElement('div');
    row.id = ROW_ID;
    h2.parentNode.insertBefore(row, h2);
    row.appendChild(h2);

    var ul = document.createElement('ul');
    ul.id = PILLS_ID;
    ul.setAttribute('aria-label', 'Choose a destination');
    row.appendChild(ul);

    render();
    // The headline is rewritten by the site when the region changes — follow it.
    new MutationObserver(render).observe(h2, { childList: true, characterData: true, subtree: true });
    return true;
  }

  function apply() { if (!build()) return; render(); }

  apply();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true });
  window.__outriggerExplorerPills = apply;
})();
