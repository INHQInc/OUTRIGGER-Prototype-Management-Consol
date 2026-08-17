import { NextRequest, NextResponse } from "next/server";
import { getContentStore } from "@/lib/content/store";
import { canAccessOrg } from "@/lib/active-org";
import { resolvePrototypeOrg } from "@/lib/prototypes/org";
import { getVerdict } from "@/lib/prototypes/verdict";
import { deriveNextTest } from "@/lib/prototypes/next-test";
import { buildReadoutModel } from "@/lib/prototypes/readout-model";
import { draftNextTest, type NextTestDraft } from "@/lib/ai/next-test";
import { getMetricMap } from "@/lib/prototypes/results";

export const dynamic = "force-dynamic";
// One model call, with a single retry when the first draft is refused.
export const maxDuration = 60;

const flagKey = (key: string) => `nexttest:${key}`;

async function guard(key: string) {
  const store = await getContentStore();
  const proto = await store.getPrototype(key);
  if (!proto) return { error: NextResponse.json({ error: "Unknown prototype" }, { status: 404 }) };
  const orgId = await resolvePrototypeOrg(proto);
  if (!orgId || !(await canAccessOrg(orgId))) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { store, proto, orgId };
}

/** GET — the draft already made for this run, if there is one. */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
  const g = await guard(key);
  if ("error" in g) return g.error;
  const raw = await g.store!.getFlag(flagKey(key)).catch(() => null);
  if (!raw) return NextResponse.json({ draft: null });
  try { return NextResponse.json({ draft: JSON.parse(raw) as NextTestDraft }); }
  catch { return NextResponse.json({ draft: null }); }
}

/**
 * POST — draft (or redraft) the follow-up for a concluded run.
 *
 * The figures are derived HERE, server-side, from the same readout model the
 * page renders. The client never supplies them: a drafting endpoint that
 * accepted numbers from the caller would let a stale or edited page put words
 * around figures nobody computed.
 */
export async function POST(req: NextRequest) {
  let body: { key?: string; correction?: string; current?: NextTestDraft };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.key) return NextResponse.json({ error: "key required" }, { status: 400 });

  const g = await guard(body.key);
  if ("error" in g) return g.error;
  const { store, proto } = g;

  const verdict = await getVerdict(proto!.key).catch(() => null);
  if (verdict?.state !== "stamped") {
    return NextResponse.json(
      { error: "This run isn't adjudicated yet — close it out first." },
      { status: 409 },
    );
  }
  const stats = verdict.frozenStats ?? null;
  if (!stats) return NextResponse.json({ error: "The stamped verdict carries no frozen statistics." }, { status: 409 });

  const metricMap = await getMetricMap(proto!.key).catch(() => null);
  const model = buildReadoutModel({
    prototypeName: proto!.name, prototypeKey: proto!.key,
    results: null, stats, verdict, reading: null,
    plan: metricMap ?? { composites: [], confirmed: false },
    // Left null on purpose: the model falls back to `stats.primaryKey`, which
    // is the frozen record of what this run was actually decided on. Passing a
    // reconstructed decision here would be a second, weaker source for a fact
    // the stamped verdict already holds.
    decision: null,
    observed: [], roles: {},
    order: metricMap?.measureOrder ?? [],
    hidden: [...new Set([...(metricMap?.unfeatured ?? []), ...(metricMap?.hiddenMeasures ?? [])])],
    experimentStatus: "concluded", now: Date.now(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const next = deriveNextTest(model.all, stats.power);
  const draft = await draftNextTest({
    next,
    parentKey: proto!.key,
    parentName: proto!.name,
    parentChange: proto!.brief?.change ?? "",
    parentHypothesis: proto!.hypothesis?.outcome ?? "",
    parentVerdict: verdict.verdict,
    correction: body.correction?.trim() || undefined,
    current: body.current,
  });

  if (!draft) {
    return NextResponse.json(
      { error: "Couldn't draft a follow-up. The figures are on the page regardless — they don't depend on this." },
      { status: 502 },
    );
  }
  await store!.setFlag(flagKey(proto!.key), JSON.stringify(draft)).catch(() => null);
  return NextResponse.json({ draft });
}
