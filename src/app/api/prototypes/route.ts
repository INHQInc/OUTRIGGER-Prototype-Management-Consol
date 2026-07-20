import { NextRequest, NextResponse } from "next/server";
import { getContentStore } from "@/lib/content/store";
import { normalizeStage, type PrototypeRecord } from "@/lib/prototypes/types";

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
