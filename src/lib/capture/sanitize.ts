import type { CheerioAPI } from "cheerio";
import type { RemovedScript, SanitizationReport } from "./types";

/**
 * Tracking/analytics domains — any script, iframe, link, or asset pointing at
 * these is removed from the clone. Built from ground truth observed on
 * outrigger.com (GTM-M84QDRN, OneTrust, Optimizely Web, Azure App Insights)
 * plus the usual suspects as a safety net.
 */
export const TRACKING_DOMAINS = [
  "googletagmanager.com",
  "google-analytics.com",
  "analytics.google.com",
  "doubleclick.net",
  "googleadservices.com",
  "googlesyndication.com",
  "cookielaw.org", // OneTrust CDN
  "onetrust.com",
  "optimizely.com", // A/B testing (cdn.optimizely.com, cdn3.optimizely.com/geo)
  "js.monitor.azure.com", // Azure Application Insights
  "dc.services.visualstudio.com", // App Insights ingestion
  "facebook.net",
  "facebook.com/tr",
  "connect.facebook.net",
  "bat.bing.com",
  "clarity.ms",
  "hotjar.com",
  "fullstory.com",
  "segment.com",
  "segment.io",
  "tiktok.com/i18n/pixel",
  "analytics.tiktok.com",
  "snap.licdn.com",
  "px.ads.linkedin.com",
  "quantserve.com",
  "scorecardresearch.com",
  "demdex.net", // Adobe Audience Manager
  "omtrdc.net", // Adobe Analytics
  "everesttech.net",
  "krxd.net",
  "criteo.com",
  "criteo.net",
  "taboola.com",
  "outbrain.com",
  "yahoo.com/pixel",
  "ads.yahoo.com",
  "amazon-adsystem.com",
  "sojern.com", // travel-vertical pixel, common on hospitality sites
  "adara.com", // travel data co-op pixel
  "cendyn.com",
  "triptease.io",
  "thehotelsnetwork.com",
];

/** Patterns that identify tracking inline scripts. */
const INLINE_PATTERNS: { re: RegExp; reason: string }[] = [
  { re: /googletagmanager\.com|GTM-[A-Z0-9]+/, reason: "GTM bootstrap/reference" },
  { re: /\bdataLayer\b/, reason: "dataLayer push (GA4/GTM)" },
  { re: /\bgtag\s*\(/, reason: "gtag() call" },
  { re: /OneTrust|OptanonWrapper|optanon/i, reason: "OneTrust consent" },
  { re: /appInsights|InstrumentationKey/i, reason: "Azure App Insights" },
  { re: /fbq\s*\(|facebook pixel/i, reason: "Facebook pixel" },
  { re: /optimizely/i, reason: "Optimizely experimentation" },
];

function matchesTrackingDomain(url: string): string | null {
  const u = url.toLowerCase();
  for (const d of TRACKING_DOMAINS) {
    if (u.includes(d)) return d;
  }
  return null;
}

/**
 * Remove artifacts leaked into the serialized DOM by the headless-browser
 * renderer (Chrome injects its internal error-page CSS, a `subframe`
 * attribute, and an error-page body style — `html[subframe] body
 * { overflow: hidden }` breaks page scrolling if left in).
 */
export function stripCaptureArtifacts($: CheerioAPI): RemovedScript[] {
  const removed: RemovedScript[] = [];

  const html = $("html");
  if (html.attr("subframe") !== undefined) {
    html.removeAttr("subframe");
    removed.push({ kind: "attribute", reason: "renderer artifact: subframe attr on <html>", detail: "subframe" });
  }

  $("style").each((_, el) => {
    const text = $(el).html() ?? "";
    if (/main-frame-error|sub-frame-error|neterror/.test(text)) {
      removed.push({ kind: "inline", reason: "renderer artifact: Chrome error-page CSS", detail: text.slice(0, 120) });
      $(el).remove();
    }
  });

  const bodyStyle = $("body").attr("style") ?? "";
  if (/font-size:\s*75%/.test(bodyStyle) && /sans/.test(bodyStyle)) {
    $("body").removeAttr("style");
    removed.push({ kind: "attribute", reason: "renderer artifact: Chrome error-page body style", detail: bodyStyle.slice(0, 120) });
  }

  return removed;
}

/**
 * Strip all tracking from a parsed document, in place.
 * Returns the list of removals for the sanitization report.
 */
export function sanitize($: CheerioAPI): RemovedScript[] {
  const removed: RemovedScript[] = stripCaptureArtifacts($);

  // 1. External scripts on tracking domains
  $("script[src]").each((_, el) => {
    const src = $(el).attr("src") ?? "";
    const hit = matchesTrackingDomain(src);
    if (hit) {
      removed.push({ kind: "external", reason: `tracking domain: ${hit}`, detail: src });
      $(el).remove();
    }
  });

  // 2. Inline scripts matching tracking patterns
  $("script:not([src])").each((_, el) => {
    const text = $(el).html() ?? "";
    for (const { re, reason } of INLINE_PATTERNS) {
      if (re.test(text)) {
        removed.push({ kind: "inline", reason, detail: text.slice(0, 200) });
        $(el).remove();
        break;
      }
    }
  });

  // 3. noscript GTM/pixel iframes
  $("noscript").each((_, el) => {
    const html = $(el).html() ?? "";
    const hit = matchesTrackingDomain(html);
    if (hit) {
      removed.push({ kind: "noscript", reason: `tracking domain: ${hit}`, detail: html.slice(0, 200) });
      $(el).remove();
    }
  });

  // 4. Tracking iframes (GTM noscript variant rendered, ad frames)
  $("iframe[src]").each((_, el) => {
    const src = $(el).attr("src") ?? "";
    const hit = matchesTrackingDomain(src);
    if (hit) {
      removed.push({ kind: "external", reason: `tracking iframe: ${hit}`, detail: src });
      $(el).remove();
    }
  });

  // 5. preconnect / dns-prefetch / preload hints to tracking domains
  $("link[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const rel = $(el).attr("rel") ?? "";
    const hit = matchesTrackingDomain(href);
    if (hit) {
      removed.push({ kind: "link", reason: `resource hint (${rel}) to ${hit}`, detail: href });
      $(el).remove();
    }
  });

  // 6. Tracking pixels as images (1x1 gifs on tracking domains)
  $("img[src]").each((_, el) => {
    const src = $(el).attr("src") ?? "";
    const hit = matchesTrackingDomain(src);
    if (hit) {
      removed.push({ kind: "external", reason: `pixel image: ${hit}`, detail: src });
      $(el).remove();
    }
  });

  // 7. Inline event handlers that push to dataLayer
  $("[onclick],[onsubmit],[onchange]").each((_, el) => {
    for (const attr of ["onclick", "onsubmit", "onchange"]) {
      const v = $(el).attr(attr);
      if (v && /dataLayer|gtag\(/.test(v)) {
        removed.push({ kind: "attribute", reason: `inline ${attr} dataLayer push`, detail: v.slice(0, 200) });
        $(el).removeAttr(attr);
      }
    }
  });

  return removed;
}

/**
 * Inject clone guards: noindex meta + a runtime tracking-request blocker.
 * The blocker is belt-and-braces: anything the static strip missed still
 * cannot phone home, and attempted calls are logged to the console.
 */
export function injectGuards($: CheerioAPI): void {
  const head = $("head");
  head.prepend(`<meta name="robots" content="noindex, nofollow">\n`);

  const blocklist = JSON.stringify(TRACKING_DOMAINS);
  const guard = `
<script data-clone-guard="1">
(function () {
  var BLOCKED = ${blocklist};
  function isBlocked(url) {
    try { var s = String(url).toLowerCase(); return BLOCKED.some(function (d) { return s.indexOf(d) !== -1; }); }
    catch (e) { return false; }
  }
  var origFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    if (isBlocked(url)) { console.warn("[clone-guard] blocked fetch:", url); return Promise.resolve(new Response("", { status: 204 })); }
    return origFetch.apply(this, arguments);
  };
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (isBlocked(url)) { console.warn("[clone-guard] blocked XHR:", url); url = "data:text/plain,"; }
    return origOpen.apply(this, [method, url].concat([].slice.call(arguments, 2)));
  };
  var origBeacon = navigator.sendBeacon && navigator.sendBeacon.bind(navigator);
  if (origBeacon) {
    navigator.sendBeacon = function (url, data) {
      if (isBlocked(url)) { console.warn("[clone-guard] blocked beacon:", url); return true; }
      return origBeacon(url, data);
    };
  }
  // Neutralize dataLayer so stray pushes are inert but don't throw
  window.dataLayer = { push: function () { return 0; } };
})();
</script>`;
  head.prepend(guard);
}

export function buildReport(url: string, removed: RemovedScript[], notes: string[]): SanitizationReport {
  return {
    url,
    capturedAt: new Date().toISOString(),
    removed,
    blockedDomains: TRACKING_DOMAINS,
    notes,
  };
}
