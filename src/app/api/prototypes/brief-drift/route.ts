import { NextRequest, NextResponse } from "next/server";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { resolveRepoSource } from "@/lib/prototypes/source";
import { listArtifactVersions } from "@/lib/prototypes/versions";
import { checkBriefDrift } from "@/lib/ai/brief";
import { setBriefDrift, clearBriefDrift, briefFingerprint } from "@/lib/prototypes/brief-drift-state";
import { currentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";

export const maxDuration = 60;

/**
 * POST { key }                 → AI drift audit vs the BUILT code. The verdict
 *                                PERSISTS: drifted → stored (blocks re-sync,
 *                                reds the rail) until resolved; in-sync → clears.
 * POST { key, dismiss: true }  → human overrides: "the brief is accurate."
 *                                Audited; clears the block.
 * Session-only — spends console-level API credit.
 */
export async function POST(req: NextRequest) {
  let body: { key?: string; dismiss?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const g = await guardPrototypeAccess(body.key ?? null, req.headers.get("authorization"), { tokenAllowed: false });
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const user = await currentUser();
  const actor = user?.name ?? user?.sub ?? "user";

  try {
    if (body.dismiss) {
      await clearBriefDrift(g.proto.key);
      await audit(g.orgId, actor, "brief.drift-dismissed", g.proto.name, "human confirmed the brief is accurate despite the audit");
      return NextResponse.json({ ok: true });
    }

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
    if (report.inSync) {
      await clearBriefDrift(g.proto.key);
    } else {
      await setBriefDrift(g.proto.key, {
        report, builtSha, checkedAt: new Date().toISOString(), checkedBy: actor,
        briefFingerprint: briefFingerprint(g.proto),
      });
    }
    await audit(g.orgId, actor, "brief.drift-check", g.proto.name,
      `${report.inSync ? "IN SYNC" : `DRIFTED · ${report.mismatches.length} mismatch${report.mismatches.length === 1 ? "" : "es"} · blocks re-sync until resolved`}${builtSha ? ` · vs ${builtSha.slice(0, 7)}` : ""}`);
    return NextResponse.json({ report, builtSha });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
