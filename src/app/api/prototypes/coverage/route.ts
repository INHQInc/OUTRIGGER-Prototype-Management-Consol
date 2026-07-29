import { NextRequest, NextResponse } from "next/server";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { resolveRepoSource } from "@/lib/prototypes/source";
import { listArtifactVersions } from "@/lib/prototypes/versions";
import { generateCoverage } from "@/lib/ai/coverage";
import { getCoverage, setCoverage, coverageReviewed, coverageHasFailures, type CoverageSpec, type CoverageDevice, type CheckResult } from "@/lib/prototypes/coverage";
import { currentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";

export const maxDuration = 60;

const RESULTS = ["pass", "fail", "na"];

/**
 * GET  ?key=                       → the coverage spec (or null)
 * POST { key, generate: true }     → derive scenarios from brief + built code
 *                                    (session-only; existing RESULTS carried
 *                                    over by scenario id where they survive)
 * POST { key, results: {...} }     → save review results (per scenario × device)
 */
export async function GET(req: NextRequest) {
  const g = await guardPrototypeAccess(req.nextUrl.searchParams.get("key"), req.headers.get("authorization"));
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  return NextResponse.json({ coverage: await getCoverage(g.proto.key) });
}

export async function POST(req: NextRequest) {
  let body: { key?: string; generate?: boolean; results?: Record<string, Record<string, string>> };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  // Session-only: generation spends API credit; results are human review acts.
  const g = await guardPrototypeAccess(body.key ?? null, req.headers.get("authorization"), { tokenAllowed: false });
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const user = await currentUser();
  const actor = user?.name ?? user?.sub ?? "user";

  try {
    if (body.generate) {
      const source = await resolveRepoSource(g.proto.key).catch(() => null);
      let variationJs = source?.found ? source.variationJs : undefined;
      let builtSha = source?.headSha;
      if (!variationJs) {
        const latest = (await listArtifactVersions(g.proto.key))[0];
        variationJs = latest?.variationJs;
        builtSha = latest?.gitSha;
      }
      if (!variationJs) return NextResponse.json({ error: "Nothing built yet — coverage is derived from the built code." }, { status: 400 });

      const scenarios = await generateCoverage({ proto: g.proto, variationJs, builtSha });
      // Carry review results forward where scenario ids survived regeneration —
      // but only for devices the NEW scenario still lists, or an orphaned
      // result (invisible in the UI) could wedge the gate at "failing".
      const prev = await getCoverage(g.proto.key);
      const results: CoverageSpec["results"] = {};
      if (prev) for (const s of scenarios) {
        const old = prev.results[s.id];
        if (!old) continue;
        const kept: CoverageSpec["results"][string] = {};
        for (const d of s.devices) { if (old[d]) kept[d] = old[d]; }
        if (Object.keys(kept).length) results[s.id] = kept;
      }
      const spec: CoverageSpec = { scenarios, generatedAt: new Date().toISOString(), generatedBy: actor, builtSha, results };
      await setCoverage(g.proto.key, spec);
      const gaps = scenarios.filter((s) => s.gap).length;
      await audit(g.orgId, actor, "coverage.generated", g.proto.name,
        `${scenarios.length} scenarios${gaps ? ` · ${gaps} GAP${gaps === 1 ? "" : "S"} (unhandled by the build)` : ""}${builtSha ? ` · vs ${builtSha.slice(0, 7)}` : ""}`);
      return NextResponse.json({ coverage: spec });
    }

    if (body.results) {
      const spec = await getCoverage(g.proto.key);
      if (!spec) return NextResponse.json({ error: "No coverage spec yet — generate it first." }, { status: 400 });
      const byId = new Map(spec.scenarios.map((s) => [s.id, s]));
      const wasReviewed = coverageReviewed(spec);
      for (const [sid, byDevice] of Object.entries(body.results)) {
        const scenario = byId.get(sid);
        if (!scenario || !byDevice || typeof byDevice !== "object") continue;
        spec.results[sid] = spec.results[sid] ?? {};
        for (const [dev, val] of Object.entries(byDevice)) {
          // Valid only for devices THIS scenario lists — a result on any other
          // device would be invisible in the UI and unclearable.
          if (!scenario.devices.includes(dev as CoverageDevice)) continue;
          if (val === "") delete spec.results[sid][dev as CoverageDevice];
          else if (RESULTS.includes(val)) spec.results[sid][dev as CoverageDevice] = val as CheckResult;
        }
      }
      await setCoverage(g.proto.key, spec);
      if (!wasReviewed && coverageReviewed(spec)) {
        await audit(g.orgId, actor, "coverage.reviewed", g.proto.name,
          coverageHasFailures(spec) ? "all core scenarios reviewed — WITH FAILURES" : "all core scenarios reviewed · pass");
      }
      return NextResponse.json({ coverage: spec });
    }

    return NextResponse.json({ error: "Nothing to do — pass generate or results." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
