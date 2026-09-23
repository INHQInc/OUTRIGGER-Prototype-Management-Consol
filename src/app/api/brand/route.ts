import { NextRequest, NextResponse } from "next/server";
import { getActiveOrgId } from "@/lib/active-org";
import { currentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";
import { brandStatus, saveBrandDraft, approveBrand, type BrandPatch } from "@/lib/brand/onboarding";

/**
 * The active customer's brand — the vocabulary and prose a person states about
 * it, which every prompt, branch, readout and email is written in.
 *
 *   GET            → { status }                     any member
 *   PATCH  {patch} → save the draft, { status }     admin
 *   POST   {approve: true} → make it live           admin
 *
 * Admin-only writes, matching every other screen that configures a customer
 * (repositories, experimentation). The words written here reach a customer's
 * live page, so who may change them is not looser than who may change a repo.
 */
export async function GET() {
  const orgId = await getActiveOrgId();
  if (!orgId) return NextResponse.json({ error: "No active customer." }, { status: 400 });
  return NextResponse.json({ status: await brandStatus(orgId) });
}

async function adminGuard() {
  const [user, orgId] = await Promise.all([currentUser(), getActiveOrgId()]);
  if (!user || user.role !== "admin") return { error: "Only an admin can change a customer's brand.", status: 403 as const };
  if (!orgId) return { error: "No active customer.", status: 400 as const };
  return { orgId, actor: user.name ?? user.sub };
}

export async function PATCH(req: NextRequest) {
  const g = await adminGuard();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  let body: { patch?: BrandPatch };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const status = await saveBrandDraft(g.orgId, body.patch ?? {}, g.actor);
  return NextResponse.json({ status });
}

export async function POST(req: NextRequest) {
  const g = await adminGuard();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  let body: { approve?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.approve) return NextResponse.json({ error: "Nothing to do." }, { status: 400 });

  const r = await approveBrand(g.orgId, g.actor);
  if (!r.ok) return NextResponse.json({ error: r.error, missing: r.missing }, { status: 400 });
  // Only a real change is recorded — an unchanged approve made no revision.
  if (r.changed) {
    await audit(g.orgId, g.actor, "brand.approve", "brand", `revision ${r.status.approved?.rev ?? "?"}`).catch(() => {});
  }
  return NextResponse.json({ status: r.status, changed: r.changed });
}
