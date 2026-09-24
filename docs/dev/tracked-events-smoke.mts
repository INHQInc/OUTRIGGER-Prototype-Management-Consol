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
const { assembleTrackedEvents, isNoOpChange, buildStamp } = await import("../../src/lib/prototypes/tracked-events.ts");

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
async function runPage(search: string, session: Record<string, string> = { __opmcHb: "1" }) {
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
      const body = u.includes("/api/loader/metrics") ? { events: [{ name: "E", selector: ".x" }], variations: [] } : { js: "/*prototype*/" };
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
    },
    document: { createElement: el, head: { appendChild: push("head") }, body: { appendChild: push("body") }, documentElement: { appendChild: push("html") } },
  };
  ctx.window = ctx;
  vm.runInNewContext(loaderJs, ctx);
  await new Promise((r) => setTimeout(r, 20));
  return { calls, added, events: ctx.__OPMC_EVENTS__ as { events?: unknown[] } | undefined };
}
const protoFetch = `fetch ${BASE}/api/loader?site=prep-outrigger&key=${KEY}`;
const metricsFetch = `fetch ${BASE}/api/loader/metrics?site=prep-outrigger&key=${KEY}`;
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
  const mw = readFileSync(new URL("../../src/middleware.ts", import.meta.url), "utf8");
  check("is public (anonymous visitors on a customer's site)", /PUBLIC_PATHS = \[[^\]]*"\/opmc-metrics\.js"/.test(mw), true);
}

console.log("\nThe events route");
{
  const bad = await metricsGET(new NextRequest(`${BASE}/api/loader/metrics?key=../etc`));
  check("refuses a malformed key", bad.status, 400);
  check("answers any site (CORS)", bad.headers.get("access-control-allow-origin"), "*");
  check("is CDN-cached, even a refusal", /s-maxage=\d+/.test(bad.headers.get("cache-control") ?? ""), true);
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

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
