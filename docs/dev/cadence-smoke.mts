/**
 * THE IDEMPOTENCE GUARANTEE, asserted.
 *
 *     npx tsx docs/dev/cadence-smoke.mts
 *
 * Nobody forgives a tool that mails their leadership the same report twice, and
 * that failure is invisible until it happens to a real person. These are the
 * cases that produce it.
 */
import { isoWeek, reportDue, nextSend } from "../../src/lib/reports/cadence.ts";
import type { Report } from "../../src/lib/reports/types.ts";

const base: Report = {
  id: "r1", orgId: "outrigger", name: "Monday exec digest",
  enabled: true,
  scope: { mode: "selected", keys: ["room-detail-overlay"] },
  audience: { mode: "list", people: [{ email: "a@b.com", state: "receiving" }] },
  cadence: { kind: "weekly", day: 1 }, // Monday
  createdAt: "", createdBy: "", updatedAt: "",
};

const D = (s: string) => new Date(`${s}T13:00:00Z`);
let fails = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log(`  ✗ ${label}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
  else console.log(`  ✓ ${label}`);
};

console.log("ISO week");
check("2026-08-10 (Mon) is W33", isoWeek(D("2026-08-10")), "2026-W33");
check("2026-08-16 (Sun) is still W33", isoWeek(D("2026-08-16")), "2026-W33");
check("2026-08-17 (Mon) rolls to W34", isoWeek(D("2026-08-17")), "2026-W34");
check("1 Jan 2027 belongs to W53 of 2026", isoWeek(D("2027-01-01")), "2026-W53");

console.log("\nDueness");
check("due on its day", reportDue(base, D("2026-08-17"), 1).due, true);
check("a never-run report does not fire early", reportDue(base, D("2026-08-16"), 1).due, false);
check("a never-run report waits for its day (Wed, Monday cadence)", reportDue(base, D("2026-08-19"), 1).due, false);
check("paused is never due", reportDue({ ...base, enabled: false }, D("2026-08-17"), 1).due, false);
check("manual is never due", reportDue({ ...base, cadence: { kind: "manual" } }, D("2026-08-17"), 1).due, false);
check("nobody receiving is never due", reportDue(base, D("2026-08-17"), 0).due, false);

console.log("\nTHE DOUBLE-SEND CASES");
// Already sent this week, same day (a retry, or a second invocation).
const sentMon: Report = { ...base, run: { periodKey: "2026-W34", state: "sent", at: "2026-08-17T13:00:00Z" } };
check("a retry on the same day does not resend", reportDue(sentMon, D("2026-08-17"), 1).due, false);
// THE BUG THE WEEK KEY EXISTS FOR: sent Monday, then someone moves the report
// to Thursday. A DATE comparison says "not sent today" and mails a second copy
// in the same week.
const movedToThu: Report = { ...sentMon, cadence: { kind: "weekly", day: 4 } };
check("moving Mon→Thu mid-week does NOT send twice", reportDue(movedToThu, D("2026-08-20"), 1).due, false);
check("…and it does send the following Thursday", reportDue(movedToThu, D("2026-08-27"), 1).due, true);
// A claim that never settled must not be re-driven inside its own week.
const claimed: Report = { ...base, run: { periodKey: "2026-W34", state: "claimed", at: "2026-08-17T13:00:00Z" } };
check("a claimed-but-unsettled run is not re-driven", reportDue(claimed, D("2026-08-17"), 1).due, false);

console.log("\nGrace (one cron a day means a miss costs a week)");
// A SERIES that ran last week and missed this Monday — grace applies.
const ranLastWeek: Report = { ...base, run: { periodKey: "2026-W33", state: "sent", at: "2026-08-10T13:00:00Z" } };
const missed = reportDue(ranLastWeek, D("2026-08-19"), 1); // Wednesday, Monday missed
check("a missed Monday still fires on Wednesday", missed.due, true);
check("…and says it was late", missed.due && missed.late, true);
check("but not once the week has already sent", reportDue(sentMon, D("2026-08-19"), 1).due, false);

console.log("\nNext send");
check("next Monday from a Tuesday", nextSend(base, D("2026-08-18"))?.toISOString().slice(0, 10), "2026-08-24");
check("today, when this week has not sent", nextSend(base, D("2026-08-17"))?.toISOString().slice(0, 10), "2026-08-17");
check("next week, when this week already sent", nextSend(sentMon, D("2026-08-17"))?.toISOString().slice(0, 10), "2026-08-24");
check("paused has no next send", nextSend({ ...base, enabled: false }, D("2026-08-17")), null);

console.log(fails ? `\n${fails} FAILURE(S)` : "\nall cadence assertions passed");
process.exit(fails ? 1 : 0);
