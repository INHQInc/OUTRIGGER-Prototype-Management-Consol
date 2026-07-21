import { NextRequest, NextResponse } from "next/server";
import { getContentStore } from "@/lib/content/store";
import { normalizeStage, type PrototypeRecord } from "@/lib/prototypes/types";
import { getSite } from "@/lib/sites";
import { canAccessOrg } from "@/lib/active-org";
import { currentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";

function slug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "prototype";
}

/** GET ?site=<key> → list; ?key=<key> → one. */
export async function GET(req: NextRequest) {
  const store = await getContentStore();
  const key = req.nextUrl.searchParams.get("key");
  if (key) return NextResponse.json({ prototype: await store.getPrototype(key) });
  const site = req.nextUrl.searchParams.get("site") ?? undefined;
  return NextResponse.json({ prototypes: await store.listPrototypes(site) });
}

/** POST → create (no key) or update (key present) a prototype record. */
export async function POST(req: NextRequest) {
  let b: Partial<PrototypeRecord> & { key?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!b.siteKey) return NextResponse.json({ error: "siteKey required" }, { status: 400 });
  if (!b.name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
  if (!b.hypothesis?.change?.trim() || !b.hypothesis?.outcome?.trim()) {
    return NextResponse.json({ error: "Hypothesis needs at least a change and an expected outcome" }, { status: 400 });
  }
  if (!b.metrics?.primary?.trim()) return NextResponse.json({ error: "A primary metric is required" }, { status: 400 });

  const store = await getContentStore();
  const now = new Date().toISOString();

  let key = b.key;
  let createdAt = now;
  if (key) {
    const existing = await store.getPrototype(key);
    if (existing) createdAt = existing.createdAt;
  } else {
    // derive a unique key from the name
    const base = slug(b.name);
    key = base;
    let n = 2;
    while (await store.getPrototype(key)) key = `${base}-${n++}`;
  }

  const record: PrototypeRecord = {
    key,
    siteKey: b.siteKey,
    name: b.name.trim(),
    status: normalizeStage(b.status),
    targets: (b.targets ?? []).filter((t) => t.url?.trim()).map((t) => ({ url: t.url.trim(), source: t.source === "live" ? "live" : "clone" })),
    brief: {
      problem: b.brief?.problem?.trim() ?? "",
      change: b.brief?.change?.trim() ?? "",
      doneLooksLike: b.brief?.doneLooksLike?.trim() ?? "",
    },
    hypothesis: {
      change: b.hypothesis.change.trim(),
      audience: b.hypothesis.audience?.trim() ?? "",
      outcome: b.hypothesis.outcome.trim(),
      rationale: b.hypothesis.rationale?.trim() ?? "",
    },
    metrics: {
      primary: b.metrics.primary.trim(),
      guardrails: (b.metrics.guardrails ?? []).map((g) => g.trim()).filter(Boolean),
    },
    owner: b.owner?.trim() || undefined,
    ticketUrl: b.ticketUrl?.trim() || undefined,
    priority: typeof b.priority === "number" ? b.priority : undefined,
    createdAt,
    updatedAt: now,
  };

  await store.putPrototype(record);
  return NextResponse.json({ prototype: record }, { status: 201 });
}

/** PATCH { key, status } → advance/set a prototype's lifecycle stage (skippable). */
export async function PATCH(req: NextRequest) {
  let body: { key?: string; status?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.key) return NextResponse.json({ error: "key required" }, { status: 400 });
  const store = await getContentStore();
  const proto = await store.getPrototype(body.key);
  if (!proto) return NextResponse.json({ error: "Unknown prototype" }, { status: 404 });
  const site = await getSite(proto.siteKey);
  if (site?.orgId && !(await canAccessOrg(site.orgId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const status = normalizeStage(body.status);
  const updated = { ...proto, status, updatedAt: new Date().toISOString() };
  await store.putPrototype(updated);
  const user = await currentUser();
  await audit(site?.orgId ?? "", user?.name ?? user?.sub ?? "system", "prototype.stage", proto.name, status);
  return NextResponse.json({ prototype: updated });
}

/** DELETE ?key=<key> → cascade-delete a prototype (overlay + versions + promotions). */
export async function DELETE(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
  const store = await getContentStore();
  const proto = await store.getPrototype(key);
  if (!proto) return NextResponse.json({ error: "Unknown prototype" }, { status: 404 });
  const site = await getSite(proto.siteKey);
  if (site?.orgId && !(await canAccessOrg(site.orgId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await store.deletePrototype(key);
  const user = await currentUser();
  await audit(site?.orgId ?? "", user?.name ?? user?.sub ?? "system", "prototype.delete", proto.name, key);
  return NextResponse.json({ ok: true });
}
