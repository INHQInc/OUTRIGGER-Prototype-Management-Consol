import { NextRequest, NextResponse } from "next/server";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { getOptimizelyClientForOrg, getExperimentationConfig, setDefaultProject } from "@/lib/experimentation";
import { getContentStore } from "@/lib/content/store";
import { listArtifactVersions } from "@/lib/prototypes/versions";
import { currentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";

/**
 * The Experimentation room's data source.
 *
 * GET ?key=                      → the project's experiments
 * GET ?key=&experimentId=        → that experiment's variations
 * GET ?key=&projects=1           → projects the token can reach + the default
 * POST { key, setProjectId }     → change the brand's default project
 * POST { key, create: { name } } → create a PAUSED draft A/B experiment from
 *   this prototype (URL targeting from its first target page, Original vs
 *   Variation #1 at 50/50, latest cut as custom code) and bind it. No traffic
 *   goes live — a human starts it in Optimizely.
 */
export async function GET(req: NextRequest) {
  const g = await guardPrototypeAccess(req.nextUrl.searchParams.get("key"), req.headers.get("authorization"));
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const client = await getOptimizelyClientForOrg(g.orgId);
  if (!client) return NextResponse.json({ error: "Optimizely isn't connected for this customer (Settings → Experimentation)." }, { status: 400 });
  try {
    if (req.nextUrl.searchParams.get("projects")) {
      const [projects, cfg] = await Promise.all([client.listProjects(), getExperimentationConfig(g.orgId)]);
      return NextResponse.json({
        projects: projects.filter((p) => p.status !== "archived").map((p) => ({ id: String(p.id), name: p.name, platform: p.platform })),
        defaultProjectId: cfg?.optimizely?.defaultProjectId ?? null,
      });
    }
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

export async function POST(req: NextRequest) {
  let body: { key?: string; setProjectId?: string; create?: { name?: string } };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const g = await guardPrototypeAccess(body.key ?? null, req.headers.get("authorization"));
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const user = await currentUser();
  const actor = g.viaToken ? "claude (api)" : user?.name ?? user?.sub ?? "user";

  try {
    if (body.setProjectId) {
      // Org-level config change — same gate as Settings → Experimentation:
      // admin session only. The org API token can never change configuration.
      if (g.viaToken || !user || user.role !== "admin") {
        return NextResponse.json({ error: "Only an admin can change the brand's Optimizely project (Settings → Experimentation)." }, { status: 403 });
      }
      await setDefaultProject(g.orgId, String(body.setProjectId));
      await audit(g.orgId, actor, "experiment.project", g.proto.name, `default project → ${body.setProjectId}`);
      return NextResponse.json({ ok: true, defaultProjectId: String(body.setProjectId) });
    }

    if (body.create) {
      const name = body.create.name?.trim();
      if (!name) return NextResponse.json({ error: "The experiment needs a name." }, { status: 400 });
      const client = await getOptimizelyClientForOrg(g.orgId);
      if (!client) return NextResponse.json({ error: "Optimizely isn't connected (Settings → Experimentation)." }, { status: 400 });

      const store = await getContentStore();
      const proto = await store.getPrototype(g.proto.key);
      if (!proto) return NextResponse.json({ error: "Unknown prototype" }, { status: 404 });
      const target = proto.targets[0];
      if (!target?.url) return NextResponse.json({ error: "Add a target page first (Review) — the experiment needs URL targeting." }, { status: 400 });

      let pathSubstring: string;
      try { pathSubstring = new URL(target.url).pathname; } catch { return NextResponse.json({ error: `Target URL is invalid: ${target.url}` }, { status: 400 }); }

      // Seed only code that could also pass the push gate: a failed cert never
      // leaves the console via create either (someone WILL start what they find).
      const latest = (await listArtifactVersions(proto.key))[0];
      const certFailed = Boolean(latest?.certification && !latest.certification.passed);
      const seedable = latest?.variationJs && !certFailed;
      const variationJs = seedable
        ? latest!.variationJs!
        : certFailed
          ? `/* ${proto.key}: v${latest!.version} FAILED certification — fix, re-cut, then push. Not seeded. */`
          : `/* ${proto.key}: no version cut yet — push v1 after cutting to replace this placeholder. */`;

      const page = await client.createPage(`${proto.name} — page`, target.url, pathSubstring);
      const description = (proto.brief.change || proto.hypothesis.change || proto.name).slice(0, 900);
      const exp = await client.createDraftExperiment({ name, description, pageId: page.id, variantName: "Variation #1", variationJs });
      const variation = (exp.variations ?? []).find((v) => v.name !== "Original") ?? exp.variations?.[1];
      if (!variation) return NextResponse.json({ error: "Optimizely created the experiment but returned no variation — bind it manually." }, { status: 502 });

      proto.experiment = {
        experimentId: String(exp.id),
        variationId: String(variation.variation_id),
        experimentName: exp.name,
        variationName: variation.name,
        boundAt: new Date().toISOString(),
        boundBy: actor,
      };
      proto.updatedAt = new Date().toISOString();
      await store.putPrototype(proto);
      await audit(g.orgId, actor, "experiment.create", proto.name, `"${name}" (${exp.id}) · paused draft · page ${page.id}${seedable ? ` · seeded v${latest!.version}` : certFailed ? ` · NOT seeded (v${latest!.version} cert failed)` : " · placeholder"}`);

      return NextResponse.json({
        experiment: { id: String(exp.id), name: exp.name, status: exp.status },
        binding: proto.experiment,
        seededVersion: seedable ? latest!.version : null,
        certBlocked: certFailed || undefined,
      });
    }

    return NextResponse.json({ error: "Nothing to do — pass setProjectId or create." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
