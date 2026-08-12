/**
 * WHO GETS THE READOUT, AND WHEN.
 *
 * Per prototype: a recipient list and an opt-in weekly schedule. Off by
 * default and deliberately so — a digest that mails itself the moment an
 * experiment is bound would send "too early to call" every week until someone
 * found the switch, and the fastest way to make a report ignored is to send it
 * before it says anything.
 *
 * `lastSentAt` is the idempotence guard: cron granularity and retries both
 * mean a scheduled job can fire more than once in its window, and nobody
 * forgives a tool that mails the same report to their leadership twice.
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

/**
 * Is this schedule due right now?
 *
 * The right weekday, and not already sent today. There is deliberately NO hour
 * test: the sweep runs once a day, so gating on an hour could only ever make a
 * report late or — for any hour after the sweep — permanently unsent.
 *
 * "Already sent today" survives regardless: retries and a manual send both mean
 * the job can reach this twice, and nobody forgives a tool that mails the same
 * report to their leadership twice.
 */
export function scheduleDue(s: ReportSettings, now: Date): boolean {
  if (!s.schedule?.enabled) return false;
  if (!s.recipients.length) return false;
  if (now.getUTCDay() !== s.schedule.day) return false;
  const today = now.toISOString().slice(0, 10);
  return (s.lastSentAt ?? "").slice(0, 10) !== today;
}
