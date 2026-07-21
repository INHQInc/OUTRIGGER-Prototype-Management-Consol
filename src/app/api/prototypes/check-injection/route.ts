import { NextRequest, NextResponse } from "next/server";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { listOrgEnvironments, envLoaderSeenAt } from "@/lib/environments";

/** Reject internal/loopback/link-local hosts — this endpoint fetches a
 *  caller-supplied URL, so guard against SSRF into the deploy's network. */
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost")) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    if (a === 0 || a === 10 || a === 127 || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)) return true;
  }
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
  return false;
}

/**
 * GET ?key=<prototypeKey>&url=<pageUrl> → is the OPMC loader script installed on
 * that page? Server-fetches the page and looks for a `/loader/<key>` <script>.
 * Falls back to the environment heartbeat when the page can't be auto-fetched
 * (some sites block server-side requests / bots — the loader still runs in real
 * browsers, which is what the heartbeat proves).
 */
export async function GET(req: NextRequest) {
  const g = await guardPrototypeAccess(req.nextUrl.searchParams.get("key"), req.headers.get("authorization"));
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const raw = req.nextUrl.searchParams.get("url");
  if (!raw) return NextResponse.json({ error: "url required" }, { status: 400 });
  let target: URL;
  try { target = new URL(raw); } catch { return NextResponse.json({ error: "invalid url" }, { status: 400 }); }
  if (target.protocol !== "http:" && target.protocol !== "https:") return NextResponse.json({ error: "url must be http(s)" }, { status: 400 });
  if (isPrivateHost(target.hostname)) return NextResponse.json({ error: "refusing to check an internal host" }, { status: 400 });

  // Match the page to one of the customer's environments (for the heartbeat fallback + expected key).
  const envs = await listOrgEnvironments(g.orgId);
  const env = envs.find((e) => { try { return new URL(e.url).origin === target.origin; } catch { return false; } });
  const heartbeatAt = env ? await envLoaderSeenAt(env) : null;

  let result: "present" | "absent" | "unreachable" = "unreachable";
  let httpStatus: number | undefined;
  let foundLoaderKey: string | undefined;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(target.toString(), {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (OPMC injection check; +https://outrigger-prototype-management-cons.vercel.app)", Accept: "text/html" },
    });
    clearTimeout(to);
    httpStatus = res.status;
    if (res.ok) {
      const html = (await res.text()).slice(0, 2_000_000);
      const m = html.match(/<script[^>]+src=["'][^"']*\/loader\/([A-Za-z0-9_-]+)["']/i);
      result = m ? "present" : "absent";
      if (m) foundLoaderKey = m[1];
    }
  } catch { result = "unreachable"; }

  return NextResponse.json({
    result,
    httpStatus,
    foundLoaderKey,
    environment: env ? { label: env.label, kind: env.kind, expectedKey: env.siteKey ?? env.id } : null,
    heartbeatAt,
  });
}
