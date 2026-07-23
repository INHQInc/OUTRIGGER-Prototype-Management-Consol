/**
 * SSRF-hardened fetch for caller-supplied URLs. The console fetches customer
 * pages to check for the loader tag; without these guards an authenticated
 * user could point it at cloud-metadata / internal hosts.
 *
 * Defenses, all applied on every request:
 *  - resolve DNS ourselves and reject if ANY resolved address is private/reserved
 *    (closes public-name → private-IP tricks like *.nip.io / localtest.me);
 *  - PIN the connection to the validated IP via an undici Agent lookup, so the
 *    kernel can't re-resolve to a different (private) address between our check
 *    and the connect (DNS-rebinding TOCTOU);
 *  - never follow redirects (redirect: "manual"), so a public URL can't bounce
 *    us to an internal host;
 *  - reject embedded credentials and non-http(s) schemes.
 */
import { Agent, fetch as undiciFetch } from "undici";
import { lookup as dnsLookup } from "node:dns/promises";
import net from "node:net";

function ipv4Private(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;               // this-host, private, loopback
  if (a === 169 && b === 254) return true;                          // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;                 // private
  if (a === 192 && b === 168) return true;                          // private
  if (a === 100 && b >= 64 && b <= 127) return true;                // CGNAT
  if (a === 192 && b === 0 && p[2] === 0) return true;              // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true;             // benchmarking
  if (a >= 224) return true;                                        // multicast + reserved + broadcast
  return false;
}

function ipv6Private(addr: string): boolean {
  const s = addr.toLowerCase().split("%")[0];
  if (s === "::1" || s === "::") return true;                       // loopback / unspecified
  if (s.startsWith("fc") || s.startsWith("fd")) return true;        // unique-local fc00::/7
  if (/^fe[89ab]/.test(s)) return true;                             // link-local fe80::/10
  const mapped = s.match(/(?:::ffff:)(\d+\.\d+\.\d+\.\d+)$/);       // IPv4-mapped ::ffff:a.b.c.d
  if (mapped) return ipv4Private(mapped[1]);
  if (s.includes("::ffff:")) return true;                           // mapped in hex form — be conservative
  const first = parseInt(s.split(":")[0] || "z", 16);
  if (Number.isNaN(first)) return true;
  if (first >= 0x2000 && first <= 0x3fff) return false;             // global unicast 2000::/3
  return true;                                                      // block ff.. multicast + everything else
}

function ipIsPrivate(ip: string): boolean {
  const fam = net.isIP(ip);
  if (fam === 4) return ipv4Private(ip);
  if (fam === 6) return ipv6Private(ip);
  return true; // not an IP literal → unsafe
}

export interface SafeFetchResult {
  ok: boolean;
  status: number;
  /** page HTML if 2xx (capped); undefined otherwise. */
  body?: string;
  /** security-relevant response headers (lowercased), when a response arrived. */
  headers?: Record<string, string>;
  /** why we didn't/couldn't fetch, for the caller's status reporting. */
  reason?: "blocked" | "unresolved" | "redirected" | "unreachable" | "bad-url";
}

const MAX_BODY = 2_000_000;

export async function safeFetchPage(rawUrl: string, timeoutMs = 8000): Promise<SafeFetchResult> {
  let target: URL;
  try { target = new URL(rawUrl); } catch { return { ok: false, status: 0, reason: "bad-url" }; }
  if (target.protocol !== "http:" && target.protocol !== "https:") return { ok: false, status: 0, reason: "bad-url" };
  if (target.username || target.password) return { ok: false, status: 0, reason: "blocked" };

  const host = target.hostname.replace(/^\[|\]$/g, ""); // unwrap [::1]
  let addrs: { address: string; family: number }[];
  try {
    addrs = await dnsLookup(host, { all: true });
  } catch { return { ok: false, status: 0, reason: "unresolved" }; }
  if (!addrs.length) return { ok: false, status: 0, reason: "unresolved" };
  if (addrs.some((a) => ipIsPrivate(a.address))) return { ok: false, status: 0, reason: "blocked" };

  const pinned = addrs[0];
  const agent = new Agent({
    connect: {
      // Pin to the exact validated IP — undici won't re-resolve the hostname.
      lookup: (
        _hostname: string,
        options: { all?: boolean } | undefined,
        cb: (err: Error | null, address: string | { address: string; family: number }[], family?: number) => void,
      ) => {
        if (options?.all) cb(null, [{ address: pinned.address, family: pinned.family }]);
        else cb(null, pinned.address, pinned.family);
      },
    },
  });

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await undiciFetch(target.toString(), {
      redirect: "manual",
      signal: ctrl.signal,
      dispatcher: agent,
      headers: { "User-Agent": "Mozilla/5.0 (OPMC injection check)", Accept: "text/html" },
    });
    const keep = ["content-security-policy", "content-security-policy-report-only", "server", "cf-mitigated", "x-frame-options"];
    const headers: Record<string, string> = {};
    for (const h of keep) { const v = res.headers.get(h); if (v) headers[h] = v; }
    if (res.status === 0 || (res.status >= 300 && res.status < 400)) return { ok: false, status: res.status, reason: "redirected", headers };
    if (!res.ok) return { ok: false, status: res.status, reason: "unreachable", headers };
    const body = (await res.text()).slice(0, MAX_BODY);
    return { ok: true, status: res.status, body, headers };
  } catch {
    return { ok: false, status: 0, reason: "unreachable" };
  } finally {
    clearTimeout(to);
    agent.close().catch(() => {});
  }
}
