import { NextRequest, NextResponse } from "next/server";
import { listOrgs } from "@/lib/orgs";
import { mailConfigured } from "@/lib/email/send";
import { listReports, mutateReport, claimRun, audienceOf, receiving } from "@/lib/reports/store";
import { reportDue, isoWeek } from "@/lib/reports/cadence";
import { runReport } from "@/lib/reports/run";
import { migrateReportsOnce } from "@/lib/reports/migrate";
import { audit } from "@/lib/audit";

export const maxDuration = 300;

/**
 * DAILY SWEEP (vercel.json, `0 13 * * *`) — every scheduled Report.
 *
 * Daily, not hourly: Vercel's Hobby plan permits one cron run per day and
 * rejects a more frequent expression at deploy time, which fails the whole
 * deployment and surfaces only as a commit status. So a cadence names a DAY and
 * never an hour; `SWEEP_HOUR_UTC` in report.ts is where that hour is written.
 *
 * THE IDEMPOTENCE GUARANTEE is `(reportId, ISO week)`, and the week matters:
 * the old per-prototype schedule compared against today's DATE, so moving a
 * weekly report from Monday to Thursday on a Wednesday sent it twice in one
 * week. The claim is written BEFORE a byte leaves, so an invocation that dies
 * mid-send cannot be mistaken for one that never ran.
 *
 * One report's failure never stops the sweep, and one experiment's failure
 * never stops its report — a broken Optimizely binding must not silently
 * cancel everyone else's Monday mail.
 */
export async function GET(req: NextRequest) {
  // FAIL CLOSED. Middleware lets this path through (a Vercel cron carries a
  // bearer and no session cookie), so this check is the only guard. Missing
  // configuration is a 503, never an open door.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured on this deployment." }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!mailConfigured()) {
    return NextResponse.json({ skipped: "mail is not configured on this deployment" });
  }

  const started = Date.now();
  // Leave room inside the 300s ceiling to settle whatever has already been
  // claimed — being killed between send and settle is the one state that costs
  // a report its week.
  const deadline = started + 240_000;
  const now = new Date();
  const periodKey = isoWeek(now);
  const origin = req.nextUrl.origin;

  const migration = await migrateReportsOnce().catch((e) => ({
    ran: false, created: 0, skipped: [], reconciled: false, detail: (e as Error).message,
  }));

  const sent: string[] = [];
  const failed: Record<string, string> = {};
  const notDue: Record<string, string> = {};
  let deferred = 0;

  for (const org of await listOrgs()) {
    for (const report of await listReports(org.id)) {
      if (Date.now() > deadline) {
        // Never claimed, so it fires tomorrow with `late: true` rather than
        // being lost. Reported, because a silent deferral looks like a bug.
        deferred++;
        continue;
      }

      const people = receiving(await audienceOf(report));
      const due = reportDue(report, now, people.length);
      if (!due.due) { notDue[report.id] = `${report.name}: ${due.why}`; continue; }

      // CLAIM FIRST. Losing this race means another invocation is already
      // sending — skip entirely rather than retrying into a double-send.
      const claimed = await claimRun(report.orgId, report.id, due.periodKey, due.late);
      if (!claimed) { notDue[report.id] = `${report.name}: claimed by another run`; continue; }

      try {
        const out = await runReport({ report: claimed, baseUrl: origin });
        await mutateReport(report.orgId, report.id, (cur) => ({
          ...cur,
          run: {
            periodKey, at: new Date().toISOString(),
            state: out.accepted.length ? "sent" : "failed",
            ...(due.late ? { late: true } : {}),
            deliveredTo: out.accepted,
            ...(out.failures.length ? { failures: out.failures } : {}),
            ...(out.accepted.length ? {} : { error: "nobody accepted the message" }),
            entries: out.entries,
          },
        }));
        sent.push(`${report.name} → ${out.accepted.length}${out.failures.length ? ` (${out.failures.length} failed)` : ""}`);
        await audit(report.orgId, "system", "report.sent", report.name, `${out.accepted.length} recipient(s)${due.late ? " · late" : ""}`);
      } catch (e) {
        const msg = (e as Error).message.slice(0, 200);
        failed[report.id] = `${report.name}: ${msg}`;
        await mutateReport(report.orgId, report.id, (cur) => ({
          ...cur,
          run: { periodKey, state: "failed", at: new Date().toISOString(), error: msg, ...(due.late ? { late: true } : {}) },
        })).catch(() => {});
        await audit(report.orgId, "system", "report.failed", report.name, msg).catch(() => {});
      }
    }
  }

  return NextResponse.json({
    ran: now.toISOString(),
    week: periodKey,
    ms: Date.now() - started,
    sent, failed, notDue,
    ...(deferred ? { deferred } : {}),
    ...(migration.ran || !migration.reconciled ? { migration } : {}),
  });
}
