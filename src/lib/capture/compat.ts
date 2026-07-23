/**
 * Site compatibility verdict (O3) — the 30-second answer to "will this
 * architecture work on this site?", automated. The boundary is known and
 * binary: server-rendered + CSP-permissive + reachable, or not. Today that
 * knowledge is tribal; this makes it a red/green verdict with reasons,
 * BEFORE a customer invests an hour.
 */
import { load } from "cheerio";
import { safeFetchPage } from "../net/safe-fetch";

export interface CompatCheck {
  id: "reachable" | "ssr" | "csp" | "bot";
  title: string;
  level: "pass" | "warn" | "fail";
  detail: string;
}

export interface CompatReport {
  verdict: "compatible" | "caution" | "incompatible";
  checkedAt: string;
  url: string;
  checks: CompatCheck[];
}

export async function checkSiteCompatibility(url: string): Promise<CompatReport> {
  const checks: CompatCheck[] = [];
  const res = await safeFetchPage(url, 12_000);

  // 1 · Reachable at all
  if (!res.ok || !res.body) {
    const why = res.reason === "blocked" ? "the address resolves to a private/internal network (or credentials in the URL)"
      : res.reason === "redirected" ? `it redirects (HTTP ${res.status}) — check the canonical URL`
      : res.reason === "unresolved" ? "DNS does not resolve"
      : res.status ? `HTTP ${res.status}` : "no response";
    checks.push({ id: "reachable", title: "Reachable from the console", level: "fail", detail: `Couldn't fetch the page: ${why}. Capture, snapshots and injection checks all need plain HTTP access.` });
    return { verdict: "incompatible", checkedAt: new Date().toISOString(), url, checks };
  }
  checks.push({ id: "reachable", title: "Reachable from the console", level: "pass", detail: `HTTP ${res.status}, ${(res.body.length / 1024).toFixed(0)}KB of HTML.` });

  // 2 · Bot protection / challenge pages
  const bodyLower = res.body.slice(0, 20_000).toLowerCase();
  const challenged = res.headers?.["cf-mitigated"] === "challenge"
    || /just a moment|checking your browser|attention required.*cloudflare|__cf_chl|captcha-delivery|datadome|px-captcha|incapsula/i.test(bodyLower);
  checks.push(challenged
    ? { id: "bot", title: "Bot protection", level: "warn", detail: "The response looks like a bot challenge page. Capture may need allowlisting the console's user agent / IPs with the WAF vendor." }
    : { id: "bot", title: "Bot protection", level: "pass", detail: "No challenge page detected." });

  // 3 · Server-rendered content (the capture + preview + data.md foundation)
  const $ = load(res.body);
  $("script, style, noscript").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  const elements = $("body *").length;
  if (text.length > 800 && elements > 100) {
    checks.push({ id: "ssr", title: "Server-rendered content", level: "pass", detail: `${elements.toLocaleString()} elements, ${text.length.toLocaleString()} chars of server-rendered text — snapshots, selectors and data extraction will work.` });
  } else if (text.length > 150) {
    checks.push({ id: "ssr", title: "Server-rendered content", level: "warn", detail: `Thin server-rendered content (${elements} elements). If the page hydrates client-side, snapshots and selector maps will be partial — verify against the live review URL.` });
  } else {
    checks.push({ id: "ssr", title: "Server-rendered content", level: "fail", detail: "The HTML is an app shell — the page renders client-side. Capture, offline selectors and the local preview won't see real content. (Browser-extension capture is the planned path for SPA sites.)" });
  }

  // 4 · CSP vs script injection (the loader's life depends on this)
  const csp = res.headers?.["content-security-policy"];
  if (!csp) {
    const reportOnly = res.headers?.["content-security-policy-report-only"];
    checks.push({ id: "csp", title: "Content-Security-Policy", level: "pass", detail: reportOnly ? "CSP is report-only — injection works today; watch for enforcement later." : "No CSP header — script injection is unrestricted." });
  } else {
    const scriptSrc = /script-src([^;]*)/i.exec(csp)?.[1] ?? /default-src([^;]*)/i.exec(csp)?.[1] ?? "";
    const unsafeInline = /'unsafe-inline'/.test(scriptSrc);
    const hasNonceOrHash = /'nonce-|'sha256-/.test(scriptSrc);
    const wildcard = /(\s\*|\shttps:)(\s|$)/.test(scriptSrc);
    if (unsafeInline || wildcard) {
      checks.push({ id: "csp", title: "Content-Security-Policy", level: "warn", detail: "CSP present but permissive for scripts — the loader tag will run once its host is allowed. Add the console's domain to script-src (or serve the loader first-party via CNAME)." });
    } else if (hasNonceOrHash) {
      checks.push({ id: "csp", title: "Content-Security-Policy", level: "fail", detail: "Strict nonce/hash-based CSP — injected scripts are blocked outright. Needs the site team to allowlist the loader (nonce workflow or first-party domain) before anything else." });
    } else {
      checks.push({ id: "csp", title: "Content-Security-Policy", level: "fail", detail: `script-src is restrictive (${scriptSrc.trim().slice(0, 120) || "empty"}) — the loader and Optimizely custom code will both be blocked unless the domains are allowlisted.` });
    }
  }

  const verdict = checks.some((c) => c.level === "fail") ? "incompatible" : checks.some((c) => c.level === "warn") ? "caution" : "compatible";
  return { verdict, checkedAt: new Date().toISOString(), url, checks };
}
