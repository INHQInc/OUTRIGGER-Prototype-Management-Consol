import { NextRequest, NextResponse } from "next/server";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { resolveRepoSource } from "@/lib/prototypes/source";
import { listArtifactVersions } from "@/lib/prototypes/versions";
import { checkBriefDrift } from "@/lib/ai/brief";
import { currentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";

export const maxDuration = 60;

/**
 * POST { key } → AI drift audit: does the brief still describe the BUILT code?
 * Audits against the branch HEAD build (what review shows), falling back to
 * the latest cut. Session-only — spends console-level API credit.
 */
export async function POST(req: NextRequest) {
  let body: { key?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const g = await guardPrototypeAccess(body.key ?? null, req.headers.get("authorization"), { tokenAllowed: false });
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  try {
    const source = await resolveRepoSource(g.proto.key).catch(() => null);
    let variationJs = source?.found ? source.variationJs : undefined;
    let builtSha = source?.headSha;
    if (!variationJs) {
      const latest = (await listArtifactVersions(g.proto.key))[0];
      variationJs = latest?.variationJs;
      builtSha = latest?.gitSha;
    }
    if (!variationJs) return NextResponse.json({ error: "Nothing built yet — there's no code to compare the brief against." }, { status: 400 });

    const report = await checkBriefDrift({ orgId: g.orgId, proto: g.proto, variationJs, builtSha });
    const user = await currentUser();
    await audit(g.orgId, user?.name ?? user?.sub ?? "user", "brief.drift-check", g.proto.name,
      `${report.inSync ? "IN SYNC" : `DRIFTED · ${report.mismatches.length} mismatch${report.mismatches.length === 1 ? "" : "es"}`}${builtSha ? ` · vs ${builtSha.slice(0, 7)}` : ""}`);
    return NextResponse.json({ report, builtSha });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
