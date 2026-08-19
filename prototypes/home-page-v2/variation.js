/**
 * Outrigger home page — test 01 + 03 variation
 *
 *  1. Trip Planner banner, dark blue, full bleed, directly under the destination explorer.
 *     Styling matched to the site's own .promotion-banner (rgb(0,69,97) / DuplicateSans / Montserrat).
 *  2. Property tiles: "Book Now" -> "View Availability" (keeps the widget and every data-bw-* attr);
 *     "Learn More" -> "View Rooms", pointing at that property's /rooms-suites page.
 *  3. Offer tiles: the CTA stops linking out to reservation.outrigger.com and instead opens the
 *     on-site widget, carrying the promo across as data-bw-offer-code / data-bw-offer-code-type
 *     and the stay length as data-bw-length-of-stay — the same attribute contract the
 *     /offers/campaign/2026/bc/ohr page already uses on its "Search availability" button.
 *
 * Idempotent, and re-applies on DOM churn (the offers/property rails are Swiper, which clones slides).
 */
(function () {
  'use strict';

  var ARROW = function (stroke) {
    return '<span class="icon-arrow" style="display:flex;margin-left:4px">' +
      '<svg width="12" height="16" viewBox="0 0 12 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="m4.5,3.49174l4,4l-4,4" stroke="' + stroke + '" stroke-width="2"></path></svg></span>';
  };

  /* ---------------------------------------------------------------- 1. banner */
  function styles() {
    if (document.getElementById('mock-tp-style')) return;
    var st = document.createElement('style');
    st.id = 'mock-tp-style';
    st.textContent = [
      '#mock-tp-banner{background:rgb(0,69,97);display:block;width:100%}',
      '#mock-tp-banner .mtp-c{max-width:1280px;margin:0 auto;padding:56px 12px;display:flex;flex-wrap:wrap;gap:28px 8.33%}',
      '#mock-tp-banner .mtp-l{flex:1 1 380px;min-width:280px}',
      '#mock-tp-banner .mtp-r{flex:1 1 380px;min-width:280px}',
      '#mock-tp-banner h2{font:40px/52px DuplicateSans-Regular,sans-serif;color:#fff;margin:0 0 12px}',
      '#mock-tp-banner p{font:16px/25px Montserrat-Light,sans-serif;color:#fff;margin:0 0 28px}',
      '#mock-tp-banner .mtp-types{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 32px;padding:0;list-style:none}',
      '#mock-tp-banner .mtp-types button{font:14px/20px Montserrat-Medium,sans-serif;color:#fff;background:transparent;' +
        'border:1px solid rgba(255,255,255,.55);border-radius:999px;padding:10px 20px;cursor:pointer;transition:.15s}',
      '#mock-tp-banner .mtp-types button:hover,#mock-tp-banner .mtp-types button[aria-pressed="true"]' +
        '{background:#fff;color:rgb(0,69,97);border-color:#fff}',
      '#mock-tp-banner .mtp-cta{font:500 16px/16px DuplicateSans-Medium,sans-serif;color:#fff;background:transparent;' +
        'border:1px solid #fff;padding:16px;display:inline-flex;align-items:center;cursor:pointer;text-decoration:none}',
      '#mock-tp-banner .mtp-cta:hover{background:#fff;color:rgb(0,69,97)}',
      '#mock-tp-banner .mtp-cta:hover path{stroke:rgb(0,69,97)}',
      '@media(max-width:767px){#mock-tp-banner .mtp-c{padding:36px 12px;gap:20px}' +
        '#mock-tp-banner h2{font-size:30px;line-height:38px}}'
    ].join('');
    document.head.appendChild(st);
  }

  function banner() {
    if (document.getElementById('mock-tp-banner')) return true;
    var ds = document.querySelector('.destination-selection');
    if (!ds) return false;

    var el = document.createElement('div');
    el.id = 'mock-tp-banner';
    el.setAttribute('data-tag-item', 'trip_planner_banner');
    el.innerHTML =
      '<div class="mtp-c">' +
        '<div class="mtp-l"><h2>Not sure where to start?</h2></div>' +
        '<div class="mtp-r">' +
          '<p>Tell us the kind of trip you have in mind and we&rsquo;ll build it with you &mdash; ' +
          'save the places you love and come back to them any time.</p>' +
          '<ul class="mtp-types">' +
            '<li><button type="button" aria-pressed="false" data-type="adventure">Adventure</button></li>' +
            '<li><button type="button" aria-pressed="false" data-type="wellness">Wellness &amp; spa</button></li>' +
            '<li><button type="button" aria-pressed="false" data-type="romance">Romantic getaway</button></li>' +
            '<li><button type="button" aria-pressed="false" data-type="family">Family-friendly</button></li>' +
          '</ul>' +
          '<button type="button" class="mtp-cta" data-bs-toggle="offcanvas" data-bs-target="#favoritesOffcanvas" ' +
            'aria-controls="favoritesOffcanvas" data-tag-item="trip_planner_banner_cta">Start your trip' + ARROW('white') + '</button>' +
        '</div>' +
      '</div>';

    el.addEventListener('click', function (e) {
      var b = e.target.closest('.mtp-types button');
      if (!b) return;
      el.querySelectorAll('.mtp-types button').forEach(function (o) {
        o.setAttribute('aria-pressed', o === b ? 'true' : 'false');
      });
    });

    ds.insertAdjacentElement('afterend', el);
    return true;
  }

  /* ------------------------------------------------------ 2. property tiles */
  function tiles() {
    var n = 0;
    document.querySelectorAll('.card-cta-info').forEach(function (cta) {
      var bn = cta.querySelector('.bw-magic-link');
      var lm = cta.querySelector('.card-view-property');
      if (!bn || !lm || cta.dataset.mockDone === '1') return;

      // Book Now -> View Availability. Widget behaviour and every data-bw-* attribute untouched.
      bn.innerHTML = 'View Availability' + ARROW('#332926');
      bn.setAttribute('data-tag-item', 'property_card_view_availability_cta');

      // Learn More -> View Rooms, pointed at the property's rooms & suites page.
      var prop = (lm.getAttribute('href') || '').replace(/\/+$/, '');
      if (prop && !/\/rooms-suites$/.test(prop)) lm.setAttribute('href', prop + '/rooms-suites');
      lm.textContent = 'View Rooms';
      lm.setAttribute('data-tag-item', 'property_card_view_rooms_cta');

      cta.dataset.mockDone = '1';
      n++;
    });
    return n;
  }

  /* --------------------------------------------------------- 3. offer tiles */
  function offers() {
    var n = 0;
    document.querySelectorAll('.offers-slider a[href*="reservation.outrigger.com"]').forEach(function (a) {
      var u;
      try { u = new URL(a.href); } catch (e) { return; }
      var promo  = u.searchParams.get('promo');
      var nights = u.searchParams.get('nights');

      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'button bw-magic-link';
      b.setAttribute('data-bs-toggle', 'offcanvas');
      b.setAttribute('data-bs-target', '#bookingWidget');
      b.setAttribute('aria-controls', 'bookingWidget');
      b.setAttribute('data-button-origin', location.href);
      b.setAttribute('data-bw-chain', '18497');
      b.setAttribute('data-bw-prices-language', 'Prices shown in');
      b.setAttribute('data-bw-prices-language-subtext', 'Lowest daily rate (does not include taxes and fees)');
      if (promo) {
        b.setAttribute('data-bw-offer-code', promo);
        b.setAttribute('data-bw-offer-code-type', 'Promotion');
      }
      if (nights) b.setAttribute('data-bw-length-of-stay', nights);
      b.setAttribute('data-alt-cta-text', 'Search availability');
      b.setAttribute('data-tag-item', 'top_offers_widget_cta');
      b.innerHTML = 'Search availability' + ARROW('#332926');

      a.replaceWith(b);
      n++;
    });
    return n;
  }

  function apply() { styles(); banner(); tiles(); offers(); }

  apply();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true });
  window.__outriggerHomeV2 = apply;
})();
