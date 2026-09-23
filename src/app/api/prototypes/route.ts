import { NextRequest, NextResponse } from "next/server";
import { getContentStore } from "@/lib/content/store";
import { normalizeStage, referenceKind, normalizeReferenceUrl, type PrototypeRecord, type PrototypeBrief, type BriefReference, type BriefAttachment } from "@/lib/prototypes/types";
import { normalizeScore, derivePriority, formatRice } from "@/lib/prototypes/score";
import { accessibleOrgIds, canAccessOrg, getActiveOrgId } from "@/lib/active-org";
import { listOrgEnvironments } from "@/lib/environments";
import { resolvePrototypeOrg } from "@/lib/prototypes/org";
import { currentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";
import { apiOrgFromAuthHeader } from "@/lib/api-token";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { defaultOrgRepo } from "@/lib/git/org-repos";
import { defaultSiteId, getSiteById } from "@/lib/site/sites";

/** A prototype's own branch — never the shared `starter` template. Coerces
 *  a blank or `starter` choice to the conventional prototype/<key>. */
function prototypeBranch(input: string | undefined, key: string): string {
  const b = input?.trim();
  return b && b !== "starter" ? b : `prototype/${key}`;
}

/**
 * Sanitize + normalize a brief payload identically on create and update.
 *
 * ── ABSENT IS NOT EMPTY ────────────────────────────────────────────────────
 *
 * PATCH replaces the brief WHOLESALE (`updated.brief = normalizeBrief(...)`),
 * so every field this function omits is a field the record loses. That made
 * the old behaviour a data-loss bug with a comment promising the opposite: a
 * payload that simply did not MENTION references or attachments had them
 * dropped, silently, with no error.
 *
 * Two callers hit that every day. `opmc-prototype` tells the building agent to
 * PATCH "the full brief object (unset fields are cleared)" and enumerates only
 * the six prose fields — so an agent keeping the brief honest deleted every
 * supporting link and every attached file, and the next Re-sync removed them
 * from the branch too. And `applyDraft` in the composer rebuilt the brief
 * without attachments, so Draft with AI → Save detached the lot.
 *
 * So: a key that is ABSENT inherits from `prev`; a key that is PRESENT AND
 * EMPTY clears. That keeps "the user removed their last link and saved"
 * working while making "this caller didn't know the field existed" harmless.
 */
function normalizeBrief(
  raw: { problem?: string; change?: string; doneLooksLike?: string; where?: string; constraints?: string; reference?: string; references?: { url?: string; label?: string; note?: string }[]; attachments?: BriefAttachment[] } | undefined,
  prev?: PrototypeBrief,
): PrototypeBrief {
  // `!= null`, not `!== undefined`: a body carrying `"brief": null` reached
  // hasOwnProperty.call(null, …) and threw a TypeError out as an unhandled 500.
  // A null brief means "no fields given" — inherit, exactly like an absent one.
  const given = (k: string) => raw != null && Object.prototype.hasOwnProperty.call(raw, k);
  const refs: BriefReference[] = [];
  for (const r of (given("references") ? raw!.references ?? [] : prev?.references ?? [])) {
    const url = normalizeReferenceUrl(r?.url ?? ""); // drops non-URLs / javascript:/data:
    if (!url) continue;
    // `note` LAST, and undefined when blank. contentHashOf JSON.stringifies the
    // whole brief and JSON.stringify is key-order sensitive while omitting
    // undefined values — so a reference with no note hashes byte-identically to
    // one written before this field existed. Insert it any earlier and every
    // prototype holding a link gets a new hash on deploy, and the whole fleet
    // reports "the brief changed — re-sync" at once.
    refs.push({ url, label: r?.label?.trim() || undefined, kind: referenceKind(url), note: r?.note?.trim() || undefined });
    if (refs.length >= 20) break;
  }
  /**
   * ATTACHMENT IDENTITY IS THE SERVER'S; ONLY THE NOTE IS THE CLIENT'S.
   *
   * The stored list is the base and a PATCH may edit exactly one field of it.
   * Everything else — asset, name, contentType, bytes, addedAt, addedBy — is
   * copied from the record, and an incoming entry whose `asset` the record
   * does not know is ignored outright, because only the upload route can mint
   * one.
   *
   * Two bugs close here. `name` is written straight into a git path at
   * provision.ts (`.opmc/attachments/${a.name}`) and `safeFileName` runs only
   * on upload, so a PATCHed name containing `../` escaped the attachments
   * directory on the committed branch — and `brief` is token-writable, so an
   * API token could drive it. And because the list can no longer SHRINK here,
   * a composer that loaded before a file was uploaded in another tab can't
   * delete that file by saving a stale array. Removal has one door, the
   * DELETE route, which is the one the UI already uses.
   */
  //
  // Keyed on asset AND name, and only for entries that actually carry a `note`
  // key. Two reasons, both reachable:
  //   · `asset` is the sha1 of the BYTES, so the same file uploaded under two
  //     names is two entries sharing one asset. Keying on asset alone wrote one
  //     note onto both.
  //   · An entry sent WITHOUT a note key meant "clear the note" — so any client
  //     echoing the attachments array it already had, minus the note field,
  //     silently wiped every note and moved the content hash with it.
  const key = (a: { asset: string; name: string }) => `${a.asset}\u0000${a.name}`;
  const incomingNotes = new Map<string, string | undefined>();
  for (const a of given("attachments") ? raw!.attachments ?? [] : []) {
    if (!a || !Object.prototype.hasOwnProperty.call(a, "note")) continue;
    incomingNotes.set(key(a), typeof a.note === "string" ? a.note.trim() || undefined : undefined);
  }
  const attachments = (prev?.attachments ?? []).slice(0, 20).map((a) =>
    incomingNotes.has(key(a)) ? { ...a, note: incomingNotes.get(key(a)) } : a);
  return {
    problem: raw?.problem?.trim() ?? "",
    change: raw?.change?.trim() ?? "",
    doneLooksLike: raw?.doneLooksLike?.trim() ?? "",
    ...(raw?.where?.trim() ? { where: raw.where.trim() } : {}),
    ...(raw?.constraints?.trim() ? { constraints: raw.constraints.trim() } : {}),
    ...(raw?.reference?.trim() ? { reference: raw.reference.trim() } : {}),
    ...(refs.length ? { references: refs } : {}),
    ...(attachments.length ? { attachments } : {}),
  };
}

/**
 * What an org API token may write through PATCH.
 *
 * The token exists so the agent building a prototype can keep the brief honest
 * as the build moves — a brief that still describes the starter banner three
 * days into the work is worse than no brief, because the drift audit then
 * measures the code against fiction. But a token is a bearer credential
 * sitting in a shell env, so it must never be able to move the prototype's
 * stage, repoint its repo or targets, or reassign its owner. Those stay with a
 * signed-in human, exactly as lib/api-token.ts promises.
 *
 * Deny-by-default: any field outside this set is refused by name rather than
 * silently dropped, so a caller that thinks it changed the stage finds out.
 */
const TOKEN_WRITABLE = new Set(["key", "brief", "hypothesis", "metrics"]);

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
    if ((await resolvePrototypeOrg(proto)) !== tokenOrg) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const environments = (await listOrgEnvironments(tokenOrg)).map((e) => ({ label: e.label, url: e.url, kind: e.kind }));
    return NextResponse.json({ prototype: proto, environments });
  }
  if (key) {
    const proto = await store.getPrototype(key);
    if (!proto) return NextResponse.json({ error: "Unknown prototype" }, { status: 404 });
    const org = await resolvePrototypeOrg(proto);
    if (!org || !(await canAccessOrg(org))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ prototype: proto });
  }
  const site = req.nextUrl.searchParams.get("site") ?? undefined;
  const accessible = new Set(await accessibleOrgIds());
  const prototypes: PrototypeRecord[] = [];
  for (const p of await store.listPrototypes(site)) {
    const org = await resolvePrototypeOrg(p);
    if (org && accessible.has(org)) prototypes.push(p);
  }
  return NextResponse.json({ prototypes });
}

/** POST → create (no key) or update (key present) a prototype record. */
export async function POST(req: NextRequest) {
  let b: Partial<PrototypeRecord> & { key?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!b.name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const activeOrg = await getActiveOrgId();

  const store = await getContentStore();
  const now = new Date().toISOString();

  let key = b.key;
  let createdAt = now;
  let existing: PrototypeRecord | null = null;
  let existingOrg = "";
  if (key) {
    existing = await store.getPrototype(key);
    if (existing) {
      createdAt = existing.createdAt;
      existingOrg = await resolvePrototypeOrg(existing);
      if (!existingOrg || !(await canAccessOrg(existingOrg))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    // derive a unique key from the name
    const base = slug(b.name);
    key = base;
    let n = 2;
    while (await store.getPrototype(key)) key = `${base}-${n++}`;
  }
  // Creating (no existing record) always requires an owning customer — no orphans.
  if (!existing && !activeOrg) return NextResponse.json({ error: "No active customer." }, { status: 400 });
  const recordOrg = existing ? existingOrg : activeOrg!;

  // A prototype belongs to exactly one site, and once it has one it keeps it —
  // this route never moves a prototype between sites. A new one takes the site
  // it was created under (validated against its customer), or the customer's
  // default site when none was sent.
  let siteId = existing?.siteId;
  if (!siteId && b.siteId) {
    const site = await getSiteById(recordOrg, b.siteId);
    if (!site) return NextResponse.json({ error: "Unknown site." }, { status: 400 });
    siteId = site.id;
  }
  if (!siteId) siteId = (await defaultSiteId(recordOrg)) ?? undefined;

  const record: PrototypeRecord = {
    key,
    orgId: recordOrg,
    ...(siteId ? { siteId } : {}),
    siteKey: b.siteKey ?? existing?.siteKey ?? "",
    name: b.name.trim(),
    status: normalizeStage(b.status),
    buildMode: b.buildMode === "external" ? "external" : b.buildMode === "console" ? "console" : existing?.buildMode,
    repo: b.repo?.fullName?.trim()
      ? { fullName: b.repo.fullName.trim(), branch: prototypeBranch(b.repo.branch, key), ...(b.repo.artifactPath?.trim() ? { artifactPath: b.repo.artifactPath.trim() } : {}) }
      : undefined,
    targets: (b.targets ?? []).filter((t) => t.url?.trim()).map((t) => ({ url: t.url.trim(), source: t.source === "live" ? "live" : "clone" })),
    // `existing?.brief` matters: POST is documented as "create (no key) or
    // update (key present)", and without it the update branch resolved
    // attachments from an undefined `prev` and dropped every file on the brief.
    brief: normalizeBrief(b.brief, existing?.brief),
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
    // Set by /api/prototypes/arm, which is the only thing that validates a
    // group id — carried through here so a plain save never drops it.
    ...(existing?.arm ? { arm: existing.arm } : {}),
    owner: b.owner?.trim() || undefined,
    ticketUrl: b.ticketUrl?.trim() || undefined,
    priority: typeof b.priority === "number" ? b.priority : undefined,
    createdAt,
    updatedAt: now,
  };

  // Stub-friendly: no repo given → attach the brand's default prototypes repo
  // with the conventional branch. Changeable later in the workspace Source panel.
  if (!record.repo && record.orgId) {
    const def = await defaultOrgRepo(record.orgId, "prototypes");
    if (def) record.repo = { fullName: def.fullName, branch: `prototype/${key}`, artifactPath: def.artifactPath };
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
  const g = await guardPrototypeAccess(body.key, req.headers.get("authorization"));
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const { proto, orgId: protoOrg, viaToken } = g;
  if (viaToken) {
    const reach = Object.keys(body as Record<string, unknown>)
      .filter((k) => (body as Record<string, unknown>)[k] !== undefined && !TOKEN_WRITABLE.has(k));
    if (reach.length) {
      return NextResponse.json({
        error: `An API token may only update the brief, hypothesis and metrics. Sign in to change: ${reach.join(", ")}`,
      }, { status: 403 });
    }
  }
  const updated = { ...proto, updatedAt: new Date().toISOString() };
  const changes: string[] = [];
  if (body.status !== undefined) { updated.status = normalizeStage(body.status); changes.push(updated.status); }
  if (body.repo !== undefined) {
    updated.repo = body.repo?.fullName?.trim()
      ? { fullName: body.repo.fullName.trim(), branch: prototypeBranch(body.repo.branch, proto.key), ...(body.repo.artifactPath?.trim() ? { artifactPath: body.repo.artifactPath.trim() } : {}) }
      : undefined;
    changes.push(updated.repo ? `repo ${updated.repo.fullName}@${updated.repo.branch}` : "repo cleared");
  }
  if (body.name !== undefined && body.name.trim()) { updated.name = body.name.trim(); changes.push("name"); }
  if (body.buildMode !== undefined) {
    updated.buildMode = body.buildMode === "external" ? "external" : "console";
    changes.push(updated.buildMode === "external" ? "built externally (Optimizely) — brief + experiment only" : "built in this app (full pipeline)");
  }
  if (body.targets !== undefined) {
    const prevInj = new Map(proto.targets.map((t) => [t.url, t.injection]));
    updated.targets = (body.targets ?? []).filter((t) => t.url?.trim()).map((t) => {
      const url = t.url.trim();
      const inj = prevInj.get(url);
      return { url, source: t.source === "live" ? "live" : "clone", ...(inj ? { injection: inj } : {}) };
    });
    changes.push("targets");
  }
  if (body.brief !== undefined) {
    updated.brief = normalizeBrief(body.brief, proto.brief);
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
  if (body.priority !== undefined) { updated.priority = typeof body.priority === "number" && isFinite(body.priority) ? body.priority : undefined; changes.push("priority"); }
  if (body.score !== undefined) {
    const next = normalizeScore(body.score);
    // Stamped only when something is actually stored: a cleared score should
    // not leave a "set by Bryan just now" behind it.
    updated.score = next ? { ...next, setAt: new Date().toISOString(), setBy: (await currentUser())?.name ?? undefined } : undefined;
    const d = derivePriority(updated.score, {});
    changes.push(next ? `score ${d.scored ? formatRice(d.rice) : "(incomplete)"}` : "score cleared");
  }
  if (body.ticketUrl !== undefined) { updated.ticketUrl = body.ticketUrl?.trim() || undefined; changes.push("ticket"); }
  await store.putPrototype(updated);
  const user = await currentUser();
  const actor = viaToken ? "api-token" : (user?.name ?? user?.sub ?? "system");
  await audit(protoOrg, actor, "prototype.update", proto.name, changes.join(" · "));
  return NextResponse.json({ prototype: updated });
}

/** DELETE ?key=<key> → cascade-delete a prototype (overlay + versions + promotions). */
export async function DELETE(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
  const store = await getContentStore();
  const proto = await store.getPrototype(key);
  if (!proto) return NextResponse.json({ error: "Unknown prototype" }, { status: 404 });
  const delOrg = await resolvePrototypeOrg(proto);
  if (!delOrg || !(await canAccessOrg(delOrg))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await store.deletePrototype(key);
  const user = await currentUser();
  await audit(delOrg, user?.name ?? user?.sub ?? "system", "prototype.delete", proto.name, key);
  return NextResponse.json({ ok: true });
}
