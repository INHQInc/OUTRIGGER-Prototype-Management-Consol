import { NextRequest, NextResponse } from "next/server";

/**
 * Loader script for a Live site. The tenant adds ONE tag to their pages:
 *   <script src="https://<console>/loader/<siteKey>" async></script>
 *
 * It's inert for normal visitors. Only when a page is opened with
 * ?opmc=<prototype-key> does it fetch that prototype's overlay from the console
 * and inject it into the live DOM — a preview-token gate, so a shared link
 * shows the prototype on the real site without affecting anyone else.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ siteKey: string }> }) {
  const { siteKey } = await params;
  const base = req.nextUrl.origin;

  const js = `(function () {
  try {
    var q = new URLSearchParams(location.search);
    var key = q.get('opmc');
    if (!key || !/^[a-zA-Z0-9_-]+$/.test(key)) return;
    if (window.__opmcLoaded) return; window.__opmcLoaded = {};
    if (window.__opmcLoaded[key]) return; window.__opmcLoaded[key] = true;
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
