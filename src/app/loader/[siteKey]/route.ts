import { NextRequest, NextResponse } from "next/server";

/**
 * Loader script for a Live site. The tenant adds ONE tag to their pages:
 *   <script src="https://<console>/loader/<siteKey>" async></script>
 *
 * It's inert for normal visitors. Only when a page is opened with
 * ?opmc=<prototype-key> does it fetch that prototype's overlay from the console
 * and inject it into the live DOM — a preview-token gate, so a shared link
 * shows the prototype on the real site without affecting anyone else.
 *
 * Adding &opmc_metrics=1 also draws the tracked-events overlay: every element
 * the experiment's Optimizely click events count, boxed and named
 * (/api/loader/metrics + /opmc-metrics.js). Without that flag the loader makes
 * no extra call. &opmc_variation=<id>, set by the overlay's variation switcher,
 * shows a variation that isn't this prototype (usually the original): the
 * overlay still loads for this prototype's test, and the prototype's code is
 * skipped.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ siteKey: string }> }) {
  const { siteKey } = await params;
  const base = req.nextUrl.origin;

  const js = `(function () {
  try {
    // Install heartbeat: once per browser session, prove the tag is live.
    try {
      if (!sessionStorage.getItem('__opmcHb')) {
        sessionStorage.setItem('__opmcHb', '1');
        var hb = ${JSON.stringify(base)} + '/api/loader/heartbeat?site=' + ${JSON.stringify(encodeURIComponent(siteKey))};
        if (navigator.sendBeacon) { navigator.sendBeacon(hb); }
        else { fetch(hb, { method: 'POST', mode: 'no-cors', keepalive: true }).catch(function () {}); }
      }
    } catch (e) {}
    var q = new URLSearchParams(location.search);
    var key = q.get('opmc');
    if (!key || !/^[a-zA-Z0-9_-]+$/.test(key)) return;
    if (window.__opmcLoaded) return; window.__opmcLoaded = {};
    if (window.__opmcLoaded[key]) return; window.__opmcLoaded[key] = true;
    // Tracked-events overlay: ONLY when the address asks for it.
    var metrics = false, otherVariation = false;
    q.forEach(function (v, k) {
      k = k.toLowerCase();
      if (k === 'opmc_metrics' && v === '1') metrics = true;
      if (k === 'opmc_variation' && v) otherVariation = true;
    });
    if (!(metrics && otherVariation)) {
      fetch(${JSON.stringify(base)} + '/api/loader?site=' + ${JSON.stringify(encodeURIComponent(siteKey))} + '&key=' + encodeURIComponent(key))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d || !d.js) return;
          var s = document.createElement('script');
          s.setAttribute('data-opmc', key);
          s.textContent = d.js;
          (document.body || document.documentElement).appendChild(s);
        })
        .catch(function () {});
    }
    if (metrics) {
      fetch(${JSON.stringify(base)} + '/api/loader/metrics?site=' + ${JSON.stringify(encodeURIComponent(siteKey))} + '&key=' + encodeURIComponent(key))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d || !d.events) return;
          window.__OPMC_EVENTS__ = d;
          var s = document.createElement('script');
          s.src = ${JSON.stringify(base)} + '/opmc-metrics.js';
          s.async = true;
          (document.head || document.documentElement).appendChild(s);
        })
        .catch(function () {});
    }
  } catch (e) {}
})();`;

  return new NextResponse(js, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
