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

export interface ReportSettings {
  recipients: string[];
  schedule?: {
    enabled: boolean;
    /** 0 = Sunday. The day the digest goes out. */
    day: number;
    /** UTC hour, 0–23. Kept in UTC because cron is. */
    hour: number;
  };
  lastSentAt?: string;
  lastSentTo?: string[];
  lastError?: string;
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
 * True only on the right weekday, at or after the chosen hour, and not already
 * sent today. The "already sent today" check is what makes an hourly sweep
 * safe: the job can run sixty times and the report leaves once.
 */
export function scheduleDue(s: ReportSettings, now: Date): boolean {
  if (!s.schedule?.enabled) return false;
  if (!s.recipients.length) return false;
  if (now.getUTCDay() !== s.schedule.day) return false;
  if (now.getUTCHours() < s.schedule.hour) return false;
  const today = now.toISOString().slice(0, 10);
  return (s.lastSentAt ?? "").slice(0, 10) !== today;
}
