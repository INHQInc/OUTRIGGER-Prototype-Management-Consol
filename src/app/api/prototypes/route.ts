import { NextRequest, NextResponse } from "next/server";
import { getContentStore } from "@/lib/content/store";
import { normalizeStage, type PrototypeRecord } from "@/lib/prototypes/types";
import { getSite } from "@/lib/sites";
import { canAccessOrg } from "@/lib/active-org";
import { currentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";
import { apiOrgFromAuthHeader } from "@/lib/api-token";
import { defaultOrgRepo } from "@/lib/git/org-repos";

function slug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "prototype";
}

/** GET ?site=<key> → list; ?key=<key> → one. API tokens may read one key (org-scoped). */
export async function GET(req: NextRequest) {
  const store = await getContentStore();
  const key = req.nextUrl.searchParams.get("key");
  const tokenOrg = await apiOrgFromAuthHeader(req.headers.get("authorization"));
  if (tokenOrg) {
    if (!key) return NextResponse.json({ error: "API tokens may only read a single prototype (?key=)" }, { status: 403 });
    const proto = await store.getPrototype(key);
    if (!proto) return NextResponse.json({ error: "Unknown prototype" }, { status: 404 });
    const site = await getSite(proto.siteKey);
    if (site?.orgId !== tokenOrg) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ prototype: proto, site: site ? { label: site.label, origin: site.origin } : null });
  }
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
    repo: b.repo?.fullName?.trim()
      ? { fullName: b.repo.fullName.trim(), branch: b.repo.branch?.trim() || `prototype/${key}`, ...(b.repo.artifactPath?.trim() ? { artifactPath: b.repo.artifactPath.trim() } : {}) }
      : undefined,
    targets: (b.targets ?? []).filter((t) => t.url?.trim()).map((t) => ({ url: t.url.trim(), source: t.source === "live" ? "live" : "clone" })),
    brief: {
      problem: b.brief?.problem?.trim() ?? "",
      change: b.brief?.change?.trim() ?? "",
      doneLooksLike: b.brief?.doneLooksLike?.trim() ?? "",
    },
    hypothesis: {
      change: b.hypothesis?.change?.trim() ?? "",
      audience: b.hypothesis?.audience?.trim() ?? "",
      outcome: b.hypothesis?.outcome?.trim() ?? "",
      rationale: b.hypothesis?.rationale?.trim() ?? "",
    },
    metrics: {
      primary: b.metrics?.primary?.trim() ?? "",
      guardrails: (b.metrics?.guardrails ?? []).map((g) => g.trim()).filter(Boolean),
    },
    owner: b.owner?.trim() || undefined,
    ticketUrl: b.ticketUrl?.trim() || undefined,
    priority: typeof b.priority === "number" ? b.priority : undefined,
    createdAt,
    updatedAt: now,
  };

  // Stub-friendly: no repo given → attach the brand's default prototypes repo
  // with the conventional branch. Changeable later in the workspace Source panel.
  if (!record.repo) {
    const site = await getSite(record.siteKey);
    if (site?.orgId) {
      const def = await defaultOrgRepo(site.orgId, "prototypes");
      if (def) record.repo = { fullName: def.fullName, branch: `prototype/${key}`, artifactPath: def.artifactPath };
    }
  }

  await store.putPrototype(record);
  return NextResponse.json({ prototype: record }, { status: 201 });
}

/** PATCH { key, status } → advance/set a prototype's lifecycle stage (skippable). */
export async function PATCH(req: NextRequest) {
  let body: Partial<PrototypeRecord> & { key?: string; status?: string; repo?: { fullName?: string; branch?: string; artifactPath?: string } | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.key) return NextResponse.json({ error: "key required" }, { status: 400 });
  const store = await getContentStore();
  const proto = await store.getPrototype(body.key);
  if (!proto) return NextResponse.json({ error: "Unknown prototype" }, { status: 404 });
  const site = await getSite(proto.siteKey);
  if (site?.orgId && !(await canAccessOrg(site.orgId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const updated = { ...proto, updatedAt: new Date().toISOString() };
  const changes: string[] = [];
  if (body.status !== undefined) { updated.status = normalizeStage(body.status); changes.push(updated.status); }
  if (body.repo !== undefined) {
    updated.repo = body.repo?.fullName?.trim()
      ? { fullName: body.repo.fullName.trim(), branch: body.repo.branch?.trim() || `prototype/${proto.key}`, ...(body.repo.artifactPath?.trim() ? { artifactPath: body.repo.artifactPath.trim() } : {}) }
      : undefined;
    changes.push(updated.repo ? `repo ${updated.repo.fullName}@${updated.repo.branch}` : "repo cleared");
  }
  if (body.name !== undefined && body.name.trim()) { updated.name = body.name.trim(); changes.push("name"); }
  if (body.targets !== undefined) {
    updated.targets = (body.targets ?? []).filter((t) => t.url?.trim()).map((t) => ({ url: t.url.trim(), source: t.source === "live" ? "live" : "clone" }));
    changes.push("targets");
  }
  if (body.brief !== undefined) {
    updated.brief = { problem: body.brief?.problem?.trim() ?? "", change: body.brief?.change?.trim() ?? "", doneLooksLike: body.brief?.doneLooksLike?.trim() ?? "" };
    changes.push("brief");
  }
  if (body.hypothesis !== undefined) {
    updated.hypothesis = { change: body.hypothesis?.change?.trim() ?? "", audience: body.hypothesis?.audience?.trim() ?? "", outcome: body.hypothesis?.outcome?.trim() ?? "", rationale: body.hypothesis?.rationale?.trim() ?? "" };
    changes.push("hypothesis");
  }
  if (body.metrics !== undefined) {
    updated.metrics = { primary: body.metrics?.primary?.trim() ?? "", guardrails: (body.metrics?.guardrails ?? []).map((g) => g.trim()).filter(Boolean) };
    changes.push("metrics");
  }
  if (body.owner !== undefined) { updated.owner = body.owner?.trim() || undefined; changes.push("owner"); }
  if (body.ticketUrl !== undefined) { updated.ticketUrl = body.ticketUrl?.trim() || undefined; changes.push("ticket"); }
  await store.putPrototype(updated);
  const user = await currentUser();
  await audit(site?.orgId ?? "", user?.name ?? user?.sub ?? "system", "prototype.update", proto.name, changes.join(" · "));
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
