/**
 * Persisted Brief ↔ Build drift state — the audit's verdict as GROUND TRUTH,
 * not throwaway client state. While an unresolved drift record exists:
 *   - the Brief step is blocked (red in the rail),
 *   - re-sync/provision refuses (it would write the known-wrong brief into
 *     the branch for the next agent session).
 * Resolution: the brief changes (fingerprint mismatch → auto-clear on PATCH),
 * a re-check comes back in sync, or a human dismisses it (audited).
 */
import { getContentStore } from "../content/store";
import type { BriefDriftReport } from "../ai/brief";
import type { PrototypeRecord } from "./types";

export interface BriefDriftRecord {
  report: BriefDriftReport;
  builtSha?: string;
  /** Content hash of the judged code — the audit's identity key. */
  codeHash?: string;
  checkedAt: string;
  checkedBy?: string;
  /** The exact brief the audit judged — if the live brief differs, the record is stale and auto-clears. */
  briefFingerprint: string;
}

const key = (prototypeKey: string) => `briefdrift:${prototypeKey}`;

export function briefFingerprint(p: Pick<PrototypeRecord, "brief" | "hypothesis" | "metrics">): string {
  return JSON.stringify({ brief: p.brief, hypothesis: p.hypothesis, metrics: p.metrics });
}

export async function getBriefDrift(prototypeKey: string, proto?: Pick<PrototypeRecord, "brief" | "hypothesis" | "metrics">): Promise<BriefDriftRecord | null> {
  const raw = await (await getContentStore()).getFlag(key(prototypeKey));
  if (!raw) return null;
  try {
    const rec = JSON.parse(raw) as BriefDriftRecord;
    // A drift verdict about a brief that has since changed is stale — clear it.
    if (proto && rec.briefFingerprint !== briefFingerprint(proto)) {
      await clearBriefDrift(prototypeKey);
      return null;
    }
    return rec;
  } catch { return null; }
}

export async function setBriefDrift(prototypeKey: string, rec: BriefDriftRecord): Promise<void> {
  await (await getContentStore()).setFlag(key(prototypeKey), JSON.stringify(rec));
}

export async function clearBriefDrift(prototypeKey: string): Promise<void> {
  await (await getContentStore()).setFlag(key(prototypeKey), "");
}
