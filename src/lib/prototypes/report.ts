/**
 * THE LEGACY PER-PROTOTYPE EMAIL SETTINGS — READ-ONLY, FOR MIGRATION.
 *
 * Superseded by Reports (src/lib/reports/, docs/REPORTS-DESIGN.md). Email is an
 * object you own now, not a setting on an experiment, and nothing schedules
 * these flags any more: `migrateReportsOnce()` reads them once into Report
 * records and the prototype's own panel edits the Report through
 * `reports/bridge.ts`.
 *
 * NOTHING MAY WRITE HERE AGAIN. Two stores over one audience is two schedulers
 * over one audience, which is the double-send. `scheduleDue()` was deleted with
 * the old sweep for the same reason — it also compared against today's DATE, so
 * moving a report's day mid-week sent it twice; the replacement keys on the ISO
 * week (src/lib/reports/cadence.ts).
 *
 * `SWEEP_HOUR_UTC` stays here because it is still the one place the send window
 * is written down.
 */
import { getContentStore } from "../content/store";

/**
 * WHEN THE SWEEP RUNS, and the only place that hour is written down.
 *
 * The schedule names a DAY, not an hour, because the platform cannot honour an
 * hour: Vercel's Hobby plan permits one cron run per day (an hourly expression
 * is rejected at deploy time, which is how this was found) and fires it
 * anywhere inside the hour. Offering a time picker over that would be a
 * promise the deployment cannot keep — and worse, a schedule set for any hour
 * after the sweep would have silently never sent.
 *
 * On Pro this becomes per-minute and the hour can come back. Change
 * `vercel.json` and this constant together; nothing else reads the sweep time.
 */
export const SWEEP_HOUR_UTC = 13;

export interface ReportSettings {
  recipients: string[];
  schedule?: {
    enabled: boolean;
    /** 0 = Sunday. The day the digest goes out, some time around SWEEP_HOUR_UTC. */
    day: number;
  };
  lastSentAt?: string;
  lastSentTo?: string[];
  /** THE WHOLE SEND FAILED — nothing left. */
  lastError?: string;
  /** SOME of them didn't go out. Kept apart from `lastError` because they are
   *  different facts with different responses: a whole-run failure means the
   *  report did not happen, a partial means it did and one person is missing.
   *  Both used to be written to `lastError`, so four of five delivered read as
   *  an outright failure and the report looked broken when it had worked. */
  lastPartial?: string;
}

const key = (k: string) => `report:${k}`;

export async function getReportSettings(prototypeKey: string): Promise<ReportSettings> {
  const raw = await (await getContentStore()).getFlag(key(prototypeKey));
  if (!raw) return { recipients: [] };
  try {
    const s = JSON.parse(raw) as ReportSettings;
    return { ...s, recipients: Array.isArray(s.recipients) ? s.recipients : [] };
  } catch {
    return { recipients: [] };
  }
}

/** CAS write — the schedule sweep and a human editing recipients are genuinely
 *  concurrent writers, and a lost recipient is a person who stops receiving. */
export async function mutateReportSettings(
  prototypeKey: string,
  fn: (cur: ReportSettings) => ReportSettings | null,
): Promise<ReportSettings> {
  const store = await getContentStore();
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await store.getFlag(key(prototypeKey));
    let cur: ReportSettings = { recipients: [] };
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as ReportSettings;
        if (parsed && typeof parsed === "object") cur = { ...parsed, recipients: Array.isArray(parsed.recipients) ? parsed.recipients : [] };
      } catch { /* corrupted → start clean */ }
    }
    const next = fn(cur);
    if (next === null) return cur;
    if (await store.compareAndSetFlag(key(prototypeKey), raw, JSON.stringify(next))) return next;
  }
  return getReportSettings(prototypeKey);
}

