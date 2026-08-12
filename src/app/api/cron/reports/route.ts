import { NextRequest, NextResponse } from "next/server";
import { getContentStore } from "@/lib/content/store";
import { resolvePrototypeOrg } from "@/lib/prototypes/org";
import { getReportSettings, scheduleDue, mutateReportSettings } from "@/lib/prototypes/report";
import { sendReadoutEmail } from "@/lib/email/report-run";
import { mailConfigured } from "@/lib/email/send";

export const maxDuration = 300;

/**
 * DAILY SWEEP (vercel.json, `0 13 * * *`) for scheduled readouts.
 *
 * Daily, not hourly: Vercel's Hobby plan permits one cron run per day and
 * rejects a more frequent expression at deploy time — which fails the whole
 * deployment and surfaces only as a commit status. So a schedule names a DAY
 * and never an hour; `SWEEP_HOUR_UTC` in report.ts is the one place that hour
 * is written down.
 *
 * `scheduleDue` carries the idempotence on the date alone: right weekday, not
 * already sent today. The job can fire repeatedly and the report leaves once —
 * which matters, because the failure everyone remembers is the tool that mailed
 * their leadership the same report twice.
 *
 * One prototype's failure never stops the sweep: a broken Optimizely binding on
 * one experiment must not silently cancel everyone else's Monday report.
 */
export async function GET(req: NextRequest) {
  // FAIL CLOSED. This was `if (secret && …)`, which meant an unset CRON_SECRET
  // skipped the check entirely — and now that middleware lets this path through,
  // that would be a public GET that mails real people. Missing configuration is
  // a 503, never an open door.
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

  const now = new Date();
  const store = await getContentStore();
  const protos = await store.listPrototypes();
  const sent: string[] = [];
  const failed: Record<string, string> = {};
  const origin = req.nextUrl.origin;

  for (const proto of protos) {
    let due = false;
    try {
      due = scheduleDue(await getReportSettings(proto.key), now);
    } catch { due = false; }
    if (!due) continue;

    // RESOLVE, don't read the field. A legacy prototype carries no `orgId` and
    // reaches it through its site link; `resolvePrototypeOrg` returns it and
    // heals the record in place. Reading `proto.orgId` directly meant the sweep
    // permanently refused exactly the prototypes every UI path silently fixes —
    // so a report could be configured, look scheduled, and never once send.
    const orgId = await resolvePrototypeOrg(proto);
    if (!orgId) {
      failed[proto.key] = "no organisation on the prototype record, and none resolvable from its site";
      continue;
    }
    try {
      const out = await sendReadoutEmail({ orgId, proto, baseUrl: origin });
      sent.push(`${proto.key} → ${out.sent}`);
    } catch (e) {
      const msg = (e as Error).message.slice(0, 200);
      failed[proto.key] = msg;
      // Recorded on the prototype as well, so the person who owns the report
      // sees it in the app rather than in a log they will never open.
      await mutateReportSettings(proto.key, (cur) => ({ ...cur, lastError: msg, lastPartial: undefined })).catch(() => {});
    }
  }

  return NextResponse.json({ ran: now.toISOString(), sent, failed });
}
