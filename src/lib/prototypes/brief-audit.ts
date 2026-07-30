/**
 * Self-aware Brief ↔ Build auditing. The console does not trust anyone —
 * agent or human — to remember the drift check: it audits by itself whenever
 * it becomes aware of a build it has never judged against the current brief
 * (workspace view via after(), and synchronously as the cut gate).
 *
 * Cost discipline: the audit is an LLM call, so it runs ONCE per
 * (builtSha, briefFingerprint) pair. The marker below remembers EVERY verdict
 * — in-sync included — while brief-drift-state keeps only the blocking
 * drifted record. A dismissed drift writes its own marker, so dismissal
 * stands until the build or the brief actually changes. A short-lived lock
 * stops concurrent page views from stampeding the same audit.
 */
import { createHash } from "crypto";
import { getContentStore } from "../content/store";
import { resolveRepoSource } from "./source";
import { resolvePrototypeOrg } from "./org";
import { checkBriefDrift, type BriefDriftReport } from "../ai/brief";
import { setBriefDrift, clearBriefDrift, briefFingerprint } from "./brief-drift-state";
import { isBriefComplete, type PrototypeRecord } from "./types";
import { audit } from "../audit";

/**
 * The audit judges CODE against BRIEF, so its identity key is a hash of the
 * code CONTENT — never the branch sha. A console re-sync commits `.opmc/**`
 * and moves HEAD without touching dist/variation.js; keying by sha made every
 * sync invalidate the verdict (audit → brief fix → sync → new sha → re-audit
 * → forever). Content hashing ends that loop.
 */
export function codeHashOf(variationJs: string): string {
  return createHash("sha256").update(variationJs).digest("hex").slice(0, 16);
}

export interface BriefAuditMarker {
  /** Content hash of the judged code — the identity key. */
  codeHash?: string;
  /** The sha it was judged at — display only. */
  builtSha: string;
  briefFingerprint: string;
  inSync: boolean;
  checkedAt: string;
  checkedBy?: string;
}

const markerKey = (k: string) => `briefaudit:${k}`;
const lockKey = (k: string) => `briefaudit:lock:${k}`;
const LOCK_TTL_MS = 3 * 60 * 1000;

export async function getBriefAuditMarker(prototypeKey: string): Promise<BriefAuditMarker | null> {
  const raw = await (await getContentStore()).getFlag(markerKey(prototypeKey));
  if (!raw) return null;
  try { return JSON.parse(raw) as BriefAuditMarker; } catch { return null; }
}

export async function setBriefAuditMarker(prototypeKey: string, marker: BriefAuditMarker): Promise<void> {
  await (await getContentStore()).setFlag(markerKey(prototypeKey), JSON.stringify(marker));
}

/**
 * The code an audit would judge — ONE rule shared by the runner and every
 * trigger, or they disagree forever (a trigger comparing the marker against a
 * key the runner will never write re-queues a no-op audit on every view).
 * Mirrors the runner exactly: the branch artifact when it EXISTS at HEAD,
 * else the newest cut — and only if that cut carries code.
 */
export function auditTargetCode(
  source: { found?: boolean | null; headSha?: string; variationJs?: string } | null | undefined,
  latestVersion: { gitSha: string; variationJs?: string } | undefined,
): { codeHash?: string; sha?: string } {
  if (source?.found && source.variationJs) return { codeHash: codeHashOf(source.variationJs), sha: source.headSha };
  if (latestVersion?.variationJs) return { codeHash: codeHashOf(latestVersion.variationJs), sha: latestVersion.gitSha };
  return {};
}

/** TRUE when the current (code, brief) pair has no recorded verdict yet. */
export function briefAuditNeeded(marker: BriefAuditMarker | null, codeHash: string | undefined, fingerprint: string): boolean {
  if (!codeHash) return false; // nothing built — nothing to judge
  if (!marker) return true;
  // Migration: markers written before code-hash keying lack codeHash. Treat
  // them as valid while the BRIEF is unchanged — invalidating them wholesale
  // would re-judge (and possibly overturn) every pre-deploy verdict and
  // dismissal. The first real brief or code change re-keys naturally.
  if (!marker.codeHash) return marker.briefFingerprint !== fingerprint;
  return marker.codeHash !== codeHash || marker.briefFingerprint !== fingerprint;
}

export type BriefAuditOutcome =
  | { ran: false; reason: "nothing-built" | "source-unavailable" | "brief-incomplete" | "already-audited" | "locked" }
  | { ran: true; report: BriefDriftReport; builtSha?: string };

/**
 * Run the Brief ↔ Build audit and persist the verdict: drifted → blocking
 * record (reds the rail, refuses re-sync and cuts) + marker; in-sync →
 * clears the block + marker. Safe to call opportunistically — it no-ops when
 * the pair is already judged, the brief is incomplete, nothing is built, or
 * another instance holds the lock.
 *
 * `force` (an explicit ask: the human's Re-check button, the cut gate)
 * bypasses the marker, the lock, and the completeness check — it always
 * runs and its verdict always persists. `build` lets the caller pin the
 * EXACT code to judge (the cut gate passes what it is about to freeze, so
 * the verdict can't be about a different commit than the cut).
 */
export async function runBriefAudit(
  proto: PrototypeRecord,
  opts: { actor?: string; force?: boolean; build?: { variationJs: string; builtSha?: string } } = {},
): Promise<BriefAuditOutcome> {
  // Auto runs skip incomplete briefs (drift is meaningless without a spec);
  // a forced run honors the explicit ask — the audit itself doesn't need
  // completeness, and the old manual behavior audited any brief with code.
  if (!opts.force && !isBriefComplete(proto.brief, proto.metrics)) return { ran: false, reason: "brief-incomplete" };

  let variationJs = opts.build?.variationJs;
  let builtSha = opts.build?.builtSha;
  if (!variationJs) {
    // "GitHub is down" and "the branch has no built artifact" are different
    // states: only the latter may fall back to the newest cut. Degrading to
    // an old cut on a transient failure would let a background run persist a
    // blocking verdict about code that is NOT the build.
    let sourceFailed = false;
    const source = await resolveRepoSource(proto.key).catch(() => { sourceFailed = true; return null; });
    variationJs = source?.found ? source.variationJs : undefined;
    builtSha = source?.found ? source.headSha : undefined;
    if (!variationJs) {
      if (sourceFailed) return { ran: false, reason: "source-unavailable" };
      const latest = (await (await getContentStore()).listArtifactVersions(proto.key))[0];
      variationJs = latest?.variationJs;
      builtSha = latest?.gitSha;
    }
  }
  if (!variationJs) return { ran: false, reason: "nothing-built" };

  const fp = briefFingerprint(proto);
  const codeHash = codeHashOf(variationJs);
  const store = await getContentStore();
  // Snapshot for the post-LLM supersession check below — EVERY run takes it.
  const before = await getBriefAuditMarker(proto.key);
  if (!opts.force) {
    if (!briefAuditNeeded(before, codeHash, fp)) return { ran: false, reason: "already-audited" };
    // Best-effort lock (the flag store has no CAS): it stops page-view
    // stampedes; a rare double-run costs one duplicate LLM call, nothing more.
    const lockRaw = await store.getFlag(lockKey(proto.key));
    if (lockRaw && Date.now() - new Date(lockRaw).getTime() < LOCK_TTL_MS) return { ran: false, reason: "locked" };
  }
  // A FAILED run KEEPS the lock (no finally-release): the TTL becomes the
  // retry throttle. Setup mode re-arms the audit on a ~15s poll — a
  // persistently failing LLM call (bad key, provider outage) must dampen to
  // once per TTL, not be re-billed on every tick. Successful paths release
  // explicitly below.
  await store.setFlag(lockKey(proto.key), new Date().toISOString());

  const orgId = await resolvePrototypeOrg(proto);
  const actor = opts.actor ?? "console (auto-audit)";
  const report = await checkBriefDrift({ orgId: orgId ?? "", proto, variationJs, builtSha });

  // Supersession check: if ANY marker landed while the LLM was thinking —
  // a newer verdict, a dismissal, the cut gate's forced run — that
  // conclusion is newer than this one and wins; drop this persist (the
  // caller still gets the report). Pair-matching is not enough: a slow run
  // judging sha A must also yield to a verdict about sha B. A sub-second
  // window remains (no CAS on the flag store); the cut gate compensates by
  // gating on its own returned verdict, not on what got persisted.
  const now = await getBriefAuditMarker(proto.key);
  if (JSON.stringify(now) !== JSON.stringify(before)) {
    await store.setFlag(lockKey(proto.key), "");
    return { ran: true, report, builtSha };
  }

  if (report.inSync) {
    await clearBriefDrift(proto.key);
  } else {
    await setBriefDrift(proto.key, { report, builtSha, codeHash, checkedAt: new Date().toISOString(), checkedBy: actor, briefFingerprint: fp });
  }
  await setBriefAuditMarker(proto.key, { codeHash, builtSha: builtSha ?? "", briefFingerprint: fp, inSync: report.inSync, checkedAt: new Date().toISOString(), checkedBy: actor });
  await audit(orgId ?? "", actor, "brief.drift-check", proto.name,
    `${report.inSync ? "IN SYNC" : `DRIFTED · ${report.mismatches.length} mismatch${report.mismatches.length === 1 ? "" : "es"} · blocks re-sync + cut until resolved`}${builtSha ? ` · vs ${builtSha.slice(0, 7)}` : ""}`);
  await store.setFlag(lockKey(proto.key), "");
  return { ran: true, report, builtSha };
}
