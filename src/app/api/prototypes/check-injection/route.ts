import { NextRequest, NextResponse } from "next/server";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { listOrgEnvironments, envLoaderSeenAt } from "@/lib/environments";
import { safeFetchPage } from "@/lib/net/safe-fetch";
import { getContentStore } from "@/lib/content/store";
import { currentUser } from "@/lib/auth/current";
import type { TargetInjection } from "@/lib/prototypes/types";

function loaderKeysIn(html: string): string[] {
  const keys: string[] = [];
  const re = /<script[^>]+src=["'][^"']*\/loader\/([A-Za-z0-9_-]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) keys.push(m[1]);
  return keys;
}

interface InjectionResult {
  result: "present" | "wrong-env" | "absent" | "unreachable";
  httpStatus?: number;
  reason?: string;
  foundLoaderKey?: string;
  foundEnvLabel?: string | null;
  environment: { label: string; kind: string; expectedKey?: string } | null;
  heartbeatAt: string | null;
}

/** SSRF-hardened server check: is THIS customer's loader on the raw page HTML? */
async function computeInjection(orgId: string, raw: string): Promise<InjectionResult> {
  const envs = await listOrgEnvironments(orgId);
  const orgKeys = new Map(envs.map((e) => [e.siteKey ?? e.id, e]));
  let origin: string | null = null;
  try { origin = new URL(raw).origin; } catch { /* */ }
  const env = envs.find((e) => { try { return new URL(e.url).origin === origin; } catch { return false; } });
  const expectedKey = env ? (env.siteKey ?? env.id) : undefined;
  const heartbeatAt = env ? await envLoaderSeenAt(env) : null;

  const fetched = await safeFetchPage(raw);
  let result: InjectionResult["result"] = "unreachable";
  let foundLoaderKey: string | undefined;
  if (fetched.ok && fetched.body != null) {
    const ours = loaderKeysIn(fetched.body).filter((k) => orgKeys.has(k));
    if (expectedKey && ours.includes(expectedKey)) { result = "present"; foundLoaderKey = expectedKey; }
    else if (ours.length > 0) { result = expectedKey ? "wrong-env" : "present"; foundLoaderKey = ours[0]; }
    else result = "absent";
  }
  return {
    result, httpStatus: fetched.status, reason: fetched.reason, foundLoaderKey,
    foundEnvLabel: foundLoaderKey ? orgKeys.get(foundLoaderKey)?.label ?? null : null,
    environment: env ? { label: env.label, kind: env.kind, expectedKey } : null,
    heartbeatAt,
  };
}

/** GET ?key=&url= → compute + display only (auto-runs on mount; persists nothing). */
export async function GET(req: NextRequest) {
  const g = await guardPrototypeAccess(req.nextUrl.searchParams.get("key"), req.headers.get("authorization"));
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const raw = req.nextUrl.searchParams.get("url");
  if (!raw) return NextResponse.json({ error: "url required" }, { status: 400 });
  try { new URL(raw); } catch { return NextResponse.json({ error: "invalid url" }, { status: 400 }); }
  return NextResponse.json(await computeInjection(g.orgId, raw));
}

/** POST { key, url, confirm? } → the deliberate "Verify" (or human-confirm) action:
 *  compute (or confirm) AND PERSIST the result on the target so it's an auditable step. */
export async function POST(req: NextRequest) {
  let body: { key?: string; url?: string; confirm?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const g = await guardPrototypeAccess(body.key ?? null, req.headers.get("authorization"));
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const raw = body.url;
  if (!raw) return NextResponse.json({ error: "url required" }, { status: 400 });
  try { new URL(raw); } catch { return NextResponse.json({ error: "invalid url" }, { status: 400 }); }

  const user = await currentUser();
  const by = user?.name ?? user?.sub ?? (g.viaToken ? "claude (api)" : "you");
  const now = new Date().toISOString();

  let computed: InjectionResult | null = null;
  let injection: TargetInjection;
  if (body.confirm) {
    injection = { state: "confirmed", at: now, by };
  } else {
    computed = await computeInjection(g.orgId, raw);
    injection = { state: computed.result, at: now, by, ...(computed.foundEnvLabel ? { foundEnvLabel: computed.foundEnvLabel } : {}) };
  }

  const store = await getContentStore();
  const targets = g.proto.targets.map((t) => (t.url === raw ? { ...t, injection } : t));
  await store.putPrototype({ ...g.proto, targets, updatedAt: now });

  return NextResponse.json({ ...(computed ?? {}), injection });
}
