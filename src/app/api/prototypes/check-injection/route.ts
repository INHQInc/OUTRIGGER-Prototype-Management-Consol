import { NextRequest, NextResponse } from "next/server";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { listOrgEnvironments, envLoaderSeenAt } from "@/lib/environments";
import { safeFetchPage } from "@/lib/net/safe-fetch";

/** All `/loader/<key>` script srcs on the page (order preserved). */
function loaderKeysIn(html: string): string[] {
  const keys: string[] = [];
  const re = /<script[^>]+src=["'][^"']*\/loader\/([A-Za-z0-9_-]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) keys.push(m[1]);
  return keys;
}

/**
 * GET ?key=<prototypeKey>&url=<pageUrl> → is the OPMC loader script installed on
 * that page? SSRF-hardened server fetch (see lib/net/safe-fetch) that looks for
 * a `/loader/<envKey>` <script> whose key belongs to one of this customer's
 * environments. Falls back to the environment heartbeat when the page can't be
 * fetched OR the tag is injected client-side (not in the raw server HTML) — the
 * loader still runs in real browsers, which the heartbeat proves.
 */
export async function GET(req: NextRequest) {
  const g = await guardPrototypeAccess(req.nextUrl.searchParams.get("key"), req.headers.get("authorization"));
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const raw = req.nextUrl.searchParams.get("url");
  if (!raw) return NextResponse.json({ error: "url required" }, { status: 400 });
  let targetOrigin: string | null = null;
  try { targetOrigin = new URL(raw).origin; } catch { return NextResponse.json({ error: "invalid url" }, { status: 400 }); }

  // The customer's environments — for key matching + heartbeat fallback.
  const envs = await listOrgEnvironments(g.orgId);
  const orgKeys = new Map(envs.map((e) => [e.siteKey ?? e.id, e]));
  const env = envs.find((e) => { try { return new URL(e.url).origin === targetOrigin; } catch { return false; } });
  const expectedKey = env ? (env.siteKey ?? env.id) : undefined;
  const heartbeatAt = env ? await envLoaderSeenAt(env) : null;

  const fetched = await safeFetchPage(raw);

  // Reachable page: decide from the raw HTML, but only trust a loader key that
  // belongs to THIS customer (ignore unrelated third-party /loader/ scripts).
  let result: "present" | "wrong-env" | "absent" | "unreachable" = "unreachable";
  let foundLoaderKey: string | undefined;
  if (fetched.ok && fetched.body != null) {
    const ours = loaderKeysIn(fetched.body).filter((k) => orgKeys.has(k));
    if (expectedKey && ours.includes(expectedKey)) { result = "present"; foundLoaderKey = expectedKey; }
    else if (ours.length > 0) { result = expectedKey ? "wrong-env" : "present"; foundLoaderKey = ours[0]; }
    else result = "absent";
  }

  return NextResponse.json({
    result,
    httpStatus: fetched.status,
    reason: fetched.reason,
    foundLoaderKey,
    foundEnvLabel: foundLoaderKey ? orgKeys.get(foundLoaderKey)?.label ?? null : null,
    environment: env ? { label: env.label, kind: env.kind, expectedKey } : null,
    heartbeatAt,
  });
}
