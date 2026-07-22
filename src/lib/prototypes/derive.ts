/**
 * Capture-time derivations — the things a fresh Claude instance otherwise
 * spends hours reverse-engineering in a browser console.
 *
 * `data.md`          the page's embedded data globals + DOM↔data join keys.
 *                    CMS pages ship their data as inline <script> JSON, so this
 *                    is static parsing of the HTML we already captured — no
 *                    headless browser required.
 * `design-tokens.md` the brand system: @font-face, CSS custom properties, and
 *                    the site's overlay idioms (z-index ladder), pulled from the
 *                    page's own stylesheets.
 *
 * The font list is also returned machine-readable so `dev.mjs` can proxy brand
 * fonts without hardcoding a per-customer list (browsers CORS-block webfonts
 * when the preview is served from localhost).
 */
import { load } from "cheerio";

export interface FontRef { family: string; url: string; format?: string }

const MAX_CSS_BYTES = 3_000_000;
const MAX_CSS_FILES = 5;
const FETCH_TIMEOUT_MS = 12_000;

/** Plain http(s) text fetch with a timeout + size cap. Never throws. */
async function fetchText(url: string): Promise<string | null> {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(u.toString(), {
        signal: ctrl.signal,
        headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36" },
      });
      if (!res.ok) return null;
      const text = await res.text();
      return text.length > MAX_CSS_BYTES ? text.slice(0, MAX_CSS_BYTES) : text;
    } finally { clearTimeout(t); }
  } catch { return null; }
}

/** Walk from the first `{`/`[` and return the balanced literal (string-aware). */
function balancedLiteral(src: string, from: number): string | null {
  const start = src.slice(from).search(/[{[]/);
  if (start < 0) return null;
  const i0 = from + start;
  const open = src[i0];
  const close = open === "{" ? "}" : "]";
  let depth = 0, inStr: string | null = null, esc = false;
  for (let i = i0; i < src.length && i - i0 < 2_000_000; i++) {
    const c = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return src.slice(i0, i + 1); }
  }
  return null;
}

function shapeOf(v: unknown, depth = 0): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return depth > 1 ? `array[${v.length}]` : `array[${v.length}] of ${v.length ? shapeOf(v[0], depth + 1) : "?"}`;
  if (typeof v === "object") {
    const keys = Object.keys(v as object);
    return depth > 1 ? `object{${keys.length} keys}` : `object{${keys.slice(0, 12).join(", ")}${keys.length > 12 ? ", …" : ""}}`;
  }
  return typeof v;
}

function sample(v: unknown): string {
  const one = Array.isArray(v) ? v[0] : v;
  let s: string;
  try { s = JSON.stringify(one, null, 2) ?? "undefined"; } catch { return "(unserializable)"; }
  return s.length > 1400 ? s.slice(0, 1400) + "\n… (truncated)" : s;
}

/**
 * Extract embedded JSON data globals from inline scripts + JSON-LD, and infer
 * the DOM↔data join keys (e.g. `data-contentid` ↔ `contentID`).
 */
export function deriveDataGlobals(html: string, pageUrl: string): string {
  const $ = load(html);
  const found: { name: string; value: unknown }[] = [];

  $("script").each((_, el) => {
    const type = ($(el).attr("type") || "").toLowerCase();
    const body = $(el).html() || "";
    if ($(el).attr("src")) return;
    if (!body.trim()) return;

    if (type.includes("ld+json")) {
      try {
        const v = JSON.parse(body);
        found.push({ name: `JSON-LD (${Array.isArray(v) ? "array" : (v && typeof v === "object" && "@type" in v ? String((v as Record<string, unknown>)["@type"]) : "object")})`, value: v });
      } catch { /* malformed ld+json */ }
      return;
    }
    if (type && !type.includes("javascript") && !type.includes("json")) {
      // Some frameworks stash state in a non-JS type (e.g. application/json islands).
      try { found.push({ name: $(el).attr("id") || `script[type=${type}]`, value: JSON.parse(body) }); } catch { /* */ }
      return;
    }

    // window.X = {...} / var X = {...} / X = [...]
    const assign = /(?:window\.([A-Za-z_$][\w$.]*)|(?:var|let|const)\s+([A-Za-z_$][\w$]*))\s*=\s*(?=[{[])/g;
    let m: RegExpExecArray | null;
    while ((m = assign.exec(body))) {
      const name = m[1] ? `window.${m[1]}` : (m[2] ?? "?");
      const lit = balancedLiteral(body, m.index + m[0].length);
      if (!lit) continue;
      try { found.push({ name, value: JSON.parse(lit) }); } catch { /* JS object literal, not strict JSON */ }
      if (found.length > 40) break;
    }
  });

  // Collect data-* attributes actually present in the DOM.
  const dataAttrs = new Map<string, string>();
  $("[class],[id],[data-contentid],*").each((_, el) => {
    const attribs = (el as unknown as { attribs?: Record<string, string> }).attribs || {};
    for (const [k, v] of Object.entries(attribs)) {
      if (k.startsWith("data-") && v && dataAttrs.size < 400 && !dataAttrs.has(k)) dataAttrs.set(k, v);
    }
  });

  // Infer join keys: a data-* attr whose normalized name matches a JSON field.
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const fieldNames = new Set<string>();
  for (const f of found) {
    const v = Array.isArray(f.value) ? f.value[0] : f.value;
    if (v && typeof v === "object") for (const k of Object.keys(v as object)) fieldNames.add(k);
  }
  const joins: string[] = [];
  for (const [attr] of dataAttrs) {
    const a = norm(attr.replace(/^data-/, ""));
    for (const fld of fieldNames) if (norm(fld) === a) { joins.push(`\`${attr}\` ↔ \`${fld}\``); break; }
  }

  const lines: string[] = [
    "<!-- OPMC-PROVISIONED · do NOT hand-edit · regenerated on re-sync -->",
    "# Page data globals",
    `> Extracted from the captured HTML of ${pageUrl}`,
    "",
    "**Read this before planning any fetch.** CMS pages usually embed everything the page renders — if the data you need is here, join to the DOM instead of calling an API.",
    "",
  ];

  if (!found.length) {
    lines.push("_No parseable embedded JSON found in inline scripts._", "", "Data may be injected at runtime — probe in the browser console (`Object.keys(window).filter(k => !(k in top.frames))`) or check XHR calls on the live page.");
  } else {
    lines.push(`## Globals found (${found.length})`, "");
    for (const f of found.slice(0, 12)) {
      lines.push(`### \`${f.name}\``, "", `- shape: \`${shapeOf(f.value)}\``, "", "<details><summary>sample record</summary>", "", "```json", sample(f.value), "```", "", "</details>", "");
    }
    if (found.length > 12) lines.push(`_…and ${found.length - 12} more._`, "");
  }

  lines.push("## DOM ↔ data join keys", "");
  if (joins.length) {
    lines.push("These DOM attributes match field names in the data above — that's your join:", "", ...joins.slice(0, 20).map((j) => `- ${j}`), "");
  } else {
    lines.push("_No exact attribute↔field name matches found._ Look for an id-ish field in the data and a `data-*` attribute carrying the same value.", "");
  }
  if (dataAttrs.size) {
    lines.push("<details><summary>data-* attributes present on the page</summary>", "", ...Array.from(dataAttrs).slice(0, 60).map(([k, v]) => `- \`${k}="${v.slice(0, 60)}"\``), "", "</details>", "");
  }
  return lines.join("\n");
}

/**
 * Pull the brand system out of the page's own stylesheets: @font-face (also
 * returned machine-readable for the dev-server font proxy), CSS custom
 * properties, and the overlay/z-index idioms to imitate.
 */
export async function deriveDesignTokens(html: string, pageUrl: string): Promise<{ md: string; fonts: FontRef[] }> {
  const $ = load(html);
  const origin = (() => { try { return new URL(pageUrl).origin; } catch { return ""; } })();
  const abs = (href: string) => { try { return new URL(href, pageUrl).toString(); } catch { return ""; } };

  const sameOrigin: string[] = [];
  const crossOrigin: string[] = [];
  $('link[rel~="stylesheet"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const u = abs(href);
    if (!u || !/^https?:/i.test(u)) return;
    (origin && u.startsWith(origin) ? sameOrigin : crossOrigin).push(u);
  });
  // Same-origin first — that's usually the brand system — but DON'T stop there:
  // brand fonts are frequently declared in CDN-hosted CSS, and skipping those
  // would silently yield zero tokens on any site that puts its styles on a CDN.
  const sheets = [...sameOrigin, ...crossOrigin].slice(0, MAX_CSS_FILES);
  let css = "";
  const fetched: string[] = [];
  for (const s of sheets) {
    const text = await fetchText(s);
    if (text) { css += "\n" + text; fetched.push(s); }
  }
  $("style").each((_, el) => { css += "\n" + ($(el).html() || ""); });

  // @font-face → family + src url(+format)
  const fonts: FontRef[] = [];
  const seenFont = new Set<string>();
  for (const m of css.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
    const block = m[1];
    const fam = block.match(/font-family\s*:\s*["']?([^;"']+)["']?/i)?.[1]?.trim();
    if (!fam) continue;
    for (const um of block.matchAll(/url\(\s*["']?([^)"']+)["']?\s*\)(?:\s*format\(\s*["']?([^)"']+)["']?\s*\))?/gi)) {
      const url = abs(um[1]);
      if (!url) continue;
      const key = `${fam}|${url}`;
      if (seenFont.has(key)) continue;
      seenFont.add(key);
      fonts.push({ family: fam, url, format: um[2]?.trim() });
    }
  }

  // CSS custom properties
  const vars = new Map<string, string>();
  for (const m of css.matchAll(/--([a-zA-Z0-9_-]+)\s*:\s*([^;}]{1,120})[;}]/g)) {
    const name = `--${m[1]}`;
    if (!vars.has(name)) vars.set(name, m[2].trim());
    if (vars.size > 300) break;
  }
  const colorVars = Array.from(vars).filter(([, v]) => /^(#|rgb|hsl)/i.test(v));
  const otherVars = Array.from(vars).filter(([, v]) => !/^(#|rgb|hsl)/i.test(v));

  // Overlay idioms — the z-index ladder for modals/drawers.
  const overlays: { sel: string; z: number }[] = [];
  for (const m of css.matchAll(/([^{}]{1,200})\{[^{}]*z-index\s*:\s*(\d{2,})[^{}]*\}/gi)) {
    const sel = m[1].replace(/\s+/g, " ").trim();
    if (!/modal|overlay|offcanvas|drawer|dialog|popup|backdrop|lightbox|flyout/i.test(sel)) continue;
    const z = parseInt(m[2], 10);
    if (!overlays.some((o) => o.sel === sel)) overlays.push({ sel, z });
  }
  overlays.sort((a, b) => b.z - a.z);

  const md = [
    "<!-- OPMC-PROVISIONED · do NOT hand-edit · regenerated on re-sync -->",
    "# Brand system (extracted)",
    `> From the stylesheets of ${pageUrl}`,
    "",
    "**Defer to these.** Reuse the site's own classes inside your components; namespace anything custom. Never redefine a site class globally.",
    "",
    `## Webfonts (${fonts.length})`,
    "",
    fonts.length
      ? ["| family | file | format |", "|---|---|---|", ...fonts.slice(0, 40).map((f) => `| \`${f.family}\` | \`${f.url.replace(origin, "")}\` | ${f.format ?? "—"} |`)].join("\n")
      : "_None found in same-origin CSS._",
    "",
    "> The preview server proxies these through localhost — browsers CORS-block cross-origin webfonts, which silently falls text back to serif.",
    "",
    `## Color variables (${colorVars.length})`,
    "",
    colorVars.length ? colorVars.slice(0, 80).map(([k, v]) => `- \`${k}\`: \`${v}\``).join("\n") : "_No color custom properties found._",
    "",
    `<details><summary>Other custom properties (${otherVars.length})</summary>`,
    "",
    otherVars.slice(0, 120).map(([k, v]) => `- \`${k}\`: \`${v}\``).join("\n") || "_none_",
    "",
    "</details>",
    "",
    "## Overlay idioms (z-index ladder)",
    "",
    overlays.length
      ? ["Match these so your overlay sits correctly in the stack:", "", ...overlays.slice(0, 15).map((o) => `- \`${o.sel}\` → \`z-index: ${o.z}\``)].join("\n")
      : "_No modal/overlay z-index rules found — inspect the live page before picking a z-index._",
    "",
    "## Stylesheets read",
    "",
    fetched.length ? fetched.map((f) => `- \`${f.replace(origin, "")}\``).join("\n") : "_none reachable_",
    "",
    "> Computed styles in the browser miss media queries and pseudo-states. Prefer the source repo's SCSS (see `referenceRepos` in `context.json`) when it's available.",
    "",
  ].join("\n");

  return { md, fonts };
}
