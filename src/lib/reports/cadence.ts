/**
 * WHEN A REPORT IS DUE, and the guarantee that it goes out once.
 *
 * Pure functions over a clock the caller passes, so the sweep's decision can be
 * tested without waiting for Thursday.
 */
import type { Report } from "./types";
import { DAY_NAMES } from "./types";

/**
 * ISO-8601 week, e.g. "2026-W33". THE IDEMPOTENCE KEY.
 *
 * Not the date. The old per-prototype schedule compared `lastSentAt` to today,
 * which is correct only while the day never changes: move a weekly report from
 * Monday to Thursday on a Wednesday and the date check sees "not sent today"
 * and mails a second copy in the same week. A week key cannot do that.
 */
export function isoWeek(d: Date): string {
  // Thursday of the current week determines the year an ISO week belongs to.
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (t.getUTCDay() + 6) % 7; // Monday = 0
  t.setUTCDate(t.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((t.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export type Dueness =
  | { due: false; why: string }
  | { due: true; late: boolean; periodKey: string };

/**
 * Is this report due right now?
 *
 * Every negative answer carries its reason, because "the report didn't send"
 * is the question this system will be asked most, and a boolean cannot answer
 * it. The sweep puts these straight into its response.
 */
export function reportDue(r: Report, now: Date, receivingCount: number): Dueness {
  if (!r.enabled) return { due: false, why: "paused" };
  if (r.cadence.kind !== "weekly") return { due: false, why: "manual only" };
  if (receivingCount === 0) return { due: false, why: "no one on the audience is receiving" };

  const periodKey = isoWeek(now);
  if (r.run?.periodKey === periodKey) {
    // Claimed counts: an invocation that died mid-send already claimed this
    // week, and re-driving it is how the same report reaches an inbox twice.
    return { due: false, why: r.run.state === "claimed" ? "already claimed this week" : `already ${r.run.state} this week` };
  }

  const today = now.getUTCDay();
  if (today === r.cadence.day) return { due: true, late: false, periodKey };

  // GRACE, BUT ONLY FOR A SERIES THAT MISSED. One cron run a day means a single
  // failed invocation costs a whole week, so a report whose day has already
  // passed inside this ISO week fires late rather than never.
  //
  // It requires PRIOR HISTORY. Without that check, enabling a brand-new Monday
  // report on a Wednesday mails it within the day — the report has never run,
  // its day is behind us, so it looks exactly like a miss. Someone setting up a
  // Monday digest on Wednesday means next Monday, and a tool that mails their
  // leadership four days early has done the unforgivable thing in the other
  // direction. A first send always waits for a real cadence day.
  //
  // Note ISO ordering: Sunday is the LAST day of a week, not the day before
  // Monday, so a Monday report is six days overdue on Sunday and not one early.
  const mondayIndex = (n: number) => (n + 6) % 7;
  const overdueThisWeek = mondayIndex(today) > mondayIndex(r.cadence.day);
  if (overdueThisWeek && r.run) return { due: true, late: true, periodKey };
  if (overdueThisWeek) return { due: false, why: `first send waits for ${DAY_NAMES[r.cadence.day]}` };
  return { due: false, why: `next ${DAY_NAMES[r.cadence.day]}` };
}

/** The next calendar date this report should go out, for the UI. */
export function nextSend(r: Report, now: Date): Date | null {
  if (!r.enabled || r.cadence.kind !== "weekly") return null;
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const alreadyThisWeek = r.run?.periodKey === isoWeek(now);
  for (let i = 0; i <= 14; i++) {
    const cand = new Date(d.getTime() + i * 86400000);
    if (cand.getUTCDay() !== r.cadence.day) continue;
    // Today only counts if the sweep has not already claimed this week.
    if (i === 0 && alreadyThisWeek) continue;
    if (i > 0 && alreadyThisWeek && isoWeek(cand) === isoWeek(now)) continue;
    return cand;
  }
  return null;
}
