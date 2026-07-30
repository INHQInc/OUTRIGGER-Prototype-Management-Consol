import { NextRequest, NextResponse } from "next/server";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { runBriefAudit, setBriefAuditMarker, auditTargetCode } from "@/lib/prototypes/brief-audit";
import { getBriefDrift, clearBriefDrift, briefFingerprint } from "@/lib/prototypes/brief-drift-state";
import { resolveRepoSource } from "@/lib/prototypes/source";
import { listArtifactVersions } from "@/lib/prototypes/versions";
import { currentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";

export const maxDuration = 60;

/** The code the audit system currently considers "the build" — for markers. */
async function currentTarget(key: string): Promise<{ codeHash?: string; sha?: string }> {
  const source = await resolveRepoSource(key).catch(() => null);
  const latest = (await listArtifactVersions(key).catch(() => []))[0];
  return auditTargetCode(source, latest);
}

/**
 * POST { key }                 → AI drift audit vs the BUILT code (forced —
 *                                an explicit human ask always runs, marker or
 *                                not). The verdict PERSISTS: drifted → stored
 *                                (blocks re-sync + cut, reds the rail) until
 *                                resolved; in-sync → clears. The console also
 *                                runs this audit BY ITSELF whenever it sees an
 *                                unjudged build (lib/prototypes/brief-audit).
 * POST { key, applied: true }  → the human saved the audit's OWN suggested
 *                                brief: record the pair as judged-in-sync
 *                                WITHOUT re-running the LLM. Applying the
 *                                audit's remedy must close the loop
 *                                deterministically — re-judging it invites
 *                                verdict noise to reopen it forever.
 * POST { key, dismiss: true }  → human overrides: "the brief is accurate."
 *                                Audited; clears the block. The audit marker
 *                                stays, so the dismissal stands until the
 *                                build or the brief actually changes.
 * Session-only — spends console-level API credit.
 */
export async function POST(req: NextRequest) {
  let body: { key?: string; dismiss?: boolean; applied?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const g = await guardPrototypeAccess(body.key ?? null, req.headers.get("authorization"), { tokenAllowed: false });
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const user = await currentUser();
  const actor = user?.name ?? user?.sub ?? "user";

  try {
    if (body.dismiss) {
      // Write the marker for the dismissed pair FIRST — without it (legacy
      // records, partial writes) the next page view would re-audit the same
      // pair and silently reinstate the block the human just dismissed.
      const rec = await getBriefDrift(g.proto.key);
      if (rec) {
        // Key the marker to the AUDITED build. Legacy records lack codeHash:
        // use the current build's hash only when it IS the audited build
        // (same sha); never inoculate newer code the record didn't judge. A
        // codeHash-less marker still holds while the brief is unchanged
        // (briefAuditNeeded's migration rule), so the dismissal stands.
        let codeHash = rec.codeHash;
        if (!codeHash && rec.builtSha) {
          const target = await currentTarget(g.proto.key);
          if (target.sha === rec.builtSha) codeHash = target.codeHash;
        }
        await setBriefAuditMarker(g.proto.key, {
          codeHash, builtSha: rec.builtSha ?? "", briefFingerprint: rec.briefFingerprint,
          inSync: false, checkedAt: new Date().toISOString(), checkedBy: actor,
        });
      }
      await clearBriefDrift(g.proto.key);
      await audit(g.orgId, actor, "brief.drift-dismissed", g.proto.name, "human confirmed the brief is accurate despite the audit");
      return NextResponse.json({ ok: true });
    }

    if (body.applied) {
      // "The saved brief is the audit's remedy" is VERIFIED, never trusted:
      // the marker is written only when the saved design fields actually
      // equal the drift record's suggestion, and it is keyed to the AUDITED
      // build (rec.codeHash), not whatever is at HEAD now. Anything else —
      // record gone, hand-edits beyond the suggestion, build moved — skips
      // the marker and lets the auto-audit judge for real. Skipping is the
      // safe default; stamping in-sync unverified would blind the system.
      const rec = await getBriefDrift(g.proto.key);
      const s = rec?.report.suggested;
      const b = g.proto.brief;
      const matches = Boolean(s)
        && (!s!.change || b.change === s!.change)
        && (!s!.where || (b.where ?? "") === s!.where)
        && (!s!.doneLooksLike.length || (b.doneLooksLike ?? "") === s!.doneLooksLike.join("\n"));
      if (rec && matches && rec.codeHash) {
        await setBriefAuditMarker(g.proto.key, {
          codeHash: rec.codeHash, builtSha: rec.builtSha ?? "",
          briefFingerprint: briefFingerprint(g.proto),
          inSync: true, checkedAt: new Date().toISOString(), checkedBy: `${actor} (applied audit suggestion)`,
        });
        await clearBriefDrift(g.proto.key);
        await audit(g.orgId, actor, "brief.drift-resolved", g.proto.name, "brief updated to match the build (audit suggestion applied, verified)");
        return NextResponse.json({ ok: true, marked: true });
      }
      // Not verifiable — the auto-audit remains the judge.
      return NextResponse.json({ ok: true, marked: false });
    }

    const outcome = await runBriefAudit(g.proto, { actor, force: true });
    if (!outcome.ran) {
      const msg = outcome.reason === "nothing-built"
        ? "Nothing built yet — there's no code to compare the brief against."
        : outcome.reason === "source-unavailable"
          ? "Couldn't read the branch right now (repo unreachable) — try again in a moment."
          : "The brief is incomplete — describe the change and set a decision metric first.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ report: outcome.report, builtSha: outcome.builtSha });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
