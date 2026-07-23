/**
 * Certification v1 — the static QA gate a variation passes before it ships.
 *
 * Every check encodes a failure that actually happened in production:
 * - a variation whose init() bailed once under Optimizely's early <head>
 *   injection (worked via the loader, dead in the experiment);
 * - a wrapper that appended to document.body before <body> existed
 *   ("Failed to apply change");
 * - the standing invariants: idempotent, no analytics, same-origin assets.
 *
 * v1 is static analysis of the built artifact — no browser. Dynamic dual-timing
 * execution (running the code in a real page under both injection timings) is
 * the v2 upgrade. Static catches the *structural* versions of those bugs now.
 *
 * Levels: fail = blocks the Optimizely push (explicit override required);
 * warn = surfaced, never blocks; pass = green.
 */

export type CheckLevel = "pass" | "warn" | "fail";

export interface CertificationCheck {
  id: string;
  title: string;
  level: CheckLevel;
  detail: string;
}

export interface CertificationReport {
  passed: boolean;          // no fails (warns allowed)
  ranAt: string;
  bytes: number;
  checks: CertificationCheck[];
  engine: "static-v1";
}

const BUDGET_WARN = 150_000;  // bytes
const BUDGET_FAIL = 400_000;

/** Trackers/analytics that must never ride along with a variation. */
const ANALYTICS = [
  /\bgtag\s*\(/, /\bga\s*\(\s*['"]/, /\bfbq\s*\(/, /dataLayer\s*\.\s*push\s*\(/,
  /google-analytics\.com/, /googletagmanager\.com/, /connect\.facebook\.net/,
  /hotjar|mouseflow|clarity\.ms|qualtrics|segment\.(io|com)\/v1/,
  /_satellite\b/, /adobeDataLayer/,
];

/** Cross-origin references that would break the same-origin asset rule. */
const URLISH = /\bhttps?:\/\/([a-z0-9.-]+)/gi;

export function certifyVariation(js: string, opts: { key: string; targetOrigins?: string[] } = { key: "" }): CertificationReport {
  const checks: CertificationCheck[] = [];
  const bytes = Buffer.byteLength(js, "utf8");
  const add = (id: string, title: string, level: CheckLevel, detail: string) => checks.push({ id, title, level, detail });

  // 1 · Idempotency guard
  if (/__opmc_variations\s*(\[|\.)/.test(js) && /return\s*;?/.test(js)) {
    add("idempotent", "Idempotency guard", "pass", "Guards on window.__opmc_variations — runs twice, applies once.");
  } else if (/if\s*\(\s*window\.[A-Za-z_$][\w$]*\s*(&&|\))/.test(js) && /return/.test(js.slice(0, 2000))) {
    add("idempotent", "Idempotency guard", "warn", "A guard-like pattern exists but isn't the standard __opmc_variations namespace guard — verify a double-injection applies once.");
  } else {
    add("idempotent", "Idempotency guard", "fail", "No idempotency guard found. If the platform injects twice (SPA soft navigation, re-activation), the variation applies twice.");
  }

  // 2 · Early-injection body safety (the “Failed to apply change” bug)
  const bodyAppends = js.match(/document\.body\.(appendChild|prepend|append|insertBefore)/g) ?? [];
  const guardedBody = /(document\.head\s*\|\|\s*document\.documentElement)/.test(js);
  const bodyGatedInit = /(!document\.body|document\.body\s*&&|readyState)/.test(js);
  if (bodyAppends.length === 0 || (guardedBody && bodyGatedInit)) {
    add("body-safety", "Early-injection body safety", "pass", "No unguarded top-level document.body appends — survives injection before <body> exists.");
  } else if (bodyGatedInit) {
    add("body-safety", "Early-injection body safety", "warn", `document.body is used ${bodyAppends.length}× but body-readiness gating exists — verify none run at top level before <body>.`);
  } else {
    add("body-safety", "Early-injection body safety", "fail", "document.body is appended to with no body-readiness gating. Optimizely injects from <head> before <body> exists — this throws 'Failed to apply change'.");
  }

  // 3 · Dependency-gated init must retry (the bail-once bug)
  const depGated = /(window\.(bootstrap|jQuery|\$|out|dataLayer)\b[^\n]{0,80}return|return[^\n]{0,40}!window\.)/.test(js) || /if\s*\(\s*!\w+\(\)\s*\|\|\s*!window\./.test(js);
  const hasRetry = /(setInterval|setTimeout|requestAnimationFrame)/.test(js) || /addEventListener\s*\(\s*["']load["']/.test(js) || /MutationObserver/.test(js);
  if (!depGated) {
    add("init-retry", "Init retries until dependencies exist", "pass", "No dependency-gated early return detected — nothing to retry.");
  } else if (hasRetry) {
    add("init-retry", "Init retries until dependencies exist", "pass", "Dependency gate found alongside a retry mechanism (interval / load listener / observer).");
  } else {
    add("init-retry", "Init retries until dependencies exist", "fail", "init() bails when a page dependency is missing and never retries. Under early injection the dependency isn't loaded yet — the variation goes silently dead.");
  }

  // 4 · Zero analytics
  const hits = ANALYTICS.filter((re) => re.test(js)).map((re) => re.source);
  if (hits.length === 0) add("no-analytics", "Zero analytics / tracking added", "pass", "No tracker calls or analytics domains found.");
  else add("no-analytics", "Zero analytics / tracking added", "fail", `Tracking references found: ${hits.slice(0, 4).join(" · ")}. A variation must never add measurement the platform doesn't know about.`);

  // 5 · Same-origin assets
  const allowed = new Set<string>();
  for (const o of opts.targetOrigins ?? []) { try { allowed.add(new URL(o).hostname); } catch { /* skip */ } }
  const foreign = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = URLISH.exec(js))) {
    const host = m[1].toLowerCase();
    if (host === "localhost" || allowed.has(host) || [...allowed].some((a) => host.endsWith(`.${a.split(".").slice(-2).join(".")}`) || a.endsWith(host))) continue;
    foreign.add(host);
  }
  if (foreign.size === 0) add("same-origin", "Same-origin assets only", "pass", "No cross-origin asset or endpoint references.");
  else add("same-origin", "Same-origin assets only", "warn", `External hosts referenced: ${[...foreign].slice(0, 5).join(", ")}. Verify each is intentional — external assets add latency, CSP risk, and third-party dependency.`);

  // 6 · Bundle budget
  if (bytes <= BUDGET_WARN) add("budget", "Bundle budget", "pass", `${bytes.toLocaleString()} bytes — within the ${(BUDGET_WARN / 1000).toFixed(0)}KB budget.`);
  else if (bytes <= BUDGET_FAIL) add("budget", "Bundle budget", "warn", `${bytes.toLocaleString()} bytes — over the ${(BUDGET_WARN / 1000).toFixed(0)}KB soft budget. Check for embedded images or duplicated CSS.`);
  else add("budget", "Bundle budget", "fail", `${bytes.toLocaleString()} bytes — exceeds the ${(BUDGET_FAIL / 1000).toFixed(0)}KB hard cap for injected code.`);

  // 7 · Namespace / provenance marker
  if (js.includes("__opmc") || (opts.key && js.includes(`opmc-${opts.key}`)) || /opmc-[a-z0-9-]+/.test(js)) {
    add("provenance", "Namespace + provenance marker", "pass", "Artifact carries its opmc namespace — identifiable in the wild.");
  } else {
    add("provenance", "Namespace + provenance marker", "warn", "No opmc namespace marker found — the served artifact can't self-identify.");
  }

  // 8 · eval / document.write (platform killers)
  if (/\beval\s*\(|new\s+Function\s*\(|document\.write\s*\(/.test(js)) {
    add("no-eval", "No eval / document.write", "fail", "eval(), new Function(), or document.write() found — blocked by many CSPs and destructive after load.");
  } else {
    add("no-eval", "No eval / document.write", "pass", "No eval, Function constructor, or document.write.");
  }

  const passed = checks.every((c) => c.level !== "fail");
  return { passed, ranAt: new Date().toISOString(), bytes, checks, engine: "static-v1" };
}
