import { NextRequest, NextResponse } from "next/server";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { getOptimizelyClientForOrg } from "@/lib/experimentation";

/**
 * GET ?key=<prototypeKey>[&experimentId=] — the binding picker's data source.
 * Without experimentId: the project's experiments. With: that experiment's
 * variations (id, name, whether it already has custom code).
 */
export async function GET(req: NextRequest) {
  const g = await guardPrototypeAccess(req.nextUrl.searchParams.get("key"), req.headers.get("authorization"));
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const client = await getOptimizelyClientForOrg(g.orgId);
  if (!client) return NextResponse.json({ error: "Optimizely isn't connected for this customer (Settings → Experimentation)." }, { status: 400 });
  try {
    const experimentId = req.nextUrl.searchParams.get("experimentId");
    if (!experimentId) {
      const experiments = await client.listExperiments();
      return NextResponse.json({ experiments: experiments.map((e) => ({ id: String(e.id), name: e.name, status: e.status })) });
    }
    const exp = await client.getExperiment(experimentId);
    return NextResponse.json({
      experiment: { id: String(exp.id), name: exp.name, status: exp.status },
      variations: (exp.variations ?? []).map((v) => ({
        id: String(v.variation_id),
        name: v.name,
        hasCustomCode: (v.actions ?? []).some((a) => (a.changes ?? []).some((c) => c.type === "custom_code")),
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
