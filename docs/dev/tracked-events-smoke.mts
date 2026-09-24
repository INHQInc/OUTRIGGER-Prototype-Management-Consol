/**
 * THE TRACKED-EVENTS OVERLAY, asserted.
 *
 *     npx tsx docs/dev/tracked-events-smoke.mts
 *
 * The loader runs on every page of a customer's site, so the property that
 * matters most is the one Bryan set: without ?opmc_metrics=1 in the address,
 * the loader makes NO call for the overlay. With the flag it fetches the
 * events and adds the overlay; with &opmc_variation it shows a variation that
 * isn't ours and skips the prototype's code. The loader script is run here, in
 * a sandbox, against fake pages.
 */
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";

const { GET: loaderGET } = await import("../../src/app/loader/[siteKey]/route.ts");
const { GET: metricsGET } = await import("../../src/app/api/loader/metrics/route.ts");
const { GET: analyticsGET } = await import("../../src/app/api/loader/analytics/route.ts");
const { assembleTrackedEvents, isNoOpChange, buildStamp, resultReadings } = await import("../../src/lib/prototypes/tracked-events.ts");

let fails = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log(`  ✗ ${label}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
  else console.log(`  ✓ ${label}`);
};

const BASE = "https://console.test";
const KEY = "destination-selector-with-map";
const loaderRes = await loaderGET(new NextRequest(`${BASE}/loader/prep-outrigger`), { params: Promise.resolve({ siteKey: "prep-outrigger" }) });
const loaderJs = await loaderRes.text();

type Added = { where: string; src?: string; async?: boolean; textContent?: string; attrs: Record<string, string> };
async function runPage(search: string, session: Record<string, string> = { __opmcHb: "1" }, analyticsOk = true) {
  const calls: string[] = [];
  const added: Added[] = [];
  const el = () => { const o: Added = { where: "", attrs: {} }; (o as unknown as { setAttribute: (k: string, v: string) => void }).setAttribute = (k, v) => { o.attrs[k] = v; }; return o; };
  const push = (where: string) => (s: Added) => { added.push({ ...s, where }); };
  const ctx: Record<string, unknown> = {
    location: { search },
    URLSearchParams,
    sessionStorage: { getItem: (k: string) => session[k] ?? null, setItem: (k: string, v: string) => { session[k] = v; } },
    navigator: { sendBeacon: (u: string) => { calls.push(`beacon ${u}`); return true; } },
    fetch: (u: string) => {
      calls.push(`fetch ${u}`);
      if (u.includes("/api/loader/analytics")) return Promise.resolve({ ok: analyticsOk, json: () => Promise.resolve({ visitors: "10 vs 10", readings: [] }) });
      const body = u.includes("/api/loader/metrics") ? { events: [{ name: "E", selector: ".x" }], variations: [] } : { js: "/*prototype*/" };
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
    },
    document: { createElement: el, head: { appendChild: push("head") }, body: { appendChild: push("body") }, documentElement: { appendChild: push("html") } },
  };
  ctx.window = ctx;
  vm.runInNewContext(loaderJs, ctx);
  await new Promise((r) => setTimeout(r, 20));
  return { calls, added, events: ctx.__OPMC_EVENTS__ as { events?: unknown[]; analytics?: { unavailable?: boolean; visitors?: string } } | undefined };
}
const protoFetch = `fetch ${BASE}/api/loader?site=prep-outrigger&key=${KEY}`;
const metricsFetch = `fetch ${BASE}/api/loader/metrics?site=prep-outrigger&key=${KEY}`;
const analyticsFetch = `fetch ${BASE}/api/loader/analytics?site=prep-outrigger&key=${KEY}`;
const overlayScript = (a: Added[]) => a.filter((s) => s.src === `${BASE}/opmc-metrics.js`).length;
const protoScript = (a: Added[]) => a.filter((s) => s.attrs["data-opmc"] === KEY).length;

console.log("A normal page load: no call for the overlay");
{
  const r = await runPage("");
  check("no ?opmc: nothing fetched", r.calls, []);
  const m = await runPage("?opmc_metrics=1");
  check("the flag alone, without a prototype key: nothing fetched", m.calls, []);
}

console.log("\nA prototype preview without the flag: unchanged");
{
  const r = await runPage(`?opmc=${KEY}`);
  check("fetches the prototype only", r.calls, [protoFetch]);
  check("injects the prototype", protoScript(r.added), 1);
  check("adds no overlay", overlayScript(r.added), 0);
  const zero = await runPage(`?opmc=${KEY}&opmc_metrics=0`);
  check("opmc_metrics=0 is not the flag", zero.calls, [protoFetch]);
  const stray = await runPage(`?opmc=${KEY}&opmc_variation=123`);
  check("opmc_variation without the flag doesn't skip the prototype", stray.calls, [protoFetch]);
}

console.log("\nWith ?opmc_metrics=1");
{
  const r = await runPage(`?opmc=${KEY}&opmc_metrics=1`);
  check("fetches the prototype and the events", r.calls, [protoFetch, metricsFetch]);
  check("injects the prototype", protoScript(r.added), 1);
  check("adds the overlay script once, in <head>", r.added.filter((s) => s.src === `${BASE}/opmc-metrics.js`).map((s) => [s.where, s.async]), [["head", true]]);
  check("hands the overlay its events", r.events?.events?.length, 1);
  const caps = await runPage(`?opmc=${KEY}&OPMC_METRICS=1`);
  check("the flag is case-insensitive", caps.calls, [protoFetch, metricsFetch]);
}

console.log("\nWith ?opmc_analytics=1 (results on the labels)");
{
  const r = await runPage(`?opmc=${KEY}&opmc_analytics=1`);
  check("fetches the prototype, the events and the results", r.calls, [protoFetch, metricsFetch, analyticsFetch]);
  check("adds the overlay", overlayScript(r.added), 1);
  check("hands the overlay the results", r.events?.analytics?.visitors, "10 vs 10");
  const plain = await runPage(`?opmc=${KEY}&opmc_metrics=1`);
  check("opmc_metrics=1 alone asks for no results", plain.calls.includes(analyticsFetch), false);
  const off = await runPage(`?opmc=${KEY}&opmc_analytics=0`);
  check("opmc_analytics=0 is not the flag", off.calls, [protoFetch]);
  const down = await runPage(`?opmc=${KEY}&opmc_analytics=1`, { __opmcHb: "1" }, false);
  check("no results: the overlay still draws, told there are none", [overlayScript(down.added), down.events?.analytics?.unavailable], [1, true]);
}

console.log("\nThe original, via the switcher (&opmc_variation)");
{
  const r = await runPage(`?opmc=${KEY}&opmc_metrics=1&opmc_variation=5493387342643200`);
  check("fetches the events only, not the prototype", r.calls, [metricsFetch]);
  check("injects no prototype", protoScript(r.added), 0);
  check("adds the overlay", overlayScript(r.added), 1);
}

console.log("\nThe install heartbeat is unchanged");
{
  const session: Record<string, string> = {};
  const first = await runPage("", session);
  check("first page of a session sends one beacon", first.calls.filter((c) => c.startsWith("beacon")).length, 1);
  const second = await runPage("", session);
  check("the next page sends none", second.calls, []);
}

console.log("\nThe overlay script");
{
  const src = readFileSync(new URL("../../public/opmc-metrics.js", import.meta.url), "utf8");
  let threw: string | null = null;
  const untouchable = new Proxy({}, { get() { throw new Error("the overlay touched the page without the flag"); } });
  try { vm.runInNewContext(src, { location: { search: `?opmc=${KEY}` }, URLSearchParams, window: {}, document: untouchable, localStorage: untouchable }); }
  catch (e) { threw = (e as Error).message; }
  check("does nothing without the flag", threw, null);
  let touched: string | null = null;
  try { vm.runInNewContext(src, { location: { search: `?opmc=${KEY}&opmc_analytics=1` }, URLSearchParams, window: {}, document: untouchable, localStorage: untouchable }); }
  catch (e) { touched = (e as Error).message; }
  check("switches on for opmc_analytics=1", touched, "the overlay touched the page without the flag");
  const mw = readFileSync(new URL("../../src/middleware.ts", import.meta.url), "utf8");
  check("is public (anonymous visitors on a customer's site)", /PUBLIC_PATHS = \[[^\]]*"\/opmc-metrics\.js"/.test(mw), true);
}

console.log("\nThe events route");
{
  const bad = await metricsGET(new NextRequest(`${BASE}/api/loader/metrics?key=../etc`));
  check("refuses a malformed key", bad.status, 400);
  check("answers any site (CORS)", bad.headers.get("access-control-allow-origin"), "*");
  check("is never cached, so an edit in Optimizely shows on the next reload", bad.headers.get("cache-control"), "no-store");
  const badA = await analyticsGET(new NextRequest(`${BASE}/api/loader/analytics?key=../etc`));
  check("the results route refuses a malformed key", badA.status, 400);
  check("the results route is never cached", badA.headers.get("cache-control"), "no-store");
}

console.log("\nWhat the overlay is told about the experiment");
{
  const noop = (selector: string) => ({ async: false, attributes: {}, css: {}, dependencies: [], rearrange: { insertSelector: "", operator: "before" }, selector, type: "attribute" });
  const exp = {
    id: 6619287249485824, name: "Destination Selector With Map", status: "not_started",
    variations: [
      { variation_id: 5493387342643200, name: "Default Destination Selector", weight: 5000, actions: [{ page_id: 1, changes: [noop(".destination-selection-tabs-list button"), noop(".dropdown-item")] }] },
      { variation_id: 6490208667959296, name: "Map Destination Selector", weight: 5000, actions: [{ page_id: 1, changes: [
        { type: "custom_code", value: `/* OPMC prototype "${KEY}" — built from src 3cc97bb27092 by build.mjs. Self-contained. */ (function () {})();` },
        noop(".opmc-dsm-gtile-hit"),
      ] }] },
      { variation_id: 3, name: "Made in the editor", weight: 0, actions: [{ page_id: 1, changes: [{ type: "attribute", selector: "h1", attributes: { text: "New" }, css: {} }] }] },
      { variation_id: 4, name: "Archived", weight: 0, archived: true, actions: [] },
    ],
  };
  const events = [
    { id: 1, name: "Map - Destination Pill Click", event_type: "click", config: { selector: " .opmc-dsm-where-nav > button " } },
    { id: 2, name: "Bookings", event_type: "custom" },
  ];
  const out = assembleTrackedEvents(exp, events, new Map([["6490208667959296", KEY]]));
  check("archived variations are left out", out.variations.map((v) => v.name), ["Default Destination Selector", "Map Destination Selector", "Made in the editor"]);
  check("only our prototype's variation carries its key", out.variations.map((v) => v.opmc), [null, KEY, null]);
  check("editor placeholders don't count as changes", out.variations.map((v) => v.pageAsIs), [true, false, false]);
  check("the build Optimizely holds, from its stamp", out.variations.map((v) => v.optimizelyBuild), [null, "3cc97bb27092", null]);
  check("click events keep their (trimmed) selector", out.events, [{ name: "Map - Destination Pill Click", selector: ".opmc-dsm-where-nav > button" }]);
  check("events with no selector are named, not dropped", out.notDrawable, ["Bookings"]);
  check("a css edit is a change", isNoOpChange({ type: "attribute", attributes: {}, css: { color: "red" } }), false);
  check("a move is a change", isNoOpChange({ type: "attribute", attributes: {}, css: {}, rearrange: { insertSelector: ".x", operator: "after" } }), false);
  check("inserted HTML is a change", isNoOpChange({ type: "insert_html", selector: "body", value: "<p>" }), false);
  check("no code, no stamp", buildStamp(null), null);
}

console.log("\nResults, worded as on the Evidence board");
{
  const stats = {
    focusVariationId: "v", baselineVariationId: "c",
    metrics: [
      { key: "metric:Tile Check Availability Clicked", label: "Tile Check Availability Clicked", kind: "metric", test: "proportion", cells: [
        { variationId: "v", name: "With", n: 25181, count: 2281, rate: 0.0906, lift: 10.4, liftCi: { lo: 9.1, hi: 11.8 } },
        { variationId: "c", name: "Without", isBaseline: true, n: 25096, count: 200, rate: 0.00797 } ] },
      { key: "metric:View Room Details Clicked", label: "View Room Details Clicked", kind: "metric", test: "none", featureOnly: "variation", cells: [
        { variationId: "v", name: "With", n: 25181, count: 3996, rate: 0.1587 }, { variationId: "c", name: "Without", n: 25096, count: 0, rate: 0 } ] },
      { key: "metric:Booking Complete", label: "Booking Complete", kind: "metric", test: "proportion", cells: [
        { variationId: "v", name: "With", n: 25181, count: 226, rate: 0.008975, lift: -0.0047, liftCi: { lo: -0.17, hi: 0.2 } },
        { variationId: "c", name: "Without", n: 25096, count: 227, rate: 0.009045 } ] },
      { key: "composite:intent", label: "Booking intent", kind: "composite", test: "actions", cells: [] },
    ],
  } as unknown as Parameters<typeof resultReadings>[0];
  const r = resultReadings(stats);
  check("one reading per event, composites left out", r.map((x) => x.event), ["Tile Check Availability Clicked", "View Room Details Clicked", "Booking Complete"]);
  check("a settled rise is up, with both rates", [r[0].tone, r[0].delta, r[0].variationRate, r[0].controlRate, r[0].counts, r[0].settled], ["up", "+1040.0%", "9.06%", "0.80%", "2,281 vs 200", "settled"]);
  check("an element only in the variation reads as adoption", [r[1].tone, r[1].delta, r[1].variationRate, r[1].controlRate, r[1].settled], ["new", "new", "15.9%", "—", "new surface"]);
  check("a move inside the noise stays grey", [r[2].tone, r[2].delta, r[2].settled], ["flat", "-0.5%", "not settled"]);
}

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
