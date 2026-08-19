/**
 * Outrigger home page — test 01 + 03 variation
 *
 *  1. The Travel Quiz promo card from /test/tqpromos, run full-bleed, directly under the
 *     destination explorer. Same artwork, eyebrow, headline and CTA as the component there.
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

  /* ---------------------------------------------------------------- 1. banner
   * The Travel Quiz promo card from /test/tqpromos, run full-bleed under the
   * destination explorer. Type tokens (DuplicateIonic-Black eyebrow at 4px
   * tracking, DuplicateSans-Regular headline, Montserrat-Light body, outlined
   * white CTA) are lifted from that component's computed styles.
   *
   * The artwork only exists at 517x643 — the AdaptiveImages `stamp` signs the
   * width/height, so a larger render cannot be requested. It is therefore run
   * at native scale as a right-hand accent over a gradient drawn from its own
   * palette, rather than stretched across 1440px and turned to mush.
   */
  var PROMO_IMG = 'https://www.outrigger.com/AdaptiveImages/optimizely/' +
    '5771c854-7b02-49d2-8ab8-1ca80ec981a6/promo2.png' +
    '?quality=100&width=1400&height=1741&stamp=9b0851ecb0a4dc9b51c8688da56e73c05f2829ab&format=webp';

  function styles() {
    if (document.getElementById('opmc-tq-style')) return;
    var st = document.createElement('style');
    st.id = 'opmc-tq-style';
    st.textContent = [
      '#opmc-tq-banner{position:relative;width:100%;display:block;overflow:hidden;background:#0E2E42}',
      // ONE layer at cover. Compositing the art over a hand-made gradient left a hard
      // vertical seam where the two grounds met — letting the artwork be the ground
      // across the full width removes the boundary entirely.
      '#opmc-tq-banner .tq-bg{position:absolute;inset:0;background-image:url("' + PROMO_IMG + '");' +
        'background-size:cover;background-position:center 32%;background-repeat:no-repeat}',
      '#opmc-tq-banner .tq-scrim{position:absolute;inset:0;background:linear-gradient(90deg,' +
        'rgba(8,26,40,.9) 0%,rgba(8,26,40,.72) 34%,rgba(8,26,40,.35) 62%,rgba(8,26,40,.12) 100%)}',
      '#opmc-tq-banner .tq-inner{position:relative;max-width:1280px;margin:0 auto;padding:88px 36px;' +
        'display:flex;flex-direction:column;align-items:flex-start;min-height:440px;justify-content:center}',
      '#opmc-tq-banner .tq-eyebrow{font:900 14px/18px DuplicateIonic-Black,sans-serif;color:#fff;' +
        'letter-spacing:4px;text-transform:uppercase;margin:0 0 28px}',
      '#opmc-tq-banner .tq-title{font:clamp(34px,4.4vw,56px)/1.1 DuplicateSans-Regular,sans-serif;' +
        'color:#fff;margin:0 0 18px;max-width:16ch}',
      '#opmc-tq-banner .tq-text{font:325 16px/25px Montserrat-Light,sans-serif;color:#fff;margin:0 0 34px;max-width:50ch}',
      '#opmc-tq-banner .tq-cta{font:500 16px/16px DuplicateSans-Medium,sans-serif;color:#fff;background:transparent;' +
        'border:1px solid #fff;padding:16px;display:inline-flex;align-items:center;text-decoration:none;transition:.15s}',
      '#opmc-tq-banner .tq-cta:hover{background:#fff;color:#0B2233}',
      '#opmc-tq-banner .tq-cta:hover path{stroke:#0B2233}',
      // Top Offers onto the destination explorer's sand ground. `.is-sand` is the site's
      // own theme (it flips the type to dark); the explorer's exact warm tone is not any
      // theme class, so it is set explicitly so the two sections read as one surface.
      '.offers-slider.is-sand{background-color:rgb(241,239,237) !important}',
      // Property tile CTAs: View Availability stays left, View Rooms goes to the
      // right edge. Scoped by the marker this variation sets, so the booking
      // widget's own .card-cta-info cards are untouched.
      '.card-cta-info[data-mock-done="1"]{justify-content:space-between;width:100%}',
      '.card-cta-info[data-mock-done="1"] .card-view-property{margin-left:auto}',

      '@media(max-width:767px){#opmc-tq-banner .tq-inner{padding:56px 20px;min-height:340px}' +
        '#opmc-tq-banner .tq-scrim{background:linear-gradient(180deg,rgba(8,26,40,.55) 0%,rgba(8,26,40,.9) 100%)}}'
    ].join('');
    document.head.appendChild(st);
  }

  function banner() {
    if (document.getElementById('opmc-tq-banner')) return true;
    var ds = document.querySelector('.destination-selection');
    if (!ds) return false;

    var el = document.createElement('div');
    el.id = 'opmc-tq-banner';
    el.setAttribute('data-tag-item', 'travel_quiz_banner');
    el.innerHTML =
      '<div class="tq-bg" aria-hidden="true"></div>' +
      '<div class="tq-scrim" aria-hidden="true"></div>' +
      '<div class="tq-inner">' +
        '<div class="tq-eyebrow">Outrigger Travel Quiz</div>' +
        '<div class="tq-title">Let’s discover your perfect getaway</div>' +
        '<div class="tq-text">What’s your vibe when you’re seeking an escape to paradise? Answer these quick questions and we’ll suggest a destination to fit your travel dreams.</div>' +
        '<a href="/travel-quiz" class="tq-cta" data-tag-item="travel_quiz_banner_cta">Take the quiz' + ARROW('white') + '</a>' +
      '</div>';

    ds.insertAdjacentElement('afterend', el);
    return true;
  }

  /* ------------------------------------------------------ 2. property tiles */
  function tiles() {
    var n = 0;
    document.querySelectorAll('.card-cta-info').forEach(function (cta) {
      // `.card-cta-info` is NOT unique to the home page's property tiles — the
      // booking widget's own property picker renders the same markup inside
      // #bookingWidget. Relabelling those rewrites the booking flow itself, so
      // anything inside an offcanvas is off limits.
      if (cta.closest('#bookingWidget, .offcanvas')) return;
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

  /* ------------------------------------------------- 4. Top Offers → sand */
  function offersTheme() {
    var o = document.querySelector('.offers-slider');
    if (!o || o.classList.contains('is-sand')) return;
    o.classList.remove('is-turquoise');
    o.classList.add('is-sand');
  }

  function apply() { styles(); banner(); tiles(); offers(); offersTheme(); }

  apply();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true });
  window.__outriggerHomeV2 = apply;
})();
