/**
 * A REPORT — the thing that gets emailed, as an object you own.
 *
 * Email used to be a setting on a prototype: one flat recipient list and one
 * optional weekday, stored per experiment, reachable only from inside that
 * experiment's Results tab. That shape cannot express "these four experiments,
 * to the leadership group, on Mondays", and it gave the recipient list no home
 * of its own — so nobody found it and every list stayed empty.
 *
 * A Report is a name, an audience, a coverage rule and a day. Experiments flow
 * through it. See docs/REPORTS-DESIGN.md.
 */

/** A person on a list. An address alone cannot carry "they asked to stop". */
export interface Person {
  email: string;
  name?: string;
  /** `unsubscribed` is set by the recipient, `undeliverable` by a hard bounce.
   *  Both are kept on the list rather than removed: deleting the row loses WHY,
   *  and the next person to edit the audience adds them straight back. */
  state: "receiving" | "unsubscribed" | "undeliverable";
  unsubscribedAt?: string;
  lastDeliveredAt?: string;
}

/** WHICH experiments this report covers. */
export type ReportScope =
  | { mode: "selected"; keys: string[] }
  /** Every prototype in the org with a live experiment, resolved at send time.
   *  A report that keeps up with the programme without being edited. */
  | { mode: "all-live" };

/** WHO receives it. A group is a live REFERENCE — edit the group once and
 *  every report that points at it follows, which is the whole point of having
 *  groups. An inline list is the no-ceremony path: type three addresses and go. */
export type ReportAudience =
  | { mode: "group"; groupId: string }
  | { mode: "list"; people: Person[] };

/** WHEN. A DAY, never an hour — Vercel Hobby permits one cron run per day, so
 *  an hour would be a promise the deployment cannot keep. See SWEEP_HOUR_UTC. */
export type ReportCadence =
  | { kind: "weekly"; day: 0 | 1 | 2 | 3 | 4 | 5 | 6 }
  | { kind: "manual" };

/** The record of the last SCHEDULED run. Written only by the sweep. */
export interface ReportRun {
  /** ISO week, e.g. "2026-W33" — NOT a date. Move a weekly report from Monday
   *  to Thursday on a Wednesday and a date key sends twice in the same week;
   *  a week key cannot. This also fixes that bug in the old per-prototype
   *  schedule, which keyed on the date. */
  periodKey: string;
  /** `claimed` is written BEFORE a byte leaves, so a crash mid-send cannot be
   *  mistaken for "never ran" and re-driven into a double-send. */
  state: "claimed" | "sent" | "failed";
  at: string;
  /** Fired on a later day than its cadence, because an earlier sweep missed. */
  late?: boolean;
  deliveredTo?: string[];
  /** PARTIAL IS NOT FAILURE. Some addresses bounced and the rest arrived. */
  failures?: { to: string; error: string }[];
  /** The whole run failed and nobody got anything. */
  error?: string;
  /** One line per experiment covered, so "why isn't this in my digest" is
   *  answerable from the record rather than from a log. */
  entries?: { key: string; name: string; state: "ok" | "frozen" | "unavailable" | "skipped"; reason?: string }[];
}

export interface Report {
  id: string;
  /** ON THE RECORD, never parsed out of the storage key. The guard reads this,
   *  so a forged id cannot smuggle a different org past the check. */
  orgId: string;
  /** IS the subject line, verbatim. A subject that changes with the verdict
   *  stops a weekly series threading as one conversation in the inbox. */
  name: string;
  enabled: boolean;
  scope: ReportScope;
  audience: ReportAudience;
  cadence: ReportCadence;
  run?: ReportRun;
  /** A human pressing Send now. Deliberately NOT `run`: mailing one colleague
   *  a copy must never cancel Monday's scheduled send to the leadership. */
  lastManual?: { at: string; by: string; to: string[] };
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export interface RecipientGroup {
  id: string;
  orgId: string;
  name: string;
  people: Person[];
  createdAt: string;
  updatedAt: string;
}

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
