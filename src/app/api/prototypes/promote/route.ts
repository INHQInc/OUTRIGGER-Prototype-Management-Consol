import { NextRequest, NextResponse } from "next/server";
import { getContentStore } from "@/lib/content/store";
import { canAccessOrg } from "@/lib/active-org";
import { resolvePrototypeOrg } from "@/lib/prototypes/org";
import { currentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";
import { getVerdict } from "@/lib/prototypes/verdict";
import type { PrototypeRecord } from "@/lib/prototypes/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/prototypes/promote — turn a concluded run into the next one.
 *
 * THE POINT IS THE PRE-FILL, NOT THE SHORTCUT. Today a follow-up is created by
 * hand and its brief and decision metric are written from memory, days later,
 * usually after someone has already seen data. That is the exact order the
 * verdict engine exists to prevent. Promoting carries the primary metric and
 * the guardrails ACROSS at the moment they were computed, before anyone has
 * looked at anything, so the discipline is what gets automated rather than the
 * guesswork.
 *
 * IT REFUSES AN UNSTAMPED PARENT. Building the next test on a run nobody has
 * adjudicated means inheriting a conclusion that was never agreed — the same
 * sloppiness, one step earlier.
 *
 * IT LANDS AT BRIEF. The child is created as a draft with no branch, no
 * binding and no version. Every gate then applies to it exactly as it would to
 * a prototype someone typed in by hand: promote is a head start, not a bypass.
 */
export async function POST(req: NextRequest) {
  let body: {
    parentKey?: string;
    name?: string;
    change?: string;
    hypothesis?: string;
    primaryMetric?: string;
    guardrails?: string[];
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.parentKey) return NextResponse.json({ error: "parentKey required" }, { status: 400 });

  const store = await getContentStore();
  const parent = await store.getPrototype(body.parentKey);
  if (!parent) return NextResponse.json({ error: "Unknown prototype" }, { status: 404 });

  const orgId = await resolvePrototypeOrg(parent);
  if (!orgId || !(await canAccessOrg(orgId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const verdict = await getVerdict(parent.key).catch(() => null);
  if (verdict?.state !== "stamped") {
    return NextResponse.json(
      { error: "The parent run isn't adjudicated yet — close it out before planning what follows it." },
      { status: 409 },
    );
  }

  const name = (body.name ?? "").trim() || `${parent.name} — follow-up`;
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "follow-up";
  let key = base;
  for (let n = 2; await store.getPrototype(key); n++) key = `${base}-${n}`;

  const now = new Date().toISOString();
  const child: PrototypeRecord = {
    key,
    orgId,
    siteKey: parent.siteKey,
    name,
    // Where it is built follows the parent — a follow-up to an Optimizely-built
    // test is another Optimizely-built test.
    buildMode: parent.buildMode,
    repo: parent.repo,
    status: "draft",
    // The pages carry over; the follow-up is a change to the same surfaces
    // unless someone says otherwise. Injection state does NOT carry — that is
    // ground truth about a build this prototype does not have yet.
    targets: parent.targets.map((t) => ({ url: t.url, source: t.source })),
    brief: { ...parent.brief, change: (body.change ?? "").trim() || "" },
    hypothesis: {
      change: (body.change ?? "").trim() || "",
      audience: parent.hypothesis?.audience ?? "",
      outcome: (body.hypothesis ?? "").trim(),
      rationale: `Promoted from "${parent.name}" after it was adjudicated.`,
    },
    metrics: {
      primary: (body.primaryMetric ?? "").trim(),
      guardrails: (body.guardrails ?? []).map((g) => g.trim()).filter(Boolean),
    },
    owner: parent.owner,
    parentKey: parent.key,
    createdAt: now,
    updatedAt: now,
  };

  await store.putPrototype(child);
  const user = await currentUser().catch(() => null);
  await audit(
    orgId,
    user?.name ?? user?.sub ?? "system",
    "prototype.promote",
    name,
    `promoted from ${parent.name} · primary "${child.metrics.primary || "(unset)"}" · ${child.metrics.guardrails.length} guardrail(s)`,
  ).catch(() => null);

  return NextResponse.json({ key, name, parentKey: parent.key });
}
